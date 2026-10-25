import assert from "node:assert/strict";

import type {
  FirewallGenerationAuthority,
  EmergencyDeny,
  EmergencyRejectLock,
  ControllerStartupRequest,
} from "#routing/startup-orchestrator.js";
import { FirewallProofAdapter } from "#routing/firewall-proof-adapter.js";
import type {
  FirewallEvidenceSource,
  FirewallProofClock,
} from "#routing/firewall-proof-adapter.js";
import type {
  NonClosedFirewallReasonCode,
  SealedArtifactGeneration,
} from "#routing/firewall-proof.js";
import {
  compileControllerPlan,
  type ControllerPlan,
} from "#routing/runtime-plan.js";
import {
  ControllerTransactionError,
  previewControllerTransaction,
  type ControllerApi,
  type ControllerOperation,
  type StartupGate,
} from "#routing/runtime-controller.js";
import {
  createInitialRuntimeState,
  validateRouterLocalConfig,
  type RouterDeployment,
  type RuntimeState,
} from "#routing/router-local.js";

import { loadCanonicalInputs } from "./canonical-inputs.js";
import {
  deploymentFixture,
  deploymentForPlan,
  egressFixture,
  firewallNow,
  stateFixture,
} from "./fixtures.js";

export class FakeControllerApi implements ControllerApi {
  public readonly transcript: string[] = [];
  private readonly sequentialReadbacks: Map<string, string[]>;

  public constructor(
    private readonly selections: Map<string, string>,
    private readonly failOn: readonly string[] = [],
    private readonly readbackOverrides: ReadonlyMap<string, string> = new Map(),
    sequentialReadbacks: ReadonlyMap<string, readonly string[]> = new Map(),
  ) {
    this.sequentialReadbacks = new Map(
      [...sequentialReadbacks.entries()].map(
        ([group, values]) => [group, [...values]],
      ),
    );
  }

  public async selectedProxy(group: string): Promise<string> {
    this.transcript.push(`GET ${group}`);
    const sequential = this.sequentialReadbacks.get(group);
    const next = sequential?.shift();
    if (next !== undefined) return next;
    return (
      this.readbackOverrides.get(group) ??
      this.selections.get(group) ??
      "REJECT"
    );
  }

  public async selectProxy(group: string, target: string): Promise<void> {
    this.transcript.push(`PUT ${group}=${target}`);
    if (this.failOn.includes(`${group}=${target}`))
      throw new Error(`SENTINEL_API_SECRET for ${group}=${target}`);
    this.selections.set(group, target);
  }

  public selectionFor(group: string): string | undefined {
    return this.selections.get(group);
  }

}

export const passingStartupGate: StartupGate = {
  async proveProtectedPathClosed(): Promise<void> {},
};

export async function controllerPlan(): Promise<ControllerPlan> {
  const { config, projection } = await loadCanonicalInputs();
  return compileControllerPlan(config, projection);
}

export async function controllerFixture(): Promise<{
  readonly plan: ReturnType<typeof compileControllerPlan>;
  readonly local: ReturnType<typeof validateRouterLocalConfig>;
  readonly preview: ReturnType<typeof previewControllerTransaction>;
}> {
  const { config, projection } = await loadCanonicalInputs();
  const plan = compileControllerPlan(config, projection);
  const local = validateRouterLocalConfig(
    deploymentFixture({ policyVersion: plan.policyVersion }),
    egressFixture({ policyVersion: plan.policyVersion }),
    stateFixture({ policyVersion: plan.policyVersion }),
    plan,
  );
  return {
    plan,
    local,
    preview: previewControllerTransaction(plan, local.state),
  };
}

export function firstHiddenUpdate(
  preview: ReturnType<typeof previewControllerTransaction>,
): { readonly group: string; readonly target: string } {
  const operation = preview.find((item) => item.phase === "hidden-update");
  if (operation?.target === undefined) {
    throw new Error("expected a hidden profile operation");
  }
  return { group: operation.group, target: operation.target };
}

export function assertRedactedControllerFailure(
  error: unknown,
  phase: ControllerTransactionError["phase"],
  classification: ControllerTransactionError["classification"],
  rollbackFailureCount: number,
): boolean {
  assert.ok(error instanceof ControllerTransactionError);
  assert.equal(error.phase, phase);
  assert.equal(error.classification, classification);
  assert.equal(error.rollbackFailureCount, rollbackFailureCount);
  const diagnostic = `${error.message} ${JSON.stringify(error)}`;
  assert.doesNotMatch(
    diagnostic,
    /SENTINEL_API_SECRET|SENTINEL_GATE_SECRET|SENTINEL_APPROVED_NODE/,
  );
  return true;
}

export function assertRedactedControllerTranscript(api: {
  readonly transcript: readonly string[];
}): void {
  assert.doesNotMatch(
    api.transcript.join("\n"),
    /SENTINEL_API_SECRET|SENTINEL_GATE_SECRET|SENTINEL_APPROVED_NODE/,
  );
}

export function noRawSecrets(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.doesNotMatch(
    `${error.message} ${JSON.stringify(error)}`,
    /SENTINEL_SECRET|SENTINEL_APPROVED_NODE/,
  );
  return true;
}

export class SequenceEvidenceSource implements FirewallEvidenceSource {
  public readonly transcript: string[] = [];
  private index = 0;

  public constructor(
    private readonly evidence: readonly unknown[],
    private readonly sharedTranscript?: string[],
  ) {}

  public async readFirewallEvidence(): Promise<unknown> {
    this.transcript.push("PROOF");
    this.sharedTranscript?.push("PROOF");
    const current = this.evidence[Math.min(this.index, this.evidence.length - 1)];
    this.index += 1;
    return current;
  }
}

export class FixedClock implements FirewallProofClock {
  public constructor(private readonly value: Date) {}

  public now(): Date {
    return this.value;
  }
}

export class FakeGenerationAuthority implements FirewallGenerationAuthority {
  public readonly plans: ControllerPlan[] = [];

  public constructor(
    private readonly expected: SealedArtifactGeneration,
    private readonly failure?: Error,
  ) {}

  public async expectedSealedArtifact(
    plan: ControllerPlan,
  ): Promise<SealedArtifactGeneration> {
    this.plans.push(plan);
    if (this.failure !== undefined) throw this.failure;
    return this.expected;
  }
}

export class FakeEmergencyDeny implements EmergencyDeny {
  public readonly reasons: string[] = [];

  public constructor(
    private readonly sharedTranscript: string[],
    private readonly failure?: Error,
  ) {}

  public async ensureProtectedSourcesDenied(
    reason: NonClosedFirewallReasonCode,
  ): Promise<void> {
    this.reasons.push(reason);
    this.sharedTranscript.push(`DENY ${reason}`);
    if (this.failure !== undefined) throw this.failure;
  }
}

export class FakeEmergencyRejectLock implements EmergencyRejectLock {
  public calls: readonly string[][] = [];

  public constructor(
    private readonly sharedTranscript: string[],
    private readonly failure?: Error,
  ) {}

  public async lockAccountSelectorsToReject(
    groups: readonly string[],
  ): Promise<void> {
    this.calls = [...this.calls, [...groups]];
    this.sharedTranscript.push(`LOCK ${groups.join(",")}`);
    if (this.failure !== undefined) throw this.failure;
  }
}

export class SynchronousThrowDeny implements EmergencyDeny {
  public constructor(private readonly sharedTranscript: string[]) {}

  public ensureProtectedSourcesDenied(
    reason: NonClosedFirewallReasonCode,
  ): Promise<void> {
    this.sharedTranscript.push(`DENY ${reason}`);
    throw new Error("SENTINEL_SECRET synchronous deny failure");
  }
}

export class SynchronousThrowRejectLock implements EmergencyRejectLock {
  public constructor(private readonly sharedTranscript: string[]) {}

  public lockAccountSelectorsToReject(groups: readonly string[]): Promise<void> {
    this.sharedTranscript.push(`LOCK ${groups.join(",")}`);
    throw new Error("SENTINEL_SECRET synchronous reject lock failure");
  }
}

export function adapter(evidence: readonly unknown[]): FirewallProofAdapter {
  return new FirewallProofAdapter(
    new SequenceEvidenceSource(evidence),
    new FixedClock(firewallNow()),
  );
}

export function startupRequest(
  plan: ControllerPlan,
  api: ControllerApi,
  proof: FirewallProofAdapter,
  authority: FirewallGenerationAuthority,
  deny: EmergencyDeny,
  lock: EmergencyRejectLock,
  gate: StartupGate = passingStartupGate,
  deploymentValue: RouterDeployment = deploymentForPlan(plan),
  stateValue: RuntimeState = createInitialRuntimeState(plan, "hk"),
): ControllerStartupRequest {
  return {
    api,
    deployment: deploymentValue,
    plan,
    state: stateValue,
    startupGate: gate,
    firewallProof: proof,
    firewallGenerationAuthority: authority,
    emergencyDeny: deny,
    emergencyRejectLock: lock,
  };
}
