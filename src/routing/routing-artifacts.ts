import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";

import { compileRoutingProfile } from "./compiler.js";
import { formatIssues, type RoutingIssue } from "./issues.js";
import { compileMihomoFragment, renderMihomoFragment, type MihomoProjectionConfig } from "./mihomo-projection.js";
import type { RoutingConfig } from "./schema.js";
import { compileControllerPlan, compileFirewallSemanticPlan, renderFirewallSemanticPlan } from "./runtime-plan.js";
import { compileIniMvpPlan } from "./ini-mvp-plan.js";

export class RoutingArtifactCheckError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) {
    super(formatIssues(issues));
    this.name = "RoutingArtifactCheckError";
  }
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function issue(path: readonly (string | number)[], message: string): RoutingIssue {
  return { code: "artifact-drift", path, message };
}

/** This verifier owns only compiler plans and non-standalone fragments.
 * Shadow-candidate artifacts are owned by check:shadow-profile. */
function isRoutingArtifactName(name: string): boolean {
  return name.endsWith(".plan.json") || name.endsWith(".mihomo-fragment.yaml") || name === "controller-plan.json" || name === "firewall-semantic-plan.yaml" || name === "hk.ini-mvp-plan.json";
}

export function expectedRoutingArtifacts(
  config: RoutingConfig,
  projection: MihomoProjectionConfig,
): ReadonlyMap<string, string> {
  const artifacts = new Map<string, string>();
  for (const profileId of Object.keys(config.accessProfiles).sort(compare)) {
    artifacts.set(`${profileId}.plan.json`, `${JSON.stringify(compileRoutingProfile(config, profileId), null, 2)}\n`);
    artifacts.set(`${profileId}.mihomo-fragment.yaml`, renderMihomoFragment(compileMihomoFragment(config, projection, profileId)));
  }
  artifacts.set("controller-plan.json", `${JSON.stringify(compileControllerPlan(config, projection), null, 2)}\n`);
  artifacts.set("firewall-semantic-plan.yaml", renderFirewallSemanticPlan(compileFirewallSemanticPlan(config)));
  artifacts.set("hk.ini-mvp-plan.json", `${JSON.stringify(compileIniMvpPlan(config, projection), null, 2)}\n`);
  return artifacts;
}

/** Read-only verifier: no artifact is created, replaced, or deleted. */
export async function checkRoutingArtifacts(
  config: RoutingConfig,
  projection: MihomoProjectionConfig,
  directory: string,
): Promise<void> {
  const expected = expectedRoutingArtifacts(config, projection);
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
