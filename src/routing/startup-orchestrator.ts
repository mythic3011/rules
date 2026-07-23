import {
  executeControllerTransaction,
  ControllerTransactionError,
  type ControllerApi,
  type ControllerTransactionResult,
  type StartupGate,
} from "./runtime-controller.js";
import {
  RouterDeploymentSchema,
  RuntimeStateSchema,
  type RouterDeployment,
  type RuntimeState,
} from "./router-local.js";
import type { ControllerPlan } from "./runtime-plan.js";
import { FirewallProofAdapter, FirewallProofAdapterError } from "./firewall-proof-adapter.js";
import {
  digestControllerPlan,
  validateSealedArtifactGeneration,
  type FirewallPermit,
  type NonClosedFirewallReasonCode,
  type SealedArtifactGeneration,
} from "./firewall-proof.js";

export interface EmergencyDeny {
  ensureProtectedSourcesDenied(reason: NonClosedFirewallReasonCode): Promise<void>;
}

export interface EmergencyRejectLock {
  lockAccountSelectorsToReject(groups: readonly string[]): Promise<void>;
}

/** Read-only authority; it owns sealed artifact lookup, never controller access. */
export interface FirewallGenerationAuthority {
  expectedSealedArtifact(plan: ControllerPlan): Promise<SealedArtifactGeneration>;
}

export type StartupOrchestratorFailure =
  | "initial-authority"
  | "initial-proof"
  | "proof-invalidated"
  | "startup-gate"
  | "account-lock"
  | "account-readback"
  | "controller-transaction";

export interface ContainmentResult {
  readonly denyAttempted: true;
  readonly rejectLockAttempted: true;
  readonly denyFailed: boolean;
  readonly rejectLockFailed: boolean;
}

/** Redacted failure: no source error, node, secret, or raw proof is retained. */
export class StartupOrchestratorError extends Error {
  public constructor(
    public readonly phase: StartupOrchestratorFailure,
    public readonly reasonCode: NonClosedFirewallReasonCode,
    public readonly containment: ContainmentResult,
  ) {
    super(`Controller startup denied during ${phase}: ${reasonCode}`);
    this.name = "StartupOrchestratorError";
  }
}

function accountLockGroups(plan: ControllerPlan): readonly string[] {
  return [...new Set(plan.accountProtected.map((account) => account.visibleGroup))];
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function snapshotControllerPlan(plan: ControllerPlan): ControllerPlan {
  return deepFreeze(structuredClone(plan));
}

function snapshotDeployment(deployment: RouterDeployment): RouterDeployment {
  return deepFreeze(RouterDeploymentSchema.parse(structuredClone(deployment)));
}

function snapshotRuntimeState(state: RuntimeState): RuntimeState {
  return deepFreeze(RuntimeStateSchema.parse(structuredClone(state)));
}

function proofReason(error: unknown): NonClosedFirewallReasonCode {
  return error instanceof FirewallProofAdapterError ? error.reasonCode : "invalid-evidence";
}

class ContainmentController {
  private failure: Promise<never> | undefined;

  public constructor(
    private readonly emergencyDeny: EmergencyDeny,
    private readonly emergencyRejectLock: EmergencyRejectLock,
    private readonly accountGroups: readonly string[],
  ) {}

  public get started(): boolean {
    return this.failure !== undefined;
  }

  public fail(phase: StartupOrchestratorFailure, reasonCode: NonClosedFirewallReasonCode): Promise<never> {
    if (this.failure === undefined) this.failure = this.contain(phase, reasonCode);
    return this.failure;
  }

  private async contain(phase: StartupOrchestratorFailure, reasonCode: NonClosedFirewallReasonCode): Promise<never> {
    const [deny, rejectLock] = await Promise.allSettled([
      Promise.resolve().then(() => this.emergencyDeny.ensureProtectedSourcesDenied(reasonCode)),
      Promise.resolve().then(() => this.emergencyRejectLock.lockAccountSelectorsToReject(this.accountGroups)),
    ]);
    throw new StartupOrchestratorError(phase, reasonCode, {
      denyAttempted: true,
      rejectLockAttempted: true,
      denyFailed: deny.status === "rejected",
      rejectLockFailed: rejectLock.status === "rejected",
    });
  }
}

class GenerationAwareControllerApi implements ControllerApi {
  public constructor(
    private readonly api: ControllerApi,
    private readonly adapter: FirewallProofAdapter,
    private readonly permit: FirewallPermit,
    private readonly expectedSealedArtifact: SealedArtifactGeneration,
    private readonly containment: ContainmentController,
  ) {}

  public async selectedProxy(group: string): Promise<string> {
    await this.revalidatePermit();
    return this.api.selectedProxy(group);
  }

  public async selectProxy(group: string, target: string): Promise<void> {
    await this.revalidatePermit();
    return this.api.selectProxy(group, target);
  }

  public async revalidatePermit(): Promise<void> {
    if (this.containment.started) return this.containment.fail("proof-invalidated", "invalid-evidence");
    let current: FirewallPermit;
    try {
      current = await this.adapter.issuePermit(this.expectedSealedArtifact);
    } catch (error: unknown) {
      return this.containment.fail("proof-invalidated", proofReason(error));
    }
    if (current.generationId !== this.permit.generationId || current.rulesetGeneration !== this.permit.rulesetGeneration) {
      return this.containment.fail("proof-invalidated", "generation-drift");
    }
  }
}

export interface ControllerStartupRequest {
  readonly api: ControllerApi;
  readonly deployment: RouterDeployment;
  readonly plan: ControllerPlan;
  readonly state: RuntimeState;
  readonly startupGate: StartupGate;
  readonly firewallProof: FirewallProofAdapter;
  readonly firewallGenerationAuthority: FirewallGenerationAuthority;
  readonly emergencyDeny: EmergencyDeny;
  readonly emergencyRejectLock: EmergencyRejectLock;
}

function transactionFailurePhase(error: unknown): StartupOrchestratorFailure {
  if (!(error instanceof ControllerTransactionError)) return "controller-transaction";
  if (error.phase === "startup-gate") return "startup-gate";
  if (error.phase === "account-lock") return "account-lock";
  if (error.phase === "account-readback") return "account-readback";
  return "controller-transaction";
}

/**
 * Decorates Phase 4d without expanding its normal API capability. A trusted
 * plan-bound generation is proven before the startup gate and before every
 * ordinary controller request. Any failure enters one idempotent containment
 * path that attempts both deny and reject locking independently.
 */
export async function executeControllerStartup(request: ControllerStartupRequest): Promise<ControllerTransactionResult> {
  // These snapshots are deliberately completed before the first await. Neither
  // an authority nor a startup gate can mutate the execution plan mid-flight.
  const plan = snapshotControllerPlan(request.plan);
  const containment = new ContainmentController(
    request.emergencyDeny,
    request.emergencyRejectLock,
    accountLockGroups(plan),
  );
  let deployment: RouterDeployment;
  let state: RuntimeState;
  let planSha256: string;
  try {
    deployment = snapshotDeployment(request.deployment);
    state = snapshotRuntimeState(request.state);
    planSha256 = digestControllerPlan(plan);
  } catch {
    return containment.fail("initial-authority", "invalid-evidence");
  }
  let expected: SealedArtifactGeneration;
  try {
    expected = validateSealedArtifactGeneration(
      await request.firewallGenerationAuthority.expectedSealedArtifact(plan),
    );
  } catch {
    return containment.fail("initial-authority", "invalid-evidence");
  }
  if (expected.policyVersion !== plan.policyVersion || expected.controllerPlanSha256 !== planSha256) {
    return containment.fail("initial-authority", "generation-drift");
  }

  let permit: FirewallPermit;
  try {
    permit = await request.firewallProof.issuePermit(expected);
  } catch (error: unknown) {
    return containment.fail("initial-proof", proofReason(error));
  }

  const guardedApi = new GenerationAwareControllerApi(
    request.api,
    request.firewallProof,
    permit,
    expected,
    containment,
  );
  const guardedStartupGate: StartupGate = {
    async proveProtectedPathClosed(): Promise<void> {
      await guardedApi.revalidatePermit();
      await request.startupGate.proveProtectedPathClosed();
    },
  };
  try {
    return await executeControllerTransaction(guardedApi, deployment, plan, state, guardedStartupGate);
  } catch (error: unknown) {
    if (error instanceof StartupOrchestratorError) throw error;
    return containment.fail(transactionFailurePhase(error), "invalid-evidence");
  }
}
