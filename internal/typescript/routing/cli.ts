import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

import { formatIssues } from "./issues.js";
import { compileRoutingProfile, RoutingCompileError } from "./compiler.js";
import { compileMihomoFragment, loadMihomoProjectionConfig, MihomoProjectionError, renderMihomoFragment } from "./mihomo-projection.js";
import { checkRoutingArtifacts, expectedRoutingArtifacts, RoutingArtifactCheckError } from "./routing-artifacts.js";
import { checkShadowArtifacts, composeShadowProfile, expectedShadowArtifacts, loadShadowParityManifest, ShadowProfileError } from "./shadow-profile.js";
import { loadRoutingConfig, RoutingConfigLoadError } from "./loader.js";
import { RoutingConfigSchema } from "./schema.js";
import { validateRoutingSemantics } from "./semantic-validator.js";
import { materializePrivateProfile, PrivateMaterializerError, sha256Utf8 } from "./private-materializer.js";
import { loadRouterLocalJson } from "./router-local.js";
import { compileControllerPlan } from "./runtime-plan.js";

function usage(): string {
  return "Usage: tsx internal/typescript/routing/cli.ts ... | materialize-private <manifest-directory> <projection-file> <candidate-file> <deployment-json> <approved-egress-json> <private-output>";
}

async function main(args: readonly string[]): Promise<void> {
  const [command, value, third, fourth, fifth] = args;
  if (command === "export-schema" && value !== undefined) {
    await mkdir(dirname(value), { recursive: true });
    await writeFile(value, `${JSON.stringify(z.toJSONSchema(RoutingConfigSchema), null, 2)}\n`, "utf8");
    return;
  }
  if (command === "validate" && value !== undefined) {
    const config = await loadRoutingConfig(value);
    const issues = validateRoutingSemantics(config);
    if (issues.length > 0) {
      throw new Error(formatIssues(issues));
    }
    process.stdout.write(`Routing configuration is valid: ${value}\n`);
    return;
  }
  if (command === "export-plan" && value !== undefined && third !== undefined && fourth !== undefined) {
    const config = await loadRoutingConfig(value);
    const plan = compileRoutingProfile(config, third, fifth);
    await mkdir(dirname(fourth), { recursive: true });
    await writeFile(fourth, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    return;
  }
  if (command === "export-mihomo-fragment" && value !== undefined && third !== undefined && fourth !== undefined && fifth !== undefined) {
    const config = await loadRoutingConfig(value);
    const projection = await loadMihomoProjectionConfig(third);
    const fragment = renderMihomoFragment(compileMihomoFragment(config, projection, fourth));
    await mkdir(dirname(fifth), { recursive: true });
    await writeFile(fifth, fragment, "utf8");
    return;
  }
  if (command === "export-routing-artifacts" && value !== undefined && third !== undefined && fourth !== undefined) {
    const config = await loadRoutingConfig(value);
    const projection = await loadMihomoProjectionConfig(third);
    await mkdir(fourth, { recursive: true });
    for (const [name, content] of expectedRoutingArtifacts(config, projection)) await writeFile(join(fourth, name), content, "utf8");
    return;
  }
  if (command === "check-routing-artifacts" && value !== undefined && third !== undefined && fourth !== undefined) {
    const config = await loadRoutingConfig(value);
    const projection = await loadMihomoProjectionConfig(third);
    await checkRoutingArtifacts(config, projection, fourth);
    return;
  }
  if (command === "materialize-private" && value !== undefined && third !== undefined && fourth !== undefined && fifth !== undefined) {
    const [egressPath, outputPath] = args.slice(5);
    if (egressPath === undefined || outputPath === undefined) throw new Error(usage());
    const config = await loadRoutingConfig(value);
    const projection = await loadMihomoProjectionConfig(third);
    const repositoryRoot = resolve(process.cwd());
    const artifactDirectory = join(repositoryRoot, "internal", "generated", "ai-routing");
    const canonicalCandidate = join(artifactDirectory, "hk.full-profile-candidate.yaml");
    if (resolve(fourth) !== canonicalCandidate) {
      throw new PrivateMaterializerError([{ code: "policy-invariant", path: ["candidate"], message: "materialization accepts only the canonical HK shadow candidate path" }]);
    }
    const parity = await loadShadowParityManifest(join(repositoryRoot, "internal", "config", "ai-routing", "projections", "parity.yaml"));
    const shadow = await composeShadowProfile(config, projection, join(repositoryRoot, "cfg", "yaml", "Custom_Clash_AI.yaml"), parity, join(repositoryRoot, "internal", "templates", "ai-routing", "full-relaxed-shadow.yaml.tpl"));
    await checkShadowArtifacts(artifactDirectory, expectedShadowArtifacts(shadow));
    const report = await materializePrivateProfile(
      fourth,
      outputPath,
      compileControllerPlan(config, projection),
      await loadRouterLocalJson(fifth),
      await loadRouterLocalJson(egressPath),
      { allowedOutputRoot: join(repositoryRoot, "local", "ai-routing"), trustedBaseRoot: repositoryRoot, expectedCandidateSha256: sha256Utf8(shadow.candidateYaml) },
    );
    process.stdout.write(`Private materialization completed: ${report.changedGroups.length} protected group(s); startup gate still required.\n`);
    return;
  }
  if ((command === "export-shadow-profile" || command === "check-shadow-profile") && value !== undefined && third !== undefined && fourth !== undefined && fifth !== undefined) {
    const [templatePath, outputDirectory] = args.slice(5);
    if (templatePath === undefined || outputDirectory === undefined) throw new Error(usage());
    const config = await loadRoutingConfig(value);
    const projection = await loadMihomoProjectionConfig(third);
    const parity = await loadShadowParityManifest(fifth);
    const result = await composeShadowProfile(config, projection, fourth, parity, templatePath);
    const artifacts = expectedShadowArtifacts(result);
    if (command === "export-shadow-profile") {
      await mkdir(outputDirectory, { recursive: true });
      for (const [name, content] of artifacts) await writeFile(join(outputDirectory, name), content, "utf8");
    } else await checkShadowArtifacts(outputDirectory, artifacts);
    return;
  }
  throw new Error(usage());
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof RoutingConfigLoadError || error instanceof RoutingCompileError || error instanceof MihomoProjectionError || error instanceof RoutingArtifactCheckError || error instanceof ShadowProfileError || error instanceof PrivateMaterializerError) {
    process.stderr.write(`${formatIssues(error.issues)}\n`);
  } else if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("Unknown routing validation error\n");
  }
  process.exitCode = 1;
});
