import { z } from "zod";

import { compileRoutingProfile } from "./compiler.js";
import type { MihomoProjectionConfig } from "./mihomo-projection.js";
import type { RoutingConfig } from "./schema.js";

const IdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

const RemoteClassicalRuleSchema = z.object({
  kind: z.literal("remote-classical"),
  target: z.string().min(1),
  url: z.url(),
  interval: z.number().int().positive(),
}).strict();
const GeositeRuleSchema = z.object({
  kind: z.literal("geosite"),
  target: z.string().min(1),
  value: z.string().min(1),
}).strict();
const IniRuleSchema = z.discriminatedUnion("kind", [RemoteClassicalRuleSchema, GeositeRuleSchema]);

const GroupReferenceCandidateSchema = z.object({ kind: z.literal("group-ref"), value: z.string().min(1) }).strict();
const NodeFilterCandidateSchema = z.object({ kind: z.literal("node-filter"), value: z.string().min(1) }).strict();
const GroupCandidateSchema = z.discriminatedUnion("kind", [GroupReferenceCandidateSchema, NodeFilterCandidateSchema]);
const SelectGroupSchema = z.object({
  kind: z.literal("select"),
  name: z.string().min(1),
  candidates: z.array(GroupCandidateSchema).min(1),
}).strict();

const MigrationSchema = z.object({
  migratedServiceIds: z.array(IdSchema).min(1),
  legacyReplacementIds: z.array(IdSchema).min(1),
}).strict();
const AccountProtectionSchema = z.object({
  protectedGroup: z.string().min(1),
  rejectGroup: z.string().min(1),
}).strict();

export const IniMvpPlanSchema = z.object({
  schemaVersion: z.literal(1),
  policyVersion: z.string().min(1),
  profile: IdSchema,
  externalGroups: z.array(z.string().min(1)).min(1),
  migration: MigrationSchema,
  accountProtection: AccountProtectionSchema,
  rules: z.object({
    beforeLegacy: z.array(IniRuleSchema).min(2),
    afterLegacy: z.array(IniRuleSchema).min(1),
  }).strict(),
  groups: z.array(SelectGroupSchema).min(1),
}).strict().superRefine((value, ctx) => {
  const requireUnique = (values: readonly string[], path: readonly (string | number)[], message: string): void => {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", path: [...path], message });
  };
  const ruleKey = (rule: z.infer<typeof IniRuleSchema>): string => rule.kind === "remote-classical"
    ? `${rule.kind}\u0000${rule.target}\u0000${rule.url}\u0000${rule.interval}`
    : `${rule.kind}\u0000${rule.target}\u0000${rule.value}`;
  const candidateKey = (candidate: z.infer<typeof GroupCandidateSchema>): string => `${candidate.kind}\u0000${candidate.value}`;
  requireUnique(value.migration.migratedServiceIds, ["migration", "migratedServiceIds"], "migrated service IDs must be unique");
  requireUnique(value.migration.legacyReplacementIds, ["migration", "legacyReplacementIds"], "legacy replacement IDs must be unique");
  requireUnique(value.externalGroups, ["externalGroups"], "external group names must be unique");
  requireUnique([...value.rules.beforeLegacy, ...value.rules.afterLegacy].map(ruleKey), ["rules"], "rule records must be unique");
  requireUnique(value.groups.map((group) => group.name), ["groups"], "group names must be unique");
  for (const [index, group] of value.groups.entries()) requireUnique(group.candidates.map(candidateKey), ["groups", index, "candidates"], "group candidates must be unique");

  const add = (path: readonly (string | number)[], message: string): void => ctx.addIssue({ code: "custom", path: [...path], message });
  const groupNames = new Set(value.groups.map((group) => group.name));
  const externalGroups = new Set(value.externalGroups);
  if (!externalGroups.has(value.accountProtection.rejectGroup)) add(["externalGroups"], "external groups must include the account reject group");
  for (const [index, group] of value.groups.entries()) {
    if (externalGroups.has(group.name)) add(["groups", index, "name"], "plan group names must not collide with external groups");
  }
  if (!value.migration.legacyReplacementIds.every((serviceId) => value.migration.migratedServiceIds.includes(serviceId))) {
    add(["migration", "legacyReplacementIds"], "legacy replacement IDs must be migrated service IDs");
  }
  if (value.rules.beforeLegacy.length !== 2) add(["rules", "beforeLegacy"], "this MVP requires exactly two protected rules before legacy rules");
  const [protectedRule, terminalReject] = value.rules.beforeLegacy;
  if (protectedRule?.kind !== "remote-classical" || terminalReject?.kind !== "remote-classical") {
    add(["rules", "beforeLegacy"], "protected rules must both be remote-classical");
  } else {
    if (protectedRule.target !== value.accountProtection.protectedGroup) add(["rules", "beforeLegacy", 0, "target"], "first protected rule must target the protected group");
    if (terminalReject.target !== value.accountProtection.rejectGroup) add(["rules", "beforeLegacy", 1, "target"], "second protected rule must target the reject group");
    if (protectedRule.url !== terminalReject.url || protectedRule.interval !== terminalReject.interval) add(["rules", "beforeLegacy"], "protected terminal reject must mirror URL and interval");
    const protectedProviderCount = [...value.rules.beforeLegacy, ...value.rules.afterLegacy]
      .filter((rule) => rule.kind === "remote-classical" && rule.url === protectedRule.url && rule.interval === protectedRule.interval)
      .length;
    if (protectedProviderCount !== 2) add(["rules"], "protected provider tuple may appear only in the adjacent protected/reject pair");
  }
  const protectedGroups = value.groups.filter((group) => group.name === value.accountProtection.protectedGroup);
  if (protectedGroups.length !== 1 || JSON.stringify(protectedGroups[0]?.candidates) !== JSON.stringify([{ kind: "group-ref", value: value.accountProtection.rejectGroup }])) {
    add(["accountProtection", "protectedGroup"], "protected group must exist exactly once and be reject-only");
  }
  for (const [groupIndex, group] of value.groups.entries()) {
    const hasNodeFilter = group.candidates.some((candidate) => candidate.kind === "node-filter");
    if (hasNodeFilter && (group.candidates.length !== 2 || group.candidates[0]?.kind !== "group-ref" || group.candidates[0].value !== value.accountProtection.rejectGroup || group.candidates[1]?.kind !== "node-filter")) {
      add(["groups", groupIndex, "candidates"], "filtered stable groups must be exactly [reject group-ref, node-filter]");
    }
  }
  const resolvable = new Set([...groupNames, ...externalGroups]);
  for (const [section, rules] of Object.entries(value.rules)) {
    for (const [index, rule] of rules.entries()) if (!resolvable.has(rule.target)) add(["rules", section, index, "target"], "rule target must resolve to a plan or external group");
  }
  for (const [groupIndex, group] of value.groups.entries()) {
    for (const [candidateIndex, candidate] of group.candidates.entries()) {
      if (candidate.kind === "group-ref" && !resolvable.has(candidate.value)) add(["groups", groupIndex, "candidates", candidateIndex, "value"], "group reference must resolve to a plan or external group");
    }
  }
  const graph = new Map(value.groups.map((group) => [group.name, group.candidates.filter((candidate) => candidate.kind === "group-ref" && groupNames.has(candidate.value)).map((candidate) => candidate.value)]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (name: string): void => {
    if (visiting.has(name)) { add(["groups"], "group reference graph must be acyclic"); return; }
    if (visited.has(name)) return;
    visiting.add(name);
    for (const next of graph.get(name) ?? []) visit(next);
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of groupNames) visit(name);
});
export type IniMvpPlan = z.infer<typeof IniMvpPlanSchema>;

function providerUrl(projection: MihomoProjectionConfig, providerKey: string): string {
  const provider = projection.ruleProviders[providerKey];
  if (provider === undefined) throw new Error(`Missing INI MVP rule provider: ${providerKey}`);
  const source = projection.sources[provider.source];
  if (source === undefined) throw new Error(`Missing INI MVP source: ${provider.source}`);
  const sourceUrl = new URL(source.rawBaseUrl);
  return new URL(`${sourceUrl.pathname.replace(/\/$/, "")}/${source.revision}/${provider.path}`, sourceUrl.origin).toString();
}

function presentationGroupForRoute(config: RoutingConfig, projection: MihomoProjectionConfig, routeId: string): string {
  const route = config.routeTargets[routeId];
  if (route === undefined) throw new Error(`INI MVP route is missing: ${routeId}`);
  if (route.kind === "direct") return projection.iniMvp.presentation.directGroup;
  if (route.kind === "reject") return projection.iniMvp.presentation.rejectGroup;
  return route.group;
}

function orderedRouteCandidates(
  config: RoutingConfig,
  projection: MihomoProjectionConfig,
  effectiveRouteId: string,
  allowedRouteIds: readonly string[],
): z.infer<typeof GroupReferenceCandidateSchema>[] {
  const routeIds = [effectiveRouteId, ...allowedRouteIds];
  const seen = new Set<string>();
  return routeIds.flatMap((routeId) => {
    const group = presentationGroupForRoute(config, projection, routeId);
    if (seen.has(group)) return [];
    seen.add(group);
    return [{ kind: "group-ref" as const, value: group }];
  });
}

function remoteRule(
  projection: MihomoProjectionConfig,
  ruleset: string,
  target: string,
): z.infer<typeof RemoteClassicalRuleSchema> {
  const provider = projection.ruleProviders[ruleset];
  if (provider === undefined) throw new Error(`INI MVP ruleset is missing: ${ruleset}`);
  return { kind: "remote-classical", target, url: providerUrl(projection, ruleset), interval: provider.interval };
}

export function compileIniMvpPlan(config: RoutingConfig, projection: MihomoProjectionConfig): IniMvpPlan {
  const ini = projection.iniMvp;
  const profile = projection.profiles[ini.profile];
  if (profile === undefined || profile.aiAllRoute === undefined) throw new Error("INI MVP profile requires AI_All route");
  if (profile.aiAllRoute !== profile.categoryAiRoute) throw new Error("INI MVP AI_All and category-AI routes must match");

  const compiled = compileRoutingProfile(config, ini.profile);
  const beforeLegacy: z.infer<typeof IniRuleSchema>[] = [];
  const afterLegacy: z.infer<typeof IniRuleSchema>[] = [];
  let protectedGroup: string | undefined;
  const groups: z.infer<typeof SelectGroupSchema>[] = Object.entries(projection.regions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([regionId, region]) => ({
      kind: "select" as const,
      name: region.stableGroup,
      candidates: [
        { kind: "group-ref" as const, value: ini.presentation.rejectGroup },
        { kind: "node-filter" as const, value: region.filter },
      ],
    }));

  for (const serviceId of ini.migratedServices) {
    const canonical = config.services[serviceId];
    const effective = compiled.services.find((service) => service.id === serviceId);
    if (canonical === undefined || effective === undefined) throw new Error(`INI MVP service is not canonical: ${serviceId}`);
    if (effective.endpoints.length !== 1) throw new Error(`INI MVP service must have exactly one endpoint: ${serviceId}`);
    const endpoint = effective.endpoints[0];
    if (endpoint === undefined) throw new Error(`INI MVP service has no endpoint: ${serviceId}`);
    const protection = config.protectionClasses[canonical.protectionClass];
    if (protection === undefined) throw new Error(`INI MVP service protection is missing: ${serviceId}`);
    const rule = remoteRule(projection, endpoint.ruleset, effective.selector.visibleGroup);
    if (protection.kind === "account-protected") {
      if (protectedGroup !== undefined) throw new Error("INI MVP supports exactly one account-protected service");
      protectedGroup = effective.selector.visibleGroup;
      beforeLegacy.push(rule, { ...rule, target: ini.presentation.rejectGroup });
      groups.push({ kind: "select", name: effective.selector.visibleGroup, candidates: [{ kind: "group-ref", value: ini.presentation.rejectGroup }] });
      continue;
    }
    afterLegacy.push(rule);
    groups.push({
      kind: "select",
      name: effective.selector.visibleGroup,
      candidates: orderedRouteCandidates(config, projection, effective.effectiveRoute.id, canonical.allowedRoutes),
    });
  }

  afterLegacy.push(
    remoteRule(projection, projection.aiAllRuleset, ini.aiOtherGroup),
    ...projection.categoryGeosites.map((value) => ({ kind: "geosite" as const, target: ini.aiOtherGroup, value })),
  );
  groups.push({
    kind: "select",
    name: ini.aiOtherGroup,
    candidates: orderedRouteCandidates(config, projection, profile.aiAllRoute, ini.aiOtherAllowedRoutes),
  });
  if (protectedGroup === undefined) throw new Error("INI MVP requires one account-protected service");

  return IniMvpPlanSchema.parse({
    schemaVersion: 1,
    policyVersion: config.policyVersion,
    profile: ini.profile,
    externalGroups: [...new Set([ini.presentation.directGroup, ini.presentation.rejectGroup])],
    migration: { migratedServiceIds: ini.migratedServices, legacyReplacementIds: ini.legacyReplacementIds },
    accountProtection: { protectedGroup, rejectGroup: ini.presentation.rejectGroup },
    rules: { beforeLegacy, afterLegacy },
    groups,
  });
}
