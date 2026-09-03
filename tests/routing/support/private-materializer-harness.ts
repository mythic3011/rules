import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import YAML from "yaml";

import {
  compileControllerPlan,
  type ControllerPlan,
} from "#routing/runtime-plan.js";
import {
  materializePrivateProfile,
  sha256Utf8,
  type PrivateMaterializeOptions,
  type PrivateMaterializeReport,
} from "#routing/private-materializer.js";

import {
  canonicalArtifactPath,
  loadCanonicalInputs,
} from "./canonical-inputs.js";
import {
  deploymentFixture,
  egressFixture,
} from "./fixtures.js";
import { withTempDirectory } from "./temp-dir.js";

export async function privateMaterializeOptions(
  allowedOutputRoot: string,
  canonicalCandidate: string,
): Promise<PrivateMaterializeOptions> {
  return {
    allowedOutputRoot,
    trustedBaseRoot: dirname(dirname(allowedOutputRoot)),
    expectedCandidateSha256: sha256Utf8(await readFile(canonicalCandidate)),
  };
}

export interface PrivateMaterializerHarness {
  readonly directory: string;
  readonly local: string;
  readonly secret: string;
  readonly source: string;
  readonly candidate: string;
  readonly output: string;
  readonly plan: ControllerPlan;
  readonly deployment: Record<string, unknown>;
  readonly egress: Record<string, unknown>;
  readonly options: PrivateMaterializeOptions;
  writeCandidate(value: unknown): Promise<void>;
  copyCanonicalCandidate(): Promise<void>;
  materialize(
    candidatePath?: string,
    outputPath?: string,
    deploymentValue?: unknown,
    egressValue?: unknown,
  ): Promise<PrivateMaterializeReport>;
}

export interface PrivateMaterializerHarnessOptions {
  readonly prefix?: string;
  readonly secretValue?: string;
  readonly source?: string;
  readonly outputName?: string;
}

export async function withPrivateMaterializerHarness<T>(
  callback: (harness: PrivateMaterializerHarness) => Promise<T>,
  options: PrivateMaterializerHarnessOptions = {},
): Promise<T> {
  const {
    prefix = "private-materializer-",
    secretValue = "secret",
    source,
    outputName = "out.yaml",
  } = options;
  return withTempDirectory(prefix, async (directory) => {
    const local = join(directory, "local", "ai-routing");
    await mkdir(local, { recursive: true });
    await chmod(local, 0o700);
    const secret = join(directory, "secret");
    await writeFile(secret, secretValue, "utf8");
    await chmod(secret, 0o600);

    const { project, config, projection } = await loadCanonicalInputs();
    const canonicalSource = source ?? canonicalArtifactPath(project, "shadow-candidate");
    const plan = compileControllerPlan(config, projection);
    const optionsForMaterializer = await privateMaterializeOptions(local, canonicalSource);
    const deployment = {
      ...deploymentFixture({ policyVersion: plan.policyVersion }),
      controller: {
        url: "http://127.0.0.1:9090",
        secretFile: secret,
      },
    };
    const egress = egressFixture({ policyVersion: plan.policyVersion });
    const candidate = join(directory, "candidate.yaml");
    const output = join(local, outputName);

    const harness: PrivateMaterializerHarness = {
      directory,
      local,
      secret,
      source: canonicalSource,
      candidate,
      output,
      plan,
      deployment,
      egress,
      options: optionsForMaterializer,
      async writeCandidate(value: unknown): Promise<void> {
        await writeFile(candidate, YAML.stringify(value), "utf8");
      },
      async copyCanonicalCandidate(): Promise<void> {
        await writeFile(candidate, await readFile(canonicalSource));
      },
      async materialize(
        candidatePath = candidate,
        outputPath = output,
        deploymentValue = deployment,
        egressValue = egress,
      ): Promise<PrivateMaterializeReport> {
        return materializePrivateProfile(
          candidatePath,
          outputPath,
          plan,
          deploymentValue,
          egressValue,
          optionsForMaterializer,
        );
      },
    };
    await harness.copyCanonicalCandidate();
    return callback(harness);
  });
}
