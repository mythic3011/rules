import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { z } from "zod";

import { compileRegions, loadRegionsSource } from "#routing/regions/compile.js";
import {
  classifyLegacyTerms,
  classifyNodeName,
  exitRegionIds,
  isExitRegion,
  UNKNOWN_REGION,
} from "#routing/regions/runtime.js";
import { RegionsConfigSchema, type RegionsConfig } from "#routing/regions/schema.js";
import { loadCanonicalInputs } from "#routing-test/support/canonical-inputs.js";

const CORPUS = [
  "🇺🇸 US-LA-01",
  "US-01",
  "Los Angeles",
  "日本 東京",
  "JP-01",
  "Singapore SIN",
  "台灣 台北",
  "Korea ICN",
  "🇭🇰 Hong Kong",
  "proxy.example.com:8080",
  "isp.decodo.com:10001",
  "status.io",
  "no-reply.net",
  "justus.com",
  "FRA",
  "FRA-01",
  "France FRA",
  "Frankfurt FRA",
  "🇩🇪 Frankfurt FRA",
  "IT",
  "NO",
  "CA",
  "residential-pool.xx.net:3128",
];

async function loadSource(): Promise<RegionsConfig> {
  const { project } = await loadCanonicalInputs();
  return loadRegionsSource(project.regionsSource);
}

test("regions.source.json validates against the exported JSON Schema", async () => {
  const { project } = await loadCanonicalInputs();
  const source = await loadRegionsSource(project.regionsSource);
  RegionsConfigSchema.parse(source);
  const committed = await readFile(project.regionsSchemaOutput, "utf8");
  assert.equal(committed, `${JSON.stringify(z.toJSONSchema(RegionsConfigSchema), null, 2)}\n`);
});

const BASELINE_PRIMARY_TERMS: Readonly<Record<string, string>> = {
  us: "🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|邁阿密|迈阿密|華盛頓|华盛顿|\\bUS(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC",
  jp: "🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|\\bJP(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|Kansai",
  sg: "🇸🇬|新加坡|獅城|狮城|\\bSG(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Singapore|SIN",
  tw: "🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|\\bTW(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Taiwan|TWN|TPE|ROC",
  kr: "🇰🇷|韓國|韩国|首爾|首尔|春川|\\bKR(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b|Korea|KOR|Chuncheon|ICN",
  hk: "🇭🇰|香港|Hong Kong|HongKong|HKG|\\bHK(?:[-_ ]?\\d+(?:[-_ ]?[A-Za-z]{2,})?)?\\b",
};

test("compiled v1 terms match current primary-region membership for us/jp/sg/tw/kr/hk", async () => {
  const { project } = await loadCanonicalInputs();
  const source = await loadRegionsSource(project.regionsSource);
  const { compiled, legacy } = compileRegions(source);
  const previousTerms = BASELINE_PRIMARY_TERMS;
  const nextTerms = Object.fromEntries(legacy.regions.map((region) => [region.id, region.terms]));
  const order = ["us", "jp", "sg", "tw", "kr", "hk"] as const;
  for (const node of CORPUS) {
    const left = classifyLegacyTerms(node, previousTerms, order);
    const right = classifyLegacyTerms(node, nextTerms, order);
    assert.equal(right, left, `${node}: compiled terms ${right} !== current terms ${left}`);
  }
  assert.deepEqual(compiled.primaryOrder, ["us", "jp", "sg", "tw", "kr"]);
  assert.deepEqual(exitRegionIds(compiled), ["us", "jp", "sg", "tw", "kr"]);
  assert.equal(isExitRegion(compiled, "hk"), false);
  assert.equal(isExitRegion(compiled, "de"), false);
  assert.equal(isExitRegion(compiled, "us"), true);
});

test("decisive evidence overrides ambiguous codes", async () => {
  const source = await loadSource();
  const { compiled } = compileRegions(source);
  assert.equal(classifyNodeName("FRA", compiled), UNKNOWN_REGION);
  assert.equal(classifyNodeName("FRA-01", compiled), UNKNOWN_REGION);
  assert.equal(classifyNodeName("France FRA", compiled), "fr");
  assert.equal(classifyNodeName("Frankfurt FRA", compiled), "de");
  assert.equal(classifyNodeName("🇩🇪 Frankfurt FRA", compiled), "de");
});

test("raw host:port and substring-prone names classify as unknown", async () => {
  const source = await loadSource();
  const { compiled } = compileRegions(source);
  assert.equal(classifyNodeName("proxy.example.com:8080", compiled), UNKNOWN_REGION);
  assert.equal(classifyNodeName("isp.decodo.com:10001", compiled), UNKNOWN_REGION);
  assert.equal(classifyNodeName("residential-pool.xx.net:3128", compiled), UNKNOWN_REGION);
  assert.equal(classifyNodeName("status.io", compiled), UNKNOWN_REGION);
  assert.equal(classifyNodeName("no-reply.net", compiled), UNKNOWN_REGION);
  assert.equal(classifyNodeName("justus.com", compiled), UNKNOWN_REGION);
  assert.equal(classifyNodeName("🇺🇸 US-LA-01", compiled), "us");
  assert.equal(classifyNodeName("US-01", compiled), "us");
  assert.equal(classifyNodeName("US", compiled), UNKNOWN_REGION);
});

test("ambiguous airport/prefix codes without decisive evidence are unknown", async () => {
  const source = await loadSource();
  const { compiled } = compileRegions(source);
  assert.equal(classifyNodeName("IT", compiled), UNKNOWN_REGION);
  assert.equal(classifyNodeName("NO", compiled), UNKNOWN_REGION);
  assert.equal(classifyNodeName("CA", compiled), UNKNOWN_REGION);
});

test("secondary regions classify but are not exits", async () => {
  const source = await loadSource();
  const { compiled, legacy } = compileRegions(source);
  assert.equal(classifyNodeName("London LHR", compiled), "uk");
  assert.equal(classifyNodeName("Macau", compiled), "mo");
  assert.equal(isExitRegion(compiled, "uk"), false);
  assert.equal(isExitRegion(compiled, "mo"), false);
  assert.equal(legacy.primaryOrder.includes("uk"), false);
  assert.equal(legacy.primaryOrder.includes("de"), false);
  for (const regionId of ["mo", "uk", "fr", "de", "it", "no", "ca", "au", "ru", "ua", "tr"]) {
    assert.deepEqual(compiled.roles[regionId], []);
  }
});

test("flipping a secondary region to exit is a routing-topology change", async () => {
  const source = structuredClone(await loadSource());
  const germany = source.regions.find((region) => region.id === "de");
  assert.ok(germany !== undefined);
  germany.roles = ["exit"];
  source.routing.primaryOrder = [...source.routing.primaryOrder, "de"];
  const { compiled, legacy } = compileRegions(source);
  assert.equal(isExitRegion(compiled, "de"), true);
  assert.deepEqual(exitRegionIds(compiled), ["us", "jp", "sg", "tw", "kr", "de"]);
  assert.deepEqual(legacy.primaryOrder, ["us", "jp", "sg", "tw", "kr", "de"]);
});
