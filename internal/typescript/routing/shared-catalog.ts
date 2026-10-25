import { readFile } from "node:fs/promises";
import { z } from "zod";

import type { RoutingIssue } from "./issues.js";
import { IdSchema } from "./schema.js";

const StringList = z.array(z.string().min(1));
function uniqueStringList(minimumLength = 0) {
  const values = minimumLength === 0 ? StringList : StringList.min(minimumLength);
  return values.superRefine((entries, context) => {
    const seen = new Set<string>();
    for (const [index, value] of entries.entries()) {
      if (seen.has(value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `duplicate value ${value}`,
        });
      }
      seen.add(value);
    }
  });
}
const UniqueStringList = uniqueStringList();
const NonEmptyUniqueStringList = uniqueStringList(1);

const SubconverterSelectorSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("standard"),
      emitWhenLegacyReplaced: z.boolean(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("fixed"),
      emitWhenLegacyReplaced: z.boolean(),
      groupKeys: NonEmptyUniqueStringList,
      comments: StringList,
    })
    .strict(),
  z
    .object({
      mode: z.literal("stables"),
      emitWhenLegacyReplaced: z.boolean(),
      comments: StringList.optional(),
    })
    .strict(),
]);

const SubconverterServicePolicySchema = z
  .object({
    selector: SubconverterSelectorSchema.nullable().optional(),
    ruleCluster: z.string().min(1).nullable().optional(),
  })
  .strict();

const ServicePolicySchema = z
  .object({
    group: z.string().min(1),
    regions: NonEmptyUniqueStringList,
    directRelaxed: z.boolean(),
    subconverter: SubconverterServicePolicySchema,
  })
  .strict();

const DnsPolicySchema = z
  .object({ selector: z.string().min(1) })
  .passthrough();
const UpstreamRuleSchema = z
  .object({ kind: z.string().min(1) })
  .passthrough();

const ServiceCatalogRecordSchema = z
  .object({
    id: IdSchema,
    providerKey: z.string().min(1),
    file: z.string().regex(/^[^/\\]+\.ya?ml$/i),
    payload: StringList,
    policy: IdSchema.optional(),
    group: z.string().min(1).optional(),
    regions: UniqueStringList.optional(),
    directRelaxed: z.boolean().optional(),
    subconverter: SubconverterServicePolicySchema.optional(),
    dnsPolicies: z.array(DnsPolicySchema),
    geosites: StringList.optional(),
    upstreamRules: z.array(UpstreamRuleSchema).optional(),
    projections: z.array(z.enum(["mihomo", "subconverter"])).optional(),
  })
  .passthrough()
  .superRefine((record, context) => {
    if ((record.geosites === undefined) === (record.upstreamRules === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["upstreamRules"],
        message: "service must declare exactly one of geosites or upstreamRules",
      });
    }
    if (record.policy !== undefined) {
      for (const key of ["group", "regions", "directRelaxed", "subconverter"] as const) {
        if (record[key] !== undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: "cannot be combined with a shared policy reference",
          });
        }
      }
    } else if (
      record.group === undefined ||
      record.directRelaxed === undefined ||
      record.subconverter === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "inline service routing requires group, directRelaxed, and subconverter",
      });
    }
  });

const ServiceCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    policies: z.record(z.string(), ServicePolicySchema).optional().default({}),
    services: z.array(ServiceCatalogRecordSchema).min(1),
  })
  .strict();

export interface ServiceCatalogRecord {
  readonly id: string;
  readonly providerKey: string;
  readonly group: string;
  readonly file: string;
  readonly payload: readonly string[];
  readonly regions: readonly string[];
  readonly directRelaxed: boolean;
  readonly subconverter: z.infer<typeof SubconverterServicePolicySchema>;
  readonly policyId: string | undefined;
  readonly projections: readonly ("mihomo" | "subconverter")[];
  readonly dnsPolicies: readonly { readonly selector: string }[];
  readonly upstreamRules: readonly { readonly kind: string }[];
}

export type ServiceCatalog = ReadonlyMap<string, ServiceCatalogRecord>;

export class ServiceCatalogError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) {
    super(issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
    this.name = "ServiceCatalogError";
  }
}

function issue(path: readonly (string | number)[], message: string): RoutingIssue {
  return { code: "schema", path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaIssues(path: string, error: z.ZodError): RoutingIssue[] {
  return error.issues.map((entry) => issue([path, ...entry.path.map(String)], entry.message));
}

export function parseServiceCatalog(value: unknown, path: string): ServiceCatalog {
  const parsed = ServiceCatalogSchema.safeParse(value);
  if (!parsed.success) throw new ServiceCatalogError(schemaIssues(path, parsed.error));

  const records = new Map<string, ServiceCatalogRecord>();
  const providerKeys = new Set<string>();
  const files = new Set<string>();
  const issues: RoutingIssue[] = [];

  for (const [index, record] of parsed.data.services.entries()) {
    const recordPath = [path, "services", index] as const;
    if (records.has(record.id)) issues.push(issue([...recordPath, "id"], `duplicate service id ${record.id}`));
    if (providerKeys.has(record.providerKey)) issues.push(issue([...recordPath, "providerKey"], `duplicate provider key ${record.providerKey}`));
    if (files.has(record.file)) issues.push(issue([...recordPath, "file"], `duplicate catalog file ${record.file}`));

    const policy = record.policy === undefined ? undefined : parsed.data.policies[record.policy];
    if (record.policy !== undefined && policy === undefined) {
      issues.push({
        code: "missing-reference",
        path: [...recordPath, "policy"],
        message: `unknown service policy ${record.policy}`,
      });
    }
    if (record.policy !== undefined && policy === undefined) continue;

    const group = policy?.group ?? record.group;
    const regions = policy?.regions ?? record.regions ?? [];
    const directRelaxed = policy?.directRelaxed ?? record.directRelaxed;
    const subconverter = policy?.subconverter ?? record.subconverter;
    if (group === undefined || directRelaxed === undefined || subconverter === undefined) continue;

    const upstreamRules = record.upstreamRules ?? (record.geosites ?? []).map(() => ({ kind: "geosite" }));
    records.set(record.id, {
      id: record.id,
      providerKey: record.providerKey,
      group,
      file: record.file,
      payload: record.payload,
      regions,
      directRelaxed,
      subconverter,
      policyId: record.policy,
      projections: record.projections ?? ["mihomo", "subconverter"],
      dnsPolicies: record.dnsPolicies,
      upstreamRules,
    });
    providerKeys.add(record.providerKey);
    files.add(record.file);
  }

  if (issues.length > 0) throw new ServiceCatalogError(issues);
  return records;
}

export async function loadServiceCatalog(path: string): Promise<ServiceCatalog> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error: unknown) {
    const message = error instanceof SyntaxError ? "contains invalid JSON" : "cannot be read";
    throw new ServiceCatalogError([issue([path], message)]);
  }
  return parseServiceCatalog(value, path);
}

export function hydrateRoutingServices(value: unknown, catalog: ServiceCatalog): unknown {
  if (!isRecord(value) || !isRecord(value.services)) return value;
  const hydrated = structuredClone(value) as Record<string, unknown>;
  const services = hydrated.services as Record<string, unknown>;
  const issues: RoutingIssue[] = [];

  for (const [serviceId, rawService] of Object.entries(services)) {
    const record = catalog.get(serviceId);
    if (record === undefined) continue;
    if (!isRecord(rawService)) continue;
    const service = rawService;
    if (service.displayName === undefined) {
      service.displayName = record.group;
    } else if (service.displayName === record.group) {
      issues.push(issue(["services", serviceId, "displayName"], "catalog-owned metadata must not be duplicated in core YAML"));
    }

    if (!isRecord(service.selector)) continue;
    if (service.selector.visibleGroup === undefined) {
      service.selector.visibleGroup = record.group;
    } else if (service.selector.visibleGroup === record.group) {
      issues.push(issue(["services", serviceId, "selector", "visibleGroup"], "catalog-owned metadata must not be duplicated in core YAML"));
    }

    if (!isRecord(service.endpoints)) continue;
    const endpointIds = Object.keys(service.endpoints);
    if (endpointIds.length !== 1 || endpointIds[0] !== "service") {
      issues.push(issue(["services", serviceId, "endpoints"], "canonical services provide exactly one service endpoint"));
      continue;
    }
    const endpoint = service.endpoints.service;
    if (!isRecord(endpoint)) continue;
    if (endpoint.ruleset === undefined) {
      endpoint.ruleset = record.providerKey;
    } else if (endpoint.ruleset === record.providerKey) {
      issues.push(issue(["services", serviceId, "endpoints", "service", "ruleset"], "catalog-owned metadata must not be duplicated in core YAML"));
    }
  }

  if (issues.length > 0) throw new ServiceCatalogError(issues);
  return hydrated;
}
