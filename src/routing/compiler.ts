import { formatIssues, type RoutingIssue } from "./issues.js";
import type { DnsProfile, Resolver, RouteTarget, RoutingConfig } from "./schema.js";
import { validateRoutingSemantics } from "./semantic-validator.js";

export interface TerminalRouteDescriptor {
  readonly id: string;
  readonly kind: RouteTarget["kind"];
  readonly group: string;
  readonly dynamic: boolean;
}

export interface ProfileAwareSelectorPreview {
  readonly kind: "profile-aware";
  readonly visibleGroup: string;
  readonly hiddenProfileTarget: string;
  /** Route-group choices only; raw subscription nodes are intentionally absent. */
  readonly choices: readonly TerminalRouteDescriptor[];
}

export interface ExplicitNodeRouteChoice {
  readonly kind: "route";
  readonly route: TerminalRouteDescriptor;
}

export interface ExplicitApprovedNodeChoice {
  readonly kind: "approved-node";
  readonly routeId: string;
  readonly group: string;
  readonly node: string;
  readonly emptyFallback: "REJECT";
}

export interface ExplicitNodeSelectorPreview {
  readonly kind: "explicit-node";
  readonly visibleGroup: string;
  readonly initialRoute: "reject";
  readonly runtimeSelectionRequired: true;
  /** Always starts with REJECT; approved nodes are display-only until runtime selection. */
  readonly choices: readonly (ExplicitNodeRouteChoice | ExplicitApprovedNodeChoice)[];
}

export interface CompiledEndpointPreview {
  readonly id: string;
  readonly ruleset: string;
  readonly session: "stateless" | "stable" | "realtime" | "bulk";
  readonly effectiveRoute: TerminalRouteDescriptor;
}

export interface CompiledServicePreview {
  readonly id: string;
  readonly displayName: string;
  readonly protectionClass: string;
  readonly effectiveRoute: TerminalRouteDescriptor;
  readonly selector: ProfileAwareSelectorPreview | ExplicitNodeSelectorPreview;
  readonly endpoints: readonly CompiledEndpointPreview[];
}

export interface CompiledDnsServicePolicy {
  readonly serviceId: string;
  readonly failure: "refuse" | "fallback";
  readonly fallback: "none" | "direct" | "local" | "system";
  readonly resolvers: readonly Resolver[];
}

export interface CompiledDnsPreview {
  readonly id: string;
  readonly respectRules: boolean;
  readonly defaultNameserver: readonly Resolver[];
  readonly proxyServerNameserver: readonly Resolver[];
  readonly nameserver: readonly Resolver[];
  readonly servicePolicies: readonly CompiledDnsServicePolicy[];
}

export interface CompiledRoutingPlan {
  readonly schemaVersion: 1;
  readonly policyVersion: string;
  readonly accessProfile: { readonly id: string; readonly displayName: string };
  readonly dns: CompiledDnsPreview;
  readonly services: readonly CompiledServicePreview[];
}

export class RoutingCompileError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) {
    super(formatIssues(issues));
    this.name = "RoutingCompileError";
  }
}

function compareCodepoints(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compilerIssue(path: readonly (string | number)[], message: string): RoutingIssue {
  return { code: "missing-reference", path, message };
}

function terminalRoute(config: RoutingConfig, routeId: string): TerminalRouteDescriptor {
  const target = config.routeTargets[routeId];
  if (target === undefined) {
    throw new RoutingCompileError([compilerIssue(["routeTargets", routeId], `route target ${routeId} does not exist`)]);
  }
  return {
    id: routeId,
    kind: target.kind,
    group: target.group,
    dynamic: target.kind === "region-auto",
  };
}

function cloneResolver(resolver: Resolver): Resolver {
  return structuredClone(resolver);
}

function compileDnsProfile(id: string, profile: DnsProfile): CompiledDnsPreview {
  return {
    id,
    respectRules: profile.respectRules,
    defaultNameserver: profile.defaultNameserver.map(cloneResolver),
    proxyServerNameserver: profile.proxyServerNameserver.map(cloneResolver),
    nameserver: profile.nameserver.map(cloneResolver),
    servicePolicies: Object.entries(profile.servicePolicies)
      .sort(([left], [right]) => compareCodepoints(left, right))
      .map(([serviceId, policy]) => ({
        serviceId,
        failure: policy.failure,
        fallback: policy.fallback,
        resolvers: policy.resolvers.map(cloneResolver),
      })),
  };
}

function effectiveServiceRouteId(
  config: RoutingConfig,
  profileId: string,
  serviceId: string,
): string {
  const service = config.services[serviceId];
  const profile = config.accessProfiles[profileId];
  if (service === undefined || profile === undefined) {
    throw new RoutingCompileError([compilerIssue(["services", serviceId], "service or access profile does not exist")]);
  }
  const protection = config.protectionClasses[service.protectionClass];
  if (protection?.kind === "account-protected") {
    return "reject";
  }
  const override = profile.serviceOverrides[serviceId];
  if (override !== undefined) {
    return override;
  }
  return service.selector.kind === "profile-aware" ? profile.defaultRoute : service.defaultRoute;
}

function compileSelector(
  config: RoutingConfig,
  serviceId: string,
): ProfileAwareSelectorPreview | ExplicitNodeSelectorPreview {
  const service = config.services[serviceId];
  if (service === undefined) {
    throw new RoutingCompileError([compilerIssue(["services", serviceId], `service ${serviceId} does not exist`)]);
  }
  if (service.selector.kind === "profile-aware") {
    return {
      kind: "profile-aware",
      visibleGroup: service.selector.visibleGroup,
      hiddenProfileTarget: service.selector.hiddenProfileTarget,
      choices: service.selector.allowedRouteRefs.map((routeId) => terminalRoute(config, routeId)),
    };
  }

  const reject = terminalRoute(config, "reject");
  const choices: (ExplicitNodeRouteChoice | ExplicitApprovedNodeChoice)[] = [{ kind: "route", route: reject }];
  for (const routeId of service.selector.allowedRouteRefs) {
    if (routeId === "reject") {
      continue;
    }
    const target = config.routeTargets[routeId];
    if (target?.kind !== "pinned-egress") {
      continue;
    }
    for (const node of target.approvedNodes) {
      choices.push({
        kind: "approved-node",
        routeId,
        group: target.group,
        node,
        emptyFallback: target.emptyFallback,
      });
    }
  }
  return {
    kind: "explicit-node",
    visibleGroup: service.selector.visibleGroup,
    initialRoute: "reject",
    runtimeSelectionRequired: true,
    choices,
  };
}

export function compileRoutingProfile(
  config: RoutingConfig,
  accessProfileId: string,
  dnsProfileId?: string,
): CompiledRoutingPlan {
  const issues = validateRoutingSemantics(config);
  if (issues.length > 0) {
    throw new RoutingCompileError(issues);
  }
  const profile = config.accessProfiles[accessProfileId];
  if (profile === undefined) {
    throw new RoutingCompileError([
      compilerIssue(["accessProfiles", accessProfileId], `access profile ${accessProfileId} does not exist`),
    ]);
  }
  const resolvedDnsProfileId = dnsProfileId ?? config.dns.defaultProfile;
  const dnsProfile = config.dns.profiles[resolvedDnsProfileId];
  if (dnsProfile === undefined) {
    throw new RoutingCompileError([
      compilerIssue(["dns", "profiles", resolvedDnsProfileId], `DNS profile ${resolvedDnsProfileId} does not exist`),
    ]);
  }

  const services = Object.keys(config.services)
    .sort(compareCodepoints)
    .map((serviceId) => {
      const service = config.services[serviceId];
      if (service === undefined) {
        throw new RoutingCompileError([compilerIssue(["services", serviceId], `service ${serviceId} does not exist`)]);
      }
      const effectiveRouteId = effectiveServiceRouteId(config, accessProfileId, serviceId);
      const protection = config.protectionClasses[service.protectionClass];
      const endpoints = Object.entries(service.endpoints)
        .sort(([left], [right]) => compareCodepoints(left, right))
        .map(([endpointId, endpoint]) => {
          const routeId = protection?.kind === "account-protected"
            ? "reject"
            : profile.endpointOverrides[serviceId]?.[endpointId]
              ?? endpoint.routeOverride
              ?? effectiveRouteId;
          return {
            id: endpointId,
            ruleset: endpoint.ruleset,
            session: endpoint.session,
            effectiveRoute: terminalRoute(config, routeId),
          };
        });
      return {
        id: serviceId,
        displayName: service.displayName,
        protectionClass: service.protectionClass,
        effectiveRoute: terminalRoute(config, effectiveRouteId),
        selector: compileSelector(config, serviceId),
        endpoints,
      };
    });

  return {
    schemaVersion: config.schemaVersion,
    policyVersion: config.policyVersion,
    accessProfile: { id: accessProfileId, displayName: profile.displayName },
    dns: compileDnsProfile(resolvedDnsProfileId, dnsProfile),
    services,
  };
}
