import { spawn } from "node:child_process";

import {
  CONTROLLER_SCRIPT,
  ROOT,
  ROUTING_CLI,
} from "./paths.js";

export interface ChildResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessRunOptions {
  readonly cwd?: string;
  readonly environment?: Readonly<Record<string, string>>;
}

export function runProcess(
  options: {
    readonly command: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string>>;
  },
): Promise<ChildResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(options.command, [...(options.args ?? [])], {
      cwd: options.cwd,
      env: options.env === undefined
        ? undefined
        : { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", rejectPromise);
    child.once("close", (exitCode) => {
      resolvePromise({ exitCode, stdout, stderr });
    });
  });
}

export function runRoutingCli(manifestDirectory: string): Promise<ChildResult> {
  return runProcess({
    command: process.execPath,
    args: ["--import", "tsx", ROUTING_CLI, "validate", manifestDirectory],
    cwd: ROOT,
  });
}

export function runShellAction(
  script: string,
  action: "--dry-run" | "--reconcile",
  environment: Readonly<Record<string, string>>,
): Promise<ChildResult> {
  return runProcess({
    command: "sh",
    args: [script, action],
    cwd: ROOT,
    env: environment,
  });
}

export function runShellPreview(
  script: string,
  environment: Readonly<Record<string, string>>,
): Promise<ChildResult> {
  return runShellAction(script, "--dry-run", environment);
}

export function runPrivateMaterializeCli(
  deploymentPath: string,
  egressPath: string,
  outputPath: string,
): Promise<ChildResult> {
  return runProcess({
    command: process.execPath,
    args: [
      "--import",
      "tsx",
      ROUTING_CLI,
      "materialize-private",
      deploymentPath,
      egressPath,
      outputPath,
    ],
    cwd: ROOT,
  });
}
