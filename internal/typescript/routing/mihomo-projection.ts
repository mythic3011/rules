import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";

import { compileRoutingProfile, type CompiledRoutingPlan } from "./compiler.js";
import { formatIssues, type RoutingIssue } from "./issues.js";
import { IdSchema, type Resolver, type RouteTarget, type RoutingConfig } from "./schema.js";
import { isOwnershipOverrideService, validateRuleOrdering, type RuleOrderingStage } from "./semantic-validator.js";

const RuleProviderKeySchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const SourceSchema = z.object({
  label: z.string().min(1),
  repository: z.string().min(1),
  revision: z.string().regex(/^[0-9a-f]{40}$/),
  rawBaseUrl: z.url(),
}).strict();
const RuleProviderSchema = z.object({
  type: z.literal("http"), behavior: z.literal("classical"), format: z.literal("yaml"),
  interval: z.number().int().positive(), source: IdSchema, path: z.string().min(1),
}).strict();
const RegionSchema = z.object({
  autoGroup: z.string().min(1), stableGroup: z.string().min(1), use: z.array(IdSchema).min(1),
  filter: z.string().min(1), url: z.url(), interval: z.number().int().positive(), tolerance: z.number().int().nonnegative(),
}).strict();
const ModeControlSchema = z.object({ visibleGroup: z.string().min(1), hiddenPrefix: z.string().regex(/^@mode\/$/) }).strict();
const IniMvpSchema = z.object({
  profile: IdSchema,
  migratedServices: z.array(IdSchema).min(1),
  legacyReplacementIds: z.array(IdSchema).min(1),
  aiOtherGroup: z.string().min(1),
  aiOtherAllowedRoutes: z.array(IdSchema).min(1),
  presentation: z.object({ rejectGroup: z.string().min(1), directGroup: z.string().min(1) }).strict(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.migratedServices).size !== value.migratedServices.length) ctx.addIssue({ code: "custom", path: ["migratedServices"], message: "migrated services must be unique" });
  if (new Set(value.legacyReplacementIds).size !== value.legacyReplacementIds.length) ctx.addIssue({ code: "custom", path: ["legacyReplacementIds"], message: "legacy replacement IDs must be unique" });
  if (new Set(value.aiOtherAllowedRoutes).size !== value.aiOtherAllowedRoutes.length) ctx.addIssue({ code: "custom", path: ["aiOtherAllowedRoutes"], message: "AI Other allowed routes must be unique" });
});
export const MihomoProjectionConfigSchema = z.object({
  schemaVersion: z.literal(1),
  sources: z.record(IdSchema, SourceSchema),
  proxyProviders: z.record(IdSchema, z.object({ external: z.literal(true) }).strict()),
  pinnedEgressBindings: z.record(IdSchema, z.record(z.string().min(1), IdSchema)),
  regions: z.record(IdSchema, RegionSchema),
  ruleProviders: z.record(RuleProviderKeySchema, RuleProviderSchema),
  profiles: z.record(IdSchema, z.object({ aiAllRoute: IdSchema.optional(), categoryAiRoute: IdSchema }).strict()),
  modeControl: ModeControlSchema,
  aiAllRuleset: RuleProviderKeySchema,
  categoryGeosites: z.array(z.string().min(1)).min(1),
  iniMvp: IniMvpSchema,
}).strict();
const ManifestSourceReferenceSchema = z.object({ manifestSource: IdSchema }).strict();
const ManifestSourceSchema = SourceSchema.extend({ trackingRef: z.string().min(1) }).strict();
const UpstreamSourceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  sources: z.record(IdSchema, ManifestSourceSchema),
}).strict();
const RawMihomoProjectionConfigSchema = MihomoProjectionConfigSchema.extend({
  upstreamSourceManifest: z.string().min(1).optional(),
  sources: z.record(IdSchema, z.union([SourceSchema, ManifestSourceReferenceSchema])),
}).strict();
export type MihomoProjectionConfig = z.infer<typeof MihomoProjectionConfigSchema>;

export class MihomoProjectionError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) { super(formatIssues(issues)); this.name = "MihomoProjectionError"; }
}
function issue(code: RoutingIssue["code"], path: readonly (string | number)[], message: string): RoutingIssue { return { code, path, message }; }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }

export async function loadMihomoProjectionConfig(path: string): Promise<MihomoProjectionConfig> {
  const document = YAML.parseDocument(await readFile(path, "utf8"), { uniqueKeys: true });
  if (document.errors.length > 0) throw new MihomoProjectionError(document.errors.map((error) => issue("invalid-yaml", [path], error.message)));
  const rawResult = RawMihomoProjectionConfigSchema.safeParse(document.toJS());
  if (!rawResult.success) throw new MihomoProjectionError(rawResult.error.issues.map((entry) => issue("schema", entry.path.map(String), entry.message)));
  const raw = rawResult.data;
  const referencedSources = Object.values(raw.sources).filter((source) => "manifestSource" in source);
  let manifest: z.infer<typeof UpstreamSourceManifestSchema> | undefined;
  if (referencedSources.length > 0) {
    if (raw.upstreamSourceManifest === undefined) {
      throw new MihomoProjectionError([issue("missing-reference", ["upstreamSourceManifest"], "manifest-backed sources require upstreamSourceManifest")]);
    }
    if (!validManifestPath(raw.upstreamSourceManifest)) {
      throw new MihomoProjectionError([issue("policy-invariant", ["upstreamSourceManifest"], "upstream source manifest path must be normalized and relative")]);
    }
    const manifestPath = resolve(dirname(path), raw.upstreamSourceManifest);
    let manifestValue: unknown;
    try {
      manifestValue = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      throw new MihomoProjectionError([issue("schema", ["upstreamSourceManifest"], `cannot read upstream source manifest: ${String(error)}`)]);
    }
    const manifestResult = UpstreamSourceManifestSchema.safeParse(manifestValue);
    if (!manifestResult.success) {
      throw new MihomoProjectionError(manifestResult.error.issues.map((entry) => issue("schema", ["upstreamSourceManifest", ...entry.path.map(String)], entry.message)));
    }
    manifest = manifestResult.data;
  }
  const sources = Object.fromEntries(Object.entries(raw.sources).map(([sourceId, source]) => {
    if (!("manifestSource" in source)) return [sourceId, source];
    const resolvedSource = manifest?.sources[source.manifestSource];
    if (resolvedSource === undefined) {
      throw new MihomoProjectionError([issue("missing-reference", ["sources", sourceId, "manifestSource"], `upstream source ${source.manifestSource} does not exist`)]);
    }
    return [sourceId, { label: resolvedSource.label, repository: resolvedSource.repository, revision: resolvedSource.revision, rawBaseUrl: resolvedSource.rawBaseUrl }];
  }));
  const normalized: Record<string, unknown> = { ...raw, sources };
  delete normalized.upstreamSourceManifest;
  const result = MihomoProjectionConfigSchema.safeParse(normalized);
  if (!result.success) throw new MihomoProjectionError(result.error.issues.map((entry) => issue("schema", entry.path.map(String), entry.message)));
  return result.data;
}

interface SelectGroup { readonly name: string; readonly type: "select"; readonly emptyFallback: "REJECT"; readonly proxies: readonly string[]; readonly use?: readonly string[]; readonly filter?: string; }
interface UrlTestGroup { readonly name: string; readonly type: "url-test"; readonly emptyFallback: "REJECT"; readonly use: readonly string[]; readonly filter: string; readonly url: string; readonly interval: number; readonly tolerance: number; }
type MihomoGroup = SelectGroup | UrlTestGroup;
interface MihomoRuleProvider { readonly type: "http"; readonly behavior: "classical"; readonly format: "yaml"; readonly interval: number; readonly url: string; }
interface MihomoDns {
  readonly respectRules: boolean;
  readonly defaultNameserver: readonly string[];
  readonly proxyServerNameserver: readonly string[];
  readonly nameserver: readonly string[];
  readonly nameserverPolicy: Readonly<Record<string, readonly string[]>>;
}
export interface MihomoFragmentIR {
  readonly metadata: { readonly provenance: string; readonly externalProxyProviders: readonly string[] };
  readonly groups: readonly MihomoGroup[];
  readonly ruleProviders: Readonly<Record<string, MihomoRuleProvider>>;
  readonly rules: readonly string[];
  readonly dns: MihomoDns;
}

function requiredRoute(config: RoutingConfig, routeId: string, path: readonly (string | number)[]): RouteTarget {
  const target = config.routeTargets[routeId];
  if (target === undefined) throw new MihomoProjectionError([issue("missing-reference", path, `route target ${routeId} does not exist`)]);
  return target;
}

function validRawBaseUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.search === "" && url.hash === "";
  } catch { return false; }
}

function validRelativePath(path: string): boolean {
  return validPathSegments(path, false);
}

function validManifestPath(path: string): boolean {
  return validPathSegments(path, true);
}

function validPathSegments(path: string, allowSingleParent: boolean): boolean {
  if (path.startsWith("/") || /[\\%?#]/.test(path)) return false;
  const segments = path.split("/");
  if (segments.length === 0) return false;
  const parent = allowSingleParent && segments[0] === "..";
  const body = parent ? segments.slice(1) : segments;
  return body.length > 0 && body.every((segment) => segment !== "" && segment !== "." && segment !== ".." && !segment.startsWith("."));
}

function sourceProviderUrl(source: z.infer<typeof SourceSchema>, path: string): string {
  const base = new URL(source.rawBaseUrl);
  const basePath = base.pathname.replace(/\/$/, "");
  return new URL(`${basePath}/${source.revision}/${path}`, base.origin).toString();
}

function isPinnedSourceUrl(url: string, source: z.infer<typeof SourceSchema>, path: string): boolean {
  try {
    const candidate = new URL(url);
    const base = new URL(source.rawBaseUrl);
    if (!validRawBaseUrl(source.rawBaseUrl) || candidate.protocol !== "https:" || candidate.origin !== base.origin) return false;
    if (candidate.username !== "" || candidate.password !== "" || candidate.search !== "" || candidate.hash !== "") return false;
    return candidate.pathname === new URL(sourceProviderUrl(source, path)).pathname;
  } catch { return false; }
}

function isHttpsUrl(raw: string): boolean { try { return new URL(raw).protocol === "https:"; } catch { return false; } }

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

function validateProjection(
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

type MihomoProjectionProfile = NonNullable<MihomoProjectionConfig["profiles"][string]>;

interface ValidatedProjectionContext {
  readonly config: RoutingConfig;
  readonly projection: MihomoProjectionConfig;
  readonly profileId: string;
  readonly profile: MihomoProjectionProfile;
  readonly plan: CompiledRoutingPlan;
  readonly reachableRouteIds: ReadonlySet<string>;
}

function compilerInvariant(message: string): never {
  throw new Error(`mihomo compiler invariant: ${message}`);
}

function collectReachableRouteIds(config: RoutingConfig): ReadonlySet<string> {
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

type EmittedRuleStage = Extract<
  RuleOrderingStage,
  "ownership-override" | "account-protected" | "specific-service" | "ai-all" | "category-ai"
>;

const RULE_STAGE_ORDER = {
  "ownership-override": 10,
  "account-protected": 20,
  "specific-service": 30,
  "ai-all": 40,
  "category-ai": 50,
} as const satisfies Record<EmittedRuleStage, number>;

interface RuleBundle {
  readonly stage: EmittedRuleStage;
  readonly sortKey: string;
  readonly lines: readonly string[];
}

function compareRuleBundles(left: RuleBundle, right: RuleBundle): number {
  const stageDelta = RULE_STAGE_ORDER[left.stage] - RULE_STAGE_ORDER[right.stage];
  if (stageDelta !== 0) return stageDelta;
  return compare(left.sortKey, right.sortKey);
}

function flattenRuleBundles(bundles: readonly RuleBundle[]): {
  readonly rules: readonly string[];
  readonly entries: readonly { readonly stage: EmittedRuleStage; readonly label: string }[];
} {
  const ordered = [...bundles].sort(compareRuleBundles);
  return {
    rules: ordered.flatMap((bundle) => [...bundle.lines]),
    entries: ordered.flatMap((bundle) => bundle.lines.map((label) => ({ stage: bundle.stage, label }))),
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

function compileRuleBundles(ctx: ValidatedProjectionContext): RuleBundle[] {
  const bundles: RuleBundle[] = [];
  let specificOrder = 0;
  for (const service of ctx.plan.services) {
    const canonical = ctx.config.services[service.id];
    if (canonical === undefined) continue;
    const protection = ctx.config.protectionClasses[canonical.protectionClass];
    if (protection === undefined) compilerInvariant(`service ${service.id} is missing a protection class after validation`);
    for (const endpoint of service.endpoints) {
      const line = `RULE-SET,${endpoint.ruleset},${service.selector.visibleGroup}`;
      if (isOwnershipOverrideService(ctx.config, service.id)) {
        bundles.push({ stage: "ownership-override", sortKey: line, lines: [line] });
      } else if (protection.kind === "account-protected") {
        bundles.push({ stage: "account-protected", sortKey: line, lines: [line] });
      } else {
        bundles.push({ stage: "specific-service", sortKey: String(specificOrder).padStart(8, "0"), lines: [line] });
        specificOrder += 1;
      }
    }
  }
  if (ctx.profile.aiAllRoute !== undefined) {
    const line = `RULE-SET,${ctx.projection.aiAllRuleset},${requiredRoute(ctx.config, ctx.profile.aiAllRoute, ["profiles", ctx.profileId, "aiAllRoute"]).group}`;
    bundles.push({ stage: "ai-all", sortKey: "0", lines: [line] });
  }
  for (const [index, geosite] of ctx.projection.categoryGeosites.entries()) {
    const line = `GEOSITE,${geosite},${requiredRoute(ctx.config, ctx.profile.categoryAiRoute, ["profiles", ctx.profileId, "categoryAiRoute"]).group}`;
    bundles.push({ stage: "category-ai", sortKey: String(index).padStart(8, "0"), lines: [line] });
  }
  return bundles;
}

function compileRules(ctx: ValidatedProjectionContext): readonly string[] {
  const { rules, entries } = flattenRuleBundles(compileRuleBundles(ctx));
  const ordering = validateRuleOrdering({ entries });
  if (ordering.length > 0) throw new MihomoProjectionError(ordering);
  return rules;
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

export function renderMihomoFragment(ir: MihomoFragmentIR): string {
  const document = new YAML.Document({ "proxy-groups": ir.groups.map((group) => group.type === "select" ? { name: group.name, type: group.type, "empty-fallback": group.emptyFallback, proxies: group.proxies, ...(group.use === undefined ? {} : { use: group.use, filter: group.filter }) } : { name: group.name, type: group.type, "empty-fallback": group.emptyFallback, use: group.use, filter: group.filter, url: group.url, interval: group.interval, tolerance: group.tolerance }), "rule-providers": ir.ruleProviders, dns: { "respect-rules": ir.dns.respectRules, "default-nameserver": ir.dns.defaultNameserver, "proxy-server-nameserver": ir.dns.proxyServerNameserver, nameserver: ir.dns.nameserver, "nameserver-policy": ir.dns.nameserverPolicy }, rules: ir.rules });
  document.commentBefore = `NON-STANDALONE AI ROUTING FRAGMENT\nPROVENANCE: ${ir.metadata.provenance}\nEXTERNAL PROXY PROVIDERS: ${ir.metadata.externalProxyProviders.join(", ")}\nGlobal MATCH remains owned by the Python generator.`;
  return document.toString();
}
