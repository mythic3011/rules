import { createHash } from "node:crypto";
import { z } from "zod";

import type { ControllerPlan } from "./runtime-plan.js";

const NonEmpty = z.string().trim().min(1);
const PolicyVersion = NonEmpty.refine((value) => !/[\r\n]/.test(value), "policy version must not contain a line break");
const Sha256Digest = z.string().regex(/^sha256:[a-f0-9]{64}$/, "must be a lowercase sha256 digest");
const PositiveMilliseconds = z.number().int().positive();
const CheckedAt = z.iso.datetime({ offset: true });

export const FirewallReasonCodeSchema = z.enum([
  "closed",
  "static-only",
  "generation-drift",
  "direct-path-allowed",
  "required-path-not-blocked",
  "allow-path-not-allowed",
  "probe-unavailable",
  "probe-unknown",
  "stale-evidence",
  "invalid-evidence",
]);
export type FirewallReasonCode = z.infer<typeof FirewallReasonCodeSchema>;
export const NonClosedFirewallReasonCodeSchema = z.enum([
  "static-only",
  "generation-drift",
  "direct-path-allowed",
  "required-path-not-blocked",
  "allow-path-not-allowed",
  "probe-unavailable",
  "probe-unknown",
  "stale-evidence",
  "invalid-evidence",
]);
export type NonClosedFirewallReasonCode = z.infer<typeof NonClosedFirewallReasonCodeSchema>;

export const SealedArtifactInputSchema = z.object({
  policyVersion: PolicyVersion,
  publicArtifactSha256: Sha256Digest,
  privateMaterializationSha256: Sha256Digest,
  controllerPlanSha256: Sha256Digest,
  topologySha256: Sha256Digest,
  firewallStaticEvidenceSha256: Sha256Digest,
  proofMaximumAgeMs: PositiveMilliseconds,
}).strict();
export type SealedArtifactInput = z.infer<typeof SealedArtifactInputSchema>;

export interface SealedArtifactGeneration extends SealedArtifactInput {
  readonly generationId: string;
}

const SealedArtifactGenerationSchema = SealedArtifactInputSchema.extend({ generationId: Sha256Digest }).strict();

function canonicalGenerationInput(input: SealedArtifactInput): string {
  return [
    `policyVersion=${input.policyVersion}`,
    `publicArtifactSha256=${input.publicArtifactSha256}`,
    `privateMaterializationSha256=${input.privateMaterializationSha256}`,
    `controllerPlanSha256=${input.controllerPlanSha256}`,
    `topologySha256=${input.topologySha256}`,
    `firewallStaticEvidenceSha256=${input.firewallStaticEvidenceSha256}`,
    `proofMaximumAgeMs=${input.proofMaximumAgeMs}`,
  ].join("\n");
}

export function sealArtifactGeneration(raw: unknown): SealedArtifactGeneration {
  const input = SealedArtifactInputSchema.parse(raw);
  const generationId = `sha256:${createHash("sha256").update(canonicalGenerationInput(input), "utf8").digest("hex")}`;
  return { ...input, generationId };
}

/** Re-seals a caller-provided expectation instead of trusting its claimed ID. */
export function validateSealedArtifactGeneration(raw: unknown): SealedArtifactGeneration {
  const supplied = SealedArtifactGenerationSchema.parse(raw);
  const { generationId, ...input } = supplied;
  const sealed = sealArtifactGeneration(input);
  if (generationId !== sealed.generationId) {
    throw new Error("sealed artifact generation does not match its component digests");
  }
  return sealed;
}

const BlockedFamilySchema = z.array(z.enum(["ipv4", "ipv6"])).length(2);
const RequiredBlockedPathSchema = z.enum([
  "direct-wan",
  "external-dns",
  "external-dot",
  "direct-quic",
]);
export type RequiredBlockedPath = z.infer<typeof RequiredBlockedPathSchema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("canonical JSON requires plain records");
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("canonical JSON rejects unsupported values");
}

export function sha256CanonicalJson(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

/** The authority binds a permit to this exact immutable compiler output. */
export function digestControllerPlan(plan: ControllerPlan): string {
  return sha256CanonicalJson(plan);
}

export const FirewallStaticEvidenceSchema = z.object({
  protectedSources: z.array(NonEmpty).min(1),
  blockedFamilies: BlockedFamilySchema,
  blockedPaths: z.array(RequiredBlockedPathSchema).length(4),
  approvedProxyDestinations: z.array(NonEmpty).min(1),
  routerDnsDestinations: z.array(NonEmpty).min(1),
  rulesetGeneration: Sha256Digest,
}).strict().superRefine((value, context) => {
  const required: readonly RequiredBlockedPath[] = ["direct-wan", "external-dns", "external-dot", "direct-quic"];
  for (const path of required) {
    if (!value.blockedPaths.includes(path)) {
      context.addIssue({ code: "custom", path: ["blockedPaths"], message: `missing required blocked path: ${path}` });
    }
  }
  if (new Set(value.blockedPaths).size !== value.blockedPaths.length) {
    context.addIssue({ code: "custom", path: ["blockedPaths"], message: "blocked paths must be unique" });
  }
  if (new Set(value.blockedFamilies).size !== value.blockedFamilies.length || !value.blockedFamilies.includes("ipv4") || !value.blockedFamilies.includes("ipv6")) {
    context.addIssue({ code: "custom", path: ["blockedFamilies"], message: "blocked families must contain ipv4 and ipv6 exactly once" });
  }
  for (const [key, values] of [
    ["protectedSources", value.protectedSources],
    ["approvedProxyDestinations", value.approvedProxyDestinations],
    ["routerDnsDestinations", value.routerDnsDestinations],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", path: [key], message: `${key} must be unique` });
    }
  }
});
export type FirewallStaticEvidence = z.infer<typeof FirewallStaticEvidenceSchema>;

export function digestFirewallStaticEvidence(raw: unknown): string {
  return sha256CanonicalJson(FirewallStaticEvidenceSchema.parse(raw));
}

export const ControlledOutcomeSchema = z.enum(["blocked", "allowed", "unavailable", "unknown"]);
export type ControlledOutcome = z.infer<typeof ControlledOutcomeSchema>;

export const FirewallDynamicEvidenceSchema = z.object({
  directIpv4: ControlledOutcomeSchema,
  directIpv6: ControlledOutcomeSchema,
  externalDns: ControlledOutcomeSchema,
  externalDot: ControlledOutcomeSchema,
  directQuic: ControlledOutcomeSchema,
  approvedProxy: ControlledOutcomeSchema,
  routerDns: ControlledOutcomeSchema,
  generationBefore: Sha256Digest,
  generationAfter: Sha256Digest,
}).strict();
export type FirewallDynamicEvidence = z.infer<typeof FirewallDynamicEvidenceSchema>;

export const FirewallProofEvidenceSchema = z.object({
  checkedAt: CheckedAt,
  sealedArtifact: SealedArtifactInputSchema,
  staticEvidence: FirewallStaticEvidenceSchema,
  dynamicEvidence: FirewallDynamicEvidenceSchema.optional(),
}).strict();
export type FirewallProofEvidence = z.infer<typeof FirewallProofEvidenceSchema>;

const ProofBaseSchema = z.object({
  checkedAt: CheckedAt,
  reasonCode: FirewallReasonCodeSchema,
  sealedArtifact: z.object({
    policyVersion: PolicyVersion,
    generationId: Sha256Digest,
  }).strict(),
  rulesetGeneration: Sha256Digest,
}).strict();

export const FirewallProofResultSchema = z.discriminatedUnion("status", [
  ProofBaseSchema.extend({
    status: z.literal("closed"),
    reasonCode: z.literal("closed"),
    evidence: FirewallProofEvidenceSchema,
  }).strict(),
  ProofBaseSchema.extend({ status: z.literal("open"), reasonCode: NonClosedFirewallReasonCodeSchema }).strict(),
  ProofBaseSchema.extend({ status: z.literal("unknown"), reasonCode: NonClosedFirewallReasonCodeSchema }).strict(),
]);
export type FirewallProofResult = z.infer<typeof FirewallProofResultSchema>;

const permitBrand: unique symbol = Symbol("FirewallPermit");
export interface FirewallPermit {
  readonly generationId: string;
  readonly rulesetGeneration: string;
  readonly [permitBrand]: true;
}

export class FirewallProofError extends Error {
  public constructor(public readonly reasonCode: NonClosedFirewallReasonCode) {
    super(`Firewall proof is not closed: ${reasonCode}`);
    this.name = "FirewallProofError";
  }
}

function result(
  status: FirewallProofResult["status"],
  evidence: FirewallProofEvidence,
  sealed: SealedArtifactGeneration,
  reasonCode: FirewallReasonCode,
): FirewallProofResult {
  const base = {
    status,
    checkedAt: evidence.checkedAt,
    reasonCode,
    sealedArtifact: { policyVersion: sealed.policyVersion, generationId: sealed.generationId },
    rulesetGeneration: evidence.staticEvidence.rulesetGeneration,
  };
  if (status === "closed") return FirewallProofResultSchema.parse({ ...base, evidence });
  return FirewallProofResultSchema.parse(base);
}

function directBypass(dynamic: FirewallDynamicEvidence): boolean {
  return [dynamic.directIpv4, dynamic.directIpv6, dynamic.externalDns, dynamic.externalDot, dynamic.directQuic].includes("allowed");
}

function probeOutcomes(dynamic: FirewallDynamicEvidence): readonly ControlledOutcome[] {
  return [
    dynamic.directIpv4,
    dynamic.directIpv6,
    dynamic.externalDns,
    dynamic.externalDot,
    dynamic.directQuic,
    dynamic.approvedProxy,
    dynamic.routerDns,
  ];
}

function unavailable(dynamic: FirewallDynamicEvidence): boolean {
  return probeOutcomes(dynamic).includes("unavailable");
}

function unknown(dynamic: FirewallDynamicEvidence): boolean {
  return probeOutcomes(dynamic).includes("unknown");
}

/** Pure evidence evaluator. It does not inspect packet filters or mutate a router. */
export function evaluateFirewallProof(
  raw: unknown,
  expectedSealedArtifact?: SealedArtifactGeneration,
  now: Date = new Date(),
): FirewallProofResult {
  const expected = expectedSealedArtifact === undefined ? undefined : validateSealedArtifactGeneration(expectedSealedArtifact);
  const evidence = FirewallProofEvidenceSchema.parse(raw);
  const sealed = sealArtifactGeneration(evidence.sealedArtifact);
  if (expected !== undefined && sealed.generationId !== expected.generationId) {
    return result("unknown", evidence, sealed, "generation-drift");
  }
  if (sealed.firewallStaticEvidenceSha256 !== digestFirewallStaticEvidence(evidence.staticEvidence)) {
    return result("unknown", evidence, sealed, "generation-drift");
  }
  const checkedAt = Date.parse(evidence.checkedAt);
  if (checkedAt > now.getTime() || now.getTime() - checkedAt > sealed.proofMaximumAgeMs) {
    return result("unknown", evidence, sealed, "stale-evidence");
  }
  const dynamic = evidence.dynamicEvidence;
  if (dynamic === undefined) return result("unknown", evidence, sealed, "static-only");
  if (dynamic.generationBefore !== evidence.staticEvidence.rulesetGeneration || dynamic.generationAfter !== evidence.staticEvidence.rulesetGeneration) {
    return result("unknown", evidence, sealed, "generation-drift");
  }
  if (directBypass(dynamic)) return result("open", evidence, sealed, "direct-path-allowed");
  if (unavailable(dynamic)) return result("unknown", evidence, sealed, "probe-unavailable");
  if (unknown(dynamic)) return result("unknown", evidence, sealed, "probe-unknown");
  if (dynamic.approvedProxy !== "allowed" || dynamic.routerDns !== "allowed") {
    return result("unknown", evidence, sealed, "allow-path-not-allowed");
  }
  if ([dynamic.directIpv4, dynamic.directIpv6, dynamic.externalDns, dynamic.externalDot, dynamic.directQuic].some((value) => value !== "blocked")) {
    return result("unknown", evidence, sealed, "required-path-not-blocked");
  }
  return result("closed", evidence, sealed, "closed");
}

function issueFirewallPermit(proof: FirewallProofResult): FirewallPermit {
  const normalized = FirewallProofResultSchema.parse(proof);
  if (normalized.status !== "closed") throw new FirewallProofError(normalized.reasonCode);
  return {
    generationId: normalized.sealedArtifact.generationId,
    rulesetGeneration: normalized.rulesetGeneration,
    [permitBrand]: true,
  };
}

export interface FirewallEvidenceSource {
  readFirewallEvidence(): Promise<unknown>;
}

export interface FirewallProofClock {
  now(): Date;
}

export class FirewallProofAdapterError extends Error {
  public constructor(public readonly reasonCode: NonClosedFirewallReasonCode) {
    super(`Firewall proof adapter failed: ${reasonCode}`);
    this.name = "FirewallProofAdapterError";
  }
}

/**
 * The only public permit issuer. It reads fresh evidence and manufactures an
 * opaque permit only after a trusted generation expectation has matched.
 */
export class FirewallProofAdapter {
  public constructor(
    private readonly source: FirewallEvidenceSource,
    private readonly clock: FirewallProofClock = { now: () => new Date() },
  ) {}

  public async evaluate(expectedSealedArtifact: SealedArtifactGeneration): Promise<FirewallProofResult> {
    let raw: unknown;
    try {
      raw = await this.source.readFirewallEvidence();
    } catch {
      throw new FirewallProofAdapterError("probe-unavailable");
    }
    try {
      return evaluateFirewallProof(raw, expectedSealedArtifact, this.clock.now());
    } catch {
      throw new FirewallProofAdapterError("invalid-evidence");
    }
  }

  public async issuePermit(expectedSealedArtifact: SealedArtifactGeneration): Promise<FirewallPermit> {
    const proof = await this.evaluate(expectedSealedArtifact);
    try {
      return issueFirewallPermit(proof);
    } catch {
      const reason = proof.status === "closed" ? "invalid-evidence" : proof.reasonCode;
      throw new FirewallProofAdapterError(reason);
    }
  }
}
