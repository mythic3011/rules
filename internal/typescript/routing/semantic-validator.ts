import type { RoutingIssue } from "./issues.js";
import { canonicalServiceIdFromLegacy } from "./migration-adapter.js";
import type { RouteTarget, RoutingConfig } from "./schema.js";

const FORBIDDEN_ACCOUNT_GROUP_TOKENS = [
  "DIRECT",
  "COMPATIBLE",
  "fallback",
  "url-test",
  "load-balance",
];

function issue(
  code: RoutingIssue["code"],
  path: readonly (string | number)[],
  message: string,
): RoutingIssue {
  return { code, path, message };
}

function route(config: RoutingConfig, routeId: string): RouteTarget | undefined {
  return config.routeTargets[routeId];
}

function validateRouteRef(
  config: RoutingConfig,
  routeId: string,
  path: readonly (string | number)[],
  issues: RoutingIssue[],
): RouteTarget | undefined {
  const target = route(config, routeId);
  if (target === undefined) {
    issues.push(issue("missing-reference", path, `route target ${routeId} does not exist`));
  }
  return target;
}

function validateResolverRouteRefs(
  config: RoutingConfig,
  resolvers: readonly { readonly viaRoute?: string | undefined }[],
  path: readonly (string | number)[],
  issues: RoutingIssue[],
): void {
  for (const [index, resolver] of resolvers.entries()) {
    if (resolver.viaRoute !== undefined) {
      validateRouteRef(config, resolver.viaRoute, [...path, index, "viaRoute"], issues);
    }
  }
}

export function isAccountSafeTarget(target: RouteTarget): boolean {
  if (target.kind === "reject") {
    return true;
  }
  if (target.kind !== "pinned-egress" || target.dynamic) {
    return false;
  }
  const group = target.group.toLowerCase();
  return !FORBIDDEN_ACCOUNT_GROUP_TOKENS.some((token) => group.includes(token.toLowerCase()));
}

function effectiveEndpointRoute(
  config: RoutingConfig,
  profileId: string | undefined,
  serviceId: string,
  endpointId: string,
): string {
  const service = config.services[serviceId];
  if (service === undefined) {
    return "";
  }
  const endpoint = service.endpoints[endpointId];
  if (endpoint === undefined) {
    return "";
  }
  if (profileId !== undefined) {
    const profile = config.accessProfiles[profileId];
    const endpointOverride = profile?.endpointOverrides[serviceId]?.[endpointId];
    if (endpointOverride !== undefined) {
      return endpointOverride;
    }
  }
  if (endpoint.routeOverride !== undefined) {
    return endpoint.routeOverride;
  }
  if (profileId !== undefined) {
    const serviceOverride = config.accessProfiles[profileId]?.serviceOverrides[serviceId];
    if (serviceOverride !== undefined) {
      return serviceOverride;
    }
    const protection = config.protectionClasses[service.protectionClass];
    if (protection?.kind !== "account-protected") {
      const profileDefault = config.accessProfiles[profileId]?.defaultRoute;
      if (profileDefault !== undefined) {
        return profileDefault;
      }
    }
  }
  return service.defaultRoute;
}

export function validateRoutingSemantics(config: RoutingConfig): RoutingIssue[] {
  const issues: RoutingIssue[] = [];

  for (const [routeId, target] of Object.entries(config.routeTargets)) {
    if (target.kind !== "pinned-egress") {
      continue;
    }
    const normalizedNodes = target.approvedNodes.map((node) => node.toUpperCase());
    if (new Set(normalizedNodes).size !== normalizedNodes.length) {
      issues.push(issue("policy-invariant", ["routeTargets", routeId, "approvedNodes"], "approvedNodes must be unique"));
    }
    for (const [index, node] of target.approvedNodes.entries()) {
      if (["DIRECT", "COMPATIBLE", "REJECT"].includes(node.toUpperCase())) {
        issues.push(
          issue("policy-invariant", ["routeTargets", routeId, "approvedNodes", index], "approvedNodes cannot contain a built-in fallback target"),
        );
      }
    }
  }

  for (const [classId, protection] of Object.entries(config.protectionClasses)) {
    if (protection.kind !== "account-protected") {
      continue;
    }
    if (new Set(protection.resetOn).size !== protection.resetOn.length) {
      issues.push(issue("policy-invariant", ["protectionClasses", classId, "resetOn"], "account-protected resetOn values must be unique"));
    }
  }

  for (const [serviceId, service] of Object.entries(config.services)) {
    const servicePath = ["services", serviceId] as const;
    const protection = config.protectionClasses[service.protectionClass];
    if (protection === undefined) {
      issues.push(
        issue("missing-reference", [...servicePath, "protectionClass"], `protection class ${service.protectionClass} does not exist`),
      );
    }

    const defaultTarget = validateRouteRef(config, service.defaultRoute, [...servicePath, "defaultRoute"], issues);
    for (const [index, routeId] of service.allowedRoutes.entries()) {
      validateRouteRef(config, routeId, [...servicePath, "allowedRoutes", index], issues);
    }
    for (const [index, routeId] of service.selector.allowedRouteRefs.entries()) {
      validateRouteRef(config, routeId, [...servicePath, "selector", "allowedRouteRefs", index], issues);
      if (!service.allowedRoutes.includes(routeId)) {
        issues.push(
          issue(
            "policy-invariant",
            [...servicePath, "selector", "allowedRouteRefs", index],
            "selector route must be listed in the service allowedRoutes",
          ),
        );
      }
    }
    const hasStableOrRealtimeEndpoint = Object.values(service.endpoints).some(
      (endpoint) => endpoint.session === "stable" || endpoint.session === "realtime",
    );
    if (protection?.dynamicRouteAllowed === false) {
      for (const [index, routeId] of service.allowedRoutes.entries()) {
        if (route(config, routeId)?.kind === "region-auto") {
          issues.push(
            issue(
              "policy-invariant",
              [...servicePath, "allowedRoutes", index],
              "this protection class forbids dynamic route choices",
            ),
          );
        }
      }
      for (const [index, routeId] of service.selector.allowedRouteRefs.entries()) {
        if (route(config, routeId)?.kind === "region-auto") {
          issues.push(
            issue(
              "policy-invariant",
              [...servicePath, "selector", "allowedRouteRefs", index],
              "this protection class forbids dynamic selector choices",
            ),
          );
        }
      }
    }
    if (hasStableOrRealtimeEndpoint) {
      for (const [index, routeId] of service.selector.allowedRouteRefs.entries()) {
        if (route(config, routeId)?.kind === "region-auto") {
          issues.push(
            issue(
              "dynamic-route",
              [...servicePath, "selector", "allowedRouteRefs", index],
              "stable or realtime services cannot expose a dynamic selector route",
            ),
          );
        }
      }
    }
    if (!service.allowedRoutes.includes(service.defaultRoute)) {
      issues.push(
        issue("policy-invariant", [...servicePath, "defaultRoute"], "defaultRoute must be listed in allowedRoutes"),
      );
    }

    for (const [endpointId, endpoint] of Object.entries(service.endpoints)) {
      if (endpoint.routeOverride !== undefined) {
        validateRouteRef(config, endpoint.routeOverride, [...servicePath, "endpoints", endpointId, "routeOverride"], issues);
        if (!service.allowedRoutes.includes(endpoint.routeOverride)) {
          issues.push(
            issue(
              "policy-invariant",
              [...servicePath, "endpoints", endpointId, "routeOverride"],
              "endpoint route override must be listed in service allowedRoutes",
            ),
          );
        }
      }
    }

    if (protection?.kind === "account-protected") {
      if (service.defaultRoute !== "reject" || defaultTarget?.kind !== "reject") {
        issues.push(
          issue("policy-invariant", [...servicePath, "defaultRoute"], "account-protected services must default to the reject route"),
        );
      }
      if (service.selector.kind !== "explicit-node") {
        issues.push(
          issue("policy-invariant", [...servicePath, "selector"], "account-protected services require an explicit-node selector"),
        );
      }
      if (service.allowedRoutes[0] !== "reject" || service.selector.allowedRouteRefs[0] !== "reject") {
        issues.push(
          issue("policy-invariant", [...servicePath, "allowedRoutes"], "account-protected routes must start with reject"),
        );
      }
      for (const [index, routeId] of service.allowedRoutes.entries()) {
        const target = route(config, routeId);
        if (target !== undefined && !isAccountSafeTarget(target)) {
          issues.push(
            issue(
              "policy-invariant",
              [...servicePath, "allowedRoutes", index],
              "account-protected services may only reference reject or a non-dynamic pinned-egress route",
            ),
          );
        }
      }
    }

    if (protection !== undefined && !protection.directAllowed) {
      for (const [index, routeId] of service.allowedRoutes.entries()) {
        if (route(config, routeId)?.kind === "direct") {
          issues.push(
            issue("policy-invariant", [...servicePath, "allowedRoutes", index], "this protection class forbids direct routes"),
          );
        }
      }
    }
  }

  for (const [profileId, profile] of Object.entries(config.accessProfiles)) {
    const profileDefault = validateRouteRef(config, profile.defaultRoute, ["accessProfiles", profileId, "defaultRoute"], issues);
    for (const [serviceId, service] of Object.entries(config.services)) {
      const protection = config.protectionClasses[service.protectionClass];
      if (service.selector.kind !== "profile-aware" || profile.serviceOverrides[serviceId] !== undefined) {
        continue;
      }
      if (profileDefault !== undefined && !service.allowedRoutes.includes(profile.defaultRoute)) {
        issues.push(
          issue(
            "policy-invariant",
            ["accessProfiles", profileId, "defaultRoute"],
            `default route is not allowed for service ${serviceId}; add a service override`,
          ),
        );
      }
    }
    for (const [serviceId, routeId] of Object.entries(profile.serviceOverrides)) {
      const service = config.services[serviceId];
      const target = validateRouteRef(config, routeId, ["accessProfiles", profileId, "serviceOverrides", serviceId], issues);
      if (service === undefined) {
        issues.push(issue("missing-reference", ["accessProfiles", profileId, "serviceOverrides", serviceId], `service ${serviceId} does not exist`));
        continue;
      }
      if (!service.allowedRoutes.includes(routeId)) {
        issues.push(issue("policy-invariant", ["accessProfiles", profileId, "serviceOverrides", serviceId], "route is not allowed for this service"));
      }
      const protection = config.protectionClasses[service.protectionClass];
      if (protection?.kind === "account-protected" && target !== undefined && !isAccountSafeTarget(target)) {
        issues.push(
          issue("policy-invariant", ["accessProfiles", profileId, "serviceOverrides", serviceId], "access profiles cannot override an account-protected service to a generic route"),
        );
      }
    }
    for (const [serviceId, endpoints] of Object.entries(profile.endpointOverrides)) {
      const service = config.services[serviceId];
      if (service === undefined) {
        issues.push(issue("missing-reference", ["accessProfiles", profileId, "endpointOverrides", serviceId], `service ${serviceId} does not exist`));
        continue;
      }
      for (const [endpointId, routeId] of Object.entries(endpoints)) {
        const path = ["accessProfiles", profileId, "endpointOverrides", serviceId, endpointId] as const;
        const target = validateRouteRef(config, routeId, path, issues);
        if (service.endpoints[endpointId] === undefined) {
          issues.push(issue("missing-reference", ["accessProfiles", profileId, "endpointOverrides", serviceId, endpointId], `endpoint ${endpointId} does not exist`));
        }
        if (!service.allowedRoutes.includes(routeId)) {
          issues.push(issue("policy-invariant", path, "route is not allowed for this service"));
        }
        const protection = config.protectionClasses[service.protectionClass];
        if (protection?.kind === "account-protected" && target !== undefined && !isAccountSafeTarget(target)) {
          issues.push(issue("policy-invariant", path, "access profiles cannot override an account-protected endpoint to a generic route"));
        }
      }
    }
  }

  const endpointProfiles = [undefined, ...Object.keys(config.accessProfiles)];
  for (const [serviceId, service] of Object.entries(config.services)) {
    for (const [endpointId, endpoint] of Object.entries(service.endpoints)) {
      if (endpoint.session !== "stable" && endpoint.session !== "realtime") {
        continue;
      }
      for (const profileId of endpointProfiles) {
        const routeId = effectiveEndpointRoute(config, profileId, serviceId, endpointId);
        const target = validateRouteRef(config, routeId, ["services", serviceId, "endpoints", endpointId], issues);
        if (target?.kind === "region-auto") {
          issues.push(
            issue(
              "dynamic-route",
              ["services", serviceId, "endpoints", endpointId],
              `a ${endpoint.session} endpoint cannot resolve to dynamic route ${routeId}${profileId === undefined ? "" : ` in profile ${profileId}`}`,
            ),
          );
        }
      }
    }
  }

  if (config.dns.profiles[config.dns.defaultProfile] === undefined) {
    issues.push(issue("missing-reference", ["dns", "defaultProfile"], `DNS profile ${config.dns.defaultProfile} does not exist`));
  }
  for (const [profileId, dnsProfile] of Object.entries(config.dns.profiles)) {
    if (dnsProfile.respectRules && dnsProfile.proxyServerNameserver.length === 0) {
      issues.push(
        issue("policy-invariant", ["dns", "profiles", profileId, "proxyServerNameserver"], "respectRules requires at least one proxyServerNameserver"),
      );
    }
    validateResolverRouteRefs(
      config,
      dnsProfile.defaultNameserver,
      ["dns", "profiles", profileId, "defaultNameserver"],
      issues,
    );
    validateResolverRouteRefs(
      config,
      dnsProfile.proxyServerNameserver,
      ["dns", "profiles", profileId, "proxyServerNameserver"],
      issues,
    );
    validateResolverRouteRefs(
      config,
      dnsProfile.nameserver,
      ["dns", "profiles", profileId, "nameserver"],
      issues,
    );
    for (const [serviceId, dnsPolicy] of Object.entries(dnsProfile.servicePolicies)) {
      const service = config.services[serviceId];
      if (service === undefined) {
        issues.push(issue("missing-reference", ["dns", "profiles", profileId, "servicePolicies", serviceId], `service ${serviceId} does not exist`));
        continue;
      }
      const protection = config.protectionClasses[service.protectionClass];
      if (protection?.kind !== "account-protected") {
        validateResolverRouteRefs(
          config,
          dnsPolicy.resolvers,
          ["dns", "profiles", profileId, "servicePolicies", serviceId, "resolvers"],
          issues,
        );
        continue;
      }
      if (dnsPolicy.failure !== "refuse" || dnsPolicy.fallback !== "none") {
        issues.push(
          issue("policy-invariant", ["dns", "profiles", profileId, "servicePolicies", serviceId], "account-protected DNS must refuse with no fallback"),
        );
      }
      for (const [index, resolver] of dnsPolicy.resolvers.entries()) {
        if (resolver.viaRoute === undefined) {
          issues.push(
            issue("policy-invariant", ["dns", "profiles", profileId, "servicePolicies", serviceId, "resolvers", index], "account-protected resolver must use an approved pinned-egress route"),
          );
          continue;
        }
        const target = validateRouteRef(config, resolver.viaRoute, ["dns", "profiles", profileId, "servicePolicies", serviceId, "resolvers", index, "viaRoute"], issues);
        if (target?.kind !== "pinned-egress" || !service.allowedRoutes.includes(resolver.viaRoute)) {
          issues.push(
            issue("policy-invariant", ["dns", "profiles", profileId, "servicePolicies", serviceId, "resolvers", index, "viaRoute"], "account-protected resolver must use a service-allowed pinned-egress route"),
          );
        }
      }
    }
    for (const [serviceId, service] of Object.entries(config.services)) {
      const protection = config.protectionClasses[service.protectionClass];
      if (protection?.kind === "account-protected" && dnsProfile.servicePolicies[serviceId] === undefined) {
        issues.push(
          issue("policy-invariant", ["dns", "profiles", profileId, "servicePolicies", serviceId], "account-protected services require an explicit DNS policy in every DNS profile"),
        );
      }
    }
  }

  issues.push(...validateSharedBackends(config));
  return issues;
}

export function validateSharedBackends(config: RoutingConfig): RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  const domainOwners = new Map<string, string>();
  for (const [backendId, backend] of Object.entries(config.sharedBackends)) {
    const backendPath = ["sharedBackends", backendId] as const;
    const seenConsumers = new Set<string>();
    for (const [index, consumerId] of backend.consumers.entries()) {
      if (seenConsumers.has(consumerId)) {
        issues.push(
          issue("policy-invariant", [...backendPath, "consumers", index], `duplicate consumer ${consumerId}`),
        );
      }
      seenConsumers.add(consumerId);
      if (config.services[consumerId] === undefined && canonicalServiceIdFromLegacy(consumerId) === undefined) {
        issues.push(
          issue(
            "missing-reference",
            [...backendPath, "consumers", index],
            `consumer ${consumerId} does not exist`,
          ),
        );
      }
    }
    if (
      backend.legacyEffectiveConsumer !== undefined &&
      !backend.consumers.includes(backend.legacyEffectiveConsumer)
    ) {
      issues.push(
        issue(
          "policy-invariant",
          [...backendPath, "legacyEffectiveConsumer"],
          "legacyEffectiveConsumer must be one of consumers",
        ),
      );
    }
    for (const [index, domain] of backend.domains.entries()) {
      const owner = domainOwners.get(domain);
      if (owner !== undefined) {
        issues.push(
          issue(
            "policy-invariant",
            [...backendPath, "domains", index],
            `domain ${domain} already belongs to shared backend ${owner}`,
          ),
        );
      } else {
        domainOwners.set(domain, backendId);
      }
    }
  }
  return issues;
}

export type RuleOrderingStage =
  | "account-protected"
  | "account-terminal-reject"
  | "specific-service"
  | "ai-all"
  | "category-ai"
  | "match";

const RULE_ORDER: readonly RuleOrderingStage[] = [
  "account-protected",
  "account-terminal-reject",
  "specific-service",
  "ai-all",
  "category-ai",
  "match",
];

export interface RuleOrderingEntry {
  readonly stage: RuleOrderingStage;
  readonly label: string;
}

export interface RuleOrderingPlan {
  readonly entries: readonly RuleOrderingEntry[];
}

export function validateRuleOrdering(plan: RuleOrderingPlan): RoutingIssue[] {
  const issues: RoutingIssue[] = [];
  let previousIndex = -1;
  for (const [index, entry] of plan.entries.entries()) {
    const stageIndex = RULE_ORDER.indexOf(entry.stage);
    if (stageIndex < previousIndex) {
      issues.push(
        issue("rule-ordering", ["entries", index], `${entry.label} (${entry.stage}) appears after a later rule stage`),
      );
    }
    previousIndex = Math.max(previousIndex, stageIndex);
  }
  return issues;
}
