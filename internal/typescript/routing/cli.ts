import { join } from "node:path";

import { formatIssues } from "./issues.js";
import {
  buildRoutingArtifacts,
  checkRoutingBuild,
  writeRoutingArtifacts,
} from "./artifacts/build.js";
import { RoutingCompileError } from "./compiler.js";
import { MihomoProjectionError } from "./mihomo-projection.js";
import { loadRouterLocalJson } from "./router-local.js";
import {
  PrivateMaterializerError,
  materializePrivateProfile,
  sha256Utf8,
} from "./private-materializer.js";
import {
  DEFAULT_ROUTING_PROJECT,
  loadRoutingContext,
  RoutingProjectError,
} from "./project/loader.js";
import { loadRoutingConfig, RoutingConfigLoadError } from "./loader.js";
import { validateRoutingSemantics } from "./semantic-validator.js";
import { compileControllerPlan } from "./runtime-plan.js";

function usage(): string {
  return [
    "Usage: routing <validate|generate|check> [--config project.yaml]",
    "       routing materialize-private [--config project.yaml] <deployment.json> <approved-egress.json> <output.yaml>",
  ].join("\n");
}

interface CommandLine {
  readonly command: string | undefined;
  readonly configPath: string;
  readonly positional: readonly string[];
}

function parseCommandLine(args: readonly string[]): CommandLine {
  let configPath = DEFAULT_ROUTING_PROJECT;
  let command: string | undefined;
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--config") {
      const value = args[index + 1];
      if (value === undefined) throw new Error(usage());
      configPath = value;
      index += 1;
    } else if (argument?.startsWith("--")) {
      throw new Error(usage());
    } else if (command === undefined) {
      if (argument === undefined) throw new Error(usage());
      command = argument;
    } else {
      if (argument === undefined) throw new Error(usage());
      positional.push(argument);
    }
  }
  return { command, configPath, positional };
}

async function runMaterializePrivate(
  configPath: string,
  positional: readonly string[],
): Promise<void> {
  const [deploymentPath, egressPath, outputPath] = positional;
  if (
    deploymentPath === undefined ||
    egressPath === undefined ||
    outputPath === undefined ||
    positional.length !== 3
  ) {
    throw new Error(usage());
  }
  const context = await loadRoutingContext(configPath);
  const artifacts = await buildRoutingArtifacts(context);
  const candidate = artifacts.find((artifact) =>
    artifact.path.endsWith(".full-profile-candidate.yaml"),
  );
  if (candidate === undefined) {
    throw new PrivateMaterializerError([
      {
        code: "missing-reference",
        path: ["project", "generatedArtifactDirectory"],
        message: "routing project has no shadow candidate artifact",
      },
    ]);
  }
  const deployment = await loadRouterLocalJson(deploymentPath);
  const egress = await loadRouterLocalJson(egressPath);
  const outputRoot = join(context.project.projectDirectory, "local", "ai-routing");
  const report = await materializePrivateProfile(
    candidate.path,
    outputPath,
    compileControllerPlan(context.config, context.projection),
    deployment,
    egress,
    {
      allowedOutputRoot: outputRoot,
      trustedBaseRoot: context.project.projectDirectory,
      expectedCandidateSha256: sha256Utf8(candidate.content),
    },
  );
  process.stdout.write(
    `Private materialization completed: ${report.changedGroups.length} protected group(s); startup gate still required.\n`,
  );
}

async function main(args: readonly string[]): Promise<void> {
  const { command, configPath, positional } = parseCommandLine(args);
  if (command === "materialize-private") {
    await runMaterializePrivate(configPath, positional);
    return;
  }
  if (command !== "validate" && command !== "generate" && command !== "check") {
    throw new Error(usage());
  }
  if (command === "validate" && positional.length === 1) {
    const manifestDirectory = positional[0];
    if (manifestDirectory === undefined) throw new Error(usage());
    const config = await loadRoutingConfig(manifestDirectory);
    const issues = validateRoutingSemantics(config);
    if (issues.length > 0) throw new Error(formatIssues(issues));
    process.stdout.write(`Routing configuration is valid: ${positional[0]}\n`);
    return;
  }
  if (positional.length > 0) throw new Error(usage());

  const context = await loadRoutingContext(configPath);
  if (command === "validate") {
    const issues = validateRoutingSemantics(context.config);
    if (issues.length > 0) throw new Error(formatIssues(issues));
    process.stdout.write(
      `Routing configuration is valid: ${context.project.projectFile}\n`,
    );
    return;
  }
  const artifacts = await buildRoutingArtifacts(context);
  if (command === "generate") {
    await writeRoutingArtifacts(artifacts);
    process.stdout.write(
      `Routing artifacts generated from ${context.project.projectFile}\n`,
    );
    return;
  }
  await checkRoutingBuild(artifacts);
  process.stdout.write(
    `Routing artifacts are current for ${context.project.projectFile}\n`,
  );
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (
    error instanceof RoutingConfigLoadError ||
    error instanceof RoutingCompileError ||
    error instanceof MihomoProjectionError ||
    error instanceof PrivateMaterializerError ||
    error instanceof RoutingProjectError
  ) {
    process.stderr.write(`${formatIssues(error.issues)}\n`);
  } else if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("Unknown routing validation error\n");
  }
  process.exitCode = 1;
});
