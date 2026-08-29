import { z } from "zod";

export const IdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, {
  message: "must match ^[a-z][a-z0-9-]*$",
});

const GroupSchema = z.string().min(1);
const ResetOnSchema = z.enum([
  "policy-version-change",
  "selected-node-missing",
  "exit-ip-change",
  "geo-mismatch",
  "node-revoked",
]);

export const RouteTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("direct"), group: z.literal("DIRECT") }).strict(),
  z.object({ kind: z.literal("reject"), group: z.literal("REJECT") }).strict(),
  z
    .object({
      kind: z.literal("region-auto"),
      group: GroupSchema,
      region: IdSchema,
      dynamic: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("region-stable"),
      group: GroupSchema,
      region: IdSchema,
      dynamic: z.literal(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal("pinned-egress"),
      group: GroupSchema,
      approvedNodes: z.array(GroupSchema).min(1),
      emptyFallback: z.literal("REJECT"),
      dynamic: z.literal(false),
    })
    .strict(),
]);

export const ProtectionClassSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("direct-capable"),
      directAllowed: z.literal(true),
      dynamicRouteAllowed: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("proxy-required"),
      directAllowed: z.literal(false),
      dynamicRouteAllowed: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("stable-session"),
      directAllowed: z.literal(false),
      dynamicRouteAllowed: z.literal(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal("account-protected"),
      directAllowed: z.literal(false),
      dynamicRouteAllowed: z.literal(false),
      activation: z.literal("explicit-user-selection"),
      initialRoute: z.literal("reject"),
      dnsMode: z.literal("proxy-only"),
      ipv6: z.literal("proxy-or-reject"),
      quic: z.literal("proxy-or-reject"),
      firewallKillSwitch: z.literal(true),
      failMode: z.literal("reject"),
      resetOn: z.array(ResetOnSchema).min(1),
    })
    .strict(),
]);

export const SelectorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("profile-aware"),
      visibleGroup: GroupSchema,
      hiddenProfileTarget: GroupSchema,
      allowedRouteRefs: z.array(IdSchema).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("explicit-node"),
      visibleGroup: GroupSchema,
      initialRoute: z.literal("reject"),
      allowedRouteRefs: z.array(IdSchema).min(1),
    })
    .strict(),
]);

export const EndpointSchema = z
  .object({
    ruleset: z.string().min(1),
    session: z.enum(["stateless", "stable", "realtime", "bulk"]),
    routeOverride: IdSchema.optional(),
  })
  .strict();

const DependencySchema = z
  .object({
    id: IdSchema,
    host: z.string().min(1),
    path: z.string().regex(/^\//),
    role: z.enum(["control", "auth", "api", "media", "storage", "cdn", "websocket", "stream", "optional"]),
    required: z.boolean(),
    routePolicy: z.enum(["inherit", "direct", "explicit-route", "compatible-route", "reject"]),
    matcher: z
      .object({
        desiredGranularity: z.enum(["path", "host"]),
        availableGranularity: z.enum(["path", "host"]),
        scopeExpansion: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const ServiceSchema = z
  .object({
    displayName: z.string().min(1),
    protectionClass: IdSchema,
    defaultRoute: IdSchema,
    allowedRoutes: z.array(IdSchema).min(1),
    selector: SelectorSchema,
    upstream: z.object({ source: IdSchema, provider: IdSchema }).strict(),
    endpoints: z.record(IdSchema, EndpointSchema).default({}),
    dependencies: z.array(DependencySchema).default([]),
  })
  .strict();

export const AccessProfileSchema = z
  .object({
    displayName: z.string().min(1),
    defaultRoute: IdSchema,
    serviceOverrides: z.record(IdSchema, IdSchema).default({}),
    endpointOverrides: z.record(IdSchema, z.record(IdSchema, IdSchema)).default({}),
  })
  .strict();

const ResolverCommonSchema = z.object({ viaRoute: IdSchema.optional() }).strict();

export const ResolverSchema = z.discriminatedUnion("kind", [
  ResolverCommonSchema.extend({
    kind: z.literal("udp"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(53),
  }).strict(),
  ResolverCommonSchema.extend({
    kind: z.literal("doh"),
    url: z.url(),
  }).strict(),
  ResolverCommonSchema.extend({
    kind: z.literal("dot"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(853),
  }).strict(),
]);

export const ServiceDnsPolicySchema = z
  .object({
    resolvers: z.array(ResolverSchema).min(1),
    failure: z.enum(["refuse", "fallback"]),
    fallback: z.enum(["none", "direct", "local", "system"]),
  })
  .strict();

export const DnsProfileSchema = z
  .object({
    respectRules: z.boolean(),
    defaultNameserver: z.array(ResolverSchema).min(1),
    proxyServerNameserver: z.array(ResolverSchema),
    nameserver: z.array(ResolverSchema).min(1),
    servicePolicies: z.record(IdSchema, ServiceDnsPolicySchema).default({}),
  })
  .strict();

export const RoutingConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    policyVersion: z.string().min(1),
    routeTargets: z.record(IdSchema, RouteTargetSchema),
    protectionClasses: z.record(IdSchema, ProtectionClassSchema),
    services: z.record(IdSchema, ServiceSchema),
    accessProfiles: z.record(IdSchema, AccessProfileSchema),
    dns: z
      .object({
        defaultProfile: IdSchema,
        profiles: z.record(IdSchema, DnsProfileSchema),
      })
      .strict(),
  })
  .strict();

export const RoutingConfigFragmentSchema = RoutingConfigSchema.partial().strict();

export type RouteTarget = z.infer<typeof RouteTargetSchema>;
export type ProtectionClass = z.infer<typeof ProtectionClassSchema>;
export type Selector = z.infer<typeof SelectorSchema>;
export type Resolver = z.infer<typeof ResolverSchema>;
export type DnsProfile = z.infer<typeof DnsProfileSchema>;
export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;
