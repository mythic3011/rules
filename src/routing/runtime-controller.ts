import type { ControllerPlan } from "./runtime-plan.js";
import { isStrictLoopbackControllerUrl, type RouterDeployment, type RuntimeState } from "./router-local.js";

export interface ControllerApi {
  selectedProxy(group: string): Promise<string>;
  selectProxy(group: string, target: string): Promise<void>;
}

/**
 * The future live adapter must prove its protected path is closed before it
 * may make even a read-only controller API call. This test primitive accepts
 * only the proof boundary, never a token, node, or router implementation.
 */
export interface StartupGate {
  proveProtectedPathClosed(): Promise<void>;
}

export interface ControllerOperation {
  readonly phase: "lock" | "hidden-read" | "hidden-update" | "verify" | "rollback";
  readonly group: string;
  readonly target?: string;
}

export interface ControllerTransactionResult {
  readonly operations: readonly ControllerOperation[];
  readonly rolledBack: boolean;
}

export type ControllerFailurePhase =
  | "startup-gate"
  | "policy-boundary"
  | "account-lock"
  | "account-readback"
  | "hidden-read"
  | "hidden-update"
  | "hidden-readback";

export type ControllerFailureClassification =
  | "startup-gate-failed"
  | "policy-boundary-failed"
  | "api-call-failed"
  | "readback-mismatch";

/** Redacted operator diagnostic; deliberately never retains an underlying error. */
export class ControllerTransactionError extends Error {
  public constructor(
    public readonly phase: ControllerFailurePhase,
    public readonly group: string | undefined,
    public readonly classification: ControllerFailureClassification,
    public readonly rollbackFailureCount: number,
  ) {
    super(`Controller transaction ${classification} during ${phase}${group === undefined ? "" : ` for ${group}`}; rollback failures: ${rollbackFailureCount}`);
    this.name = "ControllerTransactionError";
  }
}

class TransactionFailure extends Error {
  public constructor(
    public readonly phase: ControllerFailurePhase,
    public readonly group: string | undefined,
    public readonly classification: ControllerFailureClassification,
  ) { super("redacted internal transaction failure"); }
}

function modeSelections(plan: ControllerPlan, state: RuntimeState): readonly { readonly group: string; readonly target: string }[] {
  const mode = plan.modes[state.activeMode];
  if (mode === undefined) throw new TransactionFailure("policy-boundary", undefined, "policy-boundary-failed");
  return mode.hiddenSelections;
}

/**
 * Test-only transaction preview. It is not a router adapter and must not be
 * wired to a live Mihomo API without a separately validated immutable plan
 * proof. It records every controller API operation in execution order,
 * including hidden pre-write snapshots. Visible service selectors are
 * deliberately absent: only account guards and @profile/* control-plane
 * groups may be changed.
 */
export function previewControllerTransaction(plan: ControllerPlan, state: RuntimeState): readonly ControllerOperation[] {
  const locks = plan.accountProtected.map((account) => ({ phase: "lock" as const, group: account.visibleGroup, target: "REJECT" as const }));
  const hidden = modeSelections(plan, state).map((selection) => ({ phase: "hidden-update" as const, group: selection.group, target: selection.target }));
  const accountVerify = locks.map((operation) => ({ phase: "verify" as const, group: operation.group, target: operation.target }));
  const hiddenWithReadback = hidden.flatMap((operation) => [
    { phase: "hidden-read" as const, group: operation.group },
    operation,
    { phase: "verify" as const, group: operation.group, target: operation.target },
  ]);
  return [...locks, ...accountVerify, ...hiddenWithReadback];
}

function assertControllerBoundary(deployment: RouterDeployment, operation: ControllerOperation): void {
  if (!isStrictLoopbackControllerUrl(deployment.controller.url)) throw new TransactionFailure("policy-boundary", operation.group, "policy-boundary-failed");
  if (operation.phase === "lock" && operation.target !== "REJECT") throw new TransactionFailure("policy-boundary", operation.group, "policy-boundary-failed");
  if (operation.phase === "hidden-read" && !operation.group.startsWith("@profile/")) throw new TransactionFailure("policy-boundary", operation.group, "policy-boundary-failed");
  if (operation.phase === "hidden-update" && !operation.group.startsWith("@profile/")) throw new TransactionFailure("policy-boundary", operation.group, "policy-boundary-failed");
  if (operation.phase === "hidden-update" && operation.target !== "DIRECT" && operation.target !== "REJECT" && !operation.target?.endsWith(" Stable")) {
    throw new TransactionFailure("policy-boundary", operation.group, "policy-boundary-failed");
  }
}

async function select(api: ControllerApi, phase: "account-lock" | "hidden-update", group: string, target: string): Promise<void> {
  try { await api.selectProxy(group, target); } catch { throw new TransactionFailure(phase, group, "api-call-failed"); }
}

async function selected(api: ControllerApi, phase: "account-readback" | "hidden-read" | "hidden-readback", group: string): Promise<string> {
  try { return await api.selectedProxy(group); } catch { throw new TransactionFailure(phase, group, "api-call-failed"); }
}

async function verify(api: ControllerApi, phase: "account-readback" | "hidden-readback", group: string, target: string): Promise<void> {
  if (await selected(api, phase, group) !== target) throw new TransactionFailure(phase, group, "readback-mismatch");
}

/**
 * Testable control-plane transaction primitive. The mandatory startup gate is
 * the first await and the first operation that may fail. Only after it proves
 * the protected path closed are account selectors locked and verified, then
 * hidden profile selectors updated. Account selectors are never rolled back.
 */
export async function executeControllerTransaction(
  api: ControllerApi,
  deployment: RouterDeployment,
  plan: ControllerPlan,
  state: RuntimeState,
  startupGate: StartupGate,
): Promise<ControllerTransactionResult> {
  const operations: ControllerOperation[] = [];
  const previousHidden = new Map<string, string>();
  try {
    try { await startupGate.proveProtectedPathClosed(); } catch { throw new TransactionFailure("startup-gate", undefined, "startup-gate-failed"); }

    const accountLocks = plan.accountProtected.map((account) => ({ phase: "lock" as const, group: account.visibleGroup, target: "REJECT" as const }));
    for (const operation of accountLocks) {
      assertControllerBoundary(deployment, operation);
      await select(api, "account-lock", operation.group, "REJECT");
      operations.push(operation);
    }
    for (const operation of accountLocks) {
      await verify(api, "account-readback", operation.group, "REJECT");
      operations.push({ phase: "verify", group: operation.group, target: "REJECT" });
    }

    for (const selection of modeSelections(plan, state)) {
      const readOperation: ControllerOperation = { phase: "hidden-read", group: selection.group };
      const operation: ControllerOperation = { phase: "hidden-update", group: selection.group, target: selection.target };
      assertControllerBoundary(deployment, readOperation);
      assertControllerBoundary(deployment, operation);
      const previous = await selected(api, "hidden-read", readOperation.group);
      operations.push(readOperation);
      previousHidden.set(operation.group, previous);
      await select(api, "hidden-update", operation.group, selection.target);
      operations.push(operation);
      await verify(api, "hidden-readback", operation.group, selection.target);
      operations.push({ phase: "verify", group: operation.group, target: selection.target });
    }
    return { operations, rolledBack: false };
  } catch (error: unknown) {
    const failure = error instanceof TransactionFailure
      ? error
      : new TransactionFailure("policy-boundary", undefined, "policy-boundary-failed");
    let rollbackFailureCount = 0;
    for (const [group, previous] of [...previousHidden.entries()].reverse()) {
      try {
        await api.selectProxy(group, previous);
        operations.push({ phase: "rollback", group, target: previous });
      } catch { rollbackFailureCount += 1; }
    }
    throw new ControllerTransactionError(failure.phase, failure.group, failure.classification, rollbackFailureCount);
  }
}
