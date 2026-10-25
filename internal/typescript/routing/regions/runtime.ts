import type { CompiledRegions } from "./schema.js";

export const UNKNOWN_REGION = "unknown" as const;

export type RegionClassification = string | typeof UNKNOWN_REGION;

type EvidenceKind =
  | "flag"
  | "alias"
  | "city"
  | "airportCode"
  | "alpha2"
  | "alpha3"
  | "prefix";

const DECISIVE_KINDS = new Set<EvidenceKind>(["flag", "alias", "city"]);

interface Hit {
  readonly kind: EvidenceKind;
  readonly regionId: string;
}

const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;
const HOST_PORT = /^(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?::\d+)?$/;
const IPV4_PORT = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/;

function fold(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function looksLikeRawHost(nodeName: string): boolean {
  const trimmed = nodeName.trim();
  return HOST_PORT.test(trimmed) || IPV4_PORT.test(trimmed);
}

function containsPhrase(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  if (/^[a-z0-9]/i.test(needle) && /[a-z0-9]$/i.test(needle)) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegex(needle)}(?:$|[^a-z0-9])`, "iu").test(haystack);
  }
  return haystack.includes(needle);
}

function lookup(
  map: Readonly<Record<string, readonly string[]>>,
  token: string,
): readonly string[] {
  return map[fold(token)] ?? [];
}

function collectHits(compiled: CompiledRegions, nodeName: string): Hit[] {
  const hits: Hit[] = [];
  const foldedName = fold(nodeName);
  const skipAmbiguous = looksLikeRawHost(nodeName);
  const tokens = nodeName
    .split(TOKEN_SPLIT)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  for (const [key, regionIds] of Object.entries(compiled.evidence.flags)) {
    if (!foldedName.includes(key) && !tokens.some((token) => fold(token) === key)) continue;
    for (const regionId of regionIds) hits.push({ kind: "flag", regionId });
  }
  for (const [key, regionIds] of Object.entries(compiled.evidence.aliases)) {
    if (!containsPhrase(foldedName, key)) continue;
    for (const regionId of regionIds) hits.push({ kind: "alias", regionId });
  }
  for (const [key, regionIds] of Object.entries(compiled.evidence.cities)) {
    if (!containsPhrase(foldedName, key)) continue;
    for (const regionId of regionIds) hits.push({ kind: "city", regionId });
  }

  if (skipAmbiguous) return hits;

  for (const token of tokens) {
    if (/^[A-Za-z]{3}$/.test(token)) {
      for (const regionId of lookup(compiled.evidence.airportCodes, token)) {
        hits.push({ kind: "airportCode", regionId });
      }
      for (const regionId of lookup(compiled.evidence.countryAlpha3, token)) {
        hits.push({ kind: "alpha3", regionId });
      }
    }
  }

  for (const prefix of compiled.evidence.prefixes) {
    const structured = new RegExp(
      prefix.pattern.replace("(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?", "[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?"),
      "iu",
    );
    if (structured.test(nodeName) || structured.test(foldedName) || tokens.some((token) => structured.test(token))) {
      hits.push({ kind: "prefix", regionId: prefix.regionId });
    }
  }

  return hits;
}

function uniqueRegions(hits: readonly Hit[]): string[] {
  return unique(hits.map((hit) => hit.regionId)).sort();
}

export function classifyNodeName(nodeName: string, compiled: CompiledRegions): RegionClassification {
  const hits = collectHits(compiled, nodeName);
  const decisive = uniqueRegions(hits.filter((hit) => DECISIVE_KINDS.has(hit.kind)));
  if (decisive.length === 1) {
    const [regionId] = decisive;
    return regionId ?? UNKNOWN_REGION;
  }
  if (decisive.length > 1) return UNKNOWN_REGION;
  const ambiguous = uniqueRegions(hits.filter((hit) => !DECISIVE_KINDS.has(hit.kind)));
  if (ambiguous.length === 1) {
    const [regionId] = ambiguous;
    return regionId ?? UNKNOWN_REGION;
  }
  return UNKNOWN_REGION;
}

export function exitRegionIds(compiled: CompiledRegions): readonly string[] {
  return compiled.primaryOrder.filter((id) => compiled.roles[id]?.includes("exit") === true);
}

export function isExitRegion(compiled: CompiledRegions, regionId: string): boolean {
  return compiled.roles[regionId]?.includes("exit") === true;
}

export function classifyLegacyTerms(
  nodeName: string,
  termsByRegion: Readonly<Record<string, string>>,
  order: readonly string[],
): RegionClassification {
  for (const regionId of order) {
    const terms = termsByRegion[regionId];
    if (terms === undefined) continue;
    if (new RegExp(terms, "iu").test(nodeName)) return regionId;
  }
  return UNKNOWN_REGION;
}
