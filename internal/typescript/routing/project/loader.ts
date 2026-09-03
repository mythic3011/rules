import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import YAML from "yaml";

import { formatIssues, type RoutingIssue } from "../issues.js";
import { loadRoutingConfig } from "../loader.js";
import { loadMihomoProjectionConfig, type MihomoProjectionConfig } from "../mihomo-projection.js";
import { loadShadowParityManifest, type ShadowParityManifest } from "../shadow-profile.js";
import { type RoutingConfig } from "../schema.js";
import { RoutingProjectDocumentSchema, type RoutingProject, type RoutingProjectDocument } from "./schema.js";

export const DEFAULT_ROUTING_PROJECT = resolve(import.meta.dirname, "../../../config/ai-routing/project.yaml");

export class RoutingProjectError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) {
    super(formatIssues(issues));
    this.name = "RoutingProjectError";
  }
}

function projectIssues(path: string, message: string): RoutingProjectError {
  return new RoutingProjectError([{ code: "schema", path: [path], message }]);
}

export async function loadRoutingProject(
  path: string = DEFAULT_ROUTING_PROJECT,
): Promise<RoutingProject> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error: unknown) {
    throw projectIssues(path, `cannot read routing project: ${String(error)}`);
  }
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new RoutingProjectError(document.errors.map((error) => ({
      code: "invalid-yaml",
      path: [path],
      message: error.message,
    })));
  }
  const parsed = RoutingProjectDocumentSchema.safeParse(document.toJS());
  if (!parsed.success) {
    throw new RoutingProjectError(parsed.error.issues.map((error) => ({
      code: "schema",
      path: error.path.map(String),
      message: error.message,
    })));
  }
  const projectDirectory = dirname(resolve(path));
  return resolveProjectPaths(parsed.data, resolve(path), projectDirectory);
}

function resolveProjectPaths(
  document: RoutingProjectDocument,
  projectFile: string,
  projectDirectory: string,
): RoutingProject {
  const resolvePath = (value: string): string => resolve(projectDirectory, value);
  return {
    ...document,
    projectFile,
    projectDirectory,
    canonicalManifest: resolvePath(document.canonicalManifest),
    serviceCatalog: resolvePath(document.serviceCatalog),
    mihomoProjection: resolvePath(document.mihomoProjection),
    shadowParityManifest: resolvePath(document.shadowParityManifest),
    legacyRelaxedBase: resolvePath(document.legacyRelaxedBase),
    shadowTemplate: resolvePath(document.shadowTemplate),
    generatedArtifactDirectory: resolvePath(document.generatedArtifactDirectory),
    schemaOutput: resolvePath(document.schemaOutput),
  };
}

export interface RoutingContext {
  readonly project: RoutingProject;
  readonly config: RoutingConfig;
  readonly projection: MihomoProjectionConfig;
  readonly parity: ShadowParityManifest;
}

export async function loadRoutingContext(
  projectPath: string = DEFAULT_ROUTING_PROJECT,
): Promise<RoutingContext> {
  const project = await loadRoutingProject(projectPath);
  const [config, projection, parity] = await Promise.all([
    loadRoutingConfig(project.canonicalManifest, project.serviceCatalog),
    loadMihomoProjectionConfig(project.mihomoProjection),
    loadShadowParityManifest(project.shadowParityManifest),
  ]);
  const actualProfiles = Object.keys(config.accessProfiles).sort();
  const expectedProfiles = [...project.supportedProfiles].sort();
  if (JSON.stringify(actualProfiles) !== JSON.stringify(expectedProfiles)) {
    throw projectIssues(
      project.projectFile,
      `supportedProfiles does not match canonical access profiles (${actualProfiles.join(", ")})`,
    );
  }
  return { project, config, projection, parity };
}
