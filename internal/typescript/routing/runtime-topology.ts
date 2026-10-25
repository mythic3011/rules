import { z } from "zod";

import { formatIssues, type RoutingIssue } from "./issues.js";
import type { FirewallSemanticPlan } from "./runtime-plan.js";

const Name = z.string().regex(/^[A-Za-z0-9_.:-]+$/);
const HostV4 = z.string().regex(/^(?:25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)(?:\.(?:25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)){3}\/32$/);
const HostV6 = z.string().regex(/^[0-9A-Fa-f:]+\/128$/);
const IPv4 = z.string().regex(/^(?:25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)(?:\.(?:25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)){3}$/);
const IPv6 = z.string().regex(/^[0-9A-Fa-f:]+$/);
const Mark = z.string().regex(/^0x[0-9a-fA-F]+$/);

export const RuntimeTopologySchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal("deployment"),
  policyVersion: z.string().min(1),
  protectedSources: z.object({
    ipv4: z.array(HostV4).min(1),
    ipv6: z.array(HostV6).min(1),
    interfaces: z.array(Name).min(1),
    vlans: z.array(Name).min(1),
  }).strict(),
  routerDns: z.object({ ipv4: z.array(IPv4).min(1), ipv6: z.array(IPv6).min(1) }).strict(),
  wanInterfaces: z.array(Name).min(1),
  mihomo: z.object({
    interceptionChains: z.array(Name).min(1),
    routingMark: Mark,
    proxyEndpointIps: z.object({ ipv4: z.array(IPv4).min(1), ipv6: z.array(IPv6).min(1) }).strict(),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.wanInterfaces).size !== value.wanInterfaces.length) ctx.addIssue({ code: "custom", path: ["wanInterfaces"], message: "WAN interfaces must be unique" });
  if (new Set(value.routerDns.ipv4).size !== value.routerDns.ipv4.length || new Set(value.routerDns.ipv6).size !== value.routerDns.ipv6.length) ctx.addIssue({ code: "custom", path: ["routerDns"], message: "router DNS addresses must be unique" });
  if (new Set(value.mihomo.proxyEndpointIps.ipv4).size !== value.mihomo.proxyEndpointIps.ipv4.length || new Set(value.mihomo.proxyEndpointIps.ipv6).size !== value.mihomo.proxyEndpointIps.ipv6.length) ctx.addIssue({ code: "custom", path: ["mihomo", "proxyEndpointIps"], message: "proxy endpoint addresses must be unique" });
  if (value.protectedSources.ipv4.some((item) => item === "0.0.0.0/32") || value.protectedSources.ipv6.some((item) => item === "::/128")) ctx.addIssue({ code: "custom", path: ["protectedSources"], message: "protected sources cannot use unspecified hosts" });
});
export type RuntimeTopology = z.infer<typeof RuntimeTopologySchema>;

export class RuntimeTopologyError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) { super(formatIssues(issues)); this.name = "RuntimeTopologyError"; }
}
function issue(path: readonly (string | number)[], message: string): RoutingIssue { return { code: "policy-invariant", path, message }; }

export interface FirewallAdapterPlan {
  readonly schemaVersion: 1;
  readonly policyVersion: string;
  readonly applyMode: "insufficient-pending-live-fw4-openclash-proof";
  readonly guardRequirements: readonly string[];
  readonly discoveredInputs: Readonly<{ readonly wanInterfaces: readonly string[]; readonly interceptionChains: readonly string[]; readonly routingMark: string }>;
  readonly guardedDraft: readonly string[];
}

function sorted(values: readonly string[]): string[] { return [...new Set(values)].sort(); }
function nftSet(values: readonly string[]): string { return `{ ${sorted(values).join(", ")} }`; }

/**
 * Compiles a review-only draft, not an nftables transaction. A late forward
 * hook cannot establish a kill switch before fw4 accepts/offloads traffic;
 * a live adapter remains blocked until it proves an earlier fw4/OpenClash path.
 */
export function compileFirewallAdapterPlan(semantic: FirewallSemanticPlan, rawTopology: unknown): FirewallAdapterPlan {
  const parsed = RuntimeTopologySchema.safeParse(rawTopology);
  if (!parsed.success) throw new RuntimeTopologyError(parsed.error.issues.map((entry) => issue(["runtime-topology", ...entry.path.map(String)], entry.message)));
  const topology = parsed.data;
  if (topology.policyVersion !== semantic.policyVersion) throw new RuntimeTopologyError([issue(["runtime-topology", "policyVersion"], "topology policy version does not match semantic plan")]);
  const guardedDraft = [
    `protected IPv4 hosts: ${nftSet(topology.protectedSources.ipv4)}`,
    `protected IPv6 hosts: ${nftSet(topology.protectedSources.ipv6)}`,
    `WAN interfaces: ${nftSet(topology.wanInterfaces.map((value) => `\"${value}\"`))}`,
    `Mihomo routing mark: ${topology.mihomo.routingMark}`,
    "required earlier-chain policy: accept only verified interception mark or proxy endpoint, then reject all remaining protected-source WAN IPv4/IPv6 traffic",
    "required specific denies within that earlier-chain policy: external DNS TCP/UDP 53, DoT TCP/UDP 853, direct QUIC UDP 443",
  ];
  return {
    schemaVersion: 1,
    policyVersion: semantic.policyVersion,
    applyMode: "insufficient-pending-live-fw4-openclash-proof",
    guardRequirements: ["fw4-earlier-chain-proof", "openclash-interception-proof", "no-established-or-offload-bypass", "verified-proxy-endpoint-allow-path", "default-deny-protected-wan-v4-v6"],
    discoveredInputs: { wanInterfaces: sorted(topology.wanInterfaces), interceptionChains: sorted(topology.mihomo.interceptionChains), routingMark: topology.mihomo.routingMark },
    guardedDraft,
  };
}
