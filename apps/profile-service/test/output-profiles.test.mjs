import assert from "node:assert/strict";
import test from "node:test";

import { getProfileOptions, resolveOutputProfile } from "../worker/profile_options.mjs";
import runtimeData from "../worker/generated/runtime-data.mjs";
import { defaultServiceGroupLayout } from "./service-group-fixtures.mjs";

function fixture() {
  const regions = ["us", "jp", "sg", "hk"].map((id) => ({
    id, name: id.toUpperCase(), group: id.toUpperCase(), terms: id.toUpperCase(),
    filterPattern: `(?i)(?:${id})`, countryCodes: [id.toUpperCase()], aliases: [], keywords: [], routable: id !== "hk",
  }));
  const profile = {
    "proxy-groups": [
      { name: "Reject", type: "select", proxies: ["REJECT"] },
      { name: "Direct", type: "select", proxies: ["DIRECT"] },
      { name: "Tools", type: "select", proxies: ["Pinned", "Direct"] },
      { name: "AI", type: "select", proxies: ["Pinned", "Direct"] },
      { name: "Account", type: "select", proxies: ["REJECT", "Pinned"], "default-selected": "REJECT" },
      { name: "Pinned", type: "select", proxies: ["US", "JP", "SG", "Direct"] },
      { name: "Auto", type: "select", proxies: ["SG", "JP", "US", "Other"] },
      { name: "Manual", type: "select", proxies: ["DIRECT"], use: ["provider1"], filter: ".*" },
      ...regions.map((region) => ({ name: region.group, type: "select", use: ["provider1"], filter: `(?i)${region.terms}` })),
      { name: "Other", type: "select", use: ["provider1"], filter: ".*", "exclude-filter": "(?i)(?:US|JP|SG)" },
      { name: "Fallback", type: "select", proxies: ["Auto", "Direct"] },
    ],
    "rule-providers": {
      Privacy: { payload: ["DST-PORT,3478"] },
      Account: { payload: ["DOMAIN,account.example"] },
      Earlier: { payload: ["DOMAIN,shared.example", "DOMAIN,earlier.example"] },
      Disabled: { payload: ["DOMAIN,shared.example", "DOMAIN,disabled.example"] },
      Sibling: { payload: ["DOMAIN,sibling.example"] },
    },
    rules: [
      "RULE-SET,Privacy,Reject",
      "RULE-SET,Account,Account",
      "RULE-SET,Earlier,Tools",
      "RULE-SET,Disabled,AI",
      "RULE-SET,Sibling,AI",
      "GEOIP,private,DIRECT,no-resolve",
      "AND,((NETWORK,UDP),(DST-PORT,443)),DIRECT",
      "MATCH,Fallback",
    ],
  };
  return {
    schemaVersion: 1,
    defaultProfiles: { ini: "ai-balanced", yaml: "ai-balanced" },
    templates: [{ id: "ai-balanced", outputFormat: "yaml", name: "AI", supportsProfileOptions: true }],
    outputProfiles: { yaml: { "ai-balanced": profile } },
    groups: { manual: "Manual", auto: "Auto", fallback: "Fallback", direct: "Direct", reject: "Reject" },
    regions,
    routableRegionOrder: ["us", "jp", "sg"],
    regionGroups: { US: "us", JP: "jp", SG: "sg" },
    stableRegionGroups: {},
    otherRegionGroup: "Other",
    accountProtection: { serviceId: "protected", protectedGroup: "Account", rejectGroup: "REJECT" },
    services: [
      { id: "earlier", name: "Earlier", group: "Tools", outputFormats: ["yaml"], ruleRefs: [{ yamlKind: "RULE-SET", yamlValue: "Earlier" }] },
      { id: "disabled", name: "Disabled", group: "AI", outputFormats: ["ini", "yaml"], ruleRefs: [{ yamlKind: "RULE-SET", yamlValue: "Disabled" }] },
      { id: "sibling", name: "Sibling", group: "AI", outputFormats: ["ini", "yaml"], ruleRefs: [{ yamlKind: "RULE-SET", yamlValue: "Sibling" }] },
      { id: "protected", name: "Protected", group: "Account", outputFormats: ["ini", "yaml"], ruleRefs: [{ yamlKind: "RULE-SET", yamlValue: "Account" }] },
      { id: "ini-only", name: "INI only", group: "INI", outputFormats: ["ini"], ruleRefs: [] },
    ],
    render: { defaultLanguage: "en", localized: { en: { header: [] } } },
  };
}

function resolve(data, spec) {
  return resolveOutputProfile({ outputFormat: "yaml", data, spec });
}

function group(profile, name) {
  return profile["proxy-groups"].find((value) => value.name === name);
}

function pattern(value) {
  return new RegExp(value.replace(/\(\?i\)/gu, ""), "i");
}

function domainRoute(profile, host) {
  for (const rule of profile.rules) {
    const [kind, value, target] = rule.split(",");
    if (kind === "MATCH") return value;
    if (kind !== "RULE-SET") continue;
    if (profile["rule-providers"][value].payload.some((entry) => entry === `DOMAIN,${host}`)) return target;
  }
  return null;
}

test("service disabling denies overlaps before earlier rules while keeping a shared sibling usable", () => {
  const data = fixture();
  const output = resolve(data, { disabledServices: ["disabled"] });
  assert.equal(domainRoute(output, "shared.example"), "Reject");
  assert.equal(domainRoute(output, "disabled.example"), "Reject");
  assert.equal(domainRoute(output, "sibling.example"), "AI");
  assert.equal(domainRoute(output, "earlier.example"), "Tools");
  assert.ok(group(output, "AI").proxies.includes("Pinned"));
  assert.equal(output.rules[0], "RULE-SET,Privacy,Reject");
  assert.equal(domainRoute(data.outputProfiles.yaml["ai-balanced"], "shared.example"), "Tools");
});

test("disabling every member makes the shared group reject-only", () => {
  const output = resolve(fixture(), { disabledServices: ["disabled", "sibling"] });
  assert.deepEqual(group(output, "AI").proxies, ["Reject"]);
  assert.equal(domainRoute(output, "sibling.example"), "Reject");
  assert.ok(group(output, "Tools").proxies.includes("Pinned"));
});

test("excluded regions cannot re-enter through Other or mixed regional node names", () => {
  const output = resolve(fixture(), { disabledNodeRegions: ["jp"] });
  assert.equal(group(output, "JP"), undefined);
  assert.ok(group(output, "Other"));
  assert.ok(pattern(group(output, "Other")["exclude-filter"]).test("jp-node"));
  assert.equal(pattern(group(output, "Other").filter).test("jp-node"), false);
  assert.equal(pattern(group(output, "Manual").filter).test("jp-node"), false);
  assert.equal(pattern(group(output, "US").filter).test("US-JP-node"), false);
  assert.ok(pattern(group(output, "Other").filter).test("unknown-node"));
});

test("only mode removes Other and excludes unknown nodes from every provider-backed group", () => {
  const output = resolve(fixture(), { onlyNodeRegions: ["sg"] });
  assert.equal(group(output, "Other"), undefined);
  for (const entry of output["proxy-groups"].filter((value) => value.use)) {
    assert.equal(pattern(entry.filter).test("unknown-node"), false);
    assert.equal(pattern(entry.filter).test("JP-node"), false);
  }
  assert.ok(pattern(group(output, "Manual").filter).test("SG-node"));
});

test("DIRECT disabling removes transitive choices and preserves trailing rule options", () => {
  const output = resolve(fixture(), { allowDirect: false });
  for (const entry of output["proxy-groups"]) {
    assert.ok(!(entry.proxies ?? []).some((choice) => choice === "DIRECT" || choice === "Direct"));
  }
  assert.ok(output.rules.includes("GEOIP,private,Reject,no-resolve"));
  assert.ok(output.rules.includes("AND,((NETWORK,UDP),(DST-PORT,443)),Reject"));
});

test("DIRECT disabling routes application DNS through the proxy while retaining encrypted proxy bootstrap", () => {
  const data = fixture();
  const proxyResolvers = ["https://1.1.1.1/dns-query#Pinned"];
  const bootstrapResolvers = ["https://8.8.8.8/dns-query#DIRECT"];
  const directResolvers = ["https://127.0.0.1:5053/dns-query#DIRECT"];
  data.outputProfiles.yaml["ai-balanced"].dns = {
    nameserver: proxyResolvers,
    "default-nameserver": directResolvers,
    "proxy-server-nameserver": bootstrapResolvers,
    "direct-nameserver": directResolvers,
    "nameserver-policy": {
      "geosite:cn": directResolvers,
      "private.example": directResolvers[0],
      "global.example": proxyResolvers,
    },
  };
  const output = resolve(data, { allowDirect: false });
  assert.deepEqual(output.dns["proxy-server-nameserver"], bootstrapResolvers);
  assert.deepEqual(output.dns["direct-nameserver"], proxyResolvers);
  assert.deepEqual(output.dns["default-nameserver"], proxyResolvers);
  for (const resolvers of Object.values(output.dns["nameserver-policy"])) {
    assert.deepEqual(resolvers, proxyResolvers);
  }
  assert.deepEqual(resolve(data, { allowDirect: true }).dns["nameserver-policy"]["geosite:cn"], directResolvers);
  assert.deepEqual(data.outputProfiles.yaml["ai-balanced"].dns["direct-nameserver"], directResolvers);
});

test("fail-closed candidates begin with REJECT then preferred regions, preserving account protection", () => {
  const output = resolve(fixture(), { failClosed: true, preferredNodeRegions: ["us", "jp", "sg"] });
  assert.deepEqual(group(output, "Auto").proxies, ["Reject", "US", "JP", "SG", "Other"]);
  assert.deepEqual(group(output, "Fallback").proxies, ["Reject"]);
  assert.equal(group(output, "Manual").proxies[0], "Reject");
  assert.deepEqual(group(output, "Account").proxies, ["REJECT", "Pinned"]);
  assert.equal(group(output, "Account")["default-selected"], "REJECT");
  const relaxed = resolve(fixture(), { failClosed: false });
  assert.equal(group(relaxed, "Account").proxies[0], "REJECT");
  assert.deepEqual(group(relaxed, "Fallback").proxies, ["Auto"]);
});

test("service preference reorders selectors without changing rule priority", () => {
  const data = fixture();
  const output = resolve(data, { preferredServices: ["sibling"] });
  assert.deepEqual(output.rules, data.outputProfiles.yaml["ai-balanced"].rules);
  assert.ok(output["proxy-groups"].findIndex((entry) => entry.name === "AI") < output["proxy-groups"].findIndex((entry) => entry.name === "Tools"));
});

test("YAML custom groups combine services and add HK only as a scoped selector", () => {
  const data = structuredClone(runtimeData);
  const layout = defaultServiceGroupLayout(data, "yaml", "ai-balanced");
  const google = layout.find((entry) => entry.id === "gemini");
  const tools = layout.find((entry) => entry.id === "notebooklm");
  const protectedGroup = layout.find((entry) => entry.id === data.accountProtection.serviceId);
  google.name = "Combined Google AI";
  google.serviceIds.push(...tools.serviceIds);
  google.routes = ["hk", "us", "reject"];
  layout.splice(layout.indexOf(tools), 1);
  for (const group of layout) group.routes = group.routes.filter((route) => route !== "jp");
  protectedGroup.routes = ["sg", "us", "reject"];

  const output = resolve(data, { serviceGroups: layout, failClosed: true, disabledNodeRegions: ["jp"] });
  const reject = data.groups.reject;
  const hk = data.regions.find((region) => region.id === "hk");
  const combined = group(output, "Combined Google AI");
  assert.deepEqual(combined.proxies, [reject, hk.group, data.regions.find((region) => region.id === "us").group]);
  assert.deepEqual(group(output, hk.group).use, group(output, data.groups.manual).use);
  assert.match(group(output, hk.group).filter, /JP/i);
  assert.equal(group(output, data.accountProtection.protectedGroup).proxies[0], reject);
  assert.deepEqual(group(output, data.accountProtection.protectedGroup).proxies.slice(1), [
    data.regions.find((region) => region.id === "sg").group,
    data.regions.find((region) => region.id === "us").group,
  ]);
  for (const serviceId of [...google.serviceIds, ...tools.serviceIds]) {
    const service = data.services.find((entry) => entry.id === serviceId);
    for (const ref of service.ruleRefs ?? []) {
      if (!ref.yamlKind || !ref.yamlValue) continue;
      const matching = output.rules.filter((rule) => `${rule.split(",")[0]}:${rule.split(",")[1]}` === `${ref.yamlKind}:${ref.yamlValue}`);
      assert.ok(matching.length > 0);
      assert.ok(matching.every((rule) => rule.split(",").at(-1) === "Combined Google AI"));
    }
  }
});

test("YAML custom layouts reject unassigned services before earlier overlap rules", () => {
  const data = structuredClone(runtimeData);
  const layout = defaultServiceGroupLayout(data, "yaml", "ai-balanced");
  const unassignedId = "gemini";
  layout.find((entry) => entry.id === "gemini").serviceIds = layout.find((entry) => entry.id === "gemini").serviceIds.filter((id) => id !== unassignedId);
  const output = resolve(data, { serviceGroups: layout, failClosed: true });
  const service = data.services.find((entry) => entry.id === unassignedId);
  const serviceRefs = new Set((service.ruleRefs ?? []).map((ref) => `${ref.yamlKind}:${ref.yamlValue}`));
  const firstDenied = output.rules.findIndex((rule) => serviceRefs.has(`${rule.split(",")[0]}:${rule.split(",")[1]}`));
  assert.ok(firstDenied >= 0);
  assert.equal(output.rules[firstDenied].split(",").at(-1), data.groups.reject);
  const firstOtherService = output.rules.findIndex((rule) => (
    data.services.some((entry) => entry.id !== unassignedId && (entry.ruleRefs ?? []).some((ref) => (
      `${rule.split(",")[0]}:${rule.split(",")[1]}` === `${ref.yamlKind}:${ref.yamlValue}`
    )))
  ));
  assert.ok(firstDenied < firstOtherService);
});

test("YAML custom default routes keep the exact source subgroup and reject incompatible merges", () => {
  const data = structuredClone(runtimeData);
  const layout = defaultServiceGroupLayout(data, "yaml", "ai-balanced");
  const chatgpt = layout.find((entry) => entry.id === "chatgpt");
  const copilot = layout.find((entry) => entry.id === "copilot");
  chatgpt.name = "Combined Accounts";
  chatgpt.serviceIds.push(...copilot.serviceIds);
  chatgpt.routes = ["default"];
  layout.splice(layout.indexOf(copilot), 1);
  const output = resolve(data, { serviceGroups: layout, failClosed: true });
  const target = data.serviceGroups.find((entry) => (
    entry.id === "chatgpt" && entry.outputFormat === "yaml" && entry.baseProfile === "ai-balanced"
  )).defaultRouteGroup;
  assert.deepEqual(group(output, "Combined Accounts").proxies, [data.groups.reject, target]);

  const incompatible = structuredClone(data);
  const copilotMeta = incompatible.serviceGroups.find((entry) => (
    entry.id === "copilot" && entry.outputFormat === "yaml" && entry.baseProfile === "ai-balanced"
  ));
  copilotMeta.defaultRouteGroup = data.groups.manual;
  assert.throws(
    () => resolve(incompatible, { serviceGroups: layout, failClosed: true }),
    (error) => error.code === "incompatible_service_group_route",
  );
});

test("canonical account protection survives relaxed fallback and rejects a disabled protected service", () => {
  const data = fixture();
  group(data.outputProfiles.yaml["ai-balanced"], "Account").proxies = ["Pinned", "REJECT"];
  const output = resolve(data, { failClosed: false });
  assert.deepEqual(group(output, "Account").proxies, ["REJECT", "Pinned"]);
  const disabled = resolve(data, { failClosed: false, disabledServices: ["protected"] });
  assert.deepEqual(group(disabled, "Account").proxies, ["REJECT"]);
  assert.equal(domainRoute(disabled, "account.example"), "Reject");
});

test("public choices only advertise services supported by the output format", () => {
  assert.deepEqual(getProfileOptions({ outputFormat: "yaml", data: fixture() }).services.map((entry) => entry.id), ["earlier", "disabled", "sibling", "protected"]);
});
