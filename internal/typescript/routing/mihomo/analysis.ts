import type { RoutingConfig } from "../schema.js";

export function collectReachableRouteIds(config: RoutingConfig): ReadonlySet<string> {
  const reachableRouteIds = new Set<string>();
  for (const service of Object.values(config.services)) {
    reachableRouteIds.add(service.defaultRoute);
    for (const routeId of service.allowedRoutes) reachableRouteIds.add(routeId);
    for (const routeId of service.selector.allowedRouteRefs) reachableRouteIds.add(routeId);
    for (const endpoint of Object.values(service.endpoints)) if (endpoint.routeOverride !== undefined) reachableRouteIds.add(endpoint.routeOverride);
  }
  for (const accessProfile of Object.values(config.accessProfiles)) {
    reachableRouteIds.add(accessProfile.defaultRoute);
    for (const routeId of Object.values(accessProfile.serviceOverrides)) reachableRouteIds.add(routeId);
    for (const endpoints of Object.values(accessProfile.endpointOverrides)) for (const routeId of Object.values(endpoints)) reachableRouteIds.add(routeId);
  }
  for (const dnsProfile of Object.values(config.dns.profiles)) {
    for (const policy of Object.values(dnsProfile.servicePolicies)) {
      for (const resolver of policy.resolvers) {
        if (resolver.viaRoute !== undefined) reachableRouteIds.add(resolver.viaRoute);
      }
    }
  }
  return reachableRouteIds;
}
