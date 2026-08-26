import { readFile } from "node:fs/promises";
import { z } from "zod";

import { formatIssues, type RoutingIssue } from "./issues.js";
import type { ControllerPlan } from "./runtime-plan.js";

const NonEmpty = z.string().trim().min(1);
const Id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const NodeName = NonEmpty.refine(
  (value) => !["DIRECT", "REJECT", "COMPATIBLE"].includes(value) && !/\b(?:auto|fallback|url-test|load-balance)\b/i.test(value),
  "approved node must not be a dynamic or fail-open target",
);
const AbsolutePath = z.string().regex(/^\/[^\0\n]+$/);

export function isStrictLoopbackControllerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" &&
      url.port !== "" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1") &&
      url.username === "" &&
      url.password === "" &&
      (url.pathname === "/" || url.pathname === "") &&
      url.search === "" &&
      url.hash === "";
  } catch {
    return false;
  }
}

const LoopbackUrl = z.url().refine(isStrictLoopbackControllerUrl, "controller URL must be credential-free loopback HTTP with an explicit port and root path");

const ProtectedSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("vlan"), name: NonEmpty }).strict(),
  z.object({ kind: z.literal("device"), label: NonEmpty }).strict(),
]);

export const RouterDeploymentSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["example", "deployment"]),
  policyVersion: NonEmpty,
  controller: z.object({ url: LoopbackUrl, secretFile: AbsolutePath }).strict(),
  protectedSources: z.array(ProtectedSourceSchema).min(1),
}).strict();

const BindingSchema = z.object({ approvedId: NodeName, node: NodeName, provider: Id }).strict();
const LocalServiceSchema = z.object({
  bindings: z.array(BindingSchema).min(1),
  revokedNodes: z.array(NodeName).default([]),
}).strict();

export const ApprovedEgressSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["example", "deployment"]),
  policyVersion: NonEmpty,
  services: z.record(Id, LocalServiceSchema),
}).strict().superRefine((value, context) => {
  for (const [serviceId, service] of Object.entries(value.services)) {
    for (const [index, binding] of service.bindings.entries()) {
      const sameId = service.bindings.findIndex((item) => item.approvedId === binding.approvedId);
      const sameNode = service.bindings.findIndex((item) => item.node === binding.node);
      if (sameId !== index) context.addIssue({ code: "custom", path: ["services", serviceId, "bindings", index], message: `duplicate canonical approved ID: ${binding.approvedId}` });
      if (sameNode !== index) context.addIssue({ code: "custom", path: ["services", serviceId, "bindings", index], message: `duplicate current node: ${binding.node}` });
      if (service.revokedNodes.includes(binding.node)) context.addIssue({ code: "custom", path: ["services", serviceId, "bindings", index], message: `approved node is revoked: ${binding.node}` });
    }
  }
});

const AccountStateSchema = z.object({
  selectedNode: z.string().min(1),
  verifiedPolicyVersion: z.string().nullable(),
  verifiedNode: z.string().nullable(),
  resetReason: z.enum(["none", "policy-version-change", "selected-node-missing", "node-revoked", "exit-ip-change", "geo-mismatch"]),
}).strict();

export const RuntimeStateSchema = z.object({
  schemaVersion: z.literal(1),
  policyVersion: NonEmpty,
  activeMode: Id,
  accounts: z.record(Id, AccountStateSchema),
}).strict();

export type RouterDeployment = z.infer<typeof RouterDeploymentSchema>;
export type ApprovedEgress = z.infer<typeof ApprovedEgressSchema>;
export type RuntimeState = z.infer<typeof RuntimeStateSchema>;

export class RouterLocalConfigError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) {
    super(formatIssues(issues));
    this.name = "RouterLocalConfigError";
  }
}

function issue(code: RoutingIssue["code"], path: readonly (string | number)[], message: string): RoutingIssue {
  return { code, path, message };
}

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new RouterLocalConfigError(parsed.error.issues.map((entry) => issue("schema", [label, ...entry.path.map(String)], entry.message)));
}

function sameSorted(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

export function validateRouterLocalConfig(
  deploymentValue: unknown,
  egressValue: unknown,
  stateValue: unknown,
  plan: ControllerPlan,
): { deployment: RouterDeployment; egress: ApprovedEgress; state: RuntimeState } {
  const deployment = parse(RouterDeploymentSchema, deploymentValue, "deployment");
  const egress = parse(ApprovedEgressSchema, egressValue, "approved-egress");
  const state = parse(RuntimeStateSchema, stateValue, "runtime-state");
  const issues: RoutingIssue[] = [];

  if (deployment.mode !== "deployment" || egress.mode !== "deployment") {
    issues.push(issue("policy-invariant", ["deployment"], "example local documents cannot arm the controller"));
  }
  for (const [name, version] of [["deployment", deployment.policyVersion], ["approved-egress", egress.policyVersion], ["runtime-state", state.policyVersion]] as const) {
    if (version !== plan.policyVersion) issues.push(issue("policy-invariant", [name, "policyVersion"], "local policy version does not match controller plan"));
  }
  if (plan.modes[state.activeMode] === undefined) {
    issues.push(issue("missing-reference", ["runtime-state", "activeMode"], "active mode does not exist in controller plan"));
  }

  for (const account of plan.accountProtected) {
    const local = egress.services[account.serviceId];
    if (local === undefined) {
      issues.push(issue("missing-reference", ["approved-egress", "services", account.serviceId], "account-protected service requires an exact local allowlist"));
    } else if (!sameSorted(local.bindings.map((binding) => binding.approvedId), account.canonicalApprovedNodeIds)) {
      issues.push(issue("policy-invariant", ["approved-egress", "services", account.serviceId, "bindings"], "local bindings must map every canonical approved ID exactly once"));
    } else if (local.bindings.some((binding) => !account.canonicalApprovedBindings.some((expected) => expected.approvedId === binding.approvedId && expected.provider === binding.provider))) {
      issues.push(issue("policy-invariant", ["approved-egress", "services", account.serviceId, "bindings"], "local binding provider must match its canonical approved ID mapping"));
    }

    const accountState = state.accounts[account.serviceId];
    if (accountState === undefined) {
      issues.push(issue("missing-reference", ["runtime-state", "accounts", account.serviceId], "account-protected service requires runtime state"));
      continue;
    }
    if (accountState.selectedNode === "REJECT") {
      if (accountState.verifiedPolicyVersion !== null || accountState.verifiedNode !== null) {
        issues.push(issue("policy-invariant", ["runtime-state", "accounts", account.serviceId], "LOCKED state must not retain armed verification"));
      }
      continue;
    }
    const allowed = local?.bindings.map((binding) => binding.node) ?? [];
    if (!allowed.includes(accountState.selectedNode) || accountState.verifiedPolicyVersion !== plan.policyVersion || accountState.verifiedNode !== accountState.selectedNode) {
      issues.push(issue("policy-invariant", ["runtime-state", "accounts", account.serviceId], "ARMED state requires current policy and approved-node verification"));
    }
  }
  if (issues.length > 0) throw new RouterLocalConfigError(issues);
  return { deployment, egress, state };
}

export async function loadRouterLocalJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export interface AccountSafetyDecision {
  readonly serviceId: string;
  readonly selection: "REJECT" | string;
  readonly resetReason: "none" | "policy-version-change" | "selected-node-missing" | "node-revoked";
}

export function createInitialRuntimeState(plan: ControllerPlan, activeMode: string): RuntimeState {
  if (plan.modes[activeMode] === undefined) {
    throw new RouterLocalConfigError([issue("missing-reference", ["runtime-state", "activeMode"], "active mode does not exist in controller plan")]);
  }
  return {
    schemaVersion: 1,
    policyVersion: plan.policyVersion,
    activeMode,
    accounts: Object.fromEntries(plan.accountProtected.map((account) => [account.serviceId, {
      selectedNode: "REJECT",
      verifiedPolicyVersion: null,
      verifiedNode: null,
      resetReason: "none",
    }])),
  };
}

/** This returns a safe decision only; it never performs account-node activation. */
export function decideAccountSafety(plan: ControllerPlan, egress: ApprovedEgress, state: RuntimeState): readonly AccountSafetyDecision[] {
  return plan.accountProtected.map((account) => {
    const remembered = state.accounts[account.serviceId];
    const local = egress.services[account.serviceId];
    if (state.policyVersion !== plan.policyVersion || egress.policyVersion !== plan.policyVersion) {
      return { serviceId: account.serviceId, selection: "REJECT", resetReason: "policy-version-change" };
    }
    if (remembered === undefined || remembered.selectedNode === "REJECT") {
      return { serviceId: account.serviceId, selection: "REJECT", resetReason: "none" };
    }
    if (local?.revokedNodes.includes(remembered.selectedNode)) {
      return { serviceId: account.serviceId, selection: "REJECT", resetReason: "node-revoked" };
    }
    const isBound = local?.bindings.some((binding) => binding.node === remembered.selectedNode) ?? false;
    if (!isBound || remembered.verifiedPolicyVersion !== plan.policyVersion || remembered.verifiedNode !== remembered.selectedNode) {
      return { serviceId: account.serviceId, selection: "REJECT", resetReason: "selected-node-missing" };
    }
    return { serviceId: account.serviceId, selection: remembered.selectedNode, resetReason: "none" };
  });
}

export interface MaterializedGroupProof {
  readonly groups: Readonly<Record<string, readonly string[]>>;
}

/** Cutover-only proof that a local account selector cannot recurse to fail-open targets. */
export function validateAccountMaterializedGraph(
  selector: string,
  approvedNodes: readonly string[],
  proof: MaterializedGroupProof,
): void {
  const issues: RoutingIssue[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const forbidden = /^(DIRECT|COMPATIBLE)$/i;
  const dynamic = /(auto|fallback|url-test|load-balance)/i;
  const walk = (name: string, path: readonly string[]): void => {
    if (visiting.has(name)) {
      issues.push(issue("policy-invariant", path, "account materialized group graph contains a cycle"));
      return;
    }
    if (visited.has(name)) return;
    const members = proof.groups[name];
    if (members === undefined) {
      if (name !== "REJECT" && !approvedNodes.includes(name)) {
        issues.push(issue("policy-invariant", path, `account graph contains unapproved terminal: ${name}`));
      }
      return;
    }
    visiting.add(name);
    for (const member of members) {
      if (forbidden.test(member) || dynamic.test(member)) {
        issues.push(issue("policy-invariant", [...path, member], "account graph reaches a fail-open or dynamic target"));
      } else {
        walk(member, [...path, member]);
      }
    }
    visiting.delete(name);
    visited.add(name);
  };
  walk(selector, [selector]);
  if (issues.length > 0) throw new RouterLocalConfigError(issues);
}
