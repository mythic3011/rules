import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { loadRoutingConfigFromFiles } from "#routing/loader.js";
import { loadShadowParityManifest, composeShadowProfile, type ShadowParityManifest } from "#routing/shadow-profile.js";
import {
  routingArtifactName,
  routingArtifactPath,
  type RoutingArtifactRole,
} from "#routing/routing-artifacts.js";
import {
  loadRoutingContext,
  type RoutingContext,
} from "#routing/project/loader.js";

import { INVALID_DIRECTORY } from "#routing-test/support/paths.js";
import { withTempDirectory } from "#routing-test/support/temp-dir.js";

export type CanonicalRoutingInputs = Pick<RoutingContext, "project" | "config" | "projection">;

export interface ShadowInputs extends CanonicalRoutingInputs {
  readonly parity: ShadowParityManifest;
}

export async function loadCanonicalInputs(): Promise<CanonicalRoutingInputs> {
  const context = await loadRoutingContext();
  return context;
}

export const loadCanonicalRoutingInputs = loadCanonicalInputs;

export function canonicalArtifactPath(
  project: CanonicalRoutingInputs["project"],
  role: RoutingArtifactRole,
  profile?: string,
): string {
  return routingArtifactPath(project, role, profile);
}

export function canonicalArtifactName(
  project: CanonicalRoutingInputs["project"],
  role: RoutingArtifactRole,
  profile?: string,
): string {
  return routingArtifactName(project, role, profile);
}

export async function shadowInputs(): Promise<ShadowInputs> {
  const { project, config, projection } = await loadCanonicalInputs();
  return {
    project,
    config,
    projection,
    parity: await loadShadowParityManifest(project.shadowParityManifest),
  };
}

export async function composeWithBase(
  contents: string,
  mutateParity?: (value: Record<string, unknown>) => void,
): Promise<void> {
  await withTempDirectory("routing-shadow-base-", async (directory) => {
    const base = join(directory, "base.yaml");
    await writeFile(base, contents, "utf8");
    const { project, config, projection, parity } = await shadowInputs();
    const mutable = structuredClone(parity) as unknown as Record<
      string,
      unknown
    >;
    mutateParity?.(mutable);
    await composeShadowProfile(
      config,
      projection,
      base,
      mutable as typeof parity,
      project.shadowTemplate,
    );
  });
}

export async function loadInvalid(
  name: string,
): Promise<ReturnType<typeof loadRoutingConfigFromFiles>> {
  return loadRoutingConfigFromFiles([
    join(INVALID_DIRECTORY, `${name}.yaml`),
  ]);
}
