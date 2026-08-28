import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { z } from "zod";
import YAML from "yaml";

import {
  RoutingConfigLoadError,
  loadRoutingConfig,
  loadRoutingConfigFromFiles,
} from "../../internal/typescript/routing/loader.js";
import {
  compileRoutingProfile,
  RoutingCompileError,
} from "../../internal/typescript/routing/compiler.js";
import {
  compileMihomoFragment,
  loadMihomoProjectionConfig,
  MihomoProjectionError,
  renderMihomoFragment,
} from "../../internal/typescript/routing/mihomo-projection.js";
import {
  compileIniMvpPlan,
  IniMvpPlanSchema,
} from "../../internal/typescript/routing/ini-mvp-plan.js";
import {
  compileControllerPlan,
  compileFirewallSemanticPlan,
} from "../../internal/typescript/routing/runtime-plan.js";
import {
  ControllerTransactionError,
  executeControllerTransaction,
  previewControllerTransaction,
  type ControllerApi,
  type StartupGate,
} from "../../internal/typescript/routing/runtime-controller.js";
import {
  ApprovedEgressSchema,
  RouterLocalConfigError,
  createInitialRuntimeState,
  decideAccountSafety,
  validateAccountMaterializedGraph,
  validateRouterLocalConfig,
} from "../../internal/typescript/routing/router-local.js";
import {
  validateEffectiveCutover,
  EffectiveCutoverError,
} from "../../internal/typescript/routing/cutover-validator.js";
import {
  compileFirewallAdapterPlan,
  RuntimeTopologyError,
} from "../../internal/typescript/routing/runtime-topology.js";
import {
  materializePrivateProfile,
  PrivateMaterializerError,
  sha256Utf8,
} from "../../internal/typescript/routing/private-materializer.js";
import {
  checkRoutingArtifacts,
  expectedRoutingArtifacts,
  RoutingArtifactCheckError,
} from "../../internal/typescript/routing/routing-artifacts.js";
import {
  canonicalServiceIdFromLegacy,
  canonicalServiceIdFromLegacyGroup,
} from "../../internal/typescript/routing/migration-adapter.js";
import {
  RoutingConfigSchema,
  type RoutingConfig,
} from "../../internal/typescript/routing/schema.js";
import {
  renderShadowTemplate,
  ShadowTemplateError,
} from "../../internal/typescript/routing/shadow-template.js";
import {
  composeShadowProfile,
  loadLegacyRelaxedBase,
  loadShadowParityManifest,
  ShadowProfileError,
  validateShadowParityCandidate,
  validateShadowFragmentShape,
  validateCompilerGroupGraph,
} from "../../internal/typescript/routing/shadow-profile.js";
import {
  validateRoutingSemantics,
  validateRuleOrdering,
} from "../../internal/typescript/routing/semantic-validator.js";

const ROOT = resolve(import.meta.dirname, "../..");
const VALID_DIRECTORY = join(ROOT, "internal", "config", "ai-routing");
const INVALID_DIRECTORY = join(ROOT, "tests", "fixtures", "routing", "invalid");
const MIHOMO_PROJECTION = join(VALID_DIRECTORY, "mihomo.yaml");
const SHADOW_PARITY = join(VALID_DIRECTORY, "parity.yaml");
const SHADOW_TEMPLATE = join(
  ROOT,
  "internal",
  "templates",
  "ai-routing",
  "full-relaxed-shadow.yaml.tpl",
);
const RELAXED_BASE = join(ROOT, "cfg", "yaml", "Custom_Clash_AI.yaml");
const SHADOW_TEMPLATE_CONTEXT = {
  header: "# shadow",
  "static-top-level": "port: 7890",
  "proxy-providers": "  provider: {}",
  dns: "  enable: true",
  "proxy-groups": "  - name: x",
  rules: "  - MATCH,DIRECT",
  "rule-providers": "  example: {}",
} as const;

async function privateMaterializeOptions(
  allowedOutputRoot: string,
  canonicalCandidate = join(
    ROOT,
    "internal",
    "generated",
    "ai-routing",
    "hk.full-profile-candidate.yaml",
  ),
) {
  return {
    allowedOutputRoot,
    trustedBaseRoot: dirname(dirname(allowedOutputRoot)),
    expectedCandidateSha256: sha256Utf8(await readFile(canonicalCandidate)),
  };
}

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

async function shadowInputs() {
  return {
    config: await loadRoutingConfig(VALID_DIRECTORY),
    projection: await loadMihomoProjectionConfig(MIHOMO_PROJECTION),
    parity: await loadShadowParityManifest(SHADOW_PARITY),
  };
}

async function composeWithBase(
  contents: string,
  mutateParity?: (value: Record<string, unknown>) => void,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "routing-shadow-base-"));
  try {
    const base = join(directory, "base.yaml");
    await writeFile(base, contents, "utf8");
    const { config, projection, parity } = await shadowInputs();
    const mutable = structuredClone(parity) as unknown as Record<
      string,
      unknown
    >;
    mutateParity?.(mutable);
    await composeShadowProfile(
      config,
      projection,
      base,
      mutable as typeof parity,
      SHADOW_TEMPLATE,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("shadow composer applies only four exact typed deltas and preserves closed unrelated inventory", async () => {
  const { config, projection, parity } = await shadowInputs();
  const result = await composeShadowProfile(
    config,
    projection,
    RELAXED_BASE,
    parity,
    SHADOW_TEMPLATE,
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

  const base = await readFile(RELAXED_BASE, "utf8");
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
  const directory = await mkdtemp(join(tmpdir(), "routing-shadow-preserve-"));
  try {
    const basePath = join(directory, "base.yaml");
    await writeFile(basePath, injected, "utf8");
    const preserved = await composeShadowProfile(
      config,
      projection,
      basePath,
      parity,
      SHADOW_TEMPLATE,
    );
    assert.match(preserved.candidateYaml, /AI_Unrelated_Classical/);
    assert.match(preserved.candidateYaml, /🤖 Unrelated/);
    assert.match(
      preserved.candidateYaml,
      /RULE-SET,AI_Unrelated_Classical,🤖 Unrelated/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("shadow composer rejects stale, missing, and unapproved typed delta contracts", async () => {
  const base = await readFile(RELAXED_BASE, "utf8");
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
  const base = YAML.parse(await readFile(RELAXED_BASE, "utf8")) as Record<
    string,
    unknown
  >;
  (base["proxy-groups"] as Array<unknown>).unshift({
    name: "🤗 Hugging Face",
    type: "select",
    proxies: ["DIRECT"],
  });
  await assert.rejects(
    () => composeWithBase(YAML.stringify(base)),
    (error: unknown) =>
      error instanceof ShadowProfileError &&
      error.issues.some((entry) =>
        entry.message.includes("collides with preserved"),
      ),
  );
});

test("shadow composer refuses changed unowned surfaces, interval anomalies, and malformed boundaries", async () => {
  const base = await readFile(RELAXED_BASE, "utf8");
  const { config, projection, parity } = await shadowInputs();
  const baseline = await composeShadowProfile(
    config,
    projection,
    RELAXED_BASE,
    parity,
    SHADOW_TEMPLATE,
  );
  const baseObject = await loadLegacyRelaxedBase(RELAXED_BASE);
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
  const malformed = await mkdtemp(join(tmpdir(), "routing-shadow-malformed-"));
  try {
    const path = join(malformed, "bad.yaml");
    await writeFile(
      path,
      "proxy-groups: {}\nrules: []\nrule-providers: {}\nproxy-providers: {}\ndns: {}\n",
      "utf8",
    );
    await assert.rejects(() => loadLegacyRelaxedBase(path), ShadowProfileError);
  } finally {
    await rm(malformed, { recursive: true, force: true });
  }
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

async function loadInvalid(
  name: string,
): Promise<ReturnType<typeof loadRoutingConfigFromFiles>> {
  return loadRoutingConfigFromFiles([join(INVALID_DIRECTORY, `${name}.yaml`)]);
}

interface ChildResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runRoutingCli(manifestDirectory: string): Promise<ChildResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "internal/typescript/routing/cli.ts",
        "validate",
        manifestDirectory,
      ],
      { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", rejectPromise);
    child.once("close", (exitCode) => {
      resolvePromise({ exitCode, stdout, stderr });
    });
  });
}

function runShellAction(
  script: string,
  action: "--dry-run" | "--reconcile",
  environment: Readonly<Record<string, string>>,
): Promise<ChildResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("sh", [script, action], {
      cwd: ROOT,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", rejectPromise);
    child.once("close", (exitCode) =>
      resolvePromise({ exitCode, stdout, stderr }),
    );
  });
}

function runShellPreview(
  script: string,
  environment: Readonly<Record<string, string>>,
): Promise<ChildResult> {
  return runShellAction(script, "--dry-run", environment);
}

test("canonical HK matrix and protected Claude configuration validate", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const hk = config.accessProfiles.hk;
  const claude = config.services.claude;
  assert.ok(hk !== undefined);
  assert.ok(claude !== undefined);
  assert.equal(hk.displayName, "🇭🇰 香港存取策略");
  assert.equal(claude.selector.kind, "explicit-node");
  assert.equal(claude.defaultRoute, "reject");
  assert.equal(config.services.windsurf?.protectionClass, "proxy-required");
  assert.equal(config.services.huggingface?.protectionClass, "proxy-required");
  assert.deepEqual(Object.keys(config.services).sort(), [
    "chatgpt",
    "claude",
    "copilot",
    "gemini",
    "grok",
    "huggingface",
    "notebooklm",
    "perplexity",
    "poe",
    "windsurf",
  ]);
  assert.deepEqual(Object.keys(config.accessProfiles).sort(), [
    "hk",
    "jp",
    "sg",
    "us",
  ]);
  assert.deepEqual(validateRoutingSemantics(config), []);
});

test("INI MVP plan owns ordered rules/groups, pins providers, and keeps Claude reject-only", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
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

test("Mihomo projection renders REJECT-first filtered groups, protected rules, and pinned DNS", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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
  const committed = await readFile(
    join(
      ROOT,
      "internal",
      "generated",
      "ai-routing",
      "hk.mihomo-fragment.yaml",
    ),
    "utf8",
  );
  const rendered = renderMihomoFragment(
    compileMihomoFragment(config, projection, "hk"),
  );
  assert.equal(committed, rendered);
  const parsed = YAML.parse(committed) as unknown;
  assert.equal(typeof parsed, "object");
});

test("compiler rejects semantic invalidity and unknown profile references", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const committed = await readFile(
    join(ROOT, "internal", "generated", "ai-routing", "hk.plan.json"),
    "utf8",
  );
  const expected = `${JSON.stringify(compileRoutingProfile(config, "hk"), null, 2)}\n`;
  assert.equal(committed, expected);
});

test("all canonical profiles have deterministic plan and non-standalone fragment artifacts", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
  for (const profileId of Object.keys(config.accessProfiles).sort()) {
    assert.ok(projection.profiles[profileId] !== undefined);
    const plan = await readFile(
      join(
        ROOT,
        "internal",
        "generated",
        "ai-routing",
        `${profileId}.plan.json`,
      ),
      "utf8",
    );
    const fragment = await readFile(
      join(
        ROOT,
        "internal",
        "generated",
        "ai-routing",
        `${profileId}.mihomo-fragment.yaml`,
      ),
      "utf8",
    );
    assert.equal(
      plan,
      `${JSON.stringify(compileRoutingProfile(config, profileId), null, 2)}\n`,
    );
    assert.equal(
      fragment,
      renderMihomoFragment(
        compileMihomoFragment(config, projection, profileId),
      ),
    );
    assert.equal(fragment.includes("MATCH,"), false);
    const parsed = YAML.parse(fragment) as Record<string, unknown>;
    const groups = parsed["proxy-groups"] as Array<Record<string, unknown>>;
    assert.equal(
      groups.some((group) => String(group.name).endsWith(" Auto")),
      false,
    );
    assert.equal(
      groups.some((group) => group.name === "🔐 Claude US Pinned"),
      false,
    );
    const rules = parsed.rules as string[];
    const deepmind = rules.findIndex((rule) =>
      rule.startsWith("GEOSITE,google-deepmind,"),
    );
    const category = rules.findIndex((rule) =>
      rule.startsWith("GEOSITE,category-ai-!cn,"),
    );
    assert.equal(deepmind >= 0 && category === deepmind + 1, true);
    assert.equal(
      rules[deepmind]?.split(",").at(-1),
      rules[category]?.split(",").at(-1),
    );
  }
});

test("artifact checker is read-only and rejects missing, stale, and changed outputs", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
  const expected = expectedRoutingArtifacts(config, projection);
  const directory = await mkdtemp(join(tmpdir(), "routing-artifacts-"));
  try {
    for (const [name, content] of expected)
      await writeFile(join(directory, name), content, "utf8");
    await checkRoutingArtifacts(config, projection, directory);
    await writeFile(
      join(directory, "hk.full-profile-candidate.yaml"),
      "shadow owns this artifact\n",
      "utf8",
    );
    await writeFile(join(directory, "hk.parity-report.json"), "{}\n", "utf8");
    await checkRoutingArtifacts(config, projection, directory);

    const missing = "hk.plan.json";
    await rm(join(directory, missing));
    await assert.rejects(
      () => checkRoutingArtifacts(config, projection, directory),
      (error: unknown) =>
        error instanceof RoutingArtifactCheckError &&
        error.issues.some(
          (entry) =>
            entry.path.at(-1) === missing && entry.message.includes("missing"),
        ),
    );
    assert.equal(
      await readFile(join(directory, "hk.mihomo-fragment.yaml"), "utf8"),
      expected.get("hk.mihomo-fragment.yaml"),
    );

    await writeFile(
      join(directory, missing),
      expected.get(missing) ?? "",
      "utf8",
    );
    await writeFile(
      join(directory, "obsolete.plan.json"),
      "obsolete\n",
      "utf8",
    );
    await assert.rejects(
      () => checkRoutingArtifacts(config, projection, directory),
      (error: unknown) =>
        error instanceof RoutingArtifactCheckError &&
        error.issues.some(
          (entry) =>
            entry.path.at(-1) === "obsolete.plan.json" &&
            entry.message.includes("stale"),
        ),
    );
    await rm(join(directory, "obsolete.plan.json"));

    await writeFile(join(directory, "jp.plan.json"), "changed\n", "utf8");
    await assert.rejects(
      () => checkRoutingArtifacts(config, projection, directory),
      (error: unknown) =>
        error instanceof RoutingArtifactCheckError &&
        error.issues.some(
          (entry) =>
            entry.path.at(-1) === "jp.plan.json" &&
            entry.message.includes("differs"),
        ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("region filters use boundary-aware codes and a source base path remains pinned", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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

test("RoutingConfigSchema rejects record IDs outside the canonical ID pattern", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const mutated = structuredClone(config);
  const windsurf = mutated.services.windsurf;
  assert.ok(windsurf !== undefined);
  mutated.services.Invalid_ID = windsurf;
  const result = RoutingConfigSchema.safeParse(mutated);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(
      result.error.issues.some(
        (entry) => entry.path.join(".") === "services.Invalid_ID",
      ),
    );
  }
});

test("RoutingConfigSchema rejects unknown root and nested object keys", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const withUnknownRoot = structuredClone(config) as unknown as Record<
    string,
    unknown
  >;
  withUnknownRoot.unexpectedRoot = true;
  const rootResult = RoutingConfigSchema.safeParse(withUnknownRoot);
  assert.equal(rootResult.success, false);
  if (!rootResult.success) {
    assert.ok(
      rootResult.error.issues.some((entry) =>
        entry.message.includes("unexpectedRoot"),
      ),
    );
  }

  const withUnknownNested = structuredClone(config);
  const windsurf = withUnknownNested.services.windsurf;
  assert.ok(windsurf !== undefined);
  const mutableWindsurf = windsurf as unknown as Record<string, unknown>;
  mutableWindsurf.unexpectedServiceField = true;
  const nestedResult = RoutingConfigSchema.safeParse(withUnknownNested);
  assert.equal(nestedResult.success, false);
  if (!nestedResult.success) {
    assert.ok(
      nestedResult.error.issues.some(
        (entry) =>
          entry.path.join(".") === "services.windsurf" &&
          entry.message.includes("unexpectedServiceField"),
      ),
    );
  }
});

for (const [fixture, expectedCode] of [
  ["claude-direct", "policy-invariant"],
  ["empty-proxy-server-nameserver", "policy-invariant"],
  ["protected-profile-override", "policy-invariant"],
  ["protected-endpoint-profile-override", "policy-invariant"],
  ["dynamic-route-stable-endpoint", "dynamic-route"],
  ["missing-ref", "missing-reference"],
  ["empty-pinned-node-list", "schema"],
] as const) {
  test(`invalid fixture ${fixture} is rejected`, async () => {
    try {
      const config = await loadInvalid(fixture);
      const issues = validateRoutingSemantics(config);
      assert.ok(issues.some((entry) => entry.code === expectedCode));
    } catch (error: unknown) {
      assert.ok(error instanceof RoutingConfigLoadError);
      assert.ok(error.issues.some((entry) => entry.code === expectedCode));
    }
  });
}

test("account-protected endpoint overrides fail semantically before compilation", async () => {
  const config = await loadInvalid("protected-endpoint-profile-override");
  const issues = validateRoutingSemantics(config);
  const path = "accessProfiles.hk.endpointOverrides.claude.service";
  assert.ok(
    issues.some(
      (entry) =>
        entry.code === "policy-invariant" &&
        entry.path.join(".") === path &&
        entry.message.includes("account-protected endpoint"),
    ),
  );
  assert.throws(
    () => compileRoutingProfile(config, "hk"),
    (error: unknown) =>
      error instanceof RoutingCompileError &&
      error.issues.some(
        (entry) =>
          entry.code === "policy-invariant" && entry.path.join(".") === path,
      ),
  );
});

test("routing config directory ignores sibling manifests owned by other schemas", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  assert.equal(config.schemaVersion, 1);
  assert.ok(config.services.chatgpt !== undefined);
  assert.ok(config.accessProfiles.hk !== undefined);
});

test("fragment loader rejects duplicate record IDs instead of overwriting", async () => {
  const directory = await mkdtemp(join(tmpdir(), "routing-config-"));
  try {
    const first = join(directory, "01.yaml");
    const second = join(directory, "02.yaml");
    await writeFile(
      first,
      "routeTargets:\n  reject: { kind: reject, group: REJECT }\n",
      "utf8",
    );
    await writeFile(
      second,
      "routeTargets:\n  reject: { kind: reject, group: REJECT }\n",
      "utf8",
    );
    await assert.rejects(
      () => loadRoutingConfigFromFiles([first, second]),
      (error: unknown) =>
        error instanceof RoutingConfigLoadError &&
        error.issues.some((entry) => entry.code === "duplicate-key"),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fragment loader rejects duplicate YAML mapping keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "routing-config-"));
  try {
    const fixture = join(directory, "duplicate.yaml");
    await writeFile(
      fixture,
      "routeTargets:\n  reject: { kind: reject, group: REJECT }\n  reject: { kind: reject, group: REJECT }\n",
      "utf8",
    );
    await assert.rejects(
      () => loadRoutingConfigFromFiles([fixture]),
      (error: unknown) =>
        error instanceof RoutingConfigLoadError &&
        error.issues.some((entry) => entry.code === "invalid-yaml"),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("routing CLI exits non-zero with code, path, and message for invalid input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "routing-cli-invalid-"));
  try {
    const fixture = await readFile(
      join(INVALID_DIRECTORY, "empty-proxy-server-nameserver.yaml"),
      "utf8",
    );
    await writeFile(join(directory, "00-invalid.yaml"), fixture, "utf8");
    const result = await runRoutingCli(directory);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /\[policy-invariant\]/);
    assert.match(
      result.stderr,
      /dns\.profiles\.default\.proxyServerNameserver/,
    );
    assert.match(
      result.stderr,
      /respectRules requires at least one proxyServerNameserver/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("migration adapter only maps legacy identities and has no generator side effect", () => {
  assert.equal(canonicalServiceIdFromLegacy("claude"), "claude");
  assert.equal(canonicalServiceIdFromLegacy("unknown"), undefined);
  assert.equal(canonicalServiceIdFromLegacyGroup("🤖 Claude"), "claude");
  assert.equal(canonicalServiceIdFromLegacyGroup("🤖 Claude "), undefined);
});

test("every DNS resolver viaRoute must reference a known target", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const mutated = structuredClone(config);
  const dnsProfile = mutated.dns.profiles.default;
  assert.ok(dnsProfile !== undefined);
  const resolver = dnsProfile.proxyServerNameserver[0];
  assert.ok(resolver !== undefined);
  resolver.viaRoute = "missing-route";
  const issues = validateRoutingSemantics(mutated);
  assert.ok(
    issues.some(
      (entry) =>
        entry.code === "missing-reference" &&
        entry.path.join(".") ===
          "dns.profiles.default.proxyServerNameserver.0.viaRoute",
    ),
  );
});

test("account-protected services need proxy-only DNS in every DNS profile", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const mutated = structuredClone(config);
  const dnsProfile = mutated.dns.profiles.default;
  assert.ok(dnsProfile !== undefined);
  delete dnsProfile.servicePolicies.claude;
  const issues = validateRoutingSemantics(mutated);
  assert.ok(
    issues.some(
      (entry) =>
        entry.path.join(".") === "dns.profiles.default.servicePolicies.claude",
    ),
  );
});

test("profile-aware services must explicitly override an incompatible profile default", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const mutated = structuredClone(config);
  const hk = mutated.accessProfiles.hk;
  assert.ok(hk !== undefined);
  delete hk.serviceOverrides.windsurf;
  assert.ok(
    validateRoutingSemantics(mutated).some(
      (entry) =>
        entry.path.join(".") === "accessProfiles.hk.defaultRoute" &&
        entry.message.includes("windsurf"),
    ),
  );
});

test("stable/realtime services and non-dynamic protection classes reject selectable auto routes", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const mutated = structuredClone(config);
  const windsurf = mutated.services.windsurf;
  assert.ok(windsurf !== undefined);
  windsurf.protectionClass = "stable-session";
  windsurf.allowedRoutes.push("us-auto");
  windsurf.selector.allowedRouteRefs.push("us-auto");
  const issues = validateRoutingSemantics(mutated);
  assert.ok(
    issues.some(
      (entry) =>
        entry.code === "policy-invariant" &&
        entry.path.join(".").startsWith("services.windsurf.allowedRoutes."),
    ),
  );
  assert.ok(
    issues.some(
      (entry) =>
        entry.code === "dynamic-route" &&
        entry.path
          .join(".")
          .startsWith("services.windsurf.selector.allowedRouteRefs."),
    ),
  );
});

test("pinned egress rejects built-ins and duplicate approved node identities", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const mutated = structuredClone(config);
  const target = mutated.routeTargets["claude-us-pinned"];
  assert.ok(target !== undefined && target.kind === "pinned-egress");
  target.approvedNodes.push("direct", "US-Claude-01");
  const issues = validateRoutingSemantics(mutated);
  assert.ok(
    issues.some(
      (entry) =>
        entry.path.join(".") === "routeTargets.claude-us-pinned.approvedNodes",
    ),
  );
  assert.ok(
    issues.some(
      (entry) =>
        entry.path.join(".") ===
        "routeTargets.claude-us-pinned.approvedNodes.2",
    ),
  );
});

test("account reset conditions must be unique", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const mutated = structuredClone(config);
  const protection = mutated.protectionClasses["account-protected"];
  assert.ok(
    protection !== undefined && protection.kind === "account-protected",
  );
  const first = protection.resetOn[0];
  assert.ok(first !== undefined);
  protection.resetOn.push(first);
  assert.ok(
    validateRoutingSemantics(mutated).some(
      (entry) =>
        entry.path.join(".") === "protectionClasses.account-protected.resetOn",
    ),
  );
});

test("rule ordering contract rejects a later stage before a protected terminal reject", () => {
  const issues = validateRuleOrdering({
    entries: [
      { stage: "account-protected", label: "Claude protected rule" },
      { stage: "specific-service", label: "Windsurf" },
      { stage: "account-terminal-reject", label: "Claude terminal reject" },
    ],
  });
  assert.equal(issues[0]?.code, "rule-ordering");
});

test("committed JSON Schema is generated from the Zod source", async () => {
  const committed = await readFile(
    join(ROOT, "internal", "schemas", "routing-config.schema.json"),
    "utf8",
  );
  const expected = `${JSON.stringify(z.toJSONSchema(RoutingConfigSchema), null, 2)}\n`;
  assert.equal(committed, expected);
});

test("controller plan materializes every access matrix into hidden profile selections only", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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

function topologyFixture(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    mode: "deployment",
    policyVersion: "1",
    protectedSources: {
      ipv4: ["192.0.2.10/32"],
      ipv6: ["2001:db8::10/128"],
      interfaces: ["br-ai"],
      vlans: ["ai-safe"],
    },
    routerDns: { ipv4: ["192.0.2.1"], ipv6: ["2001:db8::1"] },
    wanInterfaces: ["pppoe-wan"],
    mihomo: {
      interceptionChains: ["openclash_mihomo"],
      routingMark: "0x162",
      proxyEndpointIps: { ipv4: ["198.51.100.10"], ipv6: ["2001:db8:1::10"] },
    },
  };
}

test("firewall adapter plan requires exact dual-stack topology and has no runtime defaults", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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

function deploymentFixture(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    mode: "deployment",
    policyVersion: "1",
    controller: {
      url: "http://127.0.0.1:9090",
      secretFile: "/run/secrets/openclash-controller",
    },
    protectedSources: [{ kind: "vlan", name: "EXAMPLE-PROTECTED-VLAN" }],
  };
}

function egressFixture(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    mode: "deployment",
    policyVersion: "1",
    services: {
      claude: {
        bindings: [
          {
            approvedId: "US-Claude-01",
            node: "EXAMPLE-APPROVED-NODE-ONE",
            provider: "provider1",
          },
          {
            approvedId: "US-Claude-02",
            node: "EXAMPLE-APPROVED-NODE-TWO",
            provider: "provider1",
          },
        ],
        revokedNodes: [],
      },
    },
  };
}

function stateFixture(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    policyVersion: "1",
    activeMode: "hk",
    accounts: {
      claude: {
        selectedNode: "REJECT",
        verifiedPolicyVersion: null,
        verifiedNode: null,
        resetReason: "none",
      },
    },
  };
}

test("router-local documents require exact local egress mapping and preserve the initial locked state", async () => {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
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

class FakeControllerApi implements ControllerApi {
  public readonly transcript: string[] = [];

  public constructor(
    private readonly selections: Map<string, string>,
    private readonly failOn: readonly string[] = [],
    private readonly readbackOverrides: ReadonlyMap<string, string> = new Map(),
    sequentialReadbacks: ReadonlyMap<string, readonly string[]> = new Map(),
  ) {
    this.sequentialReadbacks = new Map(
      [...sequentialReadbacks.entries()].map(([group, values]) => [
        group,
        [...values],
      ]),
    );
  }

  private readonly sequentialReadbacks: Map<string, string[]>;

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
    if (this.failOn.includes(`${group}=${target}`)) {
      throw new Error(`SENTINEL_API_SECRET for ${group}=${target}`);
    }
    this.selections.set(group, target);
  }

  public selectionFor(group: string): string | undefined {
    return this.selections.get(group);
  }
}

const passingStartupGate: StartupGate = {
  async proveProtectedPathClosed(): Promise<void> {},
};

async function controllerFixture(): Promise<{
  readonly plan: ReturnType<typeof compileControllerPlan>;
  readonly local: ReturnType<typeof validateRouterLocalConfig>;
  readonly preview: ReturnType<typeof previewControllerTransaction>;
}> {
  const config = await loadRoutingConfig(VALID_DIRECTORY);
  const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
  const plan = compileControllerPlan(config, projection);
  const local = validateRouterLocalConfig(
    deploymentFixture(),
    egressFixture(),
    stateFixture(),
    plan,
  );
  return {
    plan,
    local,
    preview: previewControllerTransaction(plan, local.state),
  };
}

function firstHiddenUpdate(
  preview: ReturnType<typeof previewControllerTransaction>,
): { readonly group: string; readonly target: string } {
  const operation = preview.find((item) => item.phase === "hidden-update");
  if (operation?.target === undefined)
    throw new Error("expected a hidden profile operation");
  return { group: operation.group, target: operation.target };
}

function assertRedactedControllerFailure(
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

function assertRedactedControllerTranscript(api: FakeControllerApi): void {
  assert.doesNotMatch(
    api.transcript.join("\n"),
    /SENTINEL_API_SECRET|SENTINEL_GATE_SECRET|SENTINEL_APPROVED_NODE/,
  );
}

test("controller startup gate fails before any controller API call and redacts gate detail", async () => {
  const { plan, local, preview } = await controllerFixture();
  const firstHidden = firstHiddenUpdate(preview);
  const api = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
  );
  const failingGate: StartupGate = {
    async proveProtectedPathClosed(): Promise<void> {
      throw new Error("SENTINEL_GATE_SECRET");
    },
  };

  await assert.rejects(
    () =>
      executeControllerTransaction(
        api,
        local.deployment,
        plan,
        local.state,
        failingGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "startup-gate",
        "startup-gate-failed",
        0,
      ),
  );
  assert.deepEqual(api.transcript, []);
  assertRedactedControllerTranscript(api);
});

test("controller locks and verifies account guards before hidden writes without changing visible services", async () => {
  const { plan, local, preview } = await controllerFixture();
  const firstHidden = firstHiddenUpdate(preview);
  assert.equal(preview[0]?.phase, "lock");
  assert.ok(
    preview
      .filter((item) => item.phase === "hidden-update")
      .every((item) => item.group.startsWith("@profile/")),
  );
  assert.equal(
    preview.some((item) => item.group === "🌊 Windsurf"),
    false,
  );
  const previewRead = preview.find(
    (item) => item.phase === "hidden-read" && item.group === firstHidden.group,
  );
  const previewWrite = preview.find(
    (item) =>
      item.phase === "hidden-update" && item.group === firstHidden.group,
  );
  const previewReadback = [...preview]
    .reverse()
    .find(
      (item) => item.phase === "verify" && item.group === firstHidden.group,
    );
  assert.ok(
    previewRead !== undefined &&
      previewWrite !== undefined &&
      previewReadback !== undefined,
  );
  assert.ok(preview.indexOf(previewRead) < preview.indexOf(previewWrite));
  assert.ok(preview.indexOf(previewWrite) < preview.indexOf(previewReadback));

  const api = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
  );
  const result = await executeControllerTransaction(
    api,
    local.deployment,
    plan,
    local.state,
    passingStartupGate,
  );

  const accountLock = "PUT 🔐 Claude Account Guard=REJECT";
  const accountReadback = "GET 🔐 Claude Account Guard";
  const firstHiddenRead = `GET ${firstHidden.group}`;
  assert.ok(
    api.transcript.indexOf(accountLock) <
      api.transcript.indexOf(accountReadback),
  );
  assert.ok(
    api.transcript.indexOf(accountReadback) <
      api.transcript.indexOf(firstHiddenRead),
  );
  assert.ok(
    api.transcript.indexOf(`PUT ${firstHidden.group}=${firstHidden.target}`) <
      api.transcript.lastIndexOf(firstHiddenRead),
  );
  assert.equal(
    api.transcript.some((line) => line.startsWith("PUT 🌊 Windsurf=")),
    false,
  );
  assert.equal(api.selectionFor("🔐 Claude Account Guard"), "REJECT");
  assert.equal(result.rolledBack, false);
  assert.ok(
    result.operations.some(
      (operation) =>
        operation.phase === "verify" && operation.group === firstHidden.group,
    ),
  );
  assertRedactedControllerTranscript(api);
});

test("controller redacts account API and readback failures before hidden writes", async () => {
  const { plan, local, preview } = await controllerFixture();
  const firstHidden = firstHiddenUpdate(preview);
  const failingApi = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
    ["🔐 Claude Account Guard=REJECT"],
  );

  await assert.rejects(
    () =>
      executeControllerTransaction(
        failingApi,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "account-lock",
        "api-call-failed",
        0,
      ),
  );
  assert.equal(
    failingApi.transcript.some((line) => line.startsWith("GET @profile/")),
    false,
  );
  assertRedactedControllerTranscript(failingApi);

  const mismatchApi = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
    [],
    new Map([["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"]]),
  );
  await assert.rejects(
    () =>
      executeControllerTransaction(
        mismatchApi,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "account-readback",
        "readback-mismatch",
        0,
      ),
  );
  assert.equal(
    mismatchApi.transcript.some((line) => line.startsWith("GET @profile/")),
    false,
  );
  assertRedactedControllerTranscript(mismatchApi);
});

test("controller rolls back hidden selections only and preserves account locks on hidden failure", async () => {
  const { plan, local, preview } = await controllerFixture();
  const firstHidden = firstHiddenUpdate(preview);
  const api = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
    [`${firstHidden.group}=${firstHidden.target}`],
  );

  await assert.rejects(
    () =>
      executeControllerTransaction(
        api,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "hidden-update",
        "api-call-failed",
        0,
      ),
  );
  assert.equal(api.transcript.at(-1), `PUT ${firstHidden.group}=DIRECT`);
  assert.equal(
    api.transcript.filter(
      (line) => line === "PUT 🔐 Claude Account Guard=REJECT",
    ).length,
    1,
  );
  assert.equal(
    api.transcript.some((line) => line.startsWith("PUT 🌊 Windsurf=")),
    false,
  );
  assertRedactedControllerTranscript(api);

  const rollbackFailure = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
    [
      `${firstHidden.group}=${firstHidden.target}`,
      `${firstHidden.group}=DIRECT`,
    ],
  );
  await assert.rejects(
    () =>
      executeControllerTransaction(
        rollbackFailure,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "hidden-update",
        "api-call-failed",
        1,
      ),
  );
  assertRedactedControllerTranscript(rollbackFailure);
});

test("controller rolls back a hidden selector when its post-write readback mismatches", async () => {
  const { plan, local, preview } = await controllerFixture();
  const firstHidden = firstHiddenUpdate(preview);
  const previous = "PREVIOUS-HIDDEN-FIRST";
  const api = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, previous],
    ]),
    [],
    new Map(),
    new Map([[firstHidden.group, [previous, "MISMATCHED-HIDDEN-READBACK"]]]),
  );

  await assert.rejects(
    () =>
      executeControllerTransaction(
        api,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "hidden-readback",
        "readback-mismatch",
        0,
      ),
  );
  const write = `PUT ${firstHidden.group}=${firstHidden.target}`;
  const rollback = `PUT ${firstHidden.group}=${previous}`;
  assert.ok(
    api.transcript.indexOf(`GET ${firstHidden.group}`) <
      api.transcript.indexOf(write),
  );
  assert.ok(
    api.transcript.indexOf(write) <
      api.transcript.lastIndexOf(`GET ${firstHidden.group}`),
  );
  assert.equal(api.transcript.at(-1), rollback);
  assert.equal(api.selectionFor(firstHidden.group), previous);
  assert.equal(api.selectionFor("🔐 Claude Account Guard"), "REJECT");
  assert.equal(
    api.transcript.filter(
      (line) => line === "PUT 🔐 Claude Account Guard=REJECT",
    ).length,
    1,
  );
  assert.equal(
    api.transcript.some((line) => line.startsWith("PUT 🌊 Windsurf=")),
    false,
  );
  assertRedactedControllerTranscript(api);
});

test("controller restores every recorded hidden selector in reverse order after a later hidden write failure", async () => {
  const { plan, local, preview } = await controllerFixture();
  const hidden = preview.filter(
    (
      operation,
    ): operation is {
      readonly phase: "hidden-update";
      readonly group: string;
      readonly target: string;
    } => operation.phase === "hidden-update" && operation.target !== undefined,
  );
  assert.ok(hidden.length >= 2);
  const [firstHidden, secondHidden] = hidden;
  if (firstHidden === undefined || secondHidden === undefined)
    throw new Error("expected two hidden profile operations");
  const firstPrevious = "PREVIOUS-HIDDEN-FIRST";
  const secondPrevious = "PREVIOUS-HIDDEN-SECOND";
  const api = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, firstPrevious],
      [secondHidden.group, secondPrevious],
    ]),
    [`${secondHidden.group}=${secondHidden.target}`],
  );

  await assert.rejects(
    () =>
      executeControllerTransaction(
        api,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "hidden-update",
        "api-call-failed",
        0,
      ),
  );
  assert.deepEqual(api.transcript.slice(-2), [
    `PUT ${secondHidden.group}=${secondPrevious}`,
    `PUT ${firstHidden.group}=${firstPrevious}`,
  ]);
  assert.equal(api.selectionFor(firstHidden.group), firstPrevious);
  assert.equal(api.selectionFor(secondHidden.group), secondPrevious);
  assert.equal(api.selectionFor("🔐 Claude Account Guard"), "REJECT");
  assert.equal(
    api.transcript.filter(
      (line) => line === "PUT 🔐 Claude Account Guard=REJECT",
    ).length,
    1,
  );
  assert.equal(
    api.transcript.some((line) => line.startsWith("PUT 🌊 Windsurf=")),
    false,
  );
  assertRedactedControllerTranscript(api);
});

test("POSIX controller preview consumes line-preserving jsonfilter output and rejects unsupported IPv6 spelling", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "routing-controller-preview-"),
  );
  try {
    const tools = join(directory, "tools");
    const plan = join(directory, "controller-plan.json");
    const deployment = join(directory, "deployment.json");
    const egress = join(directory, "approved-egress.json");
    const state = join(directory, "state.json");
    const secret = join(directory, "controller.secret");
    const curlLog = join(directory, "curl-transcript.log");
    const jsonfilter = join(tools, "jsonfilter");
    const curl = join(tools, "curl");
    const jshn = join(tools, "jshn.sh");
    await new Promise<void>((resolvePromise, rejectPromise) => {
      spawn("mkdir", ["-p", tools])
        .once("error", rejectPromise)
        .once("close", (code) =>
          code === 0
            ? resolvePromise()
            : rejectPromise(new Error("mkdir failed")),
        );
    });
    await Promise.all([
      writeFile(plan, "{}\n"),
      writeFile(deployment, "{}\n"),
      writeFile(egress, '{"node":"EXAMPLE node 🤖 with spaces"}\n'),
      writeFile(state, "{}\n"),
      writeFile(secret, "example-token-never-printed\n"),
    ]);
    await writeFile(
      curl,
      "#!/bin/sh\ncase \"$*\" in *'/proxies'*) printf '%s\\n' 'GET /proxies' > \"$AI_ROUTING_TEST_CURL_LOG\" ;; *) exit 2 ;; esac\n",
      "utf8",
    );
    await writeFile(
      jshn,
      "json_init() { :; }\njson_add_string() { :; }\njson_dump() { printf '%s' '{}'; }\n",
      "utf8",
    );
    const fakeJsonfilter = [
      "#!/bin/sh",
      "expr=",
      "while [ $# -gt 0 ]; do",
      "  if [ $1 = -e ]; then expr=$2; shift 2; else shift; fi",
      "done",
      "case $expr in",
      "  '@.policyVersion') printf '%s\\n' '1' ;;",
      "  '@.controller.url') printf '%s\\n' ${AI_ROUTING_TEST_URL:-http://127.0.0.1:9090} ;;",
      "  '@.controller.secretFile') printf '%s\\n' $AI_ROUTING_TEST_SECRET ;;",
      "  '@.activeMode') printf '%s\\n' 'hk' ;;",
      "  '@.accountProtected[*].visibleGroup') printf '%s\\n' '🔐 Claude Account Guard' ;;",
      "  '@.modes.hk.hiddenSelections[#]') printf '%s\\n' '2' ;;",
      "  '@.modes.hk.hiddenSelections[0].group') printf '%s\\n' '@profile/windsurf' ;;",
      "  '@.modes.hk.hiddenSelections[0].target') printf '%s\\n' '🇺🇸 US Stable' ;;",
      "  '@.modes.hk.hiddenSelections[1].group') printf '%s\\n' '@profile/huggingface' ;;",
      "  '@.modes.hk.hiddenSelections[1].target') printf '%s\\n' 'DIRECT' ;;",
      "  *) exit 2 ;;",
      "esac",
      "",
    ].join("\n");
    await writeFile(jsonfilter, fakeJsonfilter, "utf8");
    await Promise.all([chmod(curl, 0o755), chmod(jsonfilter, 0o755)]);
    const environment = {
      PATH: `${tools}:${process.env.PATH ?? ""}`,
      AI_ROUTING_PLAN: plan,
      AI_ROUTING_DEPLOYMENT: deployment,
      AI_ROUTING_EGRESS: egress,
      AI_ROUTING_STATE: state,
      AI_ROUTING_JSHN: jshn,
      AI_ROUTING_TEST_SECRET: secret,
      AI_ROUTING_TEST_CURL_LOG: curlLog,
    };
    const preview = await runShellPreview(
      join(ROOT, "setup", "openclash", "scripts", "ai-routing-controller.sh"),
      environment,
    );
    assert.equal(preview.exitCode, 0, preview.stderr);
    assert.match(preview.stdout, /reconciliation is disabled/);
    assert.match(
      preview.stdout,
      /no controller API, secret file, local binding, or runtime-state input is read/,
    );
    assert.doesNotMatch(preview.stdout, /example-token-never-printed/);
    assert.doesNotMatch(preview.stderr, /example-token-never-printed/);
    assert.doesNotMatch(preview.stdout, /🌊 Windsurf/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("POSIX reconcile is an explicit fail-closed stub and performs no API calls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "routing-reconcile-"));
  try {
    const tools = join(directory, "tools");
    await mkdir(tools);
    const plan = join(directory, "plan.json");
    const deployment = join(directory, "deployment.json");
    const egress = join(directory, "egress.json");
    const state = join(directory, "state.json");
    const secret = join(directory, "secret");
    const transcript = join(directory, "transcript");
    const jsonfilter = join(tools, "jsonfilter");
    const curl = join(tools, "curl");
    const jshn = join(tools, "jshn.sh");
    await Promise.all([
      writeFile(plan, "{}"),
      writeFile(deployment, "{}"),
      writeFile(egress, "{}"),
      writeFile(state, "{}"),
      writeFile(secret, "non-newline-secret"),
    ]);
    await writeFile(
      jshn,
      [
        "json_init() { :; }",
        "json_add_string() { :; }",
        "json_dump() { printf '%s' '{\\\"name\\\":\\\"safe\\\"}'; }",
        "",
      ].join("\n"),
    );
    await writeFile(
      jsonfilter,
      [
        "#!/bin/sh",
        "file=",
        "expr=",
        "while [ $# -gt 0 ]; do case $1 in -i) file=$2; shift 2 ;; -e) expr=$2; shift 2 ;; *) shift ;; esac; done",
        "input=$(cat ${file:-/dev/stdin})",
        "case $expr in",
        "  '@.policyVersion') printf '%s\\n' 1 ;;",
        "  '@.controller.url') printf '%s\\n' http://127.0.0.1:9090 ;;",
        "  '@.controller.secretFile') printf '%s\\n' $AI_ROUTING_RECONCILE_SECRET ;;",
        "  '@.api.versionPath') printf '%s\\n' /version ;;",
        "  '@.version') printf '%s\\n' 1.19.0 ;;",
        "  '@.accountProtected[#]') printf '%s\\n' 1 ;;",
        "  '@.accountProtected[0].lockRequest.proxyPath') printf '%s\\n' /proxies/%F0%9F%94%90%20Claude%20Account%20Guard ;;",
        "  '@.accountProtected[0].lockRequest.target') printf '%s\\n' REJECT ;;",
        "  '@.activeMode') printf '%s\\n' hk ;;",
        "  '@.modes.hk.hiddenSelections[#]') printf '%s\\n' 1 ;;",
        "  '@.modes.hk.hiddenSelections[0].group') printf '%s\\n' @profile/windsurf ;;",
        "  '@.modes.hk.hiddenSelections[0].proxyPath') printf '%s\\n' /proxies/%40profile%2Fwindsurf ;;",
        "  '@.modes.hk.hiddenSelections[0].target') printf '%s\\n' DIRECT ;;",
        "  '@.type') printf '%s\\n' Selector ;;",
        "  '@.now') case $input in *HIDDEN*) printf '%s\\n' DIRECT ;; *) printf '%s\\n' REJECT ;; esac ;;",
        "  '@.all[*]') printf '%s\\n' REJECT; printf '%s\\n' DIRECT ;;",
        "  *) exit 2 ;;",
        "esac",
        "",
      ].join("\n"),
    );
    await writeFile(
      curl,
      [
        "#!/bin/sh",
        'printf \'%s\\n\' "$*" >> "$AI_ROUTING_RECONCILE_TRANSCRIPT"',
        "case \"$*\" in *--request*PUT*) printf 204 ;; *%40profile%2Fwindsurf*) printf '%s' HIDDEN ;; *) printf '%s' ACCOUNT ;; esac",
        "",
      ].join("\n"),
    );
    await Promise.all([chmod(jsonfilter, 0o755), chmod(curl, 0o755)]);
    const env = {
      PATH: `${tools}:${process.env.PATH ?? ""}`,
      AI_ROUTING_PLAN: plan,
      AI_ROUTING_DEPLOYMENT: deployment,
      AI_ROUTING_EGRESS: egress,
      AI_ROUTING_STATE: state,
      AI_ROUTING_JSHN: jshn,
      AI_ROUTING_RECONCILE_SECRET: secret,
      AI_ROUTING_RECONCILE_TRANSCRIPT: transcript,
    };
    const result = await runShellAction(
      join(ROOT, "setup", "openclash", "scripts", "ai-routing-controller.sh"),
      "--reconcile",
      env,
    );
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /reconcile is disabled/);
    await assert.rejects(() => readFile(transcript, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("tampered account lock targets and paths never reach the disabled controller API", async () => {
  const directory = await mkdtemp(join(tmpdir(), "routing-reconcile-tamper-"));
  try {
    const curl = join(directory, "curl");
    const transcript = join(directory, "curl.log");
    await writeFile(
      curl,
      `#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"${transcript}\"\nexit 99\n`,
    );
    await chmod(curl, 0o755);
    for (const tamperedLock of [
      { proxyPath: "/proxies/another-group", target: "US-Claude-01" },
      { proxyPath: "/proxies/%44IRECT", target: "DIRECT" },
    ]) {
      const plan = join(directory, `${tamperedLock.target}.json`);
      await writeFile(
        plan,
        JSON.stringify({
          accountProtected: [
            {
              visibleGroup: "🔐 Claude Account Guard",
              lockRequest: tamperedLock,
            },
          ],
        }),
      );
      const result = await runShellAction(
        join(ROOT, "setup", "openclash", "scripts", "ai-routing-controller.sh"),
        "--reconcile",
        {
          PATH: `${directory}:${process.env.PATH ?? ""}`,
          AI_ROUTING_PLAN: plan,
        },
      );
      assert.notEqual(result.exitCode, 0);
      assert.match(result.stderr, /reconcile is disabled/);
    }
    await assert.rejects(() => readFile(transcript, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("private materializer preserves the candidate except allowed private deltas and never reports secrets or nodes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "private-materializer-"));
  try {
    const local = join(directory, "local", "ai-routing");
    await mkdir(local, { recursive: true });
    await chmod(local, 0o700);
    const secret = join(directory, "secret");
    const output = join(local, "private.yaml");
    await writeFile(secret, "private-secret-value");
    await chmod(secret, 0o600);
    const config = await loadRoutingConfig(VALID_DIRECTORY);
    const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
    const plan = compileControllerPlan(config, projection);
    const options = await privateMaterializeOptions(local);
    const deployment = {
      ...deploymentFixture(),
      controller: { url: "http://127.0.0.1:9090", secretFile: secret },
    };
    const egress = egressFixture();
    const bindings = (
      egress.services as Record<
        string,
        {
          bindings: Array<{
            approvedId: string;
            node: string;
            provider: string;
          }>;
        }
      >
    ).claude?.bindings;
    assert.ok(bindings !== undefined);
    bindings[0] = {
      approvedId: "US-Claude-01",
      node: "節點 A + (safe)",
      provider: "provider1",
    };
    bindings[1] = {
      approvedId: "US-Claude-02",
      node: "node [B]?",
      provider: "provider1",
    };
    const report = await materializePrivateProfile(
      join(
        ROOT,
        "internal",
        "generated",
        "ai-routing",
        "hk.full-profile-candidate.yaml",
      ),
      output,
      plan,
      deployment,
      egress,
      options,
    );
    assert.deepEqual(report, {
      changedGroups: ["🔐 Claude Account Guard"],
      controllerChanged: true,
      startupGate: "still-required",
    });
    assert.doesNotMatch(JSON.stringify(report), /private-secret-value|節點 A/);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    const rendered = YAML.parse(await readFile(output, "utf8")) as Record<
      string,
      unknown
    >;
    const groups = rendered["proxy-groups"] as Array<Record<string, unknown>>;
    const account = groups.find(
      (group) => group.name === "🔐 Claude Account Guard",
    );
    assert.deepEqual(account?.proxies, ["REJECT"]);
    assert.deepEqual(account?.use, ["provider1"]);
    assert.equal(
      account?.filter,
      "^(?:節點 A \\+ \\(safe\\)|node \\[B\\]\\?)$",
    );
    assert.doesNotThrow(() => new RegExp(String(account?.filter), "u"));
    assert.equal(rendered["external-controller"], "127.0.0.1:9090");
    assert.equal(rendered.secret, "private-secret-value");
    assert.ok((rendered.rules as string[]).includes("MATCH,🐟 漏網之魚"));
    const candidate = YAML.parse(
      await readFile(
        join(
          ROOT,
          "internal",
          "generated",
          "ai-routing",
          "hk.full-profile-candidate.yaml",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const normalized = structuredClone(rendered);
    delete normalized["external-controller"];
    delete normalized.secret;
    const normalizedGroup = (
      normalized["proxy-groups"] as Array<Record<string, unknown>>
    ).find((group) => group.name === "🔐 Claude Account Guard");
    assert.ok(normalizedGroup !== undefined);
    delete normalizedGroup.use;
    delete normalizedGroup.filter;
    delete candidate["external-controller"];
    delete candidate.secret;
    assert.deepEqual(normalized, candidate);

    const unauthorized = structuredClone(egress);
    (
      (
        unauthorized.services as Record<
          string,
          { bindings: Array<{ provider: string }> }
        >
      ).claude?.bindings[0] as { provider: string }
    ).provider = "other-provider";
    await assert.rejects(
      () =>
        materializePrivateProfile(
          join(
            ROOT,
            "internal",
            "generated",
            "ai-routing",
            "hk.full-profile-candidate.yaml",
          ),
          output,
          plan,
          deployment,
          unauthorized,
          options,
        ),
      (error: unknown) =>
        error instanceof PrivateMaterializerError &&
        !error.message.includes("private-secret-value"),
    );
    const unsafe = structuredClone(egress);
    (
      (unsafe.services as Record<string, { bindings: Array<{ node: string }> }>)
        .claude?.bindings[0] as { node: string }
    ).node = "bad\u0001node";
    await assert.rejects(
      () =>
        materializePrivateProfile(
          join(
            ROOT,
            "internal",
            "generated",
            "ai-routing",
            "hk.full-profile-candidate.yaml",
          ),
          output,
          plan,
          deployment,
          unsafe,
          options,
        ),
      PrivateMaterializerError,
    );
    const example = { ...deployment, mode: "example" };
    await assert.rejects(
      () =>
        materializePrivateProfile(
          join(
            ROOT,
            "internal",
            "generated",
            "ai-routing",
            "hk.full-profile-candidate.yaml",
          ),
          output,
          plan,
          example,
          egress,
          options,
        ),
      PrivateMaterializerError,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("private materializer rejects shape drift, duplicates, unsafe paths, and cleans failed atomic output", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "private-materializer-reject-"),
  );
  try {
    const local = join(directory, "local", "ai-routing");
    await mkdir(local, { recursive: true });
    await chmod(local, 0o700);
    const secret = join(directory, "secret");
    await writeFile(secret, "secret");
    await chmod(secret, 0o600);
    const source = join(
      ROOT,
      "internal",
      "generated",
      "ai-routing",
      "hk.full-profile-candidate.yaml",
    );
    const candidate = join(directory, "candidate.yaml");
    const original = YAML.parse(await readFile(source, "utf8")) as Record<
      string,
      unknown
    >;
    const config = await loadRoutingConfig(VALID_DIRECTORY);
    const projection = await loadMihomoProjectionConfig(MIHOMO_PROJECTION);
    const plan = compileControllerPlan(config, projection);
    const options = await privateMaterializeOptions(local);
    const deployment = {
      ...deploymentFixture(),
      controller: { url: "http://127.0.0.1:9090", secretFile: secret },
    };
    const egress = egressFixture();
    const run = async (
      value: Record<string, unknown>,
      output = join(local, "out.yaml"),
    ): Promise<void> => {
      await writeFile(candidate, YAML.stringify(value));
      await materializePrivateProfile(
        candidate,
        output,
        plan,
        deployment,
        egress,
        options,
      );
    };
    const account = (
      original["proxy-groups"] as Array<Record<string, unknown>>
    ).find((group) => group.name === "🔐 Claude Account Guard");
    assert.ok(account !== undefined);
    const duplicate = structuredClone(original);
    (duplicate["proxy-groups"] as Array<unknown>).push(
      structuredClone(account),
    );
    await assert.rejects(() => run(duplicate), PrivateMaterializerError);
    const drift = structuredClone(original);
    const driftGroup = (
      drift["proxy-groups"] as Array<Record<string, unknown>>
    ).find((group) => group.name === "🔐 Claude Account Guard");
    assert.ok(driftGroup !== undefined);
    driftGroup.use = ["provider1"];
    await assert.rejects(() => run(drift), PrivateMaterializerError);
    await assert.rejects(
      () => run(original, join(directory, "outside.yaml")),
      PrivateMaterializerError,
    );
    await assert.rejects(
      () => run(original, join(local, "..", "..", "evil.yaml")),
      PrivateMaterializerError,
    );
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          candidate,
          plan,
          deployment,
          egress,
          options,
        ),
      PrivateMaterializerError,
    );
    const outputDirectory = join(local, "existing-output");
    await mkdir(outputDirectory);
    await assert.rejects(() => run(original, outputDirectory));
    assert.equal((await stat(outputDirectory)).isDirectory(), true);
    assert.equal(
      (await (await import("node:fs/promises")).readdir(local)).some((name) =>
        name.startsWith(".materialize-"),
      ),
      false,
    );
    const duplicateNode = structuredClone(egress);
    const bindings = (
      duplicateNode.services as Record<
        string,
        { bindings: Array<{ node: string }> }
      >
    ).claude?.bindings;
    assert.ok(bindings !== undefined);
    const first = bindings[0];
    const second = bindings[1];
    assert.ok(first !== undefined && second !== undefined);
    second.node = first.node;
    await writeFile(candidate, YAML.stringify(original));
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          join(local, "duplicate-node.yaml"),
          plan,
          deployment,
          duplicateNode,
          options,
        ),
      PrivateMaterializerError,
    );

    const maliciousRules = structuredClone(original);
    (maliciousRules.rules as string[]).unshift("MATCH,DIRECT");
    await writeFile(candidate, YAML.stringify(maliciousRules));
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          join(local, "malicious-rules.yaml"),
          plan,
          deployment,
          egress,
          options,
        ),
      (error: unknown) =>
        error instanceof PrivateMaterializerError &&
        error.issues.some((entry) => entry.path.join(".") === "candidate"),
    );
    const maliciousDns = structuredClone(original);
    (
      (maliciousDns.dns as Record<string, unknown>).nameserver as unknown[]
    ).push("https://example.invalid/dns-query");
    await writeFile(candidate, YAML.stringify(maliciousDns));
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          join(local, "malicious-dns.yaml"),
          plan,
          deployment,
          egress,
          options,
        ),
      PrivateMaterializerError,
    );
    const maliciousProvider = structuredClone(original);
    (
      (
        maliciousProvider["proxy-providers"] as Record<
          string,
          Record<string, unknown>
        >
      ).provider1 as Record<string, unknown>
    ).type = "file";
    await writeFile(candidate, YAML.stringify(maliciousProvider));
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          join(local, "malicious-provider.yaml"),
          plan,
          deployment,
          egress,
          options,
        ),
      PrivateMaterializerError,
    );
    await writeFile(candidate, await readFile(source));
    const escaped = join(directory, "escaped");
    await mkdir(escaped);
    await symlink(escaped, join(local, "escape"));
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          join(local, "escape", "private.yaml"),
          plan,
          deployment,
          egress,
          options,
        ),
      PrivateMaterializerError,
    );
    const trusted = join(directory, "trusted");
    const escapedRoot = join(directory, "escaped-root");
    await mkdir(trusted);
    await chmod(trusted, 0o700);
    await mkdir(escapedRoot);
    await chmod(escapedRoot, 0o700);
    await symlink(escapedRoot, join(trusted, "local"));
    const escapedRootOptions = {
      ...options,
      allowedOutputRoot: join(trusted, "local", "ai-routing"),
      trustedBaseRoot: trusted,
    };
    await assert.rejects(
      () =>
        materializePrivateProfile(
          join(
            ROOT,
            "internal",
            "generated",
            "ai-routing",
            "hk.full-profile-candidate.yaml",
          ),
          join(trusted, "local", "ai-routing", "private.yaml"),
          plan,
          deployment,
          egress,
          escapedRootOptions,
        ),
      PrivateMaterializerError,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("materialize-private CLI returns structured redacted failure output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "private-materializer-cli-"));
  try {
    const deployment = join(directory, "deployment.json");
    const egress = join(directory, "egress.json");
    const secret = join(directory, "secret");
    const output = join(directory, "local", "ai-routing", "private.yaml");
    await writeFile(secret, "SENTINEL_SECRET_DO_NOT_PRINT");
    await chmod(secret, 0o600);
    await writeFile(
      deployment,
      JSON.stringify({
        ...deploymentFixture(),
        controller: { url: "http://127.0.0.1:9090", secretFile: secret },
      }),
    );
    await writeFile(
      egress,
      JSON.stringify({
        schemaVersion: 1,
        mode: "deployment",
        policyVersion: "1",
        services: {
          claude: {
            bindings: [
              {
                approvedId: "US-Claude-01",
                node: "SENTINEL_NODE_DO_NOT_PRINT",
              },
            ],
            revokedNodes: [],
          },
        },
      }),
    );
    const result = await new Promise<ChildResult>(
      (resolvePromise, rejectPromise) => {
        const child = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            "internal/typescript/routing/cli.ts",
            "materialize-private",
            "internal/config/ai-routing",
            "internal/config/ai-routing/mihomo.yaml",
            "internal/generated/ai-routing/hk.full-profile-candidate.yaml",
            deployment,
            egress,
            output,
          ],
          { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });
        child.once("error", rejectPromise);
        child.once("close", (exitCode) =>
          resolvePromise({ exitCode, stdout, stderr }),
        );
      },
    );
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /\[policy-invariant\].*local/);
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      /SENTINEL_SECRET_DO_NOT_PRINT|SENTINEL_NODE_DO_NOT_PRINT/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
