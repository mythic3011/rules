import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileMihomoFragment } from "#routing/mihomo-projection.js";
import {
  compileControllerPlan,
  compileFirewallSemanticPlan,
} from "#routing/runtime-plan.js";
import {
  ApprovedEgressSchema,
  RouterLocalConfigError,
  createInitialRuntimeState,
  decideAccountSafety,
  validateAccountMaterializedGraph,
  validateRouterLocalConfig,
} from "#routing/router-local.js";
import {
  validateEffectiveCutover,
  EffectiveCutoverError,
} from "#routing/cutover-validator.js";
import {
  compileFirewallAdapterPlan,
  RuntimeTopologyError,
} from "#routing/runtime-topology.js";
import { RoutingConfigSchema } from "#routing/schema.js";
import { validateRoutingSemantics } from "#routing/semantic-validator.js";
import { loadCanonicalInputs } from "#routing-test/support/canonical-inputs.js";
import { deploymentFixture, egressFixture, stateFixture, topologyFixture } from "#routing-test/support/fixtures.js";

test("controller plan materializes every access matrix into hidden profile selections only", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const plan = compileControllerPlan(config, projection);
  assert.deepEqual(Object.keys(plan.modeControl.modes), [
    "hk",
    "jp",
    "sg",
    "us",
  ]);
  assert.equal(plan.modeControl.visibleGroup, "🌍 AI 存取模式");
  for (const mode of Object.values(plan.modes)) {
    assert.ok(mode.hiddenSelections.length > 0);
    assert.ok(
      mode.hiddenSelections.every((selection) =>
        selection.group.startsWith("@profile/"),
      ),
    );
  }
  const claude = plan.accountProtected.find(
    (service) => service.serviceId === "claude",
  );
  assert.deepEqual(claude?.canonicalApprovedNodeIds, [
    "US-Claude-01",
    "US-Claude-02",
  ]);
  assert.deepEqual(claude?.canonicalApprovedBindings, [
    { approvedId: "US-Claude-01", provider: "provider1" },
    { approvedId: "US-Claude-02", provider: "provider1" },
  ]);
  assert.equal(claude?.initialSelection, "REJECT");
  assert.equal(
    claude?.lockRequest.proxyPath,
    "/proxies/%F0%9F%94%90%20Claude%20Account%20Guard",
  );
  assert.ok(
    plan.modes.hk?.hiddenSelections.every((selection) =>
      selection.proxyPath.startsWith("/proxies/%40profile%2F"),
    ),
  );
  assert.equal(plan.api.requestEncoding, "precomputed-percent-path+jshn-body");
  assert.deepEqual(compileFirewallSemanticPlan(config).deny, [
    "direct-wan-v4",
    "direct-wan-v6",
    "external-dns-tcp-udp-53",
    "dot-tcp-udp-853",
    "direct-quic-udp-443",
  ]);
});

test("controller plan precomputes one-segment UTF-8 API paths for reserved selector characters", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const mutated = structuredClone(config);
  const claude = mutated.services.claude;
  assert.ok(claude !== undefined);
  claude.selector.visibleGroup = "🔐 /?#% Claude";
  const account = compileControllerPlan(mutated, projection)
    .accountProtected[0];
  assert.equal(
    account?.lockRequest.proxyPath,
    "/proxies/%F0%9F%94%90%20%2F%3F%23%25%20Claude",
  );
});


test("firewall adapter plan requires exact dual-stack topology and has no runtime defaults", async () => {
  const { config } = await loadCanonicalInputs();
  const plan = compileFirewallAdapterPlan(
    compileFirewallSemanticPlan(config),
    topologyFixture(),
  );
  assert.equal(plan.applyMode, "insufficient-pending-live-fw4-openclash-proof");
  assert.ok(plan.guardedDraft.some((line) => line.includes("192.0.2.10")));
  assert.ok(plan.guardedDraft.some((line) => line.includes("2001:db8::10")));
  assert.equal(plan.discoveredInputs.routingMark, "0x162");
  assert.ok(
    plan.guardRequirements.includes("default-deny-protected-wan-v4-v6"),
  );
  const incomplete = topologyFixture();
  delete (incomplete.protectedSources as Record<string, unknown>).ipv6;
  assert.throws(
    () =>
      compileFirewallAdapterPlan(
        compileFirewallSemanticPlan(config),
        incomplete,
      ),
    RuntimeTopologyError,
  );
  const broad = topologyFixture();
  (broad.protectedSources as Record<string, unknown>).ipv4 = ["192.0.2.0/24"];
  assert.throws(
    () =>
      compileFirewallAdapterPlan(compileFirewallSemanticPlan(config), broad),
    RuntimeTopologyError,
  );
});


test("account-protected detection follows the protection-class kind rather than a fixed ID", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const mutated = structuredClone(config);
  const protection = mutated.protectionClasses["account-protected"];
  assert.ok(protection !== undefined);
  delete mutated.protectionClasses["account-protected"];
  mutated.protectionClasses["safe-claude"] = protection;
  const claude = mutated.services.claude;
  assert.ok(claude !== undefined);
  claude.protectionClass = "safe-claude";
  assert.equal(validateRoutingSemantics(mutated).length, 0);
  assert.equal(
    compileControllerPlan(mutated, projection).accountProtected[0]?.serviceId,
    "claude",
  );
  const fragment = compileMihomoFragment(mutated, projection, "hk");
  assert.ok(fragment.rules.includes("RULE-SET,AI_Claude_Classical,REJECT"));
});


test("router-local documents require exact local egress mapping and preserve the initial locked state", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const plan = compileControllerPlan(config, projection);
  const result = validateRouterLocalConfig(
    deploymentFixture(),
    egressFixture(),
    stateFixture(),
    plan,
  );
  assert.equal(result.state.accounts.claude?.selectedNode, "REJECT");

  const wrongVersion = stateFixture();
  wrongVersion.policyVersion = "2";
  assert.throws(
    () =>
      validateRouterLocalConfig(
        deploymentFixture(),
        egressFixture(),
        wrongVersion,
        plan,
      ),
    RouterLocalConfigError,
  );

  const missingBinding = egressFixture();
  const claude = missingBinding.services as Record<
    string,
    { bindings: unknown[] }
  >;
  claude.claude?.bindings.pop();
  assert.throws(
    () =>
      validateRouterLocalConfig(
        deploymentFixture(),
        missingBinding,
        stateFixture(),
        plan,
      ),
    RouterLocalConfigError,
  );

  const unsafeNode = egressFixture();
  const unsafeClaude = unsafeNode.services as Record<
    string,
    { bindings: Array<{ approvedId: string; node: string }> }
  >;
  const binding = unsafeClaude.claude?.bindings[0];
  if (binding !== undefined) binding.node = "DIRECT";
  assert.throws(
    () =>
      validateRouterLocalConfig(
        deploymentFixture(),
        unsafeNode,
        stateFixture(),
        plan,
      ),
    RouterLocalConfigError,
  );
});

test("account safety decisions reset stale, revoked, and unverified armed selections to REJECT", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const plan = compileControllerPlan(config, projection);
  const initial = createInitialRuntimeState(plan, "hk");
  assert.deepEqual(initial.accounts.claude, {
    selectedNode: "REJECT",
    verifiedPolicyVersion: null,
    verifiedNode: null,
    resetReason: "none",
  });
  assert.deepEqual(
    decideAccountSafety(
      plan,
      ApprovedEgressSchema.parse(egressFixture()),
      initial,
    ),
    [{ serviceId: "claude", selection: "REJECT", resetReason: "none" }],
  );

  const armed = stateFixture();
  const armedAccount = (
    armed.accounts as Record<string, Record<string, unknown>>
  ).claude;
  assert.ok(armedAccount !== undefined);
  armedAccount.selectedNode = "EXAMPLE-APPROVED-NODE-ONE";
  armedAccount.verifiedNode = "EXAMPLE-APPROVED-NODE-ONE";
  armedAccount.verifiedPolicyVersion = "1";
  const valid = validateRouterLocalConfig(
    deploymentFixture(),
    egressFixture(),
    armed,
    plan,
  );
  assert.deepEqual(decideAccountSafety(plan, valid.egress, valid.state), [
    {
      serviceId: "claude",
      selection: "EXAMPLE-APPROVED-NODE-ONE",
      resetReason: "none",
    },
  ]);

  const stale = structuredClone(valid.state);
  const staleAccount = stale.accounts.claude;
  assert.ok(staleAccount !== undefined);
  staleAccount.verifiedPolicyVersion = "0";
  assert.deepEqual(decideAccountSafety(plan, valid.egress, stale), [
    {
      serviceId: "claude",
      selection: "REJECT",
      resetReason: "selected-node-missing",
    },
  ]);
  const revoked = structuredClone(valid.egress);
  const revokedClaude = revoked.services.claude;
  assert.ok(revokedClaude !== undefined);
  revokedClaude.revokedNodes.push("EXAMPLE-APPROVED-NODE-ONE");
  assert.deepEqual(decideAccountSafety(plan, revoked, valid.state), [
    { serviceId: "claude", selection: "REJECT", resetReason: "node-revoked" },
  ]);
  const changedPlan = { ...plan, policyVersion: "2" as const };
  assert.deepEqual(
    decideAccountSafety(changedPlan, valid.egress, valid.state),
    [
      {
        serviceId: "claude",
        selection: "REJECT",
        resetReason: "policy-version-change",
      },
    ],
  );
});

test("materialized account graph accepts only REJECT or exact approved nodes", () => {
  validateAccountMaterializedGraph(
    "🔐 Claude Account Guard",
    ["EXAMPLE-APPROVED-NODE-ONE"],
    {
      groups: {
        "🔐 Claude Account Guard": ["REJECT", "EXAMPLE-APPROVED-NODE-ONE"],
      },
    },
  );
  assert.throws(
    () =>
      validateAccountMaterializedGraph(
        "🔐 Claude Account Guard",
        ["EXAMPLE-APPROVED-NODE-ONE"],
        {
          groups: { "🔐 Claude Account Guard": ["DIRECT"] },
        },
      ),
    RouterLocalConfigError,
  );
  assert.throws(
    () =>
      validateAccountMaterializedGraph(
        "🔐 Claude Account Guard",
        ["EXAMPLE-APPROVED-NODE-ONE"],
        {
          groups: {
            "🔐 Claude Account Guard": ["US Auto"],
            "US Auto": ["EXAMPLE-APPROVED-NODE-ONE"],
          },
        },
      ),
    RouterLocalConfigError,
  );
});

test("effective cutover proof requires account DNS selector, startup gate, and frozen legacy authority", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const plan = compileControllerPlan(config, projection);
  const local = validateRouterLocalConfig(
    deploymentFixture(),
    egressFixture(),
    stateFixture(),
    plan,
  );
  const proof = {
    schemaVersion: 1,
    policyVersion: "1",
    accountPhase: "locked-pre-release",
    controller: { url: "http://127.0.0.1:9090", auth: "secret-file" },
    mihomoVersion: "1.19.0",
    proxyStates: {
      "🔐 Claude Account Guard": {
        type: "Selector",
        all: [
          "REJECT",
          "EXAMPLE-APPROVED-NODE-ONE",
          "EXAMPLE-APPROVED-NODE-TWO",
        ],
        now: "REJECT",
        emptyFallback: "REJECT",
        udp: true,
      },
    },
    dnsRuntime: {
      source: "mihomo-running-config",
      policies: {
        "rule-set:AI_Claude_Classical": {
          selector: "🔐 Claude Account Guard",
          fallback: false,
        },
      },
    },
    startup: {
      storeSelectedDeclared: true,
      accountGate: "locked-until-explicit-selection",
    },
    legacyShellEnforcement: "frozen-non-authoritative",
  };
  assert.equal(
    validateEffectiveCutover(plan, local.deployment, local.egress, proof)
      .policyVersion,
    "1",
  );
  proof.dnsRuntime.policies["rule-set:AI_Claude_Classical"].fallback = true;
  assert.throws(
    () => validateEffectiveCutover(plan, local.deployment, local.egress, proof),
    EffectiveCutoverError,
  );
});
