import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import YAML from "yaml";

import {
  compileMihomoFragment,
  MihomoProjectionError,
  renderMihomoFragment,
} from "#routing/mihomo-projection.js";
import { canonicalArtifactPath } from "#routing-test/support/canonical-inputs.js";
import { loadCanonicalInputs } from "#routing-test/support/canonical-inputs.js";

test("Mihomo projection renders REJECT-first filtered groups, protected rules, and pinned DNS", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const vpsdance = projection.sources.vpsdance;
  assert.ok(vpsdance !== undefined);
  const fragment = compileMihomoFragment(config, projection, "hk");
  const groups = fragment.groups;
  const stable = groups.find((group) => group.name === "🇺🇸 US Stable");
  const claude = groups.find(
    (group) => group.name === "🔐 Claude Account Guard",
  );
  assert.ok(stable !== undefined && stable.type === "select");
  assert.ok(claude !== undefined && claude.type === "select");
  assert.deepEqual(stable.proxies, ["REJECT"]);
  assert.equal(stable.emptyFallback, "REJECT");
  assert.deepEqual(claude.proxies, ["REJECT"]);
  assert.equal(JSON.stringify(claude).includes("DIRECT"), false);
  const windsurf = groups.find((group) => group.name === "🌊 Windsurf");
  assert.equal(JSON.stringify(windsurf).includes("US-Claude-01"), false);
  assert.deepEqual(fragment.rules.slice(0, 2), [
    "RULE-SET,AI_Claude_Classical,🔐 Claude Account Guard",
    "RULE-SET,AI_Claude_Classical,REJECT",
  ]);
  assert.equal(
    groups.some((group) => group.type === "url-test"),
    false,
  );
  assert.equal(
    groups.some((group) => group.name === "🔐 Claude US Pinned"),
    false,
  );
  assert.equal(
    groups.some((group) => group.name === "🌍 AI 存取模式"),
    true,
  );
  assert.deepEqual(
    groups
      .filter((group) => group.name.startsWith("@mode/"))
      .map((group) => group.name),
    ["@mode/hk", "@mode/jp", "@mode/sg", "@mode/us"],
  );
  assert.equal(fragment.rules.at(-3), "RULE-SET,AI_All_Classical,DIRECT");
  assert.equal(fragment.rules.at(-2), "GEOSITE,google-deepmind,DIRECT");
  assert.equal(fragment.rules.at(-1), "GEOSITE,category-ai-!cn,DIRECT");
  assert.deepEqual(fragment.dns.nameserverPolicy, {
    "rule-set:AI_Claude_Classical": [
      "https://1.1.1.1/dns-query#🔐 Claude Account Guard",
    ],
  });
  assert.equal(fragment.dns.respectRules, true);
  assert.deepEqual(fragment.dns.defaultNameserver, ["1.1.1.1"]);
  assert.deepEqual(fragment.dns.proxyServerNameserver, [
    "https://1.1.1.1/dns-query",
  ]);
  for (const group of groups) {
    if (group.type === "select" && group.use !== undefined) {
      assert.equal(group.emptyFallback, "REJECT");
    }
  }
  assert.equal(fragment.ruleProviders.AI_Windsurf_Classical?.type, "http");
  assert.equal(
    fragment.ruleProviders.AI_Windsurf_Classical?.url,
    `${vpsdance.rawBaseUrl}/${vpsdance.revision}/rules/clash/windsurf.yaml`,
  );
  assert.equal(renderMihomoFragment(fragment).includes("rules:\n"), true);
});

test("Mihomo DNS serializer handles UDP, DoT, and adjacent protected endpoint pairs", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const mutated = structuredClone(config);
  const dns = mutated.dns.profiles.default;
  const claude = mutated.services.claude;
  assert.ok(dns !== undefined && claude !== undefined);
  dns.defaultNameserver = [{ kind: "udp", host: "9.9.9.9", port: 5353 }];
  dns.nameserver = [{ kind: "dot", host: "1.1.1.1", port: 853 }];
  claude.endpoints.extra = {
    ruleset: "AI_Claude_Extra_Classical",
    session: "stable",
  };
  const anthropic = projection.ruleProviders.AI_Claude_Classical;
  assert.ok(anthropic !== undefined);
  projection.ruleProviders.AI_Claude_Extra_Classical =
    structuredClone(anthropic);
  const fragment = compileMihomoFragment(mutated, projection, "hk");
  assert.deepEqual(fragment.dns.defaultNameserver, ["9.9.9.9:5353"]);
  assert.deepEqual(fragment.dns.nameserver, ["tls://1.1.1.1"]);
  const protectedRules = fragment.rules.filter((rule) =>
    rule.startsWith("RULE-SET,AI_Claude"),
  );
  assert.deepEqual(protectedRules, [
    "RULE-SET,AI_Claude_Classical,🔐 Claude Account Guard",
    "RULE-SET,AI_Claude_Classical,REJECT",
    "RULE-SET,AI_Claude_Extra_Classical,🔐 Claude Account Guard",
    "RULE-SET,AI_Claude_Extra_Classical,REJECT",
  ]);
});

test("Mihomo projection rejects empty services and duplicate endpoint ruleset identities", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const emptyEndpoints = structuredClone(config);
  const claude = emptyEndpoints.services.claude;
  assert.ok(claude !== undefined);
  claude.endpoints = {};
  assert.throws(
    () => compileMihomoFragment(emptyEndpoints, projection, "hk"),
    (error: unknown) =>
      error instanceof MihomoProjectionError &&
      error.issues.some(
        (entry) => entry.path.join(".") === "services.claude.endpoints",
      ),
  );
  const duplicateRuleset = structuredClone(config);
  const huggingface = duplicateRuleset.services.huggingface;
  assert.ok(huggingface !== undefined);
  huggingface.endpoints.duplicate = {
    ruleset: "AI_HuggingFace_Classical",
    session: "stable",
  };
  assert.throws(
    () => compileMihomoFragment(duplicateRuleset, projection, "hk"),
    (error: unknown) =>
      error instanceof MihomoProjectionError &&
      error.issues.some(
        (entry) =>
          entry.path.join(".") ===
          "services.huggingface.endpoints.duplicate.ruleset",
      ),
  );
});

test("Mihomo projection rejects missing providers and the checked fragment stays deterministic and parseable", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const missingPinnedBinding = structuredClone(projection);
  const bindings =
    missingPinnedBinding.pinnedEgressBindings["claude-us-pinned"];
  assert.ok(bindings !== undefined);
  delete bindings["US-Claude-02"];
  assert.throws(
    () => compileMihomoFragment(config, missingPinnedBinding, "hk"),
    (error: unknown) =>
      error instanceof MihomoProjectionError &&
      error.issues.some(
        (entry) =>
          entry.path.join(".") === "pinnedEgressBindings.claude-us-pinned",
      ),
  );
  const nonExternalPinnedProvider = structuredClone(projection);
  const nonExternalBindings =
    nonExternalPinnedProvider.pinnedEgressBindings["claude-us-pinned"];
  assert.ok(nonExternalBindings !== undefined);
  nonExternalBindings["US-Claude-01"] = "missing-provider";
  assert.throws(
    () => compileMihomoFragment(config, nonExternalPinnedProvider, "hk"),
    (error: unknown) =>
      error instanceof MihomoProjectionError &&
      error.issues.some(
        (entry) =>
          entry.path.join(".") ===
          "pinnedEgressBindings.claude-us-pinned.US-Claude-01",
      ),
  );
  const invalid = structuredClone(projection);
  delete invalid.ruleProviders.AI_Windsurf_Classical;
  assert.throws(
    () => compileMihomoFragment(config, invalid, "hk"),
    (error: unknown) =>
      error instanceof MihomoProjectionError &&
      error.issues.some((entry) => entry.code === "missing-reference"),
  );
  const invalidRawUrls = [
    "invalid_url",
    "http://raw.githubusercontent.com/VPSDance/ai-proxy-rules",
    "https://user:pass@raw.githubusercontent.com/VPSDance/ai-proxy-rules",
    "https://raw.githubusercontent.com/VPSDance/ai-proxy-rules?query=1",
    "https://raw.githubusercontent.com/VPSDance/ai-proxy-rules#fragment",
  ] as const;
  for (const invalidRawUrl of invalidRawUrls) {
    const invalidUrlProjection = structuredClone(projection);
    const source = invalidUrlProjection.sources.vpsdance;
    if (source === undefined) throw new Error("expected vpsdance source");
    source.rawBaseUrl = invalidRawUrl;
    assert.throws(
      () => compileMihomoFragment(config, invalidUrlProjection, "hk"),
      (error: unknown) =>
        error instanceof MihomoProjectionError &&
        error.issues.some((entry) => entry.path.join(".") === "sources.vpsdance.rawBaseUrl"),
    );
  }
  const regionMismatch = structuredClone(projection);
  const us = regionMismatch.regions.us;
  assert.ok(us !== undefined);
  us.stableGroup = "Wrong Stable Group";
  assert.throws(
    () => compileMihomoFragment(config, regionMismatch, "hk"),
    (error: unknown) =>
      error instanceof MihomoProjectionError &&
      error.issues.some(
        (entry) => entry.path.join(".") === "routeTargets.us-stable.group",
      ),
  );
  const unsafeUrl = structuredClone(projection);
  const windsurf = unsafeUrl.ruleProviders.AI_Windsurf_Classical;
  assert.ok(windsurf !== undefined);
  windsurf.path = "../main/rules/clash/windsurf.yaml";
  assert.throws(
    () => compileMihomoFragment(config, unsafeUrl, "hk"),
    (error: unknown) =>
      error instanceof MihomoProjectionError &&
      error.issues.some(
        (entry) =>
          entry.path.join(".") === "ruleProviders.AI_Windsurf_Classical.path",
      ),
  );
  for (const invalidPath of [
    "rules\\..\\main.yaml",
    "rules/%2e%2e/main.yaml",
  ]) {
    const traversal = structuredClone(projection);
    const provider = traversal.ruleProviders.AI_Windsurf_Classical;
    assert.ok(provider !== undefined);
    provider.path = invalidPath;
    assert.throws(
      () => compileMihomoFragment(config, traversal, "hk"),
      (error: unknown) =>
        error instanceof MihomoProjectionError &&
        error.issues.some(
          (entry) =>
            entry.path.join(".") === "ruleProviders.AI_Windsurf_Classical.path",
        ),
    );
  }
  const missingSource = structuredClone(projection);
  const sourceProvider = missingSource.ruleProviders.AI_Windsurf_Classical;
  assert.ok(sourceProvider !== undefined);
  sourceProvider.source = "missing-source";
  assert.throws(
    () => compileMihomoFragment(config, missingSource, "hk"),
    (error: unknown) =>
      error instanceof MihomoProjectionError &&
      error.issues.some(
        (entry) =>
          entry.path.join(".") === "ruleProviders.AI_Windsurf_Classical.source",
      ),
  );
  const unsafeSource = structuredClone(projection);
  const vpsdance = unsafeSource.sources.vpsdance;
  assert.ok(vpsdance !== undefined);
  vpsdance.rawBaseUrl =
    "https://user@raw.githubusercontent.com/VPSDance/ai-proxy-rules";
  assert.throws(
    () => compileMihomoFragment(config, unsafeSource, "hk"),
    (error: unknown) =>
      error instanceof MihomoProjectionError &&
      error.issues.some(
        (entry) => entry.path.join(".") === "sources.vpsdance.rawBaseUrl",
      ),
  );
  const { project } = await loadCanonicalInputs();
  const committed = await readFile(
    canonicalArtifactPath(project, "mihomo-fragment"),
    "utf8",
  );
  const rendered = renderMihomoFragment(
    compileMihomoFragment(config, projection, "hk"),
  );
  assert.equal(committed, rendered);
  const parsed = YAML.parse(committed) as unknown;
  assert.equal(typeof parsed, "object");
});


test("region filters use boundary-aware codes and a source base path remains pinned", async () => {
  const { config, projection } = await loadCanonicalInputs();
  const us = projection.regions.us;
  const sg = projection.regions.sg;
  const jp = projection.regions.jp;
  assert.ok(us !== undefined && sg !== undefined && jp !== undefined);
  const toJavaScriptFilter = (filter: string): RegExp =>
    new RegExp(filter.replace(/^\(\?i\)/, ""), "i");
  const usFilter = toJavaScriptFilter(us.filter);
  const sgFilter = toJavaScriptFilter(sg.filter);
  const jpFilter = toJavaScriptFilter(jp.filter);
  assert.equal(usFilter.test("Australia Premium"), false);
  assert.equal(usFilter.test("US-01 Los Angeles"), true);
  assert.equal(sgFilter.test("SG-01 Singapore"), true);
  assert.equal(sgFilter.test("Sagrada test node"), false);
  assert.equal(jpFilter.test("JP-01 Tokyo"), true);
  assert.equal(jpFilter.test("Jupiter test node"), false);

  const withBasePath = structuredClone(projection);
  const source = withBasePath.sources.vpsdance;
  assert.ok(source !== undefined);
  source.rawBaseUrl =
    "https://raw.githubusercontent.com/VPSDance/ai-proxy-rules/base";
  const fragment = compileMihomoFragment(config, withBasePath, "hk");
  assert.equal(
    fragment.ruleProviders.AI_Windsurf_Classical?.url,
    `${source.rawBaseUrl}/${source.revision}/rules/clash/windsurf.yaml`,
  );
});

test("source-owned providers are pinned and canonical services do not invent endpoint roles", async () => {
  const { config, projection } = await loadCanonicalInputs();
  for (const [serviceId, service] of Object.entries(config.services)) {
    assert.deepEqual(Object.keys(service.endpoints), ["service"]);
    for (const endpoint of Object.values(service.endpoints)) {
      const provider = projection.ruleProviders[endpoint.ruleset];
      assert.ok(provider !== undefined);
      const source = projection.sources[provider.source];
      assert.ok(source !== undefined);
      const fragment = compileMihomoFragment(config, projection, "hk");
      assert.match(
        fragment.ruleProviders[endpoint.ruleset]?.url ?? "",
        new RegExp(`/${source.revision}/`),
      );
    }
  }
  assert.equal(
    projection.ruleProviders.AI_Gemini_Classical?.path,
    "rule/AI_Gemini_Classical.yaml",
  );
  assert.equal(
    projection.ruleProviders.AI_NotebookLM_Classical?.path,
    "rule/AI_NotebookLM_Classical.yaml",
  );
});
