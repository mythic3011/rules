import type { RoutingIssue } from "../issues.js";
import type { RoutingConfig } from "../schema.js";
import {
  isHttpsUrl,
  isPinnedSourceUrl,
  sourceProviderUrl,
  validRawBaseUrl,
  validRelativePath,
  type MihomoProjectionConfig,
} from "./schema.js";
import { compare, issue } from "./types.js";

interface ProjectionValidationContext {
  readonly config: RoutingConfig;
  readonly projection: MihomoProjectionConfig;
  readonly profileId: string;
  readonly names: Set<string>;
  readonly endpointRulesets: Map<string, readonly (string | number)[]>;
}

type ProjectionGate = (ctx: ProjectionValidationContext) => readonly RoutingIssue[];

function claimGeneratedName(
  ctx: ProjectionValidationContext,
  name: string,
  path: readonly (string | number)[],
): readonly RoutingIssue[] {
  if (ctx.names.has(name)) {
    return [issue("policy-invariant", path, `duplicate generated group/provider name ${name}`)];
  }
  ctx.names.add(name);
  return [];
}

function absentRoute(
  config: RoutingConfig,
  routeId: string,
  path: readonly (string | number)[],
): RoutingIssue | undefined {
  if (config.routeTargets[routeId] === undefined) {
    return issue("missing-reference", path, `route target ${routeId} does not exist`);
  }
  return undefined;
}

function validateSources(ctx: ProjectionValidationContext): readonly RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  for (const [sourceId, source] of Object.entries(ctx.projection.sources)) {
    if (!validRawBaseUrl(source.rawBaseUrl)) {
      issues.push(issue("policy-invariant", ["sources", sourceId, "rawBaseUrl"], "source rawBaseUrl must be credential-free HTTPS without query or fragment"));
    }
  }
  return issues;
}

function validateRuleProviders(ctx: ProjectionValidationContext): readonly RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  for (const [providerKey, provider] of Object.entries(ctx.projection.ruleProviders)) {
    issues.push(...claimGeneratedName(ctx, providerKey, ["ruleProviders", providerKey]));
    const source = ctx.projection.sources[provider.source];
    if (source === undefined) {
      issues.push(issue("missing-reference", ["ruleProviders", providerKey, "source"], `source ${provider.source} does not exist`));
      continue;
    }
    if (!validRawBaseUrl(source.rawBaseUrl)) {
      continue;
    }
    if (!validRelativePath(provider.path)) {
      issues.push(issue("policy-invariant", ["ruleProviders", providerKey, "path"], "rule provider path must be normalized, relative, and contain no dot segments"));
      continue;
    }
    const providerUrl = sourceProviderUrl(source, provider.path);
    if (!isPinnedSourceUrl(providerUrl, source, provider.path)) {
      issues.push(issue("policy-invariant", ["ruleProviders", providerKey, "path"], "rule provider URL must be HTTPS under its exact source revision"));
    }
  }
  return issues;
}

function validateRegions(ctx: ProjectionValidationContext): readonly RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  for (const [regionId, region] of Object.entries(ctx.projection.regions)) {
    issues.push(...claimGeneratedName(ctx, region.autoGroup, ["regions", regionId, "autoGroup"]));
    issues.push(...claimGeneratedName(ctx, region.stableGroup, ["regions", regionId, "stableGroup"]));
    if (new Set(region.use).size !== region.use.length) {
      issues.push(issue("policy-invariant", ["regions", regionId, "use"], "region use entries must be unique"));
    }
    if (!isHttpsUrl(region.url)) {
      issues.push(issue("policy-invariant", ["regions", regionId, "url"], "region health-check URL must use HTTPS"));
    }
    for (const providerId of region.use) {
      if (ctx.projection.proxyProviders[providerId] === undefined) {
        issues.push(issue("missing-reference", ["regions", regionId, "use"], `proxy provider ${providerId} does not exist`));
      }
    }
  }
  return issues;
}

function validateNamespaceIntegrity(ctx: ProjectionValidationContext): readonly RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  issues.push(...claimGeneratedName(ctx, ctx.projection.modeControl.visibleGroup, ["modeControl", "visibleGroup"]));
  for (const accessProfileId of Object.keys(ctx.config.accessProfiles)) {
    issues.push(...claimGeneratedName(
      ctx,
      `${ctx.projection.modeControl.hiddenPrefix}${accessProfileId}`,
      ["modeControl", "hiddenPrefix", accessProfileId],
    ));
  }
  return issues;
}

function validateRouteTargets(ctx: ProjectionValidationContext): readonly RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  for (const [routeId, target] of Object.entries(ctx.config.routeTargets)) {
    if (target.kind === "region-auto" || target.kind === "region-stable") {
      const region = ctx.projection.regions[target.region];
      if (region === undefined) {
        issues.push(issue("missing-reference", ["routeTargets", routeId, "region"], `region projection ${target.region} does not exist`));
      } else if (target.group !== (target.kind === "region-auto" ? region.autoGroup : region.stableGroup)) {
        issues.push(issue("policy-invariant", ["routeTargets", routeId, "group"], "route target group must equal its region projection group"));
      }
    }
    if (target.kind === "pinned-egress") {
      issues.push(...claimGeneratedName(ctx, target.group, ["routeTargets", routeId, "group"]));
      const bindings = ctx.projection.pinnedEgressBindings[routeId];
      if (bindings === undefined) {
        issues.push(issue("missing-reference", ["pinnedEgressBindings", routeId], "pinned-egress route requires exact approved-node provider bindings"));
      } else if (JSON.stringify(Object.keys(bindings).sort(compare)) !== JSON.stringify([...target.approvedNodes].sort(compare))) {
        issues.push(issue("policy-invariant", ["pinnedEgressBindings", routeId], "pinned-egress bindings must map every approved node ID exactly once"));
      } else {
        for (const [approvedId, providerId] of Object.entries(bindings)) {
          if (ctx.projection.proxyProviders[providerId]?.external !== true) {
            issues.push(issue("missing-reference", ["pinnedEgressBindings", routeId, approvedId], `pinned-egress provider ${providerId} must be an external projection provider`));
          }
        }
      }
    }
  }
  return issues;
}

function validatePinnedEgressBindings(ctx: ProjectionValidationContext): readonly RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  for (const routeId of Object.keys(ctx.projection.pinnedEgressBindings)) {
    if (ctx.config.routeTargets[routeId]?.kind !== "pinned-egress") {
      issues.push(issue("missing-reference", ["pinnedEgressBindings", routeId], "binding key must reference a canonical pinned-egress route"));
    }
  }
  return issues;
}

function validateProfiles(ctx: ProjectionValidationContext): readonly RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  for (const canonicalProfileId of Object.keys(ctx.config.accessProfiles)) {
    if (ctx.projection.profiles[canonicalProfileId] === undefined) {
      issues.push(issue("missing-reference", ["profiles", canonicalProfileId], "every canonical access profile requires a projection profile"));
    }
  }
  for (const [configuredProfileId, configuredProfile] of Object.entries(ctx.projection.profiles)) {
    if (ctx.config.accessProfiles[configuredProfileId] === undefined) {
      issues.push(issue("missing-reference", ["profiles", configuredProfileId], "projection profile has no canonical access profile"));
    }
    const categoryIssue = absentRoute(ctx.config, configuredProfile.categoryAiRoute, ["profiles", configuredProfileId, "categoryAiRoute"]);
    if (categoryIssue !== undefined) issues.push(categoryIssue);
    if (configuredProfile.aiAllRoute !== undefined) {
      const aiAllIssue = absentRoute(ctx.config, configuredProfile.aiAllRoute, ["profiles", configuredProfileId, "aiAllRoute"]);
      if (aiAllIssue !== undefined) issues.push(aiAllIssue);
    }
  }
  if (ctx.projection.profiles[ctx.profileId] === undefined) {
    issues.push(issue("missing-reference", ["profiles", ctx.profileId], `projection profile ${ctx.profileId} does not exist`));
  }
  return issues;
}

function validateIniMvp(ctx: ProjectionValidationContext): readonly RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  const iniMvp = ctx.projection.iniMvp;
  issues.push(...claimGeneratedName(ctx, iniMvp.aiOtherGroup, ["iniMvp", "aiOtherGroup"]));
  if (iniMvp.profile !== "hk") {
    issues.push(issue("policy-invariant", ["iniMvp", "profile"], "INI MVP is intentionally limited to the canonical HK access profile"));
  }
  if (ctx.config.accessProfiles[iniMvp.profile] === undefined) {
    issues.push(issue("missing-reference", ["iniMvp", "profile"], `canonical access profile ${iniMvp.profile} does not exist`));
  }
  const iniMvpProfile = ctx.projection.profiles[iniMvp.profile];
  if (iniMvpProfile === undefined || iniMvpProfile.aiAllRoute === undefined) {
    issues.push(issue("missing-reference", ["iniMvp", "profile"], "INI MVP profile requires an AI_All route"));
  } else if (iniMvpProfile.aiAllRoute !== iniMvpProfile.categoryAiRoute) {
    issues.push(issue("policy-invariant", ["iniMvp", "profile"], "INI MVP AI_All and category-AI routes must match"));
  } else if (!iniMvp.aiOtherAllowedRoutes.includes(iniMvpProfile.aiAllRoute)) {
    issues.push(issue("policy-invariant", ["iniMvp", "aiOtherAllowedRoutes"], "AI Other allowed routes must include the active profile route"));
  }
  for (const routeId of iniMvp.aiOtherAllowedRoutes) {
    const routeIssue = absentRoute(ctx.config, routeId, ["iniMvp", "aiOtherAllowedRoutes", routeId]);
    if (routeIssue !== undefined) issues.push(routeIssue);
  }
  const migratedServices = new Set(iniMvp.migratedServices);
  for (const serviceId of iniMvp.migratedServices) {
    if (ctx.config.services[serviceId] === undefined) {
      issues.push(issue("missing-reference", ["iniMvp", "migratedServices"], `canonical service ${serviceId} does not exist`));
    }
  }
  for (const serviceId of iniMvp.legacyReplacementIds) {
    if (!migratedServices.has(serviceId)) {
      issues.push(issue("policy-invariant", ["iniMvp", "legacyReplacementIds"], `legacy replacement ${serviceId} must be included in migratedServices`));
    }
  }
  return issues;
}

function validateServices(ctx: ProjectionValidationContext): readonly RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  for (const [serviceId, service] of Object.entries(ctx.config.services)) {
    const protection = ctx.config.protectionClasses[service.protectionClass];
    if (protection === undefined) {
      issues.push(issue("missing-reference", ["services", serviceId, "protectionClass"], `protection class ${service.protectionClass} does not exist`));
    }
    issues.push(...claimGeneratedName(ctx, service.selector.visibleGroup, ["services", serviceId, "selector", "visibleGroup"]));
    if (service.selector.kind === "profile-aware") {
      issues.push(...claimGeneratedName(ctx, service.selector.hiddenProfileTarget, ["services", serviceId, "selector", "hiddenProfileTarget"]));
    }
    const endpoints = Object.entries(service.endpoints);
    if (endpoints.length === 0) {
      issues.push(issue("policy-invariant", ["services", serviceId, "endpoints"], "every projected service requires at least one endpoint ruleset"));
    }
    for (const [endpointId, endpoint] of endpoints) {
      const endpointPath = ["services", serviceId, "endpoints", endpointId, "ruleset"] as const;
      if (ctx.projection.ruleProviders[endpoint.ruleset] === undefined) {
        issues.push(issue("missing-reference", endpointPath, `rule provider ${endpoint.ruleset} does not exist`));
      }
      const previous = ctx.endpointRulesets.get(endpoint.ruleset);
      if (previous !== undefined) {
        issues.push(issue("policy-invariant", endpointPath, `endpoint ruleset ${endpoint.ruleset} duplicates ${previous.join(".")}`));
      } else {
        ctx.endpointRulesets.set(endpoint.ruleset, endpointPath);
      }
    }
  }
  return issues;
}

function validateRulesetOwnership(ctx: ProjectionValidationContext): readonly RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  if (ctx.projection.ruleProviders[ctx.projection.aiAllRuleset] === undefined) {
    issues.push(issue("missing-reference", ["aiAllRuleset"], "AI_All provider does not exist"));
  }
  if (new Set(ctx.projection.categoryGeosites).size !== ctx.projection.categoryGeosites.length) {
    issues.push(issue("policy-invariant", ["categoryGeosites"], "category geosites must be unique"));
  }
  const aiAllCollision = ctx.endpointRulesets.get(ctx.projection.aiAllRuleset);
  if (aiAllCollision !== undefined) {
    issues.push(issue("policy-invariant", ["aiAllRuleset"], `AI_All ruleset duplicates ${aiAllCollision.join(".")}`));
  }
  return issues;
}

const PROJECTION_GATES: readonly ProjectionGate[] = [
  validateSources,
  validateRuleProviders,
  validateRegions,
  validateNamespaceIntegrity,
  validateRouteTargets,
  validatePinnedEgressBindings,
  validateProfiles,
  validateIniMvp,
  validateServices,
  validateRulesetOwnership,
];

function runProjectionGates(ctx: ProjectionValidationContext): RoutingIssue[] {
  return PROJECTION_GATES.flatMap((gate) => [...gate(ctx)]);
}

export function validateProjection(
  config: RoutingConfig,
  projection: MihomoProjectionConfig,
  profileId: string,
): RoutingIssue[] {
  return runProjectionGates({
    config,
    projection,
    profileId,
    names: new Set<string>(),
    endpointRulesets: new Map<string, readonly (string | number)[]>(),
  });
}
