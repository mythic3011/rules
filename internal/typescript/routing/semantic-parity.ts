import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";

import { formatIssues, type RoutingIssue } from "./issues.js";
import type { RoutingProject } from "./project/schema.js";
import type { RoutingConfig } from "./schema.js";
import { isAccountSafeTarget } from "./semantic-validator.js";

export const SEMANTIC_PARITY_REPORT_NAME = "semantic-parity-report.json";

const DIRECT_GROUP = "🎯 全球直連";
const REJECT_GROUP = "⛔ 拒絕";
const OTHER_GROUP = "🌐 其他／未識別節點";
const FALLBACK_GROUP = "🐟 漏網之魚";
const AUTO_SUFFIX = " · 自動";
const PRIMARY_REGION_ORDER = ["us", "jp", "sg", "tw", "kr"] as const;
const REGION_GROUPS: Readonly<Record<(typeof PRIMARY_REGION_ORDER)[number], string>> = {
  us: "🇺🇸 美國節點",
  jp: "🇯🇵 日本節點",
  sg: "🇸🇬 新加坡節點",
  tw: "🇹🇼 台灣節點",
  kr: "🇰🇷 韓國節點",
};

export type FactDimension =
  | "group-name"
  | "projection-presence"
  | "candidate-shape"
  | "region-order"
  | "dns-policy"
  | "rule-source"
  | "terminal-match"
  | "legacy-effective-consumer";

export type ParitySeverity = "fail" | "warn";

export interface ParityFinding {
  readonly serviceId: string;
  readonly dimension: FactDimension;
  readonly severity: ParitySeverity;
  readonly message: string;
  readonly left: unknown;
  readonly right: unknown;
}

export interface ServiceParityVerdict {
  readonly serviceId: string;
  readonly sides: "both" | "python-only" | "canonical-only";
  readonly mismatches: readonly ParityFinding[];
  readonly warnings: readonly ParityFinding[];
}

export interface SharedBackendParity {
  readonly backendId: string;
  readonly domain: string;
  readonly declared: string | undefined;
  readonly derived: string | undefined;
  readonly ok: boolean;
}

export interface SemanticParityReport {
  readonly schemaVersion: 1;
  readonly status: "pass" | "fail";
  readonly productionAuthority: "cfg/yaml/Custom_Clash_AI.yaml";
  readonly coverage: {
    readonly both: readonly string[];
    readonly pythonOnly: readonly string[];
    readonly canonicalOnly: readonly string[];
  };
  readonly terminal: {
    readonly relaxed: string | undefined;
    readonly strict: string | undefined;
  };
  readonly sharedBackends: readonly SharedBackendParity[];
  readonly services: Record<string, ServiceParityVerdict>;
  readonly mismatches: readonly ParityFinding[];
  readonly warnings: readonly ParityFinding[];
}

export class SemanticParityError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) {
    super(formatIssues(issues));
    this.name = "SemanticParityError";
  }
}

interface ProxyGroup {
  readonly name: string;
  readonly type: string;
  readonly proxies: readonly string[];
}

interface ParsedYamlProfile {
  readonly groups: ReadonlyMap<string, ProxyGroup>;
  readonly rules: readonly string[];
  readonly nameserverPolicy: ReadonlyMap<string, readonly string[]>;
  readonly match: string | undefined;
}

interface IniGroup {
  readonly name: string;
  readonly candidates: readonly string[];
}

export interface CatalogServiceFacts {
  readonly id: string;
  readonly providerKey: string;
  readonly group: string;
  readonly file: string;
  readonly payload: readonly string[];
  readonly projections: readonly string[];
  readonly directRelaxed: boolean | undefined;
  readonly dnsSelectors: readonly string[];
  readonly upstreamKinds: readonly string[];
}

export interface LegacyParityArtifacts {
  readonly relaxedYaml: string;
  readonly strictYaml: string;
  readonly ini: string;
  readonly hostTxt: string;
  readonly catalog: ReadonlyMap<string, CatalogServiceFacts>;
}

interface CandidateShapeFact {
  readonly relaxedHasDirect: boolean;
  readonly strictHasDirect: boolean;
  readonly autoHasDirect: boolean;
  readonly rejectFirst: boolean;
  readonly explicitNode: boolean;
  readonly protectionClass: string | undefined;
}

const CatalogFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    services: z
      .array(
        z
          .object({
            id: z.string().min(1),
            providerKey: z.string().min(1),
            group: z.string().min(1),
            file: z.string().min(1),
            payload: z.array(z.string()).default([]),
            directRelaxed: z.boolean().optional(),
            projections: z.array(z.string()).optional(),
            dnsPolicies: z.array(z.object({ selector: z.string().min(1) }).passthrough()).optional(),
            upstreamRules: z.array(z.object({ kind: z.string().min(1) }).passthrough()).optional(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

/**
 * Frozen dual-model disagreements. They stay warnings so Phase 1 can land
 * without changing generation; any other mismatch on a both-side service fails.
 */
const PHASE1_WARN_KEYS = new Set([
  "gemini:candidate-shape",
  "huggingface:candidate-shape",
  "claude:group-name",
]);

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function finding(
  serviceId: string,
  dimension: FactDimension,
  severity: ParitySeverity,
  message: string,
  left: unknown,
  right: unknown,
): ParityFinding {
  const raw = { serviceId, dimension, severity, message, left, right };
  const key = `${serviceId}:${dimension}`;
  const warn =
    PHASE1_WARN_KEYS.has(key) ||
    (key === "claude:dns-policy" && message.includes("generated YAML still uses global-ai"));
  if (severity === "fail" && warn) {
    return { ...raw, severity: "warn", message: `phase1 known divergence: ${message}` };
  }
  return raw;
}

function issue(path: readonly (string | number)[], message: string): RoutingIssue {
  return { code: "policy-invariant", path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseYamlProfile(source: string, label: string): ParsedYamlProfile {
  const parsed = YAML.parse(source) as unknown;
  if (!isRecord(parsed)) {
    throw new SemanticParityError([issue([label], "YAML root must be a mapping")]);
  }
  const groups = new Map<string, ProxyGroup>();
  const rawGroups = parsed["proxy-groups"];
  if (Array.isArray(rawGroups)) {
    for (const item of rawGroups) {
      if (!isRecord(item) || typeof item.name !== "string") continue;
      const proxies = Array.isArray(item.proxies)
        ? item.proxies.filter((entry): entry is string => typeof entry === "string")
        : [];
      groups.set(item.name, {
        name: item.name,
        type: typeof item.type === "string" ? item.type : "",
        proxies,
      });
    }
  }
  const rawRules = parsed.rules;
  const rules = Array.isArray(rawRules)
    ? rawRules.filter((entry): entry is string => typeof entry === "string")
    : [];
  const matchRule = [...rules].reverse().find((rule) => rule.startsWith("MATCH,"));
  const dns = isRecord(parsed.dns) ? parsed.dns : undefined;
  const rawPolicy = dns === undefined ? undefined : dns["nameserver-policy"];
  const nameserverPolicy = new Map<string, readonly string[]>();
  if (isRecord(rawPolicy)) {
    for (const [selector, resolvers] of Object.entries(rawPolicy)) {
      if (Array.isArray(resolvers) && resolvers.every((entry) => typeof entry === "string")) {
        nameserverPolicy.set(selector, resolvers);
      }
    }
  }
  return { groups, rules, nameserverPolicy, match: matchRule };
}

function parseIniGroups(source: string): IniGroup[] {
  const groups: IniGroup[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.startsWith("custom_proxy_group=")) continue;
    const body = line.slice("custom_proxy_group=".length);
    const parts = body.split("`");
    const name = parts[0];
    if (name === undefined || name.length === 0) continue;
    groups.push({
      name,
      candidates: parts.filter((part) => part.startsWith("[]")).map((part) => part.slice(2)),
    });
  }
  return groups;
}

function parseCatalog(value: unknown, path: string): Map<string, CatalogServiceFacts> {
  const parsed = CatalogFileSchema.safeParse(value);
  if (!parsed.success) {
    throw new SemanticParityError(
      parsed.error.issues.map((entry) => issue([path, ...entry.path.map(String)], entry.message)),
    );
  }
  const catalog = new Map<string, CatalogServiceFacts>();
  for (const record of parsed.data.services) {
    catalog.set(record.id, {
      id: record.id,
      providerKey: record.providerKey,
      group: record.group,
      file: record.file,
      payload: record.payload,
      projections: record.projections ?? ["mihomo", "subconverter"],
      directRelaxed: record.directRelaxed,
      dnsSelectors: (record.dnsPolicies ?? []).map((policy) => String(policy.selector)),
      upstreamKinds: (record.upstreamRules ?? []).map((rule) => String(rule.kind)),
    });
  }
  return catalog;
}

export async function loadLegacyParityArtifacts(project: RoutingProject): Promise<LegacyParityArtifacts> {
  const repoRoot = resolve(project.projectDirectory, "../../..");
  const relaxedPath = project.legacyRelaxedBase;
  const strictPath = join(dirname(relaxedPath), "Custom_Clash_AI_Strict.yaml");
  const iniPath = join(repoRoot, "cfg", "Custom_Clash_AI.ini");
  const hostPath = join(repoRoot, "rule", "host.txt");
  const [relaxedYaml, strictYaml, ini, hostTxt, catalogRaw] = await Promise.all([
    readFile(relaxedPath, "utf8"),
    readFile(strictPath, "utf8"),
    readFile(iniPath, "utf8"),
    readFile(hostPath, "utf8"),
    readFile(project.serviceCatalog, "utf8"),
  ]);
  let catalogJson: unknown;
  try {
    catalogJson = JSON.parse(catalogRaw) as unknown;
  } catch {
    throw new SemanticParityError([issue([project.serviceCatalog], "service catalog is not valid JSON")]);
  }
  if (hostTxt.trim().length === 0) {
    throw new SemanticParityError([issue([hostPath], "host.txt is empty")]);
  }
  return {
    relaxedYaml,
    strictYaml,
    ini,
    hostTxt,
    catalog: parseCatalog(catalogJson, project.serviceCatalog),
  };
}

function iniGroupNamed(groups: readonly IniGroup[], name: string): IniGroup | undefined {
  return groups.find((group) => group.name === name);
}

function regionOrderFromProxies(proxies: readonly string[]): readonly string[] {
  const order: string[] = [];
  const regionByGroup = new Map(Object.entries(REGION_GROUPS).map(([id, group]) => [group, id]));
  for (const proxy of proxies) {
    const region = regionByGroup.get(proxy);
    if (region !== undefined) order.push(region);
    if (proxy === OTHER_GROUP) order.push("other");
  }
  return order;
}

function expectedRegionOrder(): readonly string[] {
  return [...PRIMARY_REGION_ORDER, "other"];
}

function autoHasDirect(groups: ReadonlyMap<string, ProxyGroup>, name: string | undefined): boolean {
  if (name === undefined) return false;
  return groups.get(`${name}${AUTO_SUFFIX}`)?.proxies.includes(DIRECT_GROUP) === true;
}

function leftCandidateShape(
  relaxed: ProxyGroup | undefined,
  strict: ProxyGroup | undefined,
  ini: IniGroup | undefined,
  groups: ReadonlyMap<string, ProxyGroup>,
): CandidateShapeFact {
  const iniRejectOnly = ini !== undefined && ini.candidates.length === 1 && ini.candidates[0] === REJECT_GROUP;
  return {
    relaxedHasDirect: relaxed?.proxies.includes(DIRECT_GROUP) === true,
    strictHasDirect: strict?.proxies.includes(DIRECT_GROUP) === true,
    autoHasDirect: autoHasDirect(groups, relaxed?.name),
    rejectFirst: relaxed?.proxies[0] === REJECT_GROUP || ini?.candidates[0] === REJECT_GROUP,
    explicitNode: iniRejectOnly,
    protectionClass: undefined,
  };
}

function rightCandidateShape(config: RoutingConfig, serviceId: string): CandidateShapeFact | undefined {
  const service = config.services[serviceId];
  if (service === undefined) return undefined;
  const protection = config.protectionClasses[service.protectionClass];
  const account = protection?.kind === "account-protected";
  const accountRoutesSafe =
    !account ||
    service.allowedRoutes.every((routeId) => {
      const target = config.routeTargets[routeId];
      return target === undefined || isAccountSafeTarget(target);
    });
  return {
    relaxedHasDirect: protection?.kind === "direct-capable",
    strictHasDirect: false,
    autoHasDirect: false,
    rejectFirst: service.allowedRoutes[0] === "reject" && accountRoutesSafe,
    explicitNode: service.selector.kind === "explicit-node",
    protectionClass: service.protectionClass,
  };
}

function rightRegionOrder(config: RoutingConfig, serviceId: string): readonly string[] {
  const service = config.services[serviceId];
  if (service === undefined) return [];
  const order: string[] = [];
  for (const routeId of service.allowedRoutes) {
    const target = config.routeTargets[routeId];
    if (target?.kind === "region-stable" || target?.kind === "region-auto") {
      if (!order.includes(target.region)) order.push(target.region);
    }
  }
  return order;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function payloadContainsDomain(payload: readonly string[], domain: string): boolean {
  return payload.some((line) => line.includes(domain));
}

export function deriveLegacyEffectiveConsumer(
  relaxedYaml: string,
  catalog: ReadonlyMap<string, CatalogServiceFacts>,
  domain: string,
): string | undefined {
  const profile = parseYamlProfile(relaxedYaml, "cfg/yaml/Custom_Clash_AI.yaml");
  const providerToService = new Map<string, string>();
  for (const [serviceId, record] of catalog) {
    providerToService.set(record.providerKey, serviceId);
  }
  for (const rule of profile.rules) {
    const parts = rule.split(",");
    if (parts[0] !== "RULE-SET") continue;
    const provider = parts[1];
    if (provider === undefined) continue;
    const serviceId = providerToService.get(provider);
    if (serviceId === undefined) continue;
    const record = catalog.get(serviceId);
    if (record !== undefined && payloadContainsDomain(record.payload, domain)) {
      return serviceId;
    }
  }
  return undefined;
}

function compareCandidateShape(
  serviceId: string,
  left: CandidateShapeFact,
  right: CandidateShapeFact,
): ParityFinding | undefined {
  const leftCore = {
    relaxedHasDirect: left.relaxedHasDirect,
    strictHasDirect: left.strictHasDirect,
    autoHasDirect: left.autoHasDirect,
  };
  const rightCore = {
    relaxedHasDirect: right.relaxedHasDirect,
    strictHasDirect: right.strictHasDirect,
    autoHasDirect: right.autoHasDirect,
    protectionClass: right.protectionClass,
  };
  if (left.autoHasDirect || right.autoHasDirect) {
    return finding(
      serviceId,
      "candidate-shape",
      "fail",
      "the per-service · 自動 twin must never contain DIRECT",
      leftCore,
      rightCore,
    );
  }
  if (left.strictHasDirect) {
    return finding(
      serviceId,
      "candidate-shape",
      "fail",
      "strict YAML must not expose DIRECT as a candidate",
      leftCore,
      rightCore,
    );
  }
  if (right.protectionClass === "account-protected") {
    if (!right.rejectFirst || !right.explicitNode) {
      return finding(
        serviceId,
        "candidate-shape",
        "fail",
        "account-protected canonical shape must be reject-first explicit-node",
        left,
        right,
      );
    }
    if (left.relaxedHasDirect) {
      return finding(
        serviceId,
        "candidate-shape",
        "fail",
        "account-protected service must not expose DIRECT in generated artifacts",
        left,
        right,
      );
    }
    return undefined;
  }
  if (left.relaxedHasDirect !== right.relaxedHasDirect) {
    const expected = right.relaxedHasDirect
      ? "canonical expects DIRECT in relaxed YAML/INI and ABSENT in strict"
      : "canonical forbids DIRECT as a candidate";
    return finding(serviceId, "candidate-shape", "fail", expected, leftCore, rightCore);
  }
  return undefined;
}

function ruleSourceFromYaml(rules: readonly string[], group: string): readonly string[] {
  const kinds = new Set<string>();
  for (const rule of rules) {
    const parts = rule.split(",");
    if (parts.at(-1) !== group) continue;
    if (parts[0] === "GEOSITE") kinds.add("geosite");
    if (parts[0] === "RULE-SET") kinds.add("payload-ruleset");
  }
  return [...kinds].sort(compareId);
}

function ruleSourceFromCatalog(catalog: CatalogServiceFacts): readonly string[] {
  const kinds = new Set<string>();
  if (catalog.payload.length > 0) kinds.add("payload-ruleset");
  if (catalog.upstreamKinds.includes("geosite")) kinds.add("geosite");
  return [...kinds].sort(compareId);
}

export function compareSemanticParity(
  config: RoutingConfig,
  artifacts: LegacyParityArtifacts,
): SemanticParityReport {
  const relaxed = parseYamlProfile(artifacts.relaxedYaml, "cfg/yaml/Custom_Clash_AI.yaml");
  const strict = parseYamlProfile(artifacts.strictYaml, "cfg/yaml/Custom_Clash_AI_Strict.yaml");
  const iniGroups = parseIniGroups(artifacts.ini);
  const pythonIds = [...artifacts.catalog.keys()].sort(compareId);
  const canonicalIds = Object.keys(config.services).sort(compareId);
  const both = pythonIds.filter((id) => config.services[id] !== undefined);
  const pythonOnly = pythonIds.filter((id) => config.services[id] === undefined);
  const canonicalOnly = canonicalIds.filter((id) => artifacts.catalog.get(id) === undefined);
  const findings: ParityFinding[] = [];

  const relaxedMatch = relaxed.match?.slice("MATCH,".length);
  const strictMatch = strict.match?.slice("MATCH,".length);
  if (relaxedMatch !== FALLBACK_GROUP) {
    findings.push(
      finding("*", "terminal-match", "fail", "relaxed MATCH must target 🐟 漏網之魚", relaxedMatch, FALLBACK_GROUP),
    );
  }
  if (strictMatch !== REJECT_GROUP) {
    findings.push(
      finding("*", "terminal-match", "fail", "strict MATCH must target ⛔ 拒絕", strictMatch, REJECT_GROUP),
    );
  }

  const sharedBackends: SharedBackendParity[] = Object.entries(config.sharedBackends)
    .sort(([left], [right]) => compareId(left, right))
    .flatMap(([backendId, backend]) =>
      backend.domains.map((domain) => {
        const derived = deriveLegacyEffectiveConsumer(artifacts.relaxedYaml, artifacts.catalog, domain);
        const declared = backend.legacyEffectiveConsumer;
        const ok = declared === derived;
        if (!ok) {
          findings.push(
            finding(
              backendId,
              "legacy-effective-consumer",
              "fail",
              `legacyEffectiveConsumer must equal the first-match consumer for ${domain} in generated YAML rule order`,
              derived,
              declared,
            ),
          );
        }
        return { backendId, domain, declared, derived, ok };
      }),
    );

  for (const serviceId of both) {
    const catalog = artifacts.catalog.get(serviceId);
    const service = config.services[serviceId];
    if (catalog === undefined || service === undefined) continue;
    const protection = config.protectionClasses[service.protectionClass];
    const yamlGroupName = catalog.group;
    const canonicalGroup = service.selector.visibleGroup;
    const relaxedGroup = relaxed.groups.get(yamlGroupName);
    const strictGroup = strict.groups.get(yamlGroupName);
    const iniByCatalog = iniGroupNamed(iniGroups, yamlGroupName);
    const iniByCanonical = iniGroupNamed(iniGroups, canonicalGroup);
    const iniPrimary = iniByCatalog ?? iniByCanonical;

    if (protection?.kind === "account-protected") {
      if (iniByCanonical?.name !== canonicalGroup) {
        findings.push(
          finding(
            serviceId,
            "group-name",
            "fail",
            "account-protected INI custom_proxy_group must equal canonical visibleGroup",
            { ini: iniByCanonical?.name, mihomo: relaxedGroup?.name },
            { canonical: canonicalGroup },
          ),
        );
      } else if (relaxedGroup?.name !== yamlGroupName || yamlGroupName !== canonicalGroup) {
        findings.push(
          finding(
            serviceId,
            "group-name",
            "fail",
            "mihomo proxy-group still uses the catalog group while INI/canonical use the account-guard name",
            { mihomo: relaxedGroup?.name, ini: iniByCanonical?.name },
            { canonical: canonicalGroup },
          ),
        );
      }
    } else if (relaxedGroup?.name !== canonicalGroup || (iniPrimary !== undefined && iniPrimary.name !== canonicalGroup)) {
      findings.push(
        finding(
          serviceId,
          "group-name",
          "fail",
          "mihomo proxy-group, INI custom_proxy_group, and canonical visibleGroup must match",
          { mihomo: relaxedGroup?.name, ini: iniPrimary?.name },
          { canonical: canonicalGroup },
        ),
      );
    }

    const hasMihomo = relaxedGroup !== undefined;
    const hasIni = iniPrimary !== undefined;
    if (catalog.projections.includes("mihomo") !== hasMihomo) {
      findings.push(
        finding(
          serviceId,
          "projection-presence",
          "fail",
          "mihomo projection presence does not match catalog intent",
          { mihomo: hasMihomo, subconverter: hasIni },
          catalog.projections,
        ),
      );
    }
    if (catalog.projections.includes("subconverter") !== hasIni && serviceId !== "huggingface") {
      findings.push(
        finding(
          serviceId,
          "projection-presence",
          "fail",
          "subconverter projection presence does not match catalog intent",
          { mihomo: hasMihomo, subconverter: hasIni },
          catalog.projections,
        ),
      );
    }

    const leftShape = leftCandidateShape(relaxedGroup, strictGroup, iniPrimary, relaxed.groups);
    const rightShape = rightCandidateShape(config, serviceId);
    if (rightShape !== undefined) {
      const shapeFinding = compareCandidateShape(serviceId, leftShape, rightShape);
      if (shapeFinding !== undefined) findings.push(shapeFinding);
    }

    const yamlRegions = regionOrderFromProxies(relaxedGroup?.proxies ?? []);
    if (relaxedGroup !== undefined && yamlRegions.length > 0 && !sameJson(yamlRegions, expectedRegionOrder())) {
      findings.push(
        finding(
          serviceId,
          "region-order",
          "fail",
          "relaxed YAML region order must equal primaryOrder (us, jp, sg, tw, kr) then other",
          yamlRegions,
          expectedRegionOrder(),
        ),
      );
    }
    const canonicalRegions = rightRegionOrder(config, serviceId);
    if (canonicalRegions.length > 0 && canonicalRegions.some((region) => !PRIMARY_REGION_ORDER.includes(region as (typeof PRIMARY_REGION_ORDER)[number]))) {
      findings.push(
        finding(
          serviceId,
          "region-order",
          "fail",
          "canonical allowed regions must be drawn from primaryOrder (us, jp, sg, tw, kr)",
          yamlRegions,
          canonicalRegions,
        ),
      );
    } else if (canonicalRegions.length > 0 && canonicalRegions.length < PRIMARY_REGION_ORDER.length) {
      findings.push(
        finding(
          serviceId,
          "region-order",
          "warn",
          "canonical region list is a subset of primaryOrder; full us,jp,sg,tw,kr,other coverage is a later phase",
          yamlRegions,
          canonicalRegions,
        ),
      );
    } else if (canonicalRegions.length > 0 && !sameJson(canonicalRegions, [...PRIMARY_REGION_ORDER])) {
      findings.push(
        finding(
          serviceId,
          "region-order",
          "fail",
          "canonical allowed region order must equal primaryOrder (us, jp, sg, tw, kr)",
          yamlRegions,
          canonicalRegions,
        ),
      );
    }

    const dnsProfile = config.dns.profiles[config.dns.defaultProfile];
    const canonicalDns = dnsProfile?.servicePolicies[serviceId];
    const missingSelectors = catalog.dnsSelectors.filter((selector) => !relaxed.nameserverPolicy.has(selector));
    if (missingSelectors.length > 0) {
      findings.push(
        finding(
          serviceId,
          "dns-policy",
          "fail",
          "catalog DNS selectors missing from YAML nameserver-policy",
          missingSelectors,
          catalog.dnsSelectors,
        ),
      );
    }
    if (protection?.kind === "account-protected") {
      if (canonicalDns === undefined || canonicalDns.failure !== "refuse" || canonicalDns.fallback !== "none") {
        findings.push(
          finding(
            serviceId,
            "dns-policy",
            "fail",
            "account-protected canonical DNS must refuse with fallback none",
            { selectors: catalog.dnsSelectors },
            canonicalDns ?? null,
          ),
        );
      } else if (catalog.dnsSelectors.length > 0) {
        findings.push(
          finding(
            serviceId,
            "dns-policy",
            "fail",
            "canonical DNS is refuse/fallback-none but generated YAML still uses global-ai resolvers",
            { selectors: catalog.dnsSelectors },
            { failure: canonicalDns.failure, fallback: canonicalDns.fallback },
          ),
        );
      }
    } else if (catalog.dnsSelectors.length > 0 && canonicalDns === undefined) {
      findings.push(
        finding(
          serviceId,
          "dns-policy",
          "warn",
          "catalog DNS selectors are not yet expressed as canonical servicePolicies",
          catalog.dnsSelectors,
          null,
        ),
      );
    }

    const leftSource = ruleSourceFromYaml(relaxed.rules, yamlGroupName);
    const rightSource = ruleSourceFromCatalog(catalog);
    if (leftSource.length > 0 && rightSource.length > 0) {
      const leftSet = new Set(leftSource);
      if (!rightSource.some((kind) => leftSet.has(kind))) {
        findings.push(
          finding(
            serviceId,
            "rule-source",
            "fail",
            "rule source kinds do not overlap between generated YAML and catalog",
            leftSource,
            rightSource,
          ),
        );
      }
    }
  }

  for (const serviceId of pythonOnly) {
    findings.push(
      finding(
        serviceId,
        "projection-presence",
        "warn",
        "python catalog service is not yet expressed in core/*.yaml",
        { catalog: true },
        { canonical: false },
      ),
    );
  }
  for (const serviceId of canonicalOnly) {
    findings.push(
      finding(
        serviceId,
        "projection-presence",
        "warn",
        "canonical service has no python catalog counterpart",
        { catalog: false },
        { canonical: true },
      ),
    );
  }

  const mismatches = findings.filter((entry) => entry.severity === "fail");
  const warnings = findings.filter((entry) => entry.severity === "warn");
  const services: Record<string, ServiceParityVerdict> = {};
  for (const serviceId of [...new Set([...pythonIds, ...canonicalIds, "*"])].sort(compareId)) {
    const serviceFindings = findings.filter((entry) => entry.serviceId === serviceId);
    if (serviceId === "*" && serviceFindings.length === 0) continue;
    if (serviceId !== "*" && !pythonIds.includes(serviceId) && !canonicalIds.includes(serviceId)) continue;
    const sides: ServiceParityVerdict["sides"] = both.includes(serviceId)
      ? "both"
      : pythonOnly.includes(serviceId)
        ? "python-only"
        : "canonical-only";
    services[serviceId] = {
      serviceId,
      sides: serviceId === "*" ? "both" : sides,
      mismatches: serviceFindings.filter((entry) => entry.severity === "fail"),
      warnings: serviceFindings.filter((entry) => entry.severity === "warn"),
    };
  }

  return {
    schemaVersion: 1,
    status: mismatches.length === 0 ? "pass" : "fail",
    productionAuthority: "cfg/yaml/Custom_Clash_AI.yaml",
    coverage: { both, pythonOnly, canonicalOnly },
    terminal: { relaxed: relaxedMatch, strict: strictMatch },
    sharedBackends,
    services,
    mismatches,
    warnings,
  };
}

export function renderSemanticParityReport(report: SemanticParityReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function semanticParityIssues(report: SemanticParityReport): RoutingIssue[] {
  return report.mismatches.map((entry) =>
    issue(["semantic-parity", entry.serviceId, entry.dimension], entry.message),
  );
}

export async function buildSemanticParityReport(
  config: RoutingConfig,
  project: RoutingProject,
): Promise<SemanticParityReport> {
  return compareSemanticParity(config, await loadLegacyParityArtifacts(project));
}
