import YAML from "yaml";

import { compileRoutingProfile } from "./compiler.js";
import type { MihomoProjectionConfig } from "./mihomo-projection.js";
import type { RoutingConfig } from "./schema.js";

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export interface ApiSafeSelection {
  readonly group: string;
  /** Percent encoded by the compiler; the POSIX adapter must never encode names. */
  readonly proxyPath: string;
  /** The adapter serializes this value through jshn, never shell escaping. */
  readonly target: string;
}

function apiSelection(group: string, target: string): ApiSafeSelection {
  return { group, proxyPath: `/proxies/${encodeURIComponent(group)}`, target };
}

export interface ControllerPlan {
  readonly schemaVersion: 1;
  readonly policyVersion: string;
  readonly modeControl: {
    readonly visibleGroup: string;
    readonly modes: Readonly<Record<string, string>>;
  };
  readonly api: {
    readonly proxiesPath: "/proxies";
    readonly versionPath: "/version";
    readonly requestEncoding: "precomputed-percent-path+jshn-body";
  };
  readonly modes: Readonly<Record<string, {
    readonly hiddenSelections: readonly ApiSafeSelection[];
  }>>;
  readonly accountProtected: readonly {
    readonly serviceId: string;
    readonly visibleGroup: string;
    readonly initialSelection: "REJECT";
    readonly canonicalApprovedNodeIds: readonly string[];
    readonly canonicalApprovedBindings: readonly { readonly approvedId: string; readonly provider: string }[];
    readonly localMaterialization: {
      readonly exactNodeFilterRequired: true;
      readonly emptyFallback: "REJECT";
    };
    readonly dnsPolicyKeys: readonly string[];
    readonly lockRequest: ApiSafeSelection;
  }[];
}

export interface FirewallSemanticPlan {
  readonly schemaVersion: 1;
  readonly policyVersion: string;
  readonly deploymentRequired: true;
  readonly protectedSources: "router-local-deployment-required";
  readonly allow: readonly string[];
  readonly deny: readonly string[];
  readonly adapterRequirements: readonly string[];
}

function accountNodes(config: RoutingConfig, routeIds: readonly string[]): string[] {
  const nodes = routeIds.flatMap((routeId) => {
    const route = config.routeTargets[routeId];
    return route?.kind === "pinned-egress" ? route.approvedNodes : [];
  });
  return [...new Set(nodes)].sort(compare);
}

function accountBindings(config: RoutingConfig, projection: MihomoProjectionConfig, routeIds: readonly string[]): { readonly approvedId: string; readonly provider: string }[] {
  return routeIds.flatMap((routeId) => {
    const route = config.routeTargets[routeId];
    if (route?.kind !== "pinned-egress") return [];
    const bindings = projection.pinnedEgressBindings[routeId] ?? {};
    return Object.entries(bindings).map(([approvedId, provider]) => ({ approvedId, provider }));
  }).sort((left, right) => compare(left.approvedId, right.approvedId));
}

export function compileControllerPlan(
  config: RoutingConfig,
  projection: MihomoProjectionConfig,
): ControllerPlan {
  const profileIds = Object.keys(config.accessProfiles).sort(compare);
  const modes = Object.fromEntries(profileIds.map((profileId) => {
    const profile = compileRoutingProfile(config, profileId);
    const hiddenSelections = profile.services
      .filter((service) => service.selector.kind === "profile-aware")
      .map((service) => apiSelection(
        service.selector.kind === "profile-aware" ? service.selector.hiddenProfileTarget : "",
        service.effectiveRoute.group,
      ))
      .sort((left, right) => compare(left.group, right.group));
    return [profileId, { hiddenSelections }];
  }));
  const accountProtected = Object.entries(config.services)
    .filter(([, service]) => config.protectionClasses[service.protectionClass]?.kind === "account-protected")
    .map(([serviceId, service]) => ({
      serviceId,
      visibleGroup: service.selector.visibleGroup,
      initialSelection: "REJECT" as const,
      canonicalApprovedNodeIds: accountNodes(config, service.allowedRoutes),
      canonicalApprovedBindings: accountBindings(config, projection, service.allowedRoutes),
      localMaterialization: {
        exactNodeFilterRequired: true as const,
        emptyFallback: "REJECT" as const,
      },
      dnsPolicyKeys: Object.values(service.endpoints)
        .map((endpoint) => `rule-set:${endpoint.ruleset}`)
        .sort(compare),
      lockRequest: apiSelection(service.selector.visibleGroup, "REJECT"),
    }))
    .sort((left, right) => compare(left.serviceId, right.serviceId));

  return {
    schemaVersion: 1,
    policyVersion: config.policyVersion,
    modeControl: {
      visibleGroup: projection.modeControl.visibleGroup,
      modes: Object.fromEntries(profileIds.map((id) => [id, `${projection.modeControl.hiddenPrefix}${id}`])),
    },
    api: {
      proxiesPath: "/proxies",
      versionPath: "/version",
      requestEncoding: "precomputed-percent-path+jshn-body",
    },
    modes,
    accountProtected,
  };
}

export function compileFirewallSemanticPlan(config: RoutingConfig): FirewallSemanticPlan {
  const hasProtectedService = Object.values(config.protectionClasses).some(
    (item) => item.kind === "account-protected" && item.firewallKillSwitch,
  );
  if (!hasProtectedService) throw new Error("No account-protected firewall policy exists");
  return {
    schemaVersion: 1,
    policyVersion: config.policyVersion,
    deploymentRequired: true,
    protectedSources: "router-local-deployment-required",
    allow: [
      "router-dns",
      "runtime-discovered-mihomo-interception-path",
      "router-originated-approved-proxy-egress",
    ],
    deny: [
      "direct-wan-v4",
      "direct-wan-v6",
      "external-dns-tcp-udp-53",
      "dot-tcp-udp-853",
      "direct-quic-udp-443",
    ],
    adapterRequirements: [
      "discover-openclash-uci-config",
      "discover-nft-chain-mark-interface",
      "dedicated-device-or-vlan",
      "live-reboot-race-proof",
    ],
  };
}

export function renderFirewallSemanticPlan(plan: FirewallSemanticPlan): string {
  const document = new YAML.Document(plan);
  document.commentBefore = "NON-EXECUTABLE FIREWALL SEMANTIC PLAN\nA router-local adapter must discover OpenClash runtime chains, marks, and interfaces.";
  return document.toString();
}
