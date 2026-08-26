import { z } from "zod";

import { formatIssues, type RoutingIssue } from "./issues.js";
import { type ApprovedEgress, type MaterializedGroupProof, RouterLocalConfigError, type RouterDeployment, validateAccountMaterializedGraph } from "./router-local.js";
import type { ControllerPlan } from "./runtime-plan.js";

const Loopback = z.string().refine((value) => {
  try { const url = new URL(value); return url.protocol === "http:" && url.port !== "" && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1") && url.username === "" && url.password === "" && (url.pathname === "/" || url.pathname === "") && url.search === "" && url.hash === ""; } catch { return false; }
}, "controller URL must be credential-free loopback HTTP");
export const EffectiveMihomoProofSchema = z.object({
  schemaVersion: z.literal(1),
  policyVersion: z.string().min(1),
  accountPhase: z.literal("locked-pre-release"),
  controller: z.object({ url: Loopback, auth: z.literal("secret-file") }).strict(),
  mihomoVersion: z.string().min(1),
  proxyStates: z.record(z.string().min(1), z.object({
    type: z.literal("Selector"),
    all: z.array(z.string().min(1)).min(1),
    now: z.string().min(1),
    emptyFallback: z.literal("REJECT"),
    udp: z.boolean(),
  }).strict()),
  dnsRuntime: z.object({ source: z.literal("mihomo-running-config"), policies: z.record(z.string().min(1), z.object({ selector: z.string().min(1), fallback: z.literal(false) }).strict()) }).strict(),
  startup: z.object({ storeSelectedDeclared: z.literal(true), accountGate: z.literal("locked-until-explicit-selection") }).strict(),
  legacyShellEnforcement: z.enum(["frozen-non-authoritative", "superseded"]),
}).strict();
export type EffectiveMihomoProof = z.infer<typeof EffectiveMihomoProofSchema>;
export class EffectiveCutoverError extends Error { public constructor(public readonly issues: readonly RoutingIssue[]) { super(formatIssues(issues)); this.name = "EffectiveCutoverError"; } }
function issue(path: readonly (string | number)[], message: string): RoutingIssue { return { code: "policy-invariant", path, message }; }

/** Validates supplied effective-config evidence; it never inspects or changes a router. */
export function validateEffectiveCutover(
  plan: ControllerPlan,
  deployment: RouterDeployment,
  egress: ApprovedEgress,
  rawProof: unknown,
): EffectiveMihomoProof {
  const parsed = EffectiveMihomoProofSchema.safeParse(rawProof);
  if (!parsed.success) throw new EffectiveCutoverError(parsed.error.issues.map((entry) => issue(["effective-proof", ...entry.path.map(String)], entry.message)));
  const proof = parsed.data;
  const issues: RoutingIssue[] = [];
  if (proof.policyVersion !== plan.policyVersion || deployment.policyVersion !== plan.policyVersion) issues.push(issue(["policyVersion"], "effective proof and deployment must match controller policy version"));
  if (proof.controller.url !== deployment.controller.url || proof.controller.auth !== "secret-file") issues.push(issue(["controller"], "effective controller proof must use the declared loopback secret-file endpoint"));
  for (const account of plan.accountProtected) {
    const local = egress.services[account.serviceId];
    if (local === undefined) { issues.push(issue(["approved-egress", account.serviceId], "account local allowlist is absent")); continue; }
    try {
      const accountState = proof.proxyStates[account.visibleGroup];
      if (accountState === undefined) {
        issues.push(issue(["proxyStates", account.visibleGroup], "account selector runtime state is absent"));
        continue;
      }
      const expectedMembers = ["REJECT", ...local.bindings.map((binding) => binding.node)];
      if (JSON.stringify(accountState.all) !== JSON.stringify(expectedMembers) || accountState.now !== "REJECT" || accountState.emptyFallback !== "REJECT" || accountState.udp !== true) {
        issues.push(issue(["proxyStates", account.visibleGroup], "locked account selector must have REJECT first/current and exactly the local approved-node allowlist"));
      }
      const graph: MaterializedGroupProof = { groups: { [account.visibleGroup]: accountState.all } };
      validateAccountMaterializedGraph(account.visibleGroup, local.bindings.map((binding) => binding.node), graph);
    } catch (error: unknown) {
      if (error instanceof RouterLocalConfigError) issues.push(...error.issues.map((entry) => issue(["materializedGroups", ...entry.path], entry.message)));
      else throw error;
    }
    for (const key of account.dnsPolicyKeys) {
      const policy = proof.dnsRuntime.policies[key];
      if (policy === undefined || policy.selector !== account.visibleGroup || policy.fallback !== false) issues.push(issue(["dnsRuntime", "policies", key], "account DNS must use the same selector with no fallback"));
    }
  }
  if (issues.length > 0) throw new EffectiveCutoverError(issues);
  return proof;
}
