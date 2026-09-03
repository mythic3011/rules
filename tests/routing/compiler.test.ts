import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileIniMvpPlan,
  IniMvpPlanSchema,
} from "#routing/ini-mvp-plan.js";
import {
  compileRoutingProfile,
  RoutingCompileError,
} from "#routing/compiler.js";
import { validateRoutingSemantics } from "#routing/semantic-validator.js";
import type { RoutingConfig } from "#routing/schema.js";
import {
  canonicalArtifactPath,
  loadCanonicalInputs,
} from "#routing-test/support/canonical-inputs.js";
import { MIHOMO_PROJECTION, VALID_DIRECTORY } from "#routing-test/support/paths.js";

test("canonical HK matrix and protected Claude configuration validate", async () => {
  const { config } = await loadCanonicalInputs();
  const hk = config.accessProfiles.hk;
  const claude = config.services.claude;
  assert.ok(hk !== undefined);
  assert.ok(claude !== undefined);
  assert.equal(hk.displayName, "🇭🇰 香港存取策略");
  assert.equal(claude.selector.kind, "explicit-node");
  assert.equal(claude.defaultRoute, "reject");
  assert.equal(config.services.windsurf?.protectionClass, "proxy-required");
  assert.equal(config.services.huggingface?.protectionClass, "proxy-required");
  assert.ok(config.services["flow-music"]?.dependencies.some((dependency) => dependency.id === "producer-media"));
  assert.deepEqual(Object.keys(config.accessProfiles).sort(), [
    "hk",
    "jp",
    "sg",
    "us",
  ]);
  assert.deepEqual(validateRoutingSemantics(config), []);
});

test("INI MVP plan owns ordered rules/groups, pins providers, and keeps Claude reject-only", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const plan = compileIniMvpPlan(config, projection);
  const vpsdance = projection.sources.vpsdance;
  assert.ok(vpsdance !== undefined);
  assert.deepEqual(plan.migration.migratedServiceIds, [
    "claude",
    "windsurf",
    "huggingface",
  ]);
  assert.deepEqual(plan.migration.legacyReplacementIds, ["claude"]);
  assert.equal(plan.profile, "hk");
  assert.deepEqual(plan.externalGroups, ["🎯 全球直連", "⛔ 拒絕"]);
  const [claudeRule, claudeReject] = plan.rules.beforeLegacy;
  assert.equal(claudeRule?.kind, "remote-classical");
  assert.equal(claudeReject?.kind, "remote-classical");
  if (
    claudeRule?.kind !== "remote-classical" ||
    claudeReject?.kind !== "remote-classical"
  )
    throw new Error("expected Claude remote rule pair");
  assert.equal(claudeRule.target, "🔐 Claude Account Guard");
  assert.equal(claudeReject.target, "⛔ 拒絕");
  assert.equal(claudeRule.url, claudeReject.url);
  assert.equal(claudeRule.interval, claudeReject.interval);
  assert.equal(
    claudeRule.url,
    `${vpsdance.rawBaseUrl}/${vpsdance.revision}/rules/clash/anthropic.yaml`,
  );
  assert.deepEqual(
    plan.rules.afterLegacy.map((rule) =>
      rule.kind === "remote-classical"
        ? rule.target
        : `${rule.target}:${rule.value}`,
    ),
    [
      "🌊 Windsurf",
      "🤗 Hugging Face",
      "🤖 AI Other",
      "🤖 AI Other:google-deepmind",
      "🤖 AI Other:category-ai-!cn",
    ],
  );
  const claudeGroup = plan.groups.find(
    (group) => group.name === "🔐 Claude Account Guard",
  );
  const windsurfGroup = plan.groups.find(
    (group) => group.name === "🌊 Windsurf",
  );
  const aiOtherGroup = plan.groups.find(
    (group) => group.name === "🤖 AI Other",
  );
  const stableGroups = plan.groups.filter((group) =>
    group.candidates.some((candidate) => candidate.kind === "node-filter"),
  );
  assert.deepEqual(claudeGroup?.candidates, [
    { kind: "group-ref", value: "⛔ 拒絕" },
  ]);
  assert.deepEqual(
    windsurfGroup?.candidates.map((candidate) => candidate.value),
    ["🇺🇸 US Stable", "🇸🇬 SG Stable", "🇯🇵 JP Stable", "⛔ 拒絕"],
  );
  assert.deepEqual(
    aiOtherGroup?.candidates.map((candidate) => candidate.value),
    ["🎯 全球直連", "🇺🇸 US Stable", "🇸🇬 SG Stable", "🇯🇵 JP Stable", "⛔ 拒絕"],
  );
  for (const group of stableGroups)
    assert.equal(
      group.candidates[0]?.kind === "group-ref" &&
        group.candidates[0].value === "⛔ 拒絕",
      true,
    );
  assert.doesNotThrow(() => IniMvpPlanSchema.parse(plan));

  const invalid = structuredClone(plan);
  const firstGroup = invalid.groups[0];
  if (firstGroup === undefined) throw new Error("expected group");
  firstGroup.candidates.push(structuredClone(firstGroup.candidates[0]!));
  assert.throws(() => IniMvpPlanSchema.parse(invalid));

  const mustReject = (candidate: unknown): void => {
    assert.throws(() => IniMvpPlanSchema.parse(candidate));
  };
  const directClaude = structuredClone(plan);
  directClaude.rules.beforeLegacy[0]!.target = "🎯 全球直連";
  mustReject(directClaude);

  const mismatchedClaudeTerminal = structuredClone(plan);
  const terminal = mismatchedClaudeTerminal.rules.beforeLegacy[1];
  if (terminal?.kind !== "remote-classical")
    throw new Error("expected Claude terminal reject");
  terminal.url = "https://example.invalid/anthropic.yaml";
  mustReject(mismatchedClaudeTerminal);

  const missingProtectedGroup = structuredClone(plan);
  missingProtectedGroup.accountProtection.protectedGroup =
    "Missing Claude Guard";
  mustReject(missingProtectedGroup);

  const filteredGroupNotRejectFirst = structuredClone(plan);
  const stableGroup = filteredGroupNotRejectFirst.groups.find((group) =>
    group.candidates.some((candidate) => candidate.kind === "node-filter"),
  );
  if (stableGroup === undefined)
    throw new Error("expected stable node-filter group");
  stableGroup.candidates.reverse();
  mustReject(filteredGroupNotRejectFirst);

  const unresolvedRuleTarget = structuredClone(plan);
  unresolvedRuleTarget.rules.afterLegacy[0]!.target = "Missing Target";
  mustReject(unresolvedRuleTarget);

  const unresolvedGroupReference = structuredClone(plan);
  const unresolvedGroup = unresolvedGroupReference.groups.find(
    (group) => group.name === "🌊 Windsurf",
  );
  if (unresolvedGroup === undefined) throw new Error("expected Windsurf group");
  unresolvedGroup.candidates[0] = { kind: "group-ref", value: "Missing Group" };
  mustReject(unresolvedGroupReference);

  const cyclicGroups = structuredClone(plan);
  const cycleLeft = cyclicGroups.groups.find(
    (group) => group.name === "🌊 Windsurf",
  );
  const cycleRight = cyclicGroups.groups.find(
    (group) => group.name === "🤗 Hugging Face",
  );
  if (cycleLeft === undefined || cycleRight === undefined)
    throw new Error("expected service groups for cycle test");
  cycleLeft.candidates = [{ kind: "group-ref", value: cycleRight.name }];
  cycleRight.candidates = [{ kind: "group-ref", value: cycleLeft.name }];
  mustReject(cyclicGroups);

  const legacyReplacementNotMigrated = structuredClone(plan);
  legacyReplacementNotMigrated.migration.legacyReplacementIds = [
    "not-migrated",
  ];
  mustReject(legacyReplacementNotMigrated);
});

test("INI MVP puts the HK effective route first and rejects divergent AI Other routes", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const hk = config.accessProfiles.hk;
  const projectedHk = projection.profiles.hk;
  if (hk === undefined || projectedHk === undefined)
    throw new Error("expected HK profile");
  const overridden: RoutingConfig = {
    ...config,
    accessProfiles: {
      ...config.accessProfiles,
      hk: {
        ...hk,
        serviceOverrides: { ...hk.serviceOverrides, windsurf: "sg-stable" },
      },
    },
  };
  const overriddenPlan = compileIniMvpPlan(overridden, projection);
  const windsurf = overriddenPlan.groups.find(
    (group) => group.name === "🌊 Windsurf",
  );
  assert.deepEqual(
    windsurf?.candidates.map((candidate) => candidate.value),
    ["🇸🇬 SG Stable", "🇺🇸 US Stable", "🇯🇵 JP Stable", "⛔ 拒絕"],
  );
  const divergent = {
    ...projection,
    profiles: {
      ...projection.profiles,
      hk: { ...projectedHk, categoryAiRoute: "us-stable" },
    },
  };
  assert.throws(() => compileIniMvpPlan(config, divergent));
});

test("compiler preview resolves the canonical HK service matrix and keeps Claude locked", async () => {
  const { config } = await loadCanonicalInputs();
  const plan = compileRoutingProfile(config, "hk");
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.policyVersion, "1");
  assert.equal(plan.accessProfile.id, "hk");
  const windsurf = plan.services.find((service) => service.id === "windsurf");
  const huggingface = plan.services.find(
    (service) => service.id === "huggingface",
  );
  const claude = plan.services.find((service) => service.id === "claude");
  assert.ok(
    windsurf !== undefined && huggingface !== undefined && claude !== undefined,
  );
  assert.equal(windsurf.effectiveRoute.id, "us-stable");
  assert.equal(huggingface.effectiveRoute.id, "us-stable");
  assert.equal(claude.effectiveRoute.id, "reject");
  assert.equal(claude.selector.kind, "explicit-node");
  if (claude.selector.kind === "explicit-node") {
    assert.equal(claude.selector.choices[0]?.kind, "route");
    const firstChoice = claude.selector.choices[0];
    assert.ok(firstChoice !== undefined && firstChoice.kind === "route");
    assert.equal(firstChoice.route.group, "REJECT");
    assert.deepEqual(
      claude.selector.choices
        .filter((choice) => choice.kind === "approved-node")
        .map((choice) => choice.node),
      ["US-Claude-01", "US-Claude-02"],
    );
  }
  for (const serviceId of [
    "copilot",
    "gemini",
    "notebooklm",
    "perplexity",
    "grok",
  ]) {
    assert.equal(
      plan.services.find((service) => service.id === serviceId)?.effectiveRoute
        .id,
      "direct",
    );
  }
  assert.equal(windsurf.selector.kind, "profile-aware");
  if (windsurf.selector.kind === "profile-aware") {
    assert.equal(
      JSON.stringify(windsurf.selector.choices).includes("US-Claude-01"),
      false,
    );
  }
});

test("compiler endpoint resolution honors profile endpoint, endpoint, then service routes", async () => {
  const { config } = await loadCanonicalInputs();
  const mutated = structuredClone(config);
  const huggingface = mutated.services.huggingface;
  const hk = mutated.accessProfiles.hk;
  assert.ok(huggingface !== undefined && hk !== undefined);
  huggingface.endpoints.preview = {
    ruleset: "AI_HuggingFace_Classical",
    session: "stateless",
    routeOverride: "reject",
  };
  const endpointOverrides = hk.endpointOverrides.huggingface ?? {};
  endpointOverrides.preview = "us-stable";
  hk.endpointOverrides.huggingface = endpointOverrides;
  const plan = compileRoutingProfile(mutated, "hk");
  const compiledHuggingface = plan.services.find(
    (service) => service.id === "huggingface",
  );
  assert.ok(compiledHuggingface !== undefined);
  assert.equal(
    compiledHuggingface.endpoints.find((endpoint) => endpoint.id === "preview")
      ?.effectiveRoute.id,
    "us-stable",
  );

  delete hk.endpointOverrides.huggingface;
  const endpointPlan = compileRoutingProfile(mutated, "hk");
  const endpointOnly = endpointPlan.services.find(
    (service) => service.id === "huggingface",
  );
  assert.ok(endpointOnly !== undefined);
  assert.equal(
    endpointOnly.endpoints.find((endpoint) => endpoint.id === "preview")
      ?.effectiveRoute.id,
    "reject",
  );
});


test("compiler rejects semantic invalidity and unknown profile references", async () => {
  const { config } = await loadCanonicalInputs();
  const invalid = structuredClone(config);
  const dnsProfile = invalid.dns.profiles.default;
  assert.ok(dnsProfile !== undefined);
  delete dnsProfile.servicePolicies.claude;
  assert.throws(
    () => compileRoutingProfile(invalid, "hk"),
    (error: unknown) =>
      error instanceof RoutingCompileError &&
      error.issues.some((entry) => entry.code === "policy-invariant"),
  );
  assert.throws(
    () => compileRoutingProfile(config, "missing-profile"),
    (error: unknown) =>
      error instanceof RoutingCompileError &&
      error.issues[0]?.path.join(".") === "accessProfiles.missing-profile",
  );
  assert.throws(
    () => compileRoutingProfile(config, "hk", "missing-dns-profile"),
    (error: unknown) =>
      error instanceof RoutingCompileError &&
      error.issues[0]?.path.join(".") === "dns.profiles.missing-dns-profile",
  );
});

test("committed HK compiler preview is deterministic", async () => {
  const { project, config } = await loadCanonicalInputs();
  const committed = await readFile(
    canonicalArtifactPath(project, "profile-plan"),
    "utf8",
  );
  const expected = `${JSON.stringify(compileRoutingProfile(config, "hk"), null, 2)}\n`;
  assert.equal(committed, expected);
});
