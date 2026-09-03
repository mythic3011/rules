import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import YAML from "yaml";

import {
  composeShadowProfile,
  loadLegacyRelaxedBase,
  ShadowProfileError,
  validateCompilerGroupGraph,
  validateShadowFragmentShape,
  validateShadowParityCandidate,
} from "#routing/shadow-profile.js";
import {
  compileMihomoFragment,
  renderMihomoFragment,
} from "#routing/mihomo-projection.js";
import {
  renderShadowTemplate,
  ShadowTemplateError,
} from "#routing/shadow-template.js";
import { withTempDirectory } from "#routing-test/support/temp-dir.js";
import { SHADOW_TEMPLATE_CONTEXT } from "#routing-test/support/fixtures.js";
import { composeWithBase, shadowInputs } from "#routing-test/support/canonical-inputs.js";

test("shadow template rejects missing, unknown, and duplicate named slots", () => {
  assert.throws(
    () => renderShadowTemplate("${header}", SHADOW_TEMPLATE_CONTEXT),
    ShadowTemplateError,
  );
  assert.throws(
    () =>
      renderShadowTemplate(
        "${header}\n${unknown}\n${static-top-level}\n${proxy-providers}\n${dns}\n${proxy-groups}\n${rules}\n${rule-providers}",
        SHADOW_TEMPLATE_CONTEXT,
      ),
    ShadowTemplateError,
  );
  assert.throws(
    () =>
      renderShadowTemplate(
        "${header}\n${unknown_slot}\n${static-top-level}\n${proxy-providers}\n${dns}\n${proxy-groups}\n${rules}\n${rule-providers}",
        SHADOW_TEMPLATE_CONTEXT,
      ),
    ShadowTemplateError,
  );
  assert.throws(
    () =>
      renderShadowTemplate(
        "${header}\n${header}\n${static-top-level}\n${proxy-providers}\n${dns}\n${proxy-groups}\n${rules}\n${rule-providers}",
        SHADOW_TEMPLATE_CONTEXT,
      ),
    ShadowTemplateError,
  );
});


test("shadow composer applies only four exact typed deltas and preserves closed unrelated inventory", async () => {
  const { project, config, projection, parity } = await shadowInputs();
  const result = await composeShadowProfile(
    config,
    projection,
    project.legacyRelaxedBase,
    parity,
    project.shadowTemplate,
  );
  const candidate = YAML.parse(result.candidateYaml) as Record<string, unknown>;
  const groups = candidate["proxy-groups"] as Array<Record<string, unknown>>;
  const rules = candidate.rules as string[];
  assert.equal(
    groups.some((group) => group.name === "🔐 Claude US Pinned"),
    false,
  );
  assert.deepEqual(
    groups.find((group) => group.name === "🔐 Claude Account Guard")?.proxies,
    ["REJECT"],
  );
  assert.equal(rules.includes("GEOSITE,google-deepmind,DIRECT"), true);
  assert.equal(result.report.observedDeltaIds.length, 4);

  const base = await readFile(project.legacyRelaxedBase, "utf8");
  const injectedObject = YAML.parse(base) as Record<string, unknown>;
  (injectedObject["proxy-groups"] as Array<unknown>).unshift({
    name: "🤖 Unrelated",
    type: "select",
    proxies: ["DIRECT"],
  });
  (injectedObject.rules as Array<unknown>).unshift(
    "RULE-SET,AI_Unrelated_Classical,🤖 Unrelated",
  );
  (
    injectedObject["rule-providers"] as Record<string, unknown>
  ).AI_Unrelated_Classical = {
    type: "http",
    behavior: "classical",
    url: "https://example.invalid/rules.yaml",
    path: "./rule/AI_Unrelated_Classical.yaml",
  };
  const injected = YAML.stringify(injectedObject);
  await withTempDirectory("routing-shadow-preserve-", async (directory) => {
    const basePath = join(directory, "base.yaml");
    await writeFile(basePath, injected, "utf8");
    const preserved = await composeShadowProfile(
      config,
      projection,
      basePath,
      parity,
      project.shadowTemplate,
    );
    assert.match(preserved.candidateYaml, /AI_Unrelated_Classical/);
    assert.match(preserved.candidateYaml, /🤖 Unrelated/);
    assert.match(
      preserved.candidateYaml,
      /RULE-SET,AI_Unrelated_Classical,🤖 Unrelated/,
    );
  });
});

test("shadow composer rejects stale, missing, and unapproved typed delta contracts", async () => {
  const { project } = await shadowInputs();
  const base = await readFile(project.legacyRelaxedBase, "utf8");
  await assert.rejects(
    () =>
      composeWithBase(base, (manifest) => {
        const deltas = manifest.deltas as Record<string, unknown>;
        const groups = deltas["proxy-groups"] as Record<string, unknown>;
        (groups.add as string[]).pop();
      }),
    (error: unknown) =>
      error instanceof ShadowProfileError &&
      error.issues.some(
        (entry) => entry.path.join(".") === "deltas.proxy-groups.add",
      ),
  );
  const dnsPresent = YAML.parse(base) as Record<string, unknown>;
  (
    (dnsPresent.dns as Record<string, unknown>)["nameserver-policy"] as Record<
      string,
      unknown
    >
  )["rule-set:AI_Claude_Classical"] = [
    "https://1.1.1.1/dns-query#🔐 Claude Account Guard",
  ];
  await assert.rejects(
    () => composeWithBase(YAML.stringify(dnsPresent)),
    (error: unknown) =>
      error instanceof ShadowProfileError &&
      error.issues.some(
        (entry) =>
          entry.path.join(".") ===
          "dns.nameserver-policy.rule-set:AI_Claude_Classical",
      ),
  );
  await assert.rejects(
    () =>
      composeWithBase(base, (manifest) => {
        const deltas = manifest.deltas as Record<string, unknown>;
        const rules = deltas.rules as Record<string, unknown>;
        (rules.add as string[]).push("RULE-SET,AI_Unapproved_Classical,DIRECT");
      }),
    (error: unknown) =>
      error instanceof ShadowProfileError &&
      error.issues.some((entry) => entry.path.join(".") === "deltas.rules.add"),
  );
  await assert.rejects(
    () =>
      composeWithBase(base, (manifest) => {
        const deltas = manifest.deltas as Record<string, unknown>;
        delete deltas.dns;
      }),
    (error: unknown) => error instanceof ShadowProfileError,
  );
});

test("shadow composer rejects a compiled group collision with preserved legacy inventory", async () => {
  const { project } = await shadowInputs();
  const base = await readFile(project.legacyRelaxedBase, "utf8");
  await assert.rejects(
    () =>
      composeWithBase(base, (manifest) => {
        const remove = (manifest.deltas as Record<string, unknown>)[
          "proxy-groups"
        ] as Record<string, unknown>;
        remove.remove = (remove.remove as string[]).filter(
          (name) => name !== "🤖 OpenCode",
        );
      }),
    (error: unknown) =>
      error instanceof ShadowProfileError &&
      error.issues.some((entry) =>
        entry.message.includes("collides with preserved"),
      ),
  );
});

test("shadow composer refuses changed unowned surfaces, interval anomalies, and malformed boundaries", async () => {
  const { project, config, projection, parity } = await shadowInputs();
  const base = await readFile(project.legacyRelaxedBase, "utf8");
  const baseline = await composeShadowProfile(
    config,
    projection,
    project.legacyRelaxedBase,
    parity,
    project.shadowTemplate,
  );
  const baseObject = await loadLegacyRelaxedBase(project.legacyRelaxedBase);
  const fragment = YAML.parse(
    renderMihomoFragment(compileMihomoFragment(config, projection, "hk")),
  ) as Record<string, unknown>;
  const changedStatic = YAML.parse(baseline.candidateYaml) as Record<
    string,
    unknown
  >;
  changedStatic.port = 9999;
  assert.throws(
    () =>
      validateShadowParityCandidate(
        baseObject,
        changedStatic,
        fragment,
        parity,
      ),
    ShadowProfileError,
  );
  const changedProxyProvider = YAML.parse(baseline.candidateYaml) as Record<
    string,
    unknown
  >;
  (
    (
      changedProxyProvider["proxy-providers"] as Record<
        string,
        Record<string, unknown>
      >
    ).provider1 ?? {}
  ).url = "https://example.invalid/changed-subscription";
  assert.throws(
    () =>
      validateShadowParityCandidate(
        baseObject,
        changedProxyProvider,
        fragment,
        parity,
      ),
    ShadowProfileError,
  );
  const extraRoot = YAML.parse(baseline.candidateYaml) as Record<
    string,
    unknown
  >;
  extraRoot.unapprovedTopLevel = true;
  assert.throws(
    () =>
      validateShadowParityCandidate(baseObject, extraRoot, fragment, parity),
    ShadowProfileError,
  );
  const changedGroup = YAML.parse(baseline.candidateYaml) as Record<
    string,
    unknown
  >;
  (
    (changedGroup["proxy-groups"] as Array<Record<string, unknown>>)[0] ?? {}
  ).type = "fallback";
  assert.throws(
    () =>
      validateShadowParityCandidate(baseObject, changedGroup, fragment, parity),
    ShadowProfileError,
  );
  const changedProvider = YAML.parse(baseline.candidateYaml) as Record<
    string,
    unknown
  >;
  (
    (
      changedProvider["rule-providers"] as Record<
        string,
        Record<string, unknown>
      >
    ).SSH_Direct_Classical ?? {}
  ).url = "https://example.invalid/changed.yaml";
  assert.throws(
    () =>
      validateShadowParityCandidate(
        baseObject,
        changedProvider,
        fragment,
        parity,
      ),
    ShadowProfileError,
  );
  const changedDns = YAML.parse(baseline.candidateYaml) as Record<
    string,
    unknown
  >;
  (
    (
      (changedDns.dns as Record<string, unknown>)[
        "nameserver-policy"
      ] as Record<string, string[]>
    )["geosite:private"] ?? []
  ).push("https://example.invalid/dns-query");
  assert.throws(
    () =>
      validateShadowParityCandidate(baseObject, changedDns, fragment, parity),
    ShadowProfileError,
  );
  const changedRule = YAML.parse(baseline.candidateYaml) as Record<
    string,
    unknown
  >;
  const ssh = (changedRule.rules as string[]).indexOf(
    "RULE-SET,SSH_Direct_Classical,🎯 全球直連",
  );
  assert.ok(ssh >= 0);
  (changedRule.rules as string[])[ssh] = "RULE-SET,SSH_Direct_Classical,DIRECT";
  assert.throws(
    () =>
      validateShadowParityCandidate(baseObject, changedRule, fragment, parity),
    ShadowProfileError,
  );
  await assert.rejects(
    () =>
      composeWithBase(
        base.replace(
          "RULE-SET,SSH_Direct_Classical,🎯 全球直連",
          "RULE-SET,Changed,DIRECT",
        ),
      ),
    ShadowProfileError,
  );
  const changedMatch = YAML.parse(baseline.candidateYaml) as Record<
    string,
    unknown
  >;
  (changedMatch.rules as string[]).push("MATCH,REJECT");
  assert.throws(
    () =>
      validateShadowParityCandidate(baseObject, changedMatch, fragment, parity),
    ShadowProfileError,
  );
  await withTempDirectory("routing-shadow-malformed-", async (malformed) => {
    const path = join(malformed, "bad.yaml");
    await writeFile(
      path,
      "proxy-groups: {}\nrules: []\nrule-providers: {}\nproxy-providers: {}\ndns: {}\n",
      "utf8",
    );
    await assert.rejects(() => loadLegacyRelaxedBase(path), ShadowProfileError);
  });
  assert.throws(
    () =>
      validateShadowFragmentShape({
        "proxy-groups": {},
        "rule-providers": {},
        dns: {},
        rules: [],
      }),
    ShadowProfileError,
  );
  assert.throws(
    () =>
      validateShadowFragmentShape({
        "proxy-groups": [{ type: "select" }],
        "rule-providers": {},
        dns: { "nameserver-policy": {} },
        rules: [],
      }),
    ShadowProfileError,
  );
});


test("compiler-owned group graph is data-derived for renamed or newly introduced services", () => {
  const fragment = {
    "proxy-groups": [
      { name: "@profile/new-service", type: "select" },
      { name: "🆕 New Service", type: "select" },
    ],
    "rule-providers": {},
    dns: { "nameserver-policy": {} },
    rules: [],
  };
  const connected = {
    "proxy-groups": [
      {
        name: "@profile/new-service",
        type: "select",
        proxies: ["🆕 New Service"],
      },
      {
        name: "🆕 New Service",
        type: "select",
        proxies: ["@profile/new-service"],
      },
    ],
  };
  assert.doesNotThrow(() => validateCompilerGroupGraph(connected, fragment));
  const orphaned = {
    "proxy-groups": [
      { name: "@profile/new-service", type: "select", proxies: [] },
      { name: "🆕 New Service", type: "select", proxies: [] },
    ],
  };
  assert.throws(
    () => validateCompilerGroupGraph(orphaned, fragment),
    ShadowProfileError,
  );
});
