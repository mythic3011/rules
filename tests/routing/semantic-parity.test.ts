import assert from "node:assert/strict";
import test from "node:test";

import {
  allLegacyAiServiceIds,
  canonicalServiceIdFromLegacy,
  canonicalServiceIdFromLegacyGroup,
} from "#routing/migration-adapter.js";
import {
  compareSemanticParity,
  deriveLegacyEffectiveConsumer,
  loadLegacyParityArtifacts,
  type LegacyParityArtifacts,
} from "#routing/semantic-parity.js";
import { validateRoutingSemantics } from "#routing/semantic-validator.js";
import type { RoutingConfig } from "#routing/schema.js";
import { loadCanonicalInputs } from "#routing-test/support/canonical-inputs.js";

const CLOUDCODE = "cloudcode-pa.googleapis.com";

async function loadParityFixture(): Promise<{
  config: RoutingConfig;
  artifacts: LegacyParityArtifacts;
}> {
  const { project, config } = await loadCanonicalInputs();
  return { config, artifacts: await loadLegacyParityArtifacts(project) };
}

test("semantic parity passes for every service currently in core/*.yaml", async () => {
  const { config, artifacts } = await loadParityFixture();
  const report = compareSemanticParity(config, artifacts);
  const bothIds = Object.keys(config.services).filter((id) => artifacts.catalog.has(id));
  assert.equal(report.status, "pass", JSON.stringify(report.mismatches, null, 2));
  assert.deepEqual(report.coverage.both, bothIds.sort());
  assert.ok(report.coverage.pythonOnly.includes("antigravity"));
  assert.ok(report.coverage.pythonOnly.includes("android-studio-ai"));
  assert.ok(report.coverage.canonicalOnly.includes("windsurf"));
  assert.ok(report.coverage.canonicalOnly.includes("flow-music"));
  for (const serviceId of bothIds) {
    assert.equal(report.services[serviceId]?.sides, "both");
    assert.deepEqual(report.services[serviceId]?.mismatches, []);
  }
  assert.equal(report.terminal.relaxed, "🐟 漏網之魚");
  assert.equal(report.terminal.strict, "⛔ 拒絕");
  assert.ok(
    report.warnings.some(
      (entry) =>
        entry.serviceId === "jules" &&
        entry.dimension === "projection-presence" &&
        entry.severity === "warn",
    ),
  );
});

test("claude dns-policy global-ai divergence is a phase1 warning, not a mismatch", async () => {
  const { config, artifacts } = await loadParityFixture();
  const report = compareSemanticParity(config, artifacts);
  assert.equal(report.status, "pass");
  assert.equal(
    report.mismatches.find((entry) => entry.serviceId === "claude" && entry.dimension === "dns-policy"),
    undefined,
    JSON.stringify(report.mismatches, null, 2),
  );
  const warning = report.warnings.find(
    (entry) => entry.serviceId === "claude" && entry.dimension === "dns-policy",
  );
  assert.ok(warning !== undefined, JSON.stringify(report.warnings, null, 2));
  assert.equal(warning.severity, "warn");
  assert.match(warning.message, /global-ai/);
  assert.match(warning.message, /phase1 known divergence/);
});

test("legacyEffectiveConsumer equals first-match consumer from generated YAML rule order", async () => {
  const { config, artifacts } = await loadParityFixture();
  const derived = deriveLegacyEffectiveConsumer(artifacts.relaxedYaml, artifacts.catalog, CLOUDCODE);
  assert.equal(derived, "antigravity");
  const backend = config.sharedBackends["google-code-assist"];
  assert.ok(backend !== undefined);
  assert.equal(backend.legacyEffectiveConsumer, derived);
  const report = compareSemanticParity(config, artifacts);
  const row = report.sharedBackends.find((entry) => entry.backendId === "google-code-assist");
  assert.equal(row?.ok, true);
  assert.equal(row?.derived, "antigravity");
});

test("negative: flipping protection class fails candidate-shape for that service", async () => {
  const { config, artifacts } = await loadParityFixture();
  const mutated = structuredClone(config);
  const chatgpt = mutated.services.chatgpt;
  assert.ok(chatgpt !== undefined);
  chatgpt.protectionClass = "direct-capable";
  const report = compareSemanticParity(mutated, artifacts);
  assert.equal(report.status, "fail");
  const mismatch = report.mismatches.find(
    (entry) => entry.serviceId === "chatgpt" && entry.dimension === "candidate-shape",
  );
  assert.ok(mismatch !== undefined, JSON.stringify(report.mismatches, null, 2));
  assert.match(mismatch.message, /DIRECT/);
  assert.equal(mismatch.severity, "fail");
});

test("negative: dropping account-protected DNS fails dns-policy for claude", async () => {
  const { config, artifacts } = await loadParityFixture();
  const mutated = structuredClone(config);
  const dns = mutated.dns.profiles.default;
  assert.ok(dns !== undefined);
  delete dns.servicePolicies.claude;
  const report = compareSemanticParity(mutated, artifacts);
  assert.equal(report.status, "fail");
  const mismatch = report.mismatches.find(
    (entry) => entry.serviceId === "claude" && entry.dimension === "dns-policy",
  );
  assert.ok(mismatch !== undefined, JSON.stringify(report.mismatches, null, 2));
  assert.match(mismatch.message, /refuse/);
});

test("negative: reordering relaxed YAML regions fails region-order", async () => {
  const { config, artifacts } = await loadParityFixture();
  const chatgptBlock = artifacts.relaxedYaml.indexOf('  - name: "🤖 ChatGPT"');
  assert.ok(chatgptBlock >= 0);
  const us = '"🇺🇸 美國節點"';
  const jp = '"🇯🇵 日本節點"';
  const head = artifacts.relaxedYaml.slice(0, chatgptBlock);
  const rest = artifacts.relaxedYaml.slice(chatgptBlock);
  const autoMarker = '  - name: "🤖 ChatGPT · 自動"';
  const autoAt = rest.indexOf(autoMarker);
  const selectBlock = autoAt >= 0 ? rest.slice(0, autoAt) : rest;
  const after = autoAt >= 0 ? rest.slice(autoAt) : "";
  assert.ok(selectBlock.includes(us) && selectBlock.includes(jp));
  const corruptedSelect = selectBlock.replace(us, "__TMP_US__").replace(jp, us).replace("__TMP_US__", jp);
  const mutatedArtifacts = {
    ...artifacts,
    relaxedYaml: `${head}${corruptedSelect}${after}`,
  };
  const report = compareSemanticParity(config, mutatedArtifacts);
  assert.equal(report.status, "fail");
  const mismatch = report.mismatches.find(
    (entry) => entry.serviceId === "chatgpt" && entry.dimension === "region-order",
  );
  assert.ok(mismatch !== undefined, JSON.stringify(report.mismatches, null, 2));
  assert.match(mismatch.message, /primaryOrder/);
});

test("sharedBackends validation rejects unknown consumer, duplicate domain, and consumer-missing legacyEffectiveConsumer", async () => {
  const { config } = await loadCanonicalInputs();

  const unknownConsumer = structuredClone(config);
  const backend = unknownConsumer.sharedBackends["google-code-assist"];
  assert.ok(backend !== undefined);
  backend.consumers = ["not-a-service"];
  backend.legacyEffectiveConsumer = undefined;
  assert.ok(
    validateRoutingSemantics(unknownConsumer).some(
      (entry) =>
        entry.code === "missing-reference" &&
        entry.path.join(".") === "sharedBackends.google-code-assist.consumers.0",
    ),
  );

  const duplicateDomain = structuredClone(config);
  duplicateDomain.sharedBackends.other = {
    domains: [CLOUDCODE],
    consumers: ["chatgpt"],
  };
  assert.ok(
    validateRoutingSemantics(duplicateDomain).some(
      (entry) =>
        entry.code === "policy-invariant" &&
        entry.path.join(".").startsWith("sharedBackends.other.domains") &&
        entry.message.includes(CLOUDCODE),
    ),
  );

  const missingLegacy = structuredClone(config);
  const codeAssist = missingLegacy.sharedBackends["google-code-assist"];
  assert.ok(codeAssist !== undefined);
  codeAssist.legacyEffectiveConsumer = "chatgpt";
  assert.ok(
    validateRoutingSemantics(missingLegacy).some(
      (entry) =>
        entry.code === "policy-invariant" &&
        entry.path.join(".") === "sharedBackends.google-code-assist.legacyEffectiveConsumer",
    ),
  );
});

test("canonical google-code-assist consumers may be catalog identities not yet in core services", async () => {
  const { config } = await loadCanonicalInputs();
  assert.equal(config.services["android-studio-ai"], undefined);
  assert.equal(config.services.antigravity, undefined);
  assert.equal(canonicalServiceIdFromLegacy("android-studio-ai"), "android-studio-ai");
  assert.equal(canonicalServiceIdFromLegacy("antigravity"), "antigravity");
  assert.deepEqual(
    validateRoutingSemantics(config).filter((entry) =>
      entry.path.join(".").startsWith("sharedBackends"),
    ),
    [],
  );
});

test("migration adapter maps all 22 python catalog identities", async () => {
  const ids = allLegacyAiServiceIds();
  assert.equal(ids.length, 22);
  assert.equal(canonicalServiceIdFromLegacyGroup("🧑‍💻 Copilot"), "copilot");
  assert.equal(canonicalServiceIdFromLegacyGroup("🤗 Hugging Face"), "huggingface");
  assert.equal(canonicalServiceIdFromLegacyGroup("🤖 Android Studio AI"), "android-studio-ai");
  assert.equal(canonicalServiceIdFromLegacy("ai-cn-other"), "ai-cn-other");
});
