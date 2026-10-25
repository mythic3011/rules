import { z } from "zod";

import { IdSchema } from "../schema.js";

const RuleProviderKeySchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/);
export const SourceSchema = z.object({
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
export const UpstreamSourceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  sources: z.record(IdSchema, ManifestSourceSchema),
}).strict();
export const RawMihomoProjectionConfigSchema = MihomoProjectionConfigSchema.extend({
  upstreamSourceManifest: z.string().min(1).optional(),
  sources: z.record(IdSchema, z.union([SourceSchema, ManifestSourceReferenceSchema])),
}).strict();
export type MihomoProjectionConfig = z.infer<typeof MihomoProjectionConfigSchema>;
export type ProjectionSource = z.infer<typeof SourceSchema>;

export function validRawBaseUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.search === "" && url.hash === "";
  } catch { return false; }
}

export function validRelativePath(path: string): boolean {
  return validPathSegments(path, false);
}

export function validManifestPath(path: string): boolean {
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

export function sourceProviderUrl(source: ProjectionSource, path: string): string {
  const base = new URL(source.rawBaseUrl);
  const basePath = base.pathname.replace(/\/$/, "");
  return new URL(`${basePath}/${source.revision}/${path}`, base.origin).toString();
}

export function isPinnedSourceUrl(url: string, source: ProjectionSource, path: string): boolean {
  try {
    const candidate = new URL(url);
    const base = new URL(source.rawBaseUrl);
    if (!validRawBaseUrl(source.rawBaseUrl) || candidate.protocol !== "https:" || candidate.origin !== base.origin) return false;
    if (candidate.username !== "" || candidate.password !== "" || candidate.search !== "" || candidate.hash !== "") return false;
    return candidate.pathname === new URL(sourceProviderUrl(source, path)).pathname;
  } catch { return false; }
}

export function isHttpsUrl(raw: string): boolean { try { return new URL(raw).protocol === "https:"; } catch { return false; } }
