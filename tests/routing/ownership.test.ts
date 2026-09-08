import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  compileIniMvpPlan,
  IniMvpPlanSchema,
} from "#routing/ini-mvp-plan.js";
import { compileMihomoFragment } from "#routing/mihomo-projection.js";
import { isOwnershipOverrideService } from "#routing/semantic-validator.js";
import { loadServiceCatalog } from "#routing/shared-catalog.js";
import { loadCanonicalInputs } from "#routing-test/support/canonical-inputs.js";
import { ROOT } from "#routing-test/support/paths.js";

const GCS = "storage.googleapis.com";
const GCS_RULE = `DOMAIN,${GCS}`;
const OAUTH2 = "oauth2.googleapis.com";
const PINNED_ANTHROPIC_REVISION = "d07cac190c33e7914ba7adaf7e7c14298fba7024";
const PINNED_ANTHROPIC_PATH = "rules/clash/anthropic.yaml";
const DUMP_EXCERPT = join(
  ROOT,
  "tests",
  "fixtures",
  "routing",
  "vpsdance-anthropic.third-party.excerpt.yaml",
);

test("shared GCS backend is owned by Flow Music, not the Anthropic dump", async () => {
  const { project, config, projection } = await loadCanonicalInputs();
  const catalog = await loadServiceCatalog(project.serviceCatalog);
  const flowMusic = catalog.get("flow-music");
  const claude = catalog.get("claude");
  const gemini = catalog.get("gemini");
  assert.ok(flowMusic !== undefined && claude !== undefined && gemini !== undefined);
  assert.deepEqual(flowMusic.payload, [GCS_RULE]);
  assert.deepEqual(claude.payload, []);
  assert.equal(
    flowMusic.payload.some((entry) => entry === "DOMAIN-SUFFIX,googleapis.com"),
    false,
  );
  assert.equal(
    [...catalog.values()].some((record) =>
      record.payload.some((entry) => entry.includes(OAUTH2)),
    ),
    false,
  );
  assert.equal(
    gemini.payload.some((entry) => entry.includes("googleapis.com")),
    true,
  );
  assert.equal(
    gemini.payload.includes(GCS_RULE),
    false,
  );
  assert.equal(isOwnershipOverrideService(config, "flow-music"), true);
  assert.equal(isOwnershipOverrideService(config, "claude"), false);

  const backend = config.sharedBackends["gcs-object-storage"];
  assert.ok(backend !== undefined);
  assert.deepEqual(backend.domains, [GCS]);
  assert.deepEqual(backend.consumers, ["flow-music"]);
  assert.equal(backend.legacyEffectiveConsumer, "flow-music");
  const producer = config.services["flow-music"]?.dependencies.find(
    (dependency) => dependency.id === "producer-media",
  );
  assert.ok(producer !== undefined);
  assert.equal(producer.host, GCS);
  assert.equal(producer.path, "/producer-app-public/");
  assert.equal(producer.matcher.desiredGranularity, "path");
  assert.equal(producer.matcher.availableGranularity, "host");
  assert.equal(producer.matcher.scopeExpansion, true);
});

test("pinned Anthropic dump claims storage.googleapis.com as a third-party host", async () => {
  const { projection } = await loadCanonicalInputs();
  const excerpt = await readFile(DUMP_EXCERPT, "utf8");
  assert.match(excerpt, new RegExp(`revision: ${PINNED_ANTHROPIC_REVISION}`));
  assert.match(excerpt, /DOMAIN-SUFFIX,anthropic\.com/);
  assert.match(excerpt, /DOMAIN-SUFFIX,claude\.ai/);
  assert.match(excerpt, /DOMAIN,storage\.googleapis\.com/);
  assert.equal(excerpt.includes("DOMAIN-SUFFIX,googleapis.com"), false);
  assert.equal(excerpt.includes(OAUTH2), false);

  const vpsdance = projection.sources.vpsdance;
  const claudeProvider = projection.ruleProviders.AI_Claude_Classical;
  assert.ok(vpsdance !== undefined && claudeProvider !== undefined);
  assert.equal(vpsdance.revision, PINNED_ANTHROPIC_REVISION);
  assert.equal(claudeProvider.path, PINNED_ANTHROPIC_PATH);
});

test("INI first-match sends storage to Flow Music and keeps one Claude provider URL", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const plan = compileIniMvpPlan(config, projection);
  const vpsdance = projection.sources.vpsdance;
  const localRules = projection.sources["local-rules"];
  assert.ok(vpsdance !== undefined && localRules !== undefined);
  const [flowMusicRule, claudeRule] = plan.rules.beforeLegacy;
  assert.equal(flowMusicRule?.kind, "remote-classical");
  assert.equal(claudeRule?.kind, "remote-classical");
  if (
    flowMusicRule?.kind !== "remote-classical" ||
    claudeRule?.kind !== "remote-classical"
  ) {
    throw new Error("expected Flow Music then Claude remote-classical rules");
  }
  assert.equal(flowMusicRule.target, "🎵 Flow Music");
  assert.equal(claudeRule.target, "🔐 Claude Account Guard");
  assert.equal(plan.rules.beforeLegacy.at(-1), claudeRule);
  assert.notEqual(flowMusicRule.url, claudeRule.url);
  assert.equal(
    flowMusicRule.url,
    `${localRules.rawBaseUrl}/${localRules.revision}/rule/Flow_Music_Classical.yaml`,
  );
  assert.equal(
    claudeRule.url,
    `${vpsdance.rawBaseUrl}/${PINNED_ANTHROPIC_REVISION}/${PINNED_ANTHROPIC_PATH}`,
  );
  const remoteUrls = [...plan.rules.beforeLegacy, ...plan.rules.afterLegacy]
    .filter((rule) => rule.kind === "remote-classical")
    .map((rule) => (rule.kind === "remote-classical" ? rule.url : ""));
  assert.equal(new Set(remoteUrls).size, remoteUrls.length);
  assert.equal(
    remoteUrls.filter((url) => url === claudeRule.url).length,
    1,
  );
  const claudeGroup = plan.groups.find(
    (group) => group.name === "🔐 Claude Account Guard",
  );
  assert.deepEqual(claudeGroup?.candidates, [
    { kind: "group-ref", value: "⛔ 拒絕" },
    { kind: "group-ref", value: "🇺🇸 US Stable" },
    { kind: "group-ref", value: "🇸🇬 SG Stable" },
    { kind: "group-ref", value: "🇯🇵 JP Stable" },
  ]);
  assert.equal(
    plan.groups.some((group) => group.name === "🔐 Claude US Pinned"),
    false,
  );
  assert.doesNotThrow(() => IniMvpPlanSchema.parse(plan));
  assert.equal(
    plan.groups.filter((group) => group.name === "🎵 Flow Music").length,
    1,
  );

  const duplicateClaudeUrl = structuredClone(plan);
  const afterHead = duplicateClaudeUrl.rules.afterLegacy[0];
  if (afterHead?.kind !== "remote-classical") {
    throw new Error("expected afterLegacy remote-classical");
  }
  afterHead.url = claudeRule.url;
  assert.throws(() => IniMvpPlanSchema.parse(duplicateClaudeUrl));
});

test("Mihomo first-match sends storage to Flow Music and keeps a single Claude Guard rule", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const fragment = compileMihomoFragment(config, projection, "hk");
  assert.deepEqual(fragment.rules.slice(0, 2), [
    "RULE-SET,Flow_Music_Classical,🎵 Flow Music",
    "RULE-SET,AI_Claude_Classical,🔐 Claude Account Guard",
  ]);
  const claudeRules = fragment.rules.filter((rule) =>
    rule.startsWith("RULE-SET,AI_Claude_Classical,"),
  );
  assert.deepEqual(claudeRules, [
    "RULE-SET,AI_Claude_Classical,🔐 Claude Account Guard",
  ]);
  assert.equal(
    fragment.rules.includes("RULE-SET,AI_Claude_Classical,REJECT"),
    false,
  );
  const claude = fragment.groups.find(
    (group) => group.name === "🔐 Claude Account Guard",
  );
  assert.ok(claude !== undefined && claude.type === "select");
  assert.deepEqual(claude.proxies, [
    "REJECT",
    "🇺🇸 US Stable",
    "🇸🇬 SG Stable",
    "🇯🇵 JP Stable",
  ]);
  assert.equal(
    fragment.groups.some((group) => group.name === "🔐 Claude US Pinned"),
    false,
  );
  assert.equal(JSON.stringify(claude).includes("DIRECT"), false);
});
