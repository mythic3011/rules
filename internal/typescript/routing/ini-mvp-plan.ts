import { z } from "zod";

import { compileRoutingProfile } from "./compiler.js";
import type { MihomoProjectionConfig } from "./mihomo-projection.js";
import type { RoutingConfig } from "./schema.js";
import { isOwnershipOverrideService } from "./semantic-validator.js";

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
  const remoteUrls = [...value.rules.beforeLegacy, ...value.rules.afterLegacy]
    .filter((rule): rule is z.infer<typeof RemoteClassicalRuleSchema> => rule.kind === "remote-classical")
    .map((rule) => rule.url);
  if (new Set(remoteUrls).size !== remoteUrls.length) {
    add(["rules"], "remote-classical provider URLs must be unique across targets");
  }
  const protectedRuleIndexes = value.rules.beforeLegacy.flatMap((rule, index) =>
    rule.kind === "remote-classical" && rule.target === value.accountProtection.protectedGroup ? [index] : [],
  );
  const protectedIndex = protectedRuleIndexes[0];
  if (protectedRuleIndexes.length !== 1 || protectedIndex === undefined) {
    add(["rules", "beforeLegacy"], "beforeLegacy must contain exactly one remote-classical targeting the protected group");
  } else if (protectedIndex !== value.rules.beforeLegacy.length - 1) {
    add(["rules", "beforeLegacy", protectedIndex], "protected remote-classical must appear last in beforeLegacy after ownership-override rules");
  }
  for (const [index, rule] of value.rules.beforeLegacy.entries()) {
    if (index === value.rules.beforeLegacy.length - 1) continue;
    if (rule.kind !== "remote-classical") {
      add(["rules", "beforeLegacy", index], "ownership-override rules must be remote-classical");
    } else if (
      rule.target === value.accountProtection.protectedGroup ||
      rule.target === value.accountProtection.rejectGroup
    ) {
      add(["rules", "beforeLegacy", index, "target"], "ownership-override rules must not target the protected or reject group");
    }
  }
  const protectedGroups = value.groups.filter((group) => group.name === value.accountProtection.protectedGroup);
  const protectedCandidates = protectedGroups[0]?.candidates;
  if (
    protectedGroups.length !== 1 ||
    protectedCandidates === undefined ||
    protectedCandidates.length < 2 ||
    protectedCandidates[0]?.kind !== "group-ref" ||
    protectedCandidates[0].value !== value.accountProtection.rejectGroup ||
    protectedCandidates.slice(1).some((candidate) => candidate.kind !== "group-ref")
  ) {
    add(["accountProtection", "protectedGroup"], "protected group must exist exactly once and be reject-first plus stable group-refs");
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

function pinnedNodeFilter(approvedNodes: readonly string[]): string {
  return `(?i)${approvedNodes.join("|")}`;
}

export function compileIniMvpPlan(config: RoutingConfig, projection: MihomoProjectionConfig): IniMvpPlan {
  const ini = projection.iniMvp;
  const profile = projection.profiles[ini.profile];
  if (profile === undefined || profile.aiAllRoute === undefined) throw new Error("INI MVP profile requires AI_All route");
  if (profile.aiAllRoute !== profile.categoryAiRoute) throw new Error("INI MVP AI_All and category-AI routes must match");

  const compiled = compileRoutingProfile(config, ini.profile);
  const overrideRules: z.infer<typeof RemoteClassicalRuleSchema>[] = [];
  const afterLegacy: z.infer<typeof IniRuleSchema>[] = [];
  let protectedGroup: string | undefined;
  let protectedRule: z.infer<typeof RemoteClassicalRuleSchema> | undefined;
  const groups: z.infer<typeof SelectGroupSchema>[] = Object.entries(projection.regions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, region]) => ({
      kind: "select" as const,
      name: region.stableGroup,
      candidates: [
        { kind: "group-ref" as const, value: ini.presentation.rejectGroup },
        { kind: "node-filter" as const, value: region.filter },
      ],
    }));

  const emitPinnedGroup = (routeId: string): void => {
    const route = config.routeTargets[routeId];
    if (route?.kind !== "pinned-egress") throw new Error(`INI MVP pinned route is missing: ${routeId}`);
    if (groups.some((group) => group.name === route.group)) return;
    groups.push({
      kind: "select",
      name: route.group,
      candidates: [
        { kind: "group-ref", value: ini.presentation.rejectGroup },
        { kind: "node-filter", value: pinnedNodeFilter(route.approvedNodes) },
      ],
    });
  };

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
      protectedRule = rule;
      groups.push({
        kind: "select",
        name: effective.selector.visibleGroup,
        candidates: orderedRouteCandidates(config, projection, effective.effectiveRoute.id, canonical.allowedRoutes),
      });
      for (const routeId of canonical.allowedRoutes) {
        if (config.routeTargets[routeId]?.kind === "pinned-egress") emitPinnedGroup(routeId);
      }
      continue;
    }
    if (isOwnershipOverrideService(config, serviceId)) overrideRules.push(rule);
    else afterLegacy.push(rule);
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
  if (protectedGroup === undefined || protectedRule === undefined) throw new Error("INI MVP requires one account-protected service");

  return IniMvpPlanSchema.parse({
    schemaVersion: 1,
    policyVersion: config.policyVersion,
    profile: ini.profile,
    externalGroups: [...new Set([ini.presentation.directGroup, ini.presentation.rejectGroup])],
    migration: { migratedServiceIds: ini.migratedServices, legacyReplacementIds: ini.legacyReplacementIds },
    accountProtection: { protectedGroup, rejectGroup: ini.presentation.rejectGroup },
    rules: { beforeLegacy: [...overrideRules, protectedRule], afterLegacy },
    groups,
  });
}
