import { readFile } from "node:fs/promises";
import { z } from "zod";

import type { RoutingIssue } from "./issues.js";
import { IdSchema } from "./schema.js";

const ServiceCatalogRecordSchema = z
  .object({
    id: IdSchema,
    providerKey: z.string().min(1),
    group: z.string().min(1),
    file: z.string().regex(/^[^/\\]+\.ya?ml$/i),
    payload: z.array(z.string().min(1)),
  })
  .passthrough();

const ServiceCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    services: z.array(ServiceCatalogRecordSchema).min(1),
  })
  .strict();

export interface ServiceCatalogRecord {
  readonly id: string;
  readonly providerKey: string;
  readonly group: string;
  readonly file: string;
  readonly payload: readonly string[];
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

export async function loadServiceCatalog(path: string): Promise<ServiceCatalog> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error: unknown) {
    const message = error instanceof SyntaxError ? "contains invalid JSON" : "cannot be read";
    throw new ServiceCatalogError([issue([path], message)]);
  }

  const parsed = ServiceCatalogSchema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceCatalogError(
      parsed.error.issues.map((entry) => issue([path, ...entry.path.map(String)], entry.message)),
    );
  }

  const records = new Map<string, ServiceCatalogRecord>();
  const providerKeys = new Set<string>();
  const files = new Set<string>();
  const issues: RoutingIssue[] = [];
  for (const [index, record] of parsed.data.services.entries()) {
    if (records.has(record.id)) issues.push(issue([path, "services", index, "id"], `duplicate service id ${record.id}`));
    if (providerKeys.has(record.providerKey)) issues.push(issue([path, "services", index, "providerKey"], `duplicate provider key ${record.providerKey}`));
    if (files.has(record.file)) issues.push(issue([path, "services", index, "file"], `duplicate catalog file ${record.file}`));
    records.set(record.id, record);
    providerKeys.add(record.providerKey);
    files.add(record.file);
  }
  if (issues.length > 0) throw new ServiceCatalogError(issues);
  return records;
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
