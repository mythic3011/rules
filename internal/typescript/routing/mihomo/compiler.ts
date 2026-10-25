import { compileRoutingProfile } from "../compiler.js";
import type { Resolver, RoutingConfig } from "../schema.js";
import { collectReachableRouteIds } from "./analysis.js";
import { compileRules } from "./rules.js";
import { sourceProviderUrl, type MihomoProjectionConfig } from "./schema.js";
import {
  compare,
  compilerInvariant,
  MihomoProjectionError,
  requiredRoute,
  unique,
  type MihomoDns,
  type MihomoFragmentIR,
  type MihomoGroup,
  type ValidatedProjectionContext,
} from "./types.js";
import { validateProjection } from "./validation.js";

function createValidatedCompileContext(
  config: RoutingConfig,
  projection: MihomoProjectionConfig,
  profileId: string,
): ValidatedProjectionContext {
  const issues = validateProjection(config, projection, profileId);
  if (issues.length > 0) throw new MihomoProjectionError(issues);
  const profile = projection.profiles[profileId];
  if (profile === undefined) {
    compilerInvariant(`projection profile ${profileId} does not exist after validation`);
  }
  return {
    config,
    projection,
    profileId,
    profile,
    plan: compileRoutingProfile(config, profileId),
    reachableRouteIds: collectReachableRouteIds(config),
  };
}

function resolverValue(resolver: Resolver, config: RoutingConfig, selectedGroup?: string): string {
  let base: string;
  switch (resolver.kind) {
    case "udp": base = resolver.port === 53 ? resolver.host : `${resolver.host}:${resolver.port}`; break;
    case "dot": base = resolver.port === 853 ? `tls://${resolver.host}` : `tls://${resolver.host}:${resolver.port}`; break;
    case "doh": base = resolver.url; break;
    default: { const exhaustive: never = resolver; throw new Error(`Unsupported resolver: ${String(exhaustive)}`); }
  }
  if (resolver.viaRoute === undefined) return base;
  return `${base}#${selectedGroup ?? requiredRoute(config, resolver.viaRoute, ["dns", "resolver", "viaRoute"]).group}`;
}

function compileMetadata(ctx: ValidatedProjectionContext): MihomoFragmentIR["metadata"] {
  const provenance = Object.values(ctx.projection.sources)
    .sort((left, right) => compare(left.repository, right.repository))
    .map((source) => `${source.label} (${source.repository}@${source.revision})`)
    .join(", ");
  return { provenance, externalProxyProviders: Object.keys(ctx.projection.proxyProviders).sort(compare) };
}

function regionIsReachable(
  ctx: ValidatedProjectionContext,
  regionId: string,
  kind: "region-auto" | "region-stable",
): boolean {
  return [...ctx.reachableRouteIds].some((routeId) => {
    const target = ctx.config.routeTargets[routeId];
    return target?.kind === kind && target.region === regionId;
  });
}

function compileServiceGroups(ctx: ValidatedProjectionContext): MihomoGroup[] {
  const groups: MihomoGroup[] = [];
  for (const service of ctx.plan.services) {
    const canonical = ctx.config.services[service.id];
    if (canonical === undefined) continue;
    const protection = ctx.config.protectionClasses[canonical.protectionClass];
    if (protection === undefined) compilerInvariant(`service ${service.id} is missing a protection class after validation`);
    if (service.selector.kind === "profile-aware") {
      const choices = unique([service.effectiveRoute.group, ...service.selector.choices.map((choice) => choice.group)]);
      groups.push({ name: service.selector.hiddenProfileTarget, type: "select", emptyFallback: "REJECT", proxies: choices });
      groups.push({ name: service.selector.visibleGroup, type: "select", emptyFallback: "REJECT", proxies: unique([service.selector.hiddenProfileTarget, ...choices]) });
      continue;
    }
    const proxies = ["REJECT"];
    if (protection.kind === "account-protected") {
      for (const routeId of canonical.allowedRoutes) {
        const target = ctx.config.routeTargets[routeId];
        if ((target?.kind === "pinned-egress" || target?.kind === "region-stable") && !proxies.includes(target.group)) {
          proxies.push(target.group);
        }
      }
    }
    groups.push({ name: service.selector.visibleGroup, type: "select", emptyFallback: "REJECT", proxies });
  }
  return groups;
}

function compileGroups(ctx: ValidatedProjectionContext): readonly MihomoGroup[] {
  const groups: MihomoGroup[] = [];
  for (const [regionId, region] of Object.entries(ctx.projection.regions).sort(([a], [b]) => compare(a, b))) {
    if (regionIsReachable(ctx, regionId, "region-auto")) {
      groups.push({ name: region.autoGroup, type: "url-test", emptyFallback: "REJECT", use: [...region.use], filter: region.filter, url: region.url, interval: region.interval, tolerance: region.tolerance });
    }
    if (regionIsReachable(ctx, regionId, "region-stable")) {
      groups.push({ name: region.stableGroup, type: "select", emptyFallback: "REJECT", proxies: ["REJECT"], use: [...region.use], filter: region.filter });
    }
  }
  for (const [routeId, target] of Object.entries(ctx.config.routeTargets).sort(([left], [right]) => compare(left, right))) {
    if (target.kind !== "pinned-egress" || !ctx.reachableRouteIds.has(routeId)) continue;
    const bindings = ctx.projection.pinnedEgressBindings[routeId];
    if (bindings === undefined) compilerInvariant(`pinned-egress route ${routeId} is missing provider bindings after validation`);
    groups.push({
      name: target.group,
      type: "select",
      emptyFallback: "REJECT",
      proxies: ["REJECT"],
      use: unique(Object.values(bindings)),
      filter: `(?i)${target.approvedNodes.join("|")}`,
    });
  }
  const profileIds = Object.keys(ctx.config.accessProfiles).sort(compare);
  for (const modeId of profileIds) {
    groups.push({ name: `${ctx.projection.modeControl.hiddenPrefix}${modeId}`, type: "select", emptyFallback: "REJECT", proxies: ["REJECT"] });
  }
  groups.push({
    name: ctx.projection.modeControl.visibleGroup,
    type: "select",
    emptyFallback: "REJECT",
    proxies: profileIds.map((modeId) => `${ctx.projection.modeControl.hiddenPrefix}${modeId}`),
  });
  groups.push(...compileServiceGroups(ctx));
  return groups;
}

function compileRuleProviders(ctx: ValidatedProjectionContext): MihomoFragmentIR["ruleProviders"] {
  return Object.fromEntries(Object.entries(ctx.projection.ruleProviders).sort(([a], [b]) => compare(a, b)).map(([key, provider]) => {
    const source = ctx.projection.sources[provider.source];
    if (source === undefined) compilerInvariant(`rule provider ${key} is missing source ${provider.source} after validation`);
    return [key, { type: provider.type, behavior: provider.behavior, format: provider.format, interval: provider.interval, url: sourceProviderUrl(source, provider.path) }];
  }));
}

function compileDns(ctx: ValidatedProjectionContext): MihomoDns {
  const nameserverPolicy: Record<string, readonly string[]> = {};
  for (const policy of ctx.plan.dns.servicePolicies) {
    const service = ctx.config.services[policy.serviceId];
    if (service === undefined) continue;
    const protection = ctx.config.protectionClasses[service.protectionClass];
    const selectedGroup = protection?.kind === "account-protected" ? service.selector.visibleGroup : undefined;
    for (const endpoint of Object.values(service.endpoints)) {
      nameserverPolicy[`rule-set:${endpoint.ruleset}`] = policy.resolvers.map((resolver) => resolverValue(resolver, ctx.config, selectedGroup));
    }
  }
  return {
    respectRules: ctx.plan.dns.respectRules,
    defaultNameserver: ctx.plan.dns.defaultNameserver.map((resolver) => resolverValue(resolver, ctx.config)),
    proxyServerNameserver: ctx.plan.dns.proxyServerNameserver.map((resolver) => resolverValue(resolver, ctx.config)),
    nameserver: ctx.plan.dns.nameserver.map((resolver) => resolverValue(resolver, ctx.config)),
    nameserverPolicy,
  };
}

function assertValidMihomoIr(ir: MihomoFragmentIR): void {
  const names = new Set<string>();
  for (const group of ir.groups) {
    if (group.emptyFallback !== "REJECT") {
      compilerInvariant(`compiled group ${group.name} must use REJECT empty-fallback`);
    }
    if (names.has(group.name)) {
      compilerInvariant(`duplicate compiled group name ${group.name}`);
    }
    names.add(group.name);
  }
}

export function compileMihomoFragment(
  config: RoutingConfig,
  projection: MihomoProjectionConfig,
  profileId: string,
): MihomoFragmentIR {
  const ctx = createValidatedCompileContext(config, projection, profileId);
  const ir: MihomoFragmentIR = {
    metadata: compileMetadata(ctx),
    groups: compileGroups(ctx),
    ruleProviders: compileRuleProviders(ctx),
    rules: compileRules(ctx),
    dns: compileDns(ctx),
  };
  assertValidMihomoIr(ir);
  return ir;
}
