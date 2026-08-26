import { constants } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import YAML from "yaml";

import { formatIssues, type RoutingIssue } from "./issues.js";
import { ApprovedEgressSchema, RouterDeploymentSchema, type ApprovedEgress, type RouterDeployment } from "./router-local.js";
import type { ControllerPlan } from "./runtime-plan.js";

export class PrivateMaterializerError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) { super(formatIssues(issues)); this.name = "PrivateMaterializerError"; }
}

export interface PrivateMaterializeOptions {
  /** Explicit, router-local-only authority boundary. The output never chooses it from its own path. */
  readonly allowedOutputRoot: string;
  /** Immutable local base from which every allowed-root path component is checked before creation. */
  readonly trustedBaseRoot: string;
  /** SHA-256 of an independently recomputed canonical shadow candidate. */
  readonly expectedCandidateSha256: string;
}

export interface PrivateMaterializeReport {
  readonly changedGroups: readonly string[];
  readonly controllerChanged: true;
  readonly startupGate: "still-required";
}

function issue(path: readonly (string | number)[], message: string): RoutingIssue { return { code: "policy-invariant", path, message }; }
function escapeRegexLiteral(value: string): string { return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"); }
function safeNode(value: string): boolean { return !/[\u0000-\u001F\u007F]/.test(value) && !/^(DIRECT|REJECT|COMPATIBLE)$/i.test(value) && !/(auto|fallback|url-test|load-balance)/i.test(value); }
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export function sha256Utf8(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isOwnedByCurrentUser(owner: number): boolean {
  const current = process.getuid?.();
  return current === undefined || current === owner;
}

async function requireOwnedDirectory(path: string, label: readonly (string | number)[]): Promise<void> {
  let metadata;
  try { metadata = await lstat(path); } catch { throw new PrivateMaterializerError([issue(label, "private directory is unavailable")]); }
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || !isOwnedByCurrentUser(metadata.uid)) {
    throw new PrivateMaterializerError([issue(label, "private directory must be owned by the current user and not a symlink")]);
  }
}

async function requireSecureDirectory(path: string, label: readonly (string | number)[]): Promise<void> {
  await requireOwnedDirectory(path, label);
  const metadata = await lstat(path);
  if ((metadata.mode & 0o077) !== 0) throw new PrivateMaterializerError([issue(label, "private directory must be owner-only")]);
}

async function requireTrustedBaseDirectory(path: string): Promise<void> {
  let metadata;
  try { metadata = await lstat(path); } catch { throw new PrivateMaterializerError([issue(["trustedBaseRoot"], "trusted base root is unavailable")]); }
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || !isOwnedByCurrentUser(metadata.uid) || (metadata.mode & 0o022) !== 0) {
    throw new PrivateMaterializerError([issue(["trustedBaseRoot"], "trusted base root must be current-user owned, non-writable by others, and not a symlink")]);
  }
}

function strictChildPath(root: string, output: string): string {
  const relation = relative(root, output);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new PrivateMaterializerError([issue(["outputPath"], "private output must be a descendant of the explicit allowed output root")]);
  }
  return relation;
}

async function preparePrivateOutputRoot(allowedOutputRoot: string, trustedBaseRoot: string, outputPath: string): Promise<void> {
  const trustedBase = resolve(trustedBaseRoot);
  const root = resolve(allowedOutputRoot);
  const output = resolve(outputPath);
  const rootRelation = strictChildPath(trustedBase, root);
  const relation = strictChildPath(root, output);
  await requireTrustedBaseDirectory(trustedBase);
  let rootCurrent = trustedBase;
  for (const segment of rootRelation.split("/")) {
    rootCurrent = join(rootCurrent, segment);
    try { await mkdir(rootCurrent, { mode: 0o700 }); } catch (error: unknown) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw new PrivateMaterializerError([issue(["allowedOutputRoot"], "private output root cannot be created")]);
      }
    }
    await requireOwnedDirectory(rootCurrent, ["allowedOutputRoot"]);
    try { await chmod(rootCurrent, 0o700); } catch { throw new PrivateMaterializerError([issue(["allowedOutputRoot"], "private output root cannot be secured")]); }
    await requireSecureDirectory(rootCurrent, ["allowedOutputRoot"]);
  }
  await requireOwnedDirectory(root, ["allowedOutputRoot"]);
  try { await chmod(root, 0o700); } catch { throw new PrivateMaterializerError([issue(["allowedOutputRoot"], "private output root cannot be secured")]); }
  await requireSecureDirectory(root, ["allowedOutputRoot"]);

  const outputParent = dirname(output);
  const parentRelation = dirname(relation);
  let current = root;
  if (parentRelation !== ".") {
    for (const segment of parentRelation.split("/")) {
      current = join(current, segment);
      try { await mkdir(current, { mode: 0o700 }); } catch (error: unknown) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
          throw new PrivateMaterializerError([issue(["outputPath"], "private output parent cannot be created")]);
        }
      }
      await requireOwnedDirectory(current, ["outputPath"]);
      try { await chmod(current, 0o700); } catch { throw new PrivateMaterializerError([issue(["outputPath"], "private output parent cannot be secured")]); }
      await requireSecureDirectory(current, ["outputPath"]);
    }
  }
  let canonicalRoot: string;
  let canonicalParent: string;
  let canonicalBase: string;
  try { canonicalBase = await realpath(trustedBase); canonicalRoot = await realpath(root); canonicalParent = await realpath(outputParent); } catch { throw new PrivateMaterializerError([issue(["outputPath"], "private output path cannot be resolved")]); }
  strictChildPath(canonicalBase, canonicalRoot);
  strictChildPath(canonicalRoot, join(canonicalParent, "candidate.yaml"));
}

async function readOwnerOnlySecret(path: string): Promise<string> {
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new PrivateMaterializerError([issue(["deployment", "controller", "secretFile"], "secure no-follow secret reads are unavailable on this platform")]);
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isFile() || !isOwnedByCurrentUser(metadata.uid) || (metadata.mode & 0o077) !== 0) throw new Error("unsafe secret metadata");
    const secret = await handle.readFile({ encoding: "utf8" });
    if (secret.length === 0 || secret.length > 4096 || /[\r\n]/.test(secret) || /^EXAMPLE/i.test(secret)) throw new Error("unsafe secret content");
    return secret;
  } catch {
    throw new PrivateMaterializerError([issue(["deployment", "controller", "secretFile"], "secret file is unavailable or has unsafe metadata")]);
  } finally {
    await handle?.close();
  }
}

export async function materializePrivateProfile(
  candidatePath: string,
  outputPath: string,
  plan: ControllerPlan,
  deploymentValue: unknown,
  egressValue: unknown,
  options: PrivateMaterializeOptions,
): Promise<PrivateMaterializeReport> {
  let deployment: RouterDeployment;
  let egress: ApprovedEgress;
  try { deployment = RouterDeploymentSchema.parse(deploymentValue) as RouterDeployment; egress = ApprovedEgressSchema.parse(egressValue) as ApprovedEgress; }
  catch { throw new PrivateMaterializerError([issue(["local"], "router-local input has invalid shape")]); }
  if (!/^[0-9a-f]{64}$/i.test(options.expectedCandidateSha256)) throw new PrivateMaterializerError([issue(["candidate"], "canonical candidate digest is invalid")]);
  if (deployment.mode !== "deployment" || egress.mode !== "deployment" || deployment.policyVersion !== plan.policyVersion || egress.policyVersion !== plan.policyVersion) {
    throw new PrivateMaterializerError([issue(["local"], "materialization requires non-example local documents matching the controller policy")]);
  }
  if (resolve(candidatePath) === resolve(outputPath)) throw new PrivateMaterializerError([issue(["outputPath"], "candidate and private output must differ")]);

  let candidateBytes: Uint8Array;
  let document: Record<string, unknown>;
  try {
    candidateBytes = await readFile(candidatePath);
    if (sha256Utf8(candidateBytes) !== options.expectedCandidateSha256.toLowerCase()) throw new Error("candidate digest mismatch");
    const parsed = YAML.parse(new TextDecoder().decode(candidateBytes));
    if (!isObject(parsed)) throw new Error("invalid root");
    document = parsed;
  } catch {
    throw new PrivateMaterializerError([issue(["candidate"], "candidate is not the independently verified canonical shadow artifact")]);
  }
  await preparePrivateOutputRoot(options.allowedOutputRoot, options.trustedBaseRoot, outputPath);
  const secret = await readOwnerOnlySecret(deployment.controller.secretFile);

  const groups = document["proxy-groups"];
  const providers = document["proxy-providers"];
  if (!Array.isArray(groups) || !isObject(providers)) throw new PrivateMaterializerError([issue(["candidate"], "canonical candidate lacks proxy groups or provider provenance")]);
  const changed: string[] = [];
  for (const account of plan.accountProtected) {
    const local = egress.services[account.serviceId];
    const matches = groups.filter((value): value is Record<string, unknown> => isObject(value) && value.name === account.visibleGroup);
    const group = matches[0];
    if (local === undefined || group === undefined || matches.length !== 1) throw new PrivateMaterializerError([issue(["account", account.serviceId], "candidate account group or local binding is absent or ambiguous")]);
    const baseKeys = Object.keys(group).sort();
    if (JSON.stringify(baseKeys) !== JSON.stringify(["empty-fallback", "name", "proxies", "type"]) || JSON.stringify(group.proxies) !== JSON.stringify(["REJECT"]) || group.type !== "select" || group["empty-fallback"] !== "REJECT") {
      throw new PrivateMaterializerError([issue(["proxy-groups", account.visibleGroup], "public account group must retain exact locked REJECT-only base shape")]);
    }
    const ids = local.bindings.map((binding) => binding.approvedId).sort();
    if (JSON.stringify(ids) !== JSON.stringify([...account.canonicalApprovedNodeIds].sort())) throw new PrivateMaterializerError([issue(["account", account.serviceId], "local binding IDs do not exactly match canonical approved IDs")]);
    if (local.bindings.some((binding) => {
      const provider = providers[binding.provider];
      return !account.canonicalApprovedBindings.some((expected) => expected.approvedId === binding.approvedId && expected.provider === binding.provider) || !isObject(provider) || provider.type !== "http" || !safeNode(binding.node) || /^EXAMPLE/i.test(binding.node);
    })) {
      throw new PrivateMaterializerError([issue(["account", account.serviceId], "binding has an unauthorized provider, invalid public provenance, placeholder, or unsafe node")]);
    }
    const nodes = local.bindings.map((binding) => binding.node);
    if (new Set(nodes).size !== nodes.length || nodes.length === 0) throw new PrivateMaterializerError([issue(["account", account.serviceId], "binding nodes must be nonempty and unique")]);
    group.proxies = ["REJECT"];
    group.use = [...new Set(local.bindings.map((binding) => binding.provider))].sort();
    // Mihomo uses regexp2 for `filter`; this is a literal-only expression, not RE2 policy syntax.
    group.filter = `^(?:${nodes.map(escapeRegexLiteral).join("|")})$`;
    changed.push(account.visibleGroup);
  }
  document["external-controller"] = deployment.controller.url.replace(/^http:\/\//, "");
  document.secret = secret;
  const outputParent = dirname(resolve(outputPath));
  const temporaryDirectory = await mkdtemp(join(outputParent, ".materialize-"));
  const temporary = join(temporaryDirectory, "profile.yaml");
  try {
    await writeFile(temporary, YAML.stringify(document), { encoding: "utf8", mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, outputPath);
  } catch {
    try { await rm(temporaryDirectory, { recursive: true, force: true }); } catch { /* Preserve the primary staged-output failure. */ }
    throw new PrivateMaterializerError([issue(["outputPath"], "private output staging failed")]);
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
  return { changedGroups: changed, controllerChanged: true, startupGate: "still-required" };
}
