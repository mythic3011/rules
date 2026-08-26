import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";

import { loadRoutingConfig } from "../../internal/typescript/routing/loader.js";
import { loadMihomoProjectionConfig } from "../../internal/typescript/routing/mihomo-projection.js";
import * as FirewallProof from "../../internal/typescript/routing/firewall-proof.js";
import {
  digestControllerPlan,
  digestFirewallStaticEvidence,
  evaluateFirewallProof,
  sealArtifactGeneration,
  type FirewallDynamicEvidence,
  type FirewallProofEvidence,
  type FirewallStaticEvidence,
  type SealedArtifactGeneration,
  type SealedArtifactInput,
} from "../../internal/typescript/routing/firewall-proof.js";
import {
  FirewallProofAdapter,
  type FirewallEvidenceSource,
  type FirewallProofClock,
} from "../../internal/typescript/routing/firewall-proof-adapter.js";
import { createInitialRuntimeState, type RouterDeployment } from "../../internal/typescript/routing/router-local.js";
import { compileControllerPlan, type ControllerPlan } from "../../internal/typescript/routing/runtime-plan.js";
import {
  executeControllerStartup,
  StartupOrchestratorError,
  type EmergencyDeny,
  type EmergencyRejectLock,
  type FirewallGenerationAuthority,
} from "../../internal/typescript/routing/startup-orchestrator.js";
import type { ControllerApi, StartupGate } from "../../internal/typescript/routing/runtime-controller.js";

const ROOT = resolve(import.meta.dirname, "../..");
const ROUTING_DIRECTORY = join(ROOT, "internal", "config", "ai-routing");
const MIHOMO_PROJECTION = join(ROUTING_DIRECTORY, "mihomo.yaml");
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const RULESET_DIGEST = `sha256:${"c".repeat(64)}`;
const NOW = new Date("2026-07-23T00:01:00.000Z");

function staticEvidence(rulesetGeneration = RULESET_DIGEST): FirewallStaticEvidence {
  return {
    protectedSources: ["ai-account-safe"],
    blockedFamilies: ["ipv4", "ipv6"],
    blockedPaths: ["direct-wan", "external-dns", "external-dot", "direct-quic"],
    approvedProxyDestinations: ["approved-proxy"],
    routerDnsDestinations: ["router-dns"],
    rulesetGeneration,
  };
}

function sealedInput(
  staticValue = staticEvidence(),
  controllerPlanSha256 = DIGEST_A,
  overrides: Partial<SealedArtifactInput> = {},
): SealedArtifactInput {
  return {
    policyVersion: "1",
    publicArtifactSha256: DIGEST_A,
    privateMaterializationSha256: DIGEST_A,
    controllerPlanSha256,
    topologySha256: DIGEST_A,
    firewallStaticEvidenceSha256: digestFirewallStaticEvidence(staticValue),
    proofMaximumAgeMs: 60_000,
    ...overrides,
  };
}

function closedEvidence(
  input?: SealedArtifactInput | SealedArtifactGeneration,
  staticValue = staticEvidence(),
  dynamicOverrides: Partial<FirewallDynamicEvidence> = {},
  checkedAt = NOW.toISOString(),
): FirewallProofEvidence {
  const sealedArtifact = input === undefined
    ? sealedInput(staticValue)
    : "generationId" in input
      ? (() => {
        const { generationId: _generationId, ...unsealed } = input;
        return unsealed;
      })()
      : input;
  return {
    checkedAt,
    sealedArtifact,
    staticEvidence: staticValue,
    dynamicEvidence: {
      directIpv4: "blocked",
      directIpv6: "blocked",
      externalDns: "blocked",
      externalDot: "blocked",
      directQuic: "blocked",
      approvedProxy: "allowed",
      routerDns: "allowed",
      generationBefore: staticValue.rulesetGeneration,
      generationAfter: staticValue.rulesetGeneration,
      ...dynamicOverrides,
    },
  };
}

function generationForPlan(plan: ControllerPlan, staticValue = staticEvidence(), overrides: Partial<SealedArtifactInput> = {}): SealedArtifactGeneration {
  return sealArtifactGeneration(sealedInput(staticValue, digestControllerPlan(plan), overrides));
}

class SequenceEvidenceSource implements FirewallEvidenceSource {
  public readonly transcript: string[] = [];
  private index = 0;

  public constructor(private readonly evidence: readonly unknown[], private readonly shared?: string[]) {}

  public async readFirewallEvidence(): Promise<unknown> {
    this.transcript.push("PROOF");
    this.shared?.push("PROOF");
    const current = this.evidence[Math.min(this.index, this.evidence.length - 1)];
    this.index += 1;
    return current;
  }
}

class FixedClock implements FirewallProofClock {
  public constructor(private readonly value: Date) {}
  public now(): Date { return this.value; }
}

class FakeGenerationAuthority implements FirewallGenerationAuthority {
  public readonly plans: ControllerPlan[] = [];
  public constructor(private readonly expected: SealedArtifactGeneration, private readonly failure?: Error) {}
  public async expectedSealedArtifact(plan: ControllerPlan): Promise<SealedArtifactGeneration> {
    this.plans.push(plan);
    if (this.failure !== undefined) throw this.failure;
    return this.expected;
  }
}

class FakeControllerApi implements ControllerApi {
  public readonly transcript: string[] = [];

  public constructor(
    private readonly selections: Map<string, string>,
    private readonly shared: string[],
    private readonly failure?: { readonly selectGroup?: string; readonly readGroup?: string },
  ) {}

  public async selectedProxy(group: string): Promise<string> {
    this.transcript.push(`GET ${group}`);
    this.shared.push(`GET ${group}`);
    if (this.failure?.readGroup === group) throw new Error("SENTINEL_SECRET read failure");
    return this.selections.get(group) ?? "REJECT";
  }

  public async selectProxy(group: string, target: string): Promise<void> {
    this.transcript.push(`PUT ${group}=${target}`);
    this.shared.push(`PUT ${group}=${target}`);
    if (this.failure?.selectGroup === group) throw new Error("SENTINEL_SECRET select failure");
    this.selections.set(group, target);
  }
}

class FakeEmergencyDeny implements EmergencyDeny {
  public readonly reasons: string[] = [];
  public constructor(private readonly shared: string[], private readonly failure?: Error) {}
  public async ensureProtectedSourcesDenied(reason: FirewallProof.NonClosedFirewallReasonCode): Promise<void> {
    this.reasons.push(reason);
    this.shared.push(`DENY ${reason}`);
    if (this.failure !== undefined) throw this.failure;
  }
}

class FakeEmergencyRejectLock implements EmergencyRejectLock {
  public calls: readonly string[][] = [];
  public constructor(private readonly shared: string[], private readonly failure?: Error) {}
  public async lockAccountSelectorsToReject(groups: readonly string[]): Promise<void> {
    this.calls = [...this.calls, [...groups]];
    this.shared.push(`LOCK ${groups.join(",")}`);
    if (this.failure !== undefined) throw this.failure;
  }
}

class SynchronousThrowDeny implements EmergencyDeny {
  public constructor(private readonly shared: string[]) {}
  public ensureProtectedSourcesDenied(reason: FirewallProof.NonClosedFirewallReasonCode): Promise<void> {
    this.shared.push(`DENY ${reason}`);
    throw new Error("SENTINEL_SECRET synchronous deny failure");
  }
}

class SynchronousThrowRejectLock implements EmergencyRejectLock {
  public constructor(private readonly shared: string[]) {}
  public lockAccountSelectorsToReject(groups: readonly string[]): Promise<void> {
    this.shared.push(`LOCK ${groups.join(",")}`);
    throw new Error("SENTINEL_SECRET synchronous reject lock failure");
  }
}

async function controllerPlan(): Promise<ControllerPlan> {
  const config = await loadRoutingConfig(ROUTING_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
  return compileControllerPlan(config, projection);
}

function deployment(plan: ControllerPlan): RouterDeployment {
  return {
    schemaVersion: 1,
    mode: "deployment",
    policyVersion: plan.policyVersion,
    controller: { url: "http://127.0.0.1:9090", secretFile: "/tmp/redacted-controller-secret" },
    protectedSources: [{ kind: "vlan", name: "ai-account-safe" }],
  };
}

function adapter(evidence: readonly unknown[]): FirewallProofAdapter {
  return new FirewallProofAdapter(new SequenceEvidenceSource(evidence), new FixedClock(NOW));
}

function noRawSecrets(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.doesNotMatch(`${error.message} ${JSON.stringify(error)}`, /SENTINEL_SECRET|SENTINEL_APPROVED_NODE/);
  return true;
}

function startupRequest(
  plan: ControllerPlan,
  api: ControllerApi,
  proof: FirewallProofAdapter,
  authority: FirewallGenerationAuthority,
  deny: EmergencyDeny,
  lock: EmergencyRejectLock,
  gate: StartupGate = { async proveProtectedPathClosed(): Promise<void> {} },
  deploymentValue: RouterDeployment = deployment(plan),
  stateValue = createInitialRuntimeState(plan, "hk"),
) {
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

test("sealed generation binds static evidence and no public permit factory exists", () => {
  const evidence = staticEvidence();
  const first = sealArtifactGeneration(sealedInput(evidence));
  assert.equal(first.generationId, sealArtifactGeneration(sealedInput(evidence)).generationId);
  assert.notEqual(first.generationId, sealArtifactGeneration(sealedInput(evidence, DIGEST_B)).generationId);
  assert.equal("issueFirewallPermit" in FirewallProof, false);
  assert.throws(() => sealArtifactGeneration({ ...sealedInput(evidence), proofMaximumAgeMs: 0 }));
});

test("static digest, dynamic ruleset continuity, stale, and future evidence fail closed", () => {
  const staticValue = staticEvidence();
  const input = sealedInput(staticValue);
  const staticMismatch = closedEvidence(input, { ...staticValue, protectedSources: ["other-vlan"] });
  assert.equal(evaluateFirewallProof(staticMismatch, undefined, NOW).reasonCode, "generation-drift");

  const dynamicMismatch = closedEvidence(input, staticValue, { generationAfter: DIGEST_B });
  assert.equal(evaluateFirewallProof(dynamicMismatch, undefined, NOW).reasonCode, "generation-drift");

  const stale = closedEvidence(input, staticValue, {}, "2026-07-22T23:59:59.000Z");
  assert.equal(evaluateFirewallProof(stale, undefined, NOW).reasonCode, "stale-evidence");
  const future = closedEvidence(input, staticValue, {}, "2026-07-23T00:02:00.000Z");
  assert.equal(evaluateFirewallProof(future, undefined, NOW).reasonCode, "stale-evidence");
});

test("authority rejects forged self-consistent generations with the wrong plan digest or policy", async () => {
  const plan = await controllerPlan();
  for (const generation of [
    sealArtifactGeneration(sealedInput(staticEvidence(), DIGEST_B)),
    generationForPlan(plan, staticEvidence(), { policyVersion: "2" }),
  ]) {
    const shared: string[] = [];
    const api = new FakeControllerApi(new Map(), shared);
    const deny = new FakeEmergencyDeny(shared);
    const lock = new FakeEmergencyRejectLock(shared);
    await assert.rejects(
      () => executeControllerStartup(startupRequest(plan, api, adapter([closedEvidence(generation)]), new FakeGenerationAuthority(generation), deny, lock)),
      (error: unknown) => error instanceof StartupOrchestratorError && error.phase === "initial-authority" && noRawSecrets(error),
    );
    assert.deepEqual(api.transcript, []);
    assert.deepEqual(lock.calls, [["🔐 Claude Account Guard"]]);
  }
});

test("startup proof and gate failures contain before normal controller APIs", async () => {
  const plan = await controllerPlan();
  const expected = generationForPlan(plan);
  for (const [proof, gate] of [
    [adapter([closedEvidence(expected, staticEvidence(), { directIpv4: "allowed" })]), { async proveProtectedPathClosed(): Promise<void> { throw new Error("SENTINEL_SECRET gate"); } }],
    [adapter([closedEvidence(expected)]), { async proveProtectedPathClosed(): Promise<void> { throw new Error("SENTINEL_SECRET gate"); } }],
  ] as const) {
    const shared: string[] = [];
    const api = new FakeControllerApi(new Map(), shared);
    const deny = new FakeEmergencyDeny(shared);
    const lock = new FakeEmergencyRejectLock(shared);
    await assert.rejects(
      () => executeControllerStartup(startupRequest(plan, api, proof, new FakeGenerationAuthority(expected), deny, lock, gate)),
      noRawSecrets,
    );
    assert.deepEqual(api.transcript, []);
    assert.equal(deny.reasons.length, 1);
    assert.deepEqual(lock.calls, [["🔐 Claude Account Guard"]]);
  }
});

test("containment attempts reject lock even when emergency deny fails and reports only redacted aggregate status", async () => {
  const plan = await controllerPlan();
  const expected = generationForPlan(plan);
  const shared: string[] = [];
  const api = new FakeControllerApi(new Map(), shared);
  const deny = new FakeEmergencyDeny(shared, new Error("SENTINEL_SECRET deny failure"));
  const lock = new FakeEmergencyRejectLock(shared);
  await assert.rejects(
    () => executeControllerStartup(startupRequest(
      plan,
      api,
      adapter([closedEvidence(expected, staticEvidence(), { directIpv4: "allowed" })]),
      new FakeGenerationAuthority(expected),
      deny,
      lock,
    )),
    (error: unknown) => error instanceof StartupOrchestratorError && error.containment.denyFailed && !error.containment.rejectLockFailed && noRawSecrets(error),
  );
  assert.deepEqual(lock.calls, [["🔐 Claude Account Guard"]]);
  assert.ok(shared.some((entry) => entry.startsWith("DENY ")));
  assert.ok(shared.some((entry) => entry.startsWith("LOCK ")));
});

test("containment defers synchronous emergency throws so both collaborators are always attempted", async () => {
  const plan = await controllerPlan();
  const incompatible = generationForPlan(plan, staticEvidence(), { policyVersion: "2" });
  for (const [deny, lock, expectedFlags] of [
    [new SynchronousThrowDeny([]), new FakeEmergencyRejectLock([]), { denyFailed: true, rejectLockFailed: false }],
    [new FakeEmergencyDeny([]), new SynchronousThrowRejectLock([]), { denyFailed: false, rejectLockFailed: true }],
  ] as const) {
    const shared: string[] = [];
    const actualDeny = deny instanceof SynchronousThrowDeny ? new SynchronousThrowDeny(shared) : new FakeEmergencyDeny(shared);
    const actualLock = lock instanceof SynchronousThrowRejectLock ? new SynchronousThrowRejectLock(shared) : new FakeEmergencyRejectLock(shared);
    await assert.rejects(
      () => executeControllerStartup(startupRequest(
        plan,
        new FakeControllerApi(new Map(), shared),
        adapter([closedEvidence(incompatible)]),
        new FakeGenerationAuthority(incompatible),
        actualDeny,
        actualLock,
      )),
      (error: unknown) => error instanceof StartupOrchestratorError &&
        error.containment.denyFailed === expectedFlags.denyFailed &&
        error.containment.rejectLockFailed === expectedFlags.rejectLockFailed &&
        noRawSecrets(error),
    );
    assert.equal(shared.some((entry) => entry.startsWith("DENY ")), true);
    assert.equal(shared.some((entry) => entry.startsWith("LOCK ")), true);
  }
});

test("account lock and readback failures contain immediately and do not continue normal calls", async () => {
  const plan = await controllerPlan();
  const expected = generationForPlan(plan);
  for (const failure of [
    { selectGroup: "🔐 Claude Account Guard" },
    { readGroup: "🔐 Claude Account Guard" },
  ]) {
    const shared: string[] = [];
    const api = new FakeControllerApi(new Map(), shared, failure);
    const deny = new FakeEmergencyDeny(shared);
    const lock = new FakeEmergencyRejectLock(shared);
    await assert.rejects(
      () => executeControllerStartup(startupRequest(plan, api, adapter([closedEvidence(expected)]), new FakeGenerationAuthority(expected), deny, lock)),
      noRawSecrets,
    );
    assert.equal(deny.reasons.length, 1);
    assert.deepEqual(lock.calls, [["🔐 Claude Account Guard"]]);
    assert.equal(api.transcript.some((entry) => entry.includes("@profile/")), false);
  }
});

test("generation invalidation contains once and prevents subsequent normal calls", async () => {
  const plan = await controllerPlan();
  const expected = generationForPlan(plan);
  const changed = generationForPlan(plan, staticEvidence(), { topologySha256: DIGEST_B });
  const shared: string[] = [];
  const api = new FakeControllerApi(new Map(), shared);
  const deny = new FakeEmergencyDeny(shared);
  const lock = new FakeEmergencyRejectLock(shared);
  await assert.rejects(
    () => executeControllerStartup(startupRequest(
      plan,
      api,
      adapter([closedEvidence(expected), closedEvidence(changed)]),
      new FakeGenerationAuthority(expected),
      deny,
      lock,
    )),
    (error: unknown) => error instanceof StartupOrchestratorError && error.phase === "proof-invalidated" && noRawSecrets(error),
  );
  assert.deepEqual(api.transcript, []);
  assert.equal(shared.filter((entry) => entry.startsWith("DENY ")).length, 1);
  assert.equal(shared.filter((entry) => entry.startsWith("LOCK ")).length, 1);
});

test("startup snapshots and freezes every execution input before authority or gate mutation", async () => {
  const plan = await controllerPlan();
  const expected = generationForPlan(plan);
  const deploymentValue = deployment(plan);
  const stateValue = createInitialRuntimeState(plan, "hk");
  const shared: string[] = [];
  const api = new FakeControllerApi(new Map(), shared);
  const deny = new FakeEmergencyDeny(shared);
  const lock = new FakeEmergencyRejectLock(shared);
  let authorityPlan: ControllerPlan | undefined;
  const authority: FirewallGenerationAuthority = {
    async expectedSealedArtifact(snapshot: ControllerPlan): Promise<SealedArtifactGeneration> {
      authorityPlan = snapshot;
      assert.notStrictEqual(snapshot, plan);
      assert.equal(Object.isFrozen(snapshot), true);
      assert.equal(Object.isFrozen(snapshot.accountProtected), true);
      assert.equal(Object.isFrozen(snapshot.modes), true);
      assert.throws(() => {
        (snapshot.accountProtected as unknown as Array<unknown>).push({});
      });
      (plan as unknown as { accountProtected: Array<unknown> }).accountProtected = [];
      (plan.modes as unknown as Record<string, unknown>).hk = { hiddenSelections: [] };
      return expected;
    },
  };
  const result = await executeControllerStartup(startupRequest(
    plan,
    api,
    adapter([closedEvidence(expected)]),
    authority,
    deny,
    lock,
    {
      async proveProtectedPathClosed(): Promise<void> {
        delete (plan.modes as unknown as Record<string, unknown>).hk;
        (deploymentValue.controller as unknown as { url: string }).url = "http://controller.invalid:9090";
        (stateValue as unknown as { activeMode: string }).activeMode = "missing";
        shared.push("GATE");
      },
    },
    deploymentValue,
    stateValue,
  ));
  assert.ok(authorityPlan !== undefined);
  assert.equal(plan.accountProtected.length, 0);
  assert.equal(plan.modes.hk, undefined);
  assert.equal(deploymentValue.controller.url, "http://controller.invalid:9090");
  assert.equal(stateValue.activeMode, "missing");
  assert.equal(result.operations.some((operation) => operation.phase === "lock" && operation.group === "🔐 Claude Account Guard"), true);
  assert.equal(result.operations.some((operation) => operation.phase === "hidden-update"), true);
  assert.equal(deny.reasons.length, 0);
  assert.equal(lock.calls.length, 0);
});

test("closed proof revalidates before every normal API and completes the Phase 4d transaction", async () => {
  const plan = await controllerPlan();
  const expected = generationForPlan(plan);
  const shared: string[] = [];
  const api = new FakeControllerApi(new Map(), shared);
  const deny = new FakeEmergencyDeny(shared);
  const lock = new FakeEmergencyRejectLock(shared);
  const source = new SequenceEvidenceSource([closedEvidence(expected)], shared);
  const result = await executeControllerStartup(startupRequest(
    plan,
    api,
    new FirewallProofAdapter(source, new FixedClock(NOW)),
    new FakeGenerationAuthority(expected),
    deny,
    lock,
    { async proveProtectedPathClosed(): Promise<void> { shared.push("GATE"); } },
  ));
  assert.equal(result.rolledBack, false);
  assert.equal(shared.includes("GATE"), true);
  for (const [index, entry] of shared.entries()) {
    if (entry.startsWith("GET ") || entry.startsWith("PUT ")) assert.equal(shared[index - 1], "PROOF");
  }
  assert.equal(deny.reasons.length, 0);
  assert.equal(lock.calls.length, 0);
});
