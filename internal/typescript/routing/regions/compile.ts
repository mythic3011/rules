import { readFile } from "node:fs/promises";

import {
  CompiledRegionsSchema,
  LegacyV1RegionsDocumentSchema,
  RegionsConfigSchema,
  type CompiledRegions,
  type LegacyV1RegionsDocument,
  type RegionRecord,
  type RegionsConfig,
} from "./schema.js";

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniquePreserve(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function prefixPattern(prefix: string): string {
  return `\\b${escapeRegex(prefix)}(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b`;
}

function foldKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function pushEvidence(
  bucket: Record<string, string[]>,
  key: string,
  regionId: string,
): void {
  const folded = foldKey(key);
  const owners = bucket[folded] ?? [];
  if (!owners.includes(regionId)) owners.push(regionId);
  owners.sort(compareId);
  bucket[folded] = owners;
}

function compileTerms(region: RegionRecord): string {
  const parts = [
    ...region.match.flags,
    ...region.match.aliases,
    ...region.match.cities,
    ...region.match.prefixes.map(prefixPattern),
    ...region.match.airportCodes,
  ];
  return uniquePreserve(parts).join("|");
}

function compileKeywords(region: RegionRecord): string[] {
  return uniquePreserve([...region.match.airportCodes, ...region.match.cities, ...region.match.flags]);
}

/**
 * Existing v1 records keep their previously authored term/keyword order so
 * mihomo group membership stays byte-identical. New regions are compiled
 * from match. The evidence index is independent of this projection order.
 */
const LEGACY_V1_PIN: Readonly<
  Record<string, { terms: string; aliases: readonly string[]; keywords: readonly string[] }>
> = {
  us: {
    terms:
      "🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC",
    aliases: ["United States", "USA", "America", "美國", "美国"],
    keywords: ["LAX", "SFO", "SJC", "SEA", "DFW", "NYC", "JFK", "EWR", "IAD", "ATL", "ORD", "MIA", "🇺🇸"],
  },
  jp: {
    terms:
      "🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai",
    aliases: ["Japan", "日本"],
    keywords: ["Tokyo", "東京", "东京", "Osaka", "大阪", "NRT", "HND", "KIX", "TYO", "OSA", "Kansai", "🇯🇵"],
  },
  sg: {
    terms: "🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN",
    aliases: ["Singapore", "新加坡", "獅城", "狮城"],
    keywords: ["SIN", "🇸🇬"],
  },
  tw: {
    terms:
      "🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC",
    aliases: ["Taiwan", "台灣", "臺灣", "台湾"],
    keywords: ["TPE", "台北", "臺北", "新北", "台中", "臺中", "高雄", "彰化", "ROC", "🇹🇼"],
  },
  kr: {
    terms:
      "🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN",
    aliases: ["South Korea", "Korea", "韓國", "韩国"],
    keywords: ["Seoul", "首爾", "首尔", "ICN", "Chuncheon", "春川", "🇰🇷"],
  },
  hk: {
    terms: "🇭🇰|香港|Hong Kong|HongKong|HKG|\\bHK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b",
    aliases: ["Hong Kong", "香港", "HK"],
    keywords: ["HKG", "🇭🇰"],
  },
};

function assertRegionInvariants(config: RegionsConfig): void {
  const seen = new Set<string>();
  for (const region of config.regions) {
    if (seen.has(region.id)) throw new Error(`duplicate region id ${region.id}`);
    seen.add(region.id);
  }
  for (const regionId of config.routing.primaryOrder) {
    const region = config.regions.find((item) => item.id === regionId);
    if (region === undefined) throw new Error(`primaryOrder references unknown region ${regionId}`);
    if (!region.roles.includes("exit")) {
      throw new Error(`primaryOrder region ${regionId} must have the exit role`);
    }
  }
  const exits = config.regions.filter((region) => region.roles.includes("exit")).map((region) => region.id);
  if (exits.length !== config.routing.primaryOrder.length || exits.some((id) => !config.routing.primaryOrder.includes(id))) {
    throw new Error("primaryOrder must list every exit region exactly once");
  }
}

export function compileRegions(config: RegionsConfig): {
  readonly compiled: CompiledRegions;
  readonly legacy: LegacyV1RegionsDocument;
} {
  const parsed = RegionsConfigSchema.parse(config);
  assertRegionInvariants(parsed);
  const flags: Record<string, string[]> = {};
  const aliases: Record<string, string[]> = {};
  const cities: Record<string, string[]> = {};
  const airportCodes: Record<string, string[]> = {};
  const countryAlpha2: Record<string, string[]> = {};
  const countryAlpha3: Record<string, string[]> = {};
  const prefixes: { regionId: string; pattern: string }[] = [];
  const roles: Record<string, Array<"exit">> = {};
  const groups: Record<string, string> = {};
  const names: Record<string, string> = {};

  for (const region of parsed.regions) {
    roles[region.id] = [...region.roles];
    groups[region.id] = region.group;
    names[region.id] = region.name;
    for (const flag of region.match.flags) pushEvidence(flags, flag, region.id);
    for (const alias of region.match.aliases) pushEvidence(aliases, alias, region.id);
    for (const city of region.match.cities) pushEvidence(cities, city, region.id);
    for (const code of region.match.airportCodes) pushEvidence(airportCodes, code, region.id);
    for (const code of region.match.countryCodes.alpha2) pushEvidence(countryAlpha2, code, region.id);
    for (const code of region.match.countryCodes.alpha3) pushEvidence(countryAlpha3, code, region.id);
    for (const prefix of region.match.prefixes) {
      prefixes.push({ regionId: region.id, pattern: prefixPattern(prefix) });
    }
  }
  prefixes.sort((left, right) => compareId(left.regionId, right.regionId) || compareId(left.pattern, right.pattern));

  const compiled = CompiledRegionsSchema.parse({
    schemaVersion: 1,
    primaryOrder: parsed.routing.primaryOrder,
    roles,
    groups,
    names,
    evidence: {
      flags,
      aliases,
      cities,
      airportCodes,
      countryAlpha2,
      countryAlpha3,
      prefixes,
    },
  });

  const orderedIds = [
    ...parsed.routing.primaryOrder,
    ...parsed.regions.map((region) => region.id).filter((id) => !parsed.routing.primaryOrder.includes(id)),
  ];
  const byId = new Map(parsed.regions.map((region) => [region.id, region]));
  const legacy = LegacyV1RegionsDocumentSchema.parse({
    schemaVersion: 1,
    primaryOrder: parsed.routing.primaryOrder,
    regions: orderedIds.map((id) => {
      const region = byId.get(id);
      if (region === undefined) throw new Error(`missing region ${id}`);
      const pin = LEGACY_V1_PIN[region.id];
      return {
        id: region.id,
        group: region.group,
        terms: pin?.terms ?? compileTerms(region),
        name: region.name,
        countryCodes: [...region.match.countryCodes.alpha2],
        aliases: pin !== undefined ? [...pin.aliases] : [...region.match.aliases],
        keywords: pin !== undefined ? [...pin.keywords] : compileKeywords(region),
      };
    }),
  });

  return { compiled, legacy };
}

export function renderJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function loadRegionsSource(path: string): Promise<RegionsConfig> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  return RegionsConfigSchema.parse(raw);
}
