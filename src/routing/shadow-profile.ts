import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";

import { formatIssues, type RoutingIssue } from "./issues.js";
import { compileMihomoFragment, renderMihomoFragment, type MihomoProjectionConfig } from "./mihomo-projection.js";
import type { RoutingConfig } from "./schema.js";
import { loadAndRenderShadowTemplate } from "./shadow-template.js";

const Name = z.string().min(1);
const Unique = z.array(Name).min(1).superRefine((items, ctx) => {
  for (const [index, item] of items.entries()) if (items.indexOf(item) !== index) ctx.addIssue({ code: "custom", path: [index], message: `duplicate entry: ${item}` });
});
const Meta = z.object({ surface: z.enum(["proxy-groups", "rule-providers", "rules", "dns"]), reason: Name, policyReference: Name }).strict();
const GroupDelta = Meta.extend({ surface: z.literal("proxy-groups"), operation: z.literal("replace-set"), remove: Unique.length(16), add: Unique }).strict();
const ProviderDelta = Meta.extend({ surface: z.literal("rule-providers"), operation: z.literal("replace-key-set"), remove: Unique.length(3), add: Unique }).strict();
const RulesDelta = Meta.extend({ surface: z.literal("rules"), operation: z.literal("replace-contiguous-interval"), before: Unique.length(2), remove: Unique.length(11), after: Name, add: Unique }).strict();
const DnsDelta = Meta.extend({ surface: z.literal("dns"), operation: z.literal("add-map-entry"), map: z.literal("nameserver-policy"), key: Name, value: Unique }).strict();
export const ShadowParityManifestSchema = z.object({ schemaVersion: z.literal(1), deltas: z.object({ "proxy-groups": GroupDelta, "rule-providers": ProviderDelta, rules: RulesDelta, dns: DnsDelta }).strict() }).strict();
export type ShadowParityManifest = z.infer<typeof ShadowParityManifestSchema>;

type JsonObject = Record<string, unknown>;
type JsonArray = unknown[];
export class ShadowProfileError extends Error { public constructor(public readonly issues: readonly RoutingIssue[]) { super(formatIssues(issues)); this.name = "ShadowProfileError"; } }
function issue(code: RoutingIssue["code"], path: readonly (string | number)[], message: string): RoutingIssue { return { code, path, message }; }
function isObject(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
function clone<T>(value: T): T { return structuredClone(value); }
function equal(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function stringify(value: unknown, indent: number): string { const prefix = " ".repeat(indent); return YAML.stringify(value).trimEnd().split("\n").map((line) => `${prefix}${line}`).join("\n"); }
function named(value: unknown): value is JsonObject & { name: string } { return isObject(value) && typeof value.name === "string"; }
function names(values: unknown[]): string[] { return values.filter(named).map((value) => value.name); }
function record(value: unknown, path: readonly (string | number)[]): JsonObject { if (!isObject(value)) throw new ShadowProfileError([issue("schema", path, "must be a mapping")]); return value; }
function array(value: unknown, path: readonly (string | number)[]): JsonArray { if (!Array.isArray(value)) throw new ShadowProfileError([issue("schema", path, "must be an array")]); return value; }
function stringRules(value: unknown, path: readonly (string | number)[]): string[] { const items = array(value, path); if (items.some((item) => typeof item !== "string")) throw new ShadowProfileError([issue("schema", path, "must contain only rule strings")]); return clone(items) as string[]; }
function noDuplicate(values: readonly string[], path: readonly (string | number)[], label: string): RoutingIssue[] { const issues: RoutingIssue[] = []; for (const [index, value] of values.entries()) if (values.indexOf(value) !== index) issues.push(issue("schema", [...path, index], `duplicate ${label}: ${value}`)); return issues; }

export async function loadShadowParityManifest(path: string): Promise<ShadowParityManifest> {
  const document = YAML.parseDocument(await readFile(path, "utf8"), { uniqueKeys: true });
  if (document.errors.length > 0) throw new ShadowProfileError(document.errors.map((entry) => issue("invalid-yaml", [path], entry.message)));
  const parsed = ShadowParityManifestSchema.safeParse(document.toJS());
  if (!parsed.success) throw new ShadowProfileError(parsed.error.issues.map((entry) => issue("schema", entry.path.map(String), entry.message)));
  return parsed.data;
}

interface LegacyBase { readonly root: JsonObject; readonly staticTopLevel: JsonObject; readonly proxyProviders: JsonObject; readonly dns: JsonObject; readonly proxyGroups: JsonArray; readonly rules: string[]; readonly ruleProviders: JsonObject; }
export async function loadLegacyRelaxedBase(path: string): Promise<LegacyBase> {
  const document = YAML.parseDocument(await readFile(path, "utf8"), { uniqueKeys: true }); const issues: RoutingIssue[] = document.errors.map((entry) => issue("invalid-yaml", [path], entry.message)); const value = document.toJS();
  if (!isObject(value)) issues.push(issue("schema", [path], "legacy relaxed profile root must be a mapping")); const root = isObject(value) ? value : {};
  const groups = root["proxy-groups"]; const rules = root.rules; const providers = root["rule-providers"]; const proxyProviders = root["proxy-providers"]; const dns = root.dns;
  if (!Array.isArray(groups)) issues.push(issue("schema", ["proxy-groups"], "proxy-groups must be an array")); else { for (const [index, group] of groups.entries()) if (!named(group)) issues.push(issue("schema", ["proxy-groups", index], "proxy groups must be named mappings")); issues.push(...noDuplicate(names(groups), ["proxy-groups"], "proxy group name")); }
  if (!Array.isArray(rules) || rules.some((rule) => typeof rule !== "string")) issues.push(issue("schema", ["rules"], "rules must be an array of strings"));
  if (!isObject(providers)) issues.push(issue("schema", ["rule-providers"], "rule-providers must be a mapping"));
  if (!isObject(proxyProviders)) issues.push(issue("schema", ["proxy-providers"], "proxy-providers must be a mapping"));
  if (!isObject(dns)) issues.push(issue("schema", ["dns"], "dns must be a mapping"));
  if (Array.isArray(rules)) { const matches = rules.filter((rule) => typeof rule === "string" && rule.startsWith("MATCH,")); if (matches.length !== 1 || rules.at(-1) !== matches[0]) issues.push(issue("policy-invariant", ["rules"], "legacy profile must retain exactly one terminal MATCH rule")); }
  if (issues.length > 0) throw new ShadowProfileError(issues);
  const owned = new Set(["proxy-providers", "dns", "proxy-groups", "rules", "rule-providers"]);
  return { root: clone(root), staticTopLevel: Object.fromEntries(Object.entries(root).filter(([key]) => !owned.has(key))), proxyProviders: clone(proxyProviders) as JsonObject, dns: clone(dns) as JsonObject, proxyGroups: clone(groups) as JsonArray, rules: clone(rules) as string[], ruleProviders: clone(providers) as JsonObject };
}

function requireFragment(fragment: JsonObject): { groups: JsonArray; providers: JsonObject; dns: JsonObject; rules: string[] } {
  const groups = array(fragment["proxy-groups"], ["fragment", "proxy-groups"]); const providers = record(fragment["rule-providers"], ["fragment", "rule-providers"]); const dns = record(fragment.dns, ["fragment", "dns"]); const rules = stringRules(fragment.rules, ["fragment", "rules"]);
  const issues: RoutingIssue[] = []; for (const [index, group] of groups.entries()) if (!named(group)) issues.push(issue("schema", ["fragment", "proxy-groups", index], "fragment proxy group must be a named mapping")); issues.push(...noDuplicate(names(groups), ["fragment", "proxy-groups"], "fragment proxy group name"));
  if (!isObject(dns["nameserver-policy"])) issues.push(issue("schema", ["fragment", "dns", "nameserver-policy"], "fragment nameserver-policy must be a mapping"));
  if (issues.length > 0) throw new ShadowProfileError(issues); return { groups, providers, dns, rules };
}
/** Strict boundary check for the compiler fragment before it can be composed. */
export function validateShadowFragmentShape(fragment: unknown): void {
  if (!isObject(fragment)) throw new ShadowProfileError([issue("schema", ["fragment"], "fragment root must be a mapping")]);
  requireFragment(fragment);
}
function findInterval(rules: readonly string[], delta: z.infer<typeof RulesDelta>): readonly [number, number] {
  const start = rules.findIndex((_, index) => equal(rules.slice(index, index + delta.remove.length), delta.remove));
  if (start < 0 || !equal(rules.slice(start - delta.before.length, start), delta.before) || rules[start + delta.remove.length] !== delta.after) throw new ShadowProfileError([issue("policy-invariant", ["rules"], "legacy AI interval does not exactly match the parity contract anchors and members")]);
  if (rules.filter((_, index) => equal(rules.slice(index, index + delta.remove.length), delta.remove)).length !== 1) throw new ShadowProfileError([issue("policy-invariant", ["rules"], "legacy AI interval occurs more than once")]);
  return [start, start + delta.remove.length];
}
function fragmentRoot(config: RoutingConfig, projection: MihomoProjectionConfig): JsonObject { const parsed = YAML.parse(renderMihomoFragment(compileMihomoFragment(config, projection, "hk"))) as unknown; if (!isObject(parsed)) throw new ShadowProfileError([issue("schema", ["fragment"], "compiled HK fragment root must be a mapping")]); return parsed; }

export interface ShadowParityReport { readonly schemaVersion: 1; readonly shadow: true; readonly productionAuthority: "cfg/yaml/Custom_Clash_AI.yaml"; readonly profile: "hk"; readonly observedDeltaIds: readonly string[]; readonly allowlistedDeltaIds: readonly string[]; readonly preserved: { readonly staticTopLevel: true; readonly proxyProviders: true; readonly nonAiGroups: true; readonly nonAiRules: true; readonly nonAiProviders: true; readonly terminalMatch: true; readonly dnsExistingPolicies: true; }; }
export interface ShadowProfileResult { readonly candidateYaml: string; readonly report: ShadowParityReport; }

function composeCandidateObject(base: LegacyBase, fragment: JsonObject, manifest: ShadowParityManifest): JsonObject {
  const compiled = requireFragment(fragment); const groupsDelta = manifest.deltas["proxy-groups"]; const providersDelta = manifest.deltas["rule-providers"]; const rulesDelta = manifest.deltas.rules; const dnsDelta = manifest.deltas.dns;
  const groupNames = names(base.proxyGroups); if (!groupsDelta.remove.every((name) => groupNames.includes(name))) throw new ShadowProfileError([issue("policy-invariant", ["proxy-groups"], "legacy proxy-group removal set is not present")]);
  const providerKeys = Object.keys(base.ruleProviders); if (!providersDelta.remove.every((key) => providerKeys.includes(key))) throw new ShadowProfileError([issue("policy-invariant", ["rule-providers"], "legacy provider removal set is not present")]);
  const [start, end] = findInterval(base.rules, rulesDelta); const basePolicy = record(base.dns["nameserver-policy"] ?? {}, ["dns", "nameserver-policy"]); const fragmentPolicy = record(compiled.dns["nameserver-policy"], ["fragment", "dns", "nameserver-policy"]);
  return { ...clone(base.staticTopLevel), "proxy-providers": clone(base.proxyProviders), dns: { ...clone(base.dns), "nameserver-policy": { ...clone(basePolicy), ...clone(fragmentPolicy) } }, "proxy-groups": [...base.proxyGroups.filter((group) => !groupsDelta.remove.includes(named(group) ? group.name : "")), ...clone(compiled.groups)], rules: [...base.rules.slice(0, start), ...clone(compiled.rules), ...base.rules.slice(end)], "rule-providers": { ...Object.fromEntries(Object.entries(base.ruleProviders).filter(([key]) => !providersDelta.remove.includes(key))), ...clone(compiled.providers) } };
}
function parseCandidate(value: string): JsonObject { const parsed = YAML.parse(value) as unknown; if (!isObject(parsed)) throw new ShadowProfileError([issue("schema", ["candidate"], "rendered candidate must be a mapping")]); return parsed; }

function exactDeltaIssues(base: LegacyBase, candidate: JsonObject, fragment: JsonObject, manifest: ShadowParityManifest): RoutingIssue[] {
  const issues: RoutingIssue[] = []; const compiled = requireFragment(fragment); const groups = array(candidate["proxy-groups"], ["candidate", "proxy-groups"]); const proxyProviders = record(candidate["proxy-providers"], ["candidate", "proxy-providers"]); const providers = record(candidate["rule-providers"], ["candidate", "rule-providers"]); const rules = stringRules(candidate.rules, ["candidate", "rules"]); const dns = record(candidate.dns, ["candidate", "dns"]); const policy = record(dns["nameserver-policy"], ["candidate", "dns", "nameserver-policy"]);
  if (!equal(proxyProviders, base.proxyProviders)) issues.push(issue("policy-invariant", ["proxy-providers"], "global proxy-providers changed"));
  const gd = manifest.deltas["proxy-groups"]; const preservedGroups = base.proxyGroups.filter((group) => !gd.remove.includes(named(group) ? group.name : "")); const expectedGroups = [...names(preservedGroups), ...names(compiled.groups)]; const actualGroupNames = names(groups);
  if (!equal(gd.add, names(compiled.groups))) issues.push(issue("policy-invariant", ["deltas", "proxy-groups", "add"], "allowance added proxy-group set does not exactly equal compiled fragment"));
  if (!equal(actualGroupNames, expectedGroups)) issues.push(issue("policy-invariant", ["proxy-groups"], "actual proxy-group replace-set differs from the exact allowance"));
  if (!equal(groups.slice(0, preservedGroups.length), preservedGroups)) issues.push(issue("policy-invariant", ["proxy-groups"], "preserved non-AI proxy groups changed or reordered"));
  const pd = manifest.deltas["rule-providers"]; const expectedProviderKeys = [...Object.keys(base.ruleProviders).filter((key) => !pd.remove.includes(key)), ...Object.keys(compiled.providers)].sort(); const actualProviderKeys = Object.keys(providers).sort();
  if (!equal(pd.add, Object.keys(compiled.providers))) issues.push(issue("policy-invariant", ["deltas", "rule-providers", "add"], "allowance added provider key set does not exactly equal compiled fragment"));
  if (!equal(actualProviderKeys, expectedProviderKeys)) issues.push(issue("policy-invariant", ["rule-providers"], "actual rule-provider replace-key-set differs from the exact allowance"));
  for (const [key, value] of Object.entries(compiled.providers)) if (!equal(providers[key], value)) issues.push(issue("policy-invariant", ["rule-providers", key], "compiled provider definition differs from fragment"));
  for (const [key, value] of Object.entries(base.ruleProviders)) if (!pd.remove.includes(key) && !equal(providers[key], value)) issues.push(issue("policy-invariant", ["rule-providers", key], "unowned rule-provider definition changed"));
  const rd = manifest.deltas.rules; const [start, end] = findInterval(base.rules, rd); const expectedRules = [...base.rules.slice(0, start), ...compiled.rules, ...base.rules.slice(end)];
  if (!equal(rd.add, compiled.rules)) issues.push(issue("policy-invariant", ["deltas", "rules", "add"], "allowance added rule interval does not exactly equal compiled fragment"));
  if (!equal(rules, expectedRules)) issues.push(issue("policy-invariant", ["rules"], "actual rules replacement differs from the exact contiguous-interval allowance"));
  const dd = manifest.deltas.dns; const fragmentPolicy = record(compiled.dns["nameserver-policy"], ["fragment", "dns", "nameserver-policy"]); const basePolicy = record(base.dns["nameserver-policy"] ?? {}, ["dns", "nameserver-policy"]);
  if (Object.hasOwn(basePolicy, dd.key)) issues.push(issue("policy-invariant", ["dns", dd.map, dd.key], "DNS add-map-entry is stale because the key already exists in the legacy base"));
  if (!equal(fragmentPolicy, { [dd.key]: dd.value })) issues.push(issue("policy-invariant", ["deltas", "dns"], "DNS allowance must exactly equal the compiled one-entry policy overlay"));
  const expectedPolicy = { ...basePolicy, [dd.key]: dd.value }; if (!equal(policy, expectedPolicy)) issues.push(issue("policy-invariant", ["dns", dd.map], "actual DNS policy differs from the exact add-map-entry allowance"));
  const baseDnsWithoutPolicy = { ...base.dns }; delete baseDnsWithoutPolicy[dd.map]; const candidateDnsWithoutPolicy = { ...dns }; delete candidateDnsWithoutPolicy[dd.map]; if (!equal(baseDnsWithoutPolicy, candidateDnsWithoutPolicy)) issues.push(issue("policy-invariant", ["dns"], "unowned DNS fields changed"));
  const match = base.rules.at(-1); if (typeof match !== "string" || !match.startsWith("MATCH,") || rules.at(-1) !== match) issues.push(issue("policy-invariant", ["rules"], "terminal MATCH was lost or reordered"));
  return issues;
}
function graphIssues(candidate: JsonObject, fragment: JsonObject): RoutingIssue[] {
  const groups = array(candidate["proxy-groups"], ["candidate", "proxy-groups"]); const groupNames = new Set(names(groups)); const referenced = new Set<string>(); const explicitlyExposed = new Set<string>();
  for (const group of groups) if (named(group)) { const proxies = Array.isArray(group.proxies) ? group.proxies : []; for (const proxy of proxies) if (typeof proxy === "string" && groupNames.has(proxy)) referenced.add(proxy); if (!group.name.startsWith("@profile/")) explicitlyExposed.add(group.name); }
  const compilerOwned = new Set(names(requireFragment(fragment).groups));
  return [...compilerOwned].filter((name) => !referenced.has(name) && !explicitlyExposed.has(name)).map((name) => issue("policy-invariant", ["proxy-groups", name], "compiler-owned group is orphaned"));
}
/** Validates only the data-derived compiler group reference graph. */
export function validateCompilerGroupGraph(candidate: unknown, fragment: unknown): void {
  if (!isObject(candidate) || !isObject(fragment)) throw new ShadowProfileError([issue("schema", ["graph"], "candidate and fragment must be mappings")]);
  const issues = graphIssues(candidate, fragment); if (issues.length > 0) throw new ShadowProfileError(issues);
}
function validateParity(base: LegacyBase, candidate: JsonObject, fragment: JsonObject, manifest: ShadowParityManifest): ShadowParityReport {
  const issues = exactDeltaIssues(base, candidate, fragment, manifest); const baseKeys = Object.keys(base.root).sort(); const candidateKeys = Object.keys(candidate).sort(); if (!equal(baseKeys, candidateKeys)) issues.push(issue("policy-invariant", ["candidate"], "candidate root key set differs from legacy base")); const owned = new Set(["proxy-providers", "dns", "proxy-groups", "rules", "rule-providers"]); for (const [key, value] of Object.entries(base.root)) if (!owned.has(key) && !equal(value, candidate[key])) issues.push(issue("policy-invariant", ["candidate", key], "unowned static field changed")); issues.push(...graphIssues(candidate, fragment));
  if (issues.length > 0) throw new ShadowProfileError(issues); return { schemaVersion: 1, shadow: true, productionAuthority: "cfg/yaml/Custom_Clash_AI.yaml", profile: "hk", observedDeltaIds: ["dns", "proxy-groups", "rule-providers", "rules"], allowlistedDeltaIds: ["dns", "proxy-groups", "rule-providers", "rules"], preserved: { staticTopLevel: true, proxyProviders: true, nonAiGroups: true, nonAiRules: true, nonAiProviders: true, terminalMatch: true, dnsExistingPolicies: true } };
}
/** Testable read-only candidate validator; composition remains the only writer. */
export function validateShadowParityCandidate(base: LegacyBase, candidate: unknown, fragment: unknown, manifest: ShadowParityManifest): ShadowParityReport {
  const checked = ShadowParityManifestSchema.safeParse(manifest);
  if (!checked.success) throw new ShadowProfileError(checked.error.issues.map((entry) => issue("schema", entry.path.map(String), entry.message)));
  if (!isObject(candidate) || !isObject(fragment)) throw new ShadowProfileError([issue("schema", ["candidate"], "candidate and fragment must be mappings")]);
  return validateParity(base, candidate, fragment, checked.data);
}
export async function composeShadowProfile(config: RoutingConfig, projection: MihomoProjectionConfig, basePath: string, parityManifest: ShadowParityManifest, templatePath: string): Promise<ShadowProfileResult> {
  const checkedManifest = ShadowParityManifestSchema.safeParse(parityManifest);
  if (!checkedManifest.success) throw new ShadowProfileError(checkedManifest.error.issues.map((entry) => issue("schema", entry.path.map(String), entry.message)));
  const base = await loadLegacyRelaxedBase(basePath); const fragment = fragmentRoot(config, projection); const compiled = requireFragment(fragment); const removed = new Set(checkedManifest.data.deltas["proxy-groups"].remove); const collision = names(base.proxyGroups).filter((name) => !removed.has(name) && names(compiled.groups).includes(name));
  if (collision.length > 0) throw new ShadowProfileError(collision.map((name) => issue("policy-invariant", ["proxy-groups", name], "compiled group collides with preserved legacy group")));
  const candidateObject = composeCandidateObject(base, fragment, checkedManifest.data);
  const candidateYaml = await loadAndRenderShadowTemplate(templatePath, { header: "# SHADOW / NON-PRODUCTION AI routing candidate. Existing Python relaxed YAML remains production authority.", "static-top-level": stringify(Object.fromEntries(Object.entries(candidateObject).filter(([key]) => !["proxy-providers", "dns", "proxy-groups", "rules", "rule-providers"].includes(key))), 0), "proxy-providers": stringify(candidateObject["proxy-providers"], 2), dns: stringify(candidateObject.dns, 2), "proxy-groups": stringify(candidateObject["proxy-groups"], 2), rules: stringify(candidateObject.rules, 2), "rule-providers": stringify(candidateObject["rule-providers"], 2) });
  if (!candidateYaml.includes("SHADOW / NON-PRODUCTION")) throw new ShadowProfileError([issue("policy-invariant", ["template"], "shadow marker is required")]); return { candidateYaml, report: validateParity(base, parseCandidate(candidateYaml), fragment, checkedManifest.data) };
}
export function expectedShadowArtifacts(result: ShadowProfileResult): ReadonlyMap<string, string> { return new Map([["hk.full-profile-candidate.yaml", result.candidateYaml], ["hk.parity-report.json", `${JSON.stringify(result.report, null, 2)}\n`]]); }
export async function checkShadowArtifacts(directory: string, expected: ReadonlyMap<string, string>): Promise<void> { const issues: RoutingIssue[] = []; let entries: readonly Dirent<string>[]; try { entries = await readdir(directory, { withFileTypes: true, encoding: "utf8" }); } catch (error: unknown) { if (error instanceof Error && "code" in error && error.code === "ENOENT") throw new ShadowProfileError([...expected.keys()].map((name) => issue("artifact-drift", [directory, name], "shadow artifact directory is missing"))); throw error; } const inventory = new Map(entries.map((entry) => [entry.name, entry])); for (const [name, content] of expected) { const entry = inventory.get(name); if (entry === undefined) issues.push(issue("artifact-drift", [directory, name], "expected shadow artifact is missing")); else if (!entry.isFile()) issues.push(issue("artifact-drift", [directory, name], "expected shadow artifact must be a regular file")); else if (await readFile(join(directory, name), "utf8") !== content) issues.push(issue("artifact-drift", [directory, name], "shadow artifact content differs from deterministic output")); } for (const name of inventory.keys()) if ((name.endsWith(".full-profile-candidate.yaml") || name.endsWith(".parity-report.json")) && !expected.has(name)) issues.push(issue("artifact-drift", [directory, name], "unexpected stale shadow artifact is present")); if (issues.length > 0) throw new ShadowProfileError(issues); }
