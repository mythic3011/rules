import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";

import {
  MihomoProjectionConfigSchema,
  RawMihomoProjectionConfigSchema,
  UpstreamSourceManifestSchema,
  validManifestPath,
  type MihomoProjectionConfig,
} from "./schema.js";
import { MihomoProjectionError, issue } from "./types.js";

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
