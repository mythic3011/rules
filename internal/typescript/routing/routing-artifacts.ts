import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";

import { compileRoutingProfile } from "./compiler.js";
import { formatIssues, type RoutingIssue } from "./issues.js";
import { compileMihomoFragment, renderMihomoFragment, type MihomoProjectionConfig } from "./mihomo-projection.js";
import type { RoutingConfig } from "./schema.js";
import type { RoutingProject } from "./project/schema.js";
import { compileControllerPlan, compileFirewallSemanticPlan, renderFirewallSemanticPlan } from "./runtime-plan.js";
import { compileIniMvpPlan } from "./ini-mvp-plan.js";

export class RoutingArtifactCheckError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) {
    super(formatIssues(issues));
    this.name = "RoutingArtifactCheckError";
  }
}

export type RoutingArtifactRole = keyof RoutingProject["artifactPaths"];

export function routingArtifactName(
  project: RoutingProject,
  role: RoutingArtifactRole,
  profile?: string,
): string {
  const selectedProfile = profile ?? project.supportedProfiles[0];
  if (selectedProfile === undefined) throw new Error("routing project has no supported profile");
  return project.artifactPaths[role].replaceAll("{profile}", selectedProfile);
}

export function routingArtifactPath(
  project: RoutingProject,
  role: RoutingArtifactRole,
  profile?: string,
): string {
  return role === "routing-schema"
    ? project.schemaOutput
    : join(project.generatedArtifactDirectory, routingArtifactName(project, role, profile));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function issue(path: readonly (string | number)[], message: string): RoutingIssue {
  return { code: "artifact-drift", path, message };
}

/** This verifier owns compiler plans and non-standalone fragments.
 * Shadow-candidate artifacts are checked by the unified routing build. */
function isRoutingArtifactName(name: string): boolean {
  return name.endsWith(".plan.json") || name.endsWith(".mihomo-fragment.yaml") || name === "controller-plan.json" || name === "firewall-semantic-plan.yaml" || name.endsWith(".ini-mvp-plan.json");
}

export function expectedRoutingArtifacts(
  config: RoutingConfig,
  projection: MihomoProjectionConfig,
  project: RoutingProject,
): ReadonlyMap<string, string> {
  const artifacts = new Map<string, string>();
  for (const profileId of Object.keys(config.accessProfiles).sort(compare)) {
    artifacts.set(routingArtifactName(project, "profile-plan", profileId), `${JSON.stringify(compileRoutingProfile(config, profileId), null, 2)}\n`);
    artifacts.set(routingArtifactName(project, "mihomo-fragment", profileId), renderMihomoFragment(compileMihomoFragment(config, projection, profileId)));
  }
  artifacts.set(routingArtifactName(project, "controller-plan"), `${JSON.stringify(compileControllerPlan(config, projection), null, 2)}\n`);
  artifacts.set(routingArtifactName(project, "firewall-semantic-plan"), renderFirewallSemanticPlan(compileFirewallSemanticPlan(config)));
  artifacts.set(routingArtifactName(project, "ini-mvp-plan"), `${JSON.stringify(compileIniMvpPlan(config, projection), null, 2)}\n`);
  return artifacts;
}

/** Read-only verifier: no artifact is created, replaced, or deleted. */
export async function checkRoutingArtifacts(
  config: RoutingConfig,
  projection: MihomoProjectionConfig,
  directory: string,
  project: RoutingProject,
): Promise<void> {
  const expected = expectedRoutingArtifacts(config, projection, project);
  const issues: RoutingIssue[] = [];
  let entries: readonly Dirent<string>[];
  try {
    entries = await readdir(directory, { withFileTypes: true, encoding: "utf8" });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      for (const name of expected.keys()) issues.push(issue([directory, name], "expected artifact is missing because the artifact directory does not exist"));
      throw new RoutingArtifactCheckError(issues);
    }
    throw error;
  }
  const inventory = new Map(entries.map((entry) => [entry.name, entry]));
  for (const [name, content] of expected) {
    const entry = inventory.get(name);
    if (entry === undefined) {
      issues.push(issue([directory, name], "expected artifact is missing"));
      continue;
    }
    if (!entry.isFile()) {
      issues.push(issue([directory, name], "expected artifact must be a regular file"));
      continue;
    }
    const actual = await readFile(join(directory, name), "utf8");
    if (actual !== content) issues.push(issue([directory, name], "artifact content differs from the deterministic compiler output"));
  }
  for (const name of [...inventory.keys()].sort(compare)) {
    if (isRoutingArtifactName(name) && !expected.has(name)) issues.push(issue([directory, name], "unexpected stale artifact is present"));
  }
  if (issues.length > 0) throw new RoutingArtifactCheckError(issues);
}
