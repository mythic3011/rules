import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

import { compileMihomoFragment, renderMihomoFragment } from "../mihomo-projection.js";
import { compileRoutingProfile } from "../compiler.js";
import { composeShadowProfile, expectedShadowArtifacts } from "../shadow-profile.js";
import { RoutingConfigSchema } from "../schema.js";
import { expectedRoutingArtifacts, routingArtifactName } from "../routing-artifacts.js";
import { type RoutingContext } from "../project/loader.js";
import {
  SemanticParityError,
  buildSemanticParityReport,
  renderSemanticParityReport,
} from "../semantic-parity.js";

export interface BuiltRoutingArtifact {
  readonly path: string;
  readonly content: string;
}

export async function buildRoutingArtifacts(
  context: RoutingContext,
): Promise<readonly BuiltRoutingArtifact[]> {
  const artifacts: BuiltRoutingArtifact[] = [];
  for (const [name, content] of expectedRoutingArtifacts(context.config, context.projection, context.project)) {
    artifacts.push({ path: join(context.project.generatedArtifactDirectory, name), content });
  }
  const shadow = await composeShadowProfile(
    context.config,
    context.projection,
    context.project.legacyRelaxedBase,
    context.parity,
    context.project.shadowTemplate,
  );
  for (const [name, content] of expectedShadowArtifacts(shadow, context.project)) {
    artifacts.push({ path: join(context.project.generatedArtifactDirectory, name), content });
  }
  const semanticParity = await buildSemanticParityReport(context.config, context.project);
  artifacts.push({
    path: join(
      context.project.generatedArtifactDirectory,
      routingArtifactName(context.project, "semantic-parity-report"),
    ),
    content: renderSemanticParityReport(semanticParity),
  });
  artifacts.push({
    path: context.project.schemaOutput,
    content: `${JSON.stringify(z.toJSONSchema(RoutingConfigSchema), null, 2)}\n`,
  });
  return artifacts.sort((left, right) => left.path.localeCompare(right.path));
}

export async function writeRoutingArtifacts(
  artifacts: readonly BuiltRoutingArtifact[],
): Promise<void> {
  for (const artifact of artifacts) {
    await mkdir(dirname(artifact.path), { recursive: true });
    await writeFile(artifact.path, artifact.content, "utf8");
  }
}

export async function checkRoutingBuild(
  artifacts: readonly BuiltRoutingArtifact[],
): Promise<void> {
  const issues: { readonly path: readonly string[]; readonly message: string }[] = [];
  for (const artifact of artifacts) {
    let actual: string;
    try {
      actual = await readFile(artifact.path, "utf8");
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        issues.push({ path: [artifact.path], message: "expected routing artifact is missing" });
        continue;
      }
      throw error;
    }
    if (actual !== artifact.content) {
      issues.push({ path: [artifact.path], message: "routing artifact content differs from deterministic build" });
    }
  }
  const generatedDirectories = new Map<string, Set<string>>();
  for (const artifact of artifacts) {
    const directory = dirname(artifact.path);
    const names = generatedDirectories.get(directory) ?? new Set<string>();
    names.add(artifact.path.slice(directory.length + 1));
    generatedDirectories.set(directory, names);
  }
  for (const [directory, expected] of generatedDirectories) {
    if (![...expected].some((name) => name.endsWith(".plan.json"))) continue;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true, encoding: "utf8" });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || expected.has(entry.name)) continue;
      if (/(?:-plan|\.plan|\.mihomo-fragment|\.full-profile-candidate|\.parity-report|semantic-parity-report)\.(?:json|yaml)$/.test(entry.name)) {
        issues.push({ path: [directory, entry.name], message: "unexpected stale artifact is present" });
      }
    }
  }
  for (const artifact of artifacts) {
    if (!artifact.path.endsWith("semantic-parity-report.json")) continue;
    try {
      const report = JSON.parse(artifact.content) as { status?: string };
      if (report.status === "fail") {
        throw new SemanticParityError([
          { code: "policy-invariant", path: ["semantic-parity"], message: "semantic parity report status is fail" },
        ]);
      }
    } catch (error: unknown) {
      if (error instanceof SemanticParityError) throw error;
      issues.push({ path: [artifact.path], message: "semantic parity report is not valid JSON" });
    }
  }
  if (issues.length > 0) {
    const error = new Error(issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
    error.name = "RoutingBuildCheckError";
    throw error;
  }
}
