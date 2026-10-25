import assert from "node:assert/strict";
import test from "node:test";

import {
  ProfileSpecError,
  canonicalizeRegion,
  normalizeProfileSpec,
  resolveProfileSpec,
  solveSubconverterPlan,
  runtimeData,
} from "../worker/solver.mjs";
import { renderIni } from "../worker/render.mjs";
import { defaultServiceGroupLayout } from "./service-group-fixtures.mjs";

function serviceRuleReference(rule) {
  const value = rule.url ?? rule.value;
  return typeof rule.kind === "string" && typeof value === "string"
    ? JSON.stringify([rule.kind, value])
    : null;
}

function planRules(plan) {
  return plan.sections.flatMap((section) => {
    if (section.type === "rules") return section.rules;
    if (section.type === "clusters") return section.clusters.flatMap((cluster) => cluster.rules);
    return [];
  });
}

function planGroups(plan) {
  return plan.sections.flatMap((section) => section.type === "groups" ? section.groups : []);
}

function planSelectors(plan) {
  return plan.sections.flatMap((section) => (
    section.type === "selectors" ? section.selectors.map((selector) => selector.group) : []
  ));
}

test("region aliases canonicalize", () => {
  assert.equal(canonicalizeRegion("Hong Kong"), "hk");
  assert.equal(canonicalizeRegion("日本"), "jp");
  assert.equal(canonicalizeRegion("USA"), "us");
});

test("unknown HTTP-facing fields are rejected", () => {
  assert.throws(
    () => normalizeProfileSpec({ rawRule: "DOMAIN-SUFFIX,example.com" }),
    (error) => error instanceof ProfileSpecError && error.code === "unknown_profile_field",
  );
});

function editableIniLayout() {
  const data = structuredClone(runtimeData);
  return { data, layout: defaultServiceGroupLayout(data, "ini", "ai-balanced") };
}

test("service group CRUD layout validates and keeps a per-group HK route scoped", () => {
  const { data, layout } = editableIniLayout();
  for (const group of layout) group.routes = group.routes.filter((route) => route !== "jp");
  const google = layout.find((group) => group.id === "gemini");
  assert.ok(google);
  google.name = "Google AI Custom";
  google.routes = ["hk", "us", "reject"];
  const normalized = normalizeProfileSpec({ serviceGroups: layout, failClosed: true, disabledNodeRegions: ["jp"] }, data, "ini");
  assert.equal(normalized.serviceGroups[0].name, layout[0].name);

  const { plan } = solveSubconverterPlan({ serviceGroups: layout, failClosed: true, disabledNodeRegions: ["jp"] }, data);
  const selector = plan.sections.find((section) => section.type === "selectors" && section.role === "service-selectors")
    .selectors.find((entry) => entry.group.name === "Google AI Custom").group;
  assert.equal(selector.candidates[0].value, data.groups.reject);
  assert.ok(selector.candidates.some((candidate) => candidate.value === data.regions.find((region) => region.id === "hk").group));
  const hkGroup = plan.sections.find((section) => section.role === "automatic-region-groups")
    .groups.find((group) => group.name === data.regions.find((region) => region.id === "hk").group);
  assert.ok(hkGroup);
  assert.match(hkGroup.filterPattern, /JP/i);
  assert.ok(!plan.sections.some((section) => section.type === "selectors" && section.selectors.some((entry) => entry.group.name === data.regions.find((region) => region.id === "hk").group)));
});

test("custom service groups reject global route conflicts and incompatible exact rule owners", () => {
  const { data, layout } = editableIniLayout();
  const google = layout.find((group) => group.id === "gemini");
  google.routes = [...google.routes.filter((route) => route !== "jp"), "jp"];
  assert.throws(
    () => normalizeProfileSpec({ serviceGroups: layout, disabledNodeRegions: ["Japan"] }, data, "ini"),
    (error) => error instanceof ProfileSpecError && error.code === "conflicting_service_group_route",
  );

  const tools = layout.find((group) => group.id === "notebooklm");
  assert.ok(tools?.routes.includes("direct"));
  tools.routes = ["direct"];
  assert.throws(
    () => normalizeProfileSpec({ serviceGroups: layout, allowDirect: false }, data, "ini"),
    (error) => error instanceof ProfileSpecError && error.code === "conflicting_service_group_route",
  );

  const conflicting = structuredClone(layout);
  const geminiService = data.services.find((service) => service.id === "gemini");
  const notebookService = data.services.find((service) => service.id === "notebooklm");
  const sharedRule = { iniKind: "geosite", iniValue: "same-owner-check" };
  geminiService.ruleRefs.push(sharedRule);
  notebookService.ruleRefs.push({ ...sharedRule });
  assert.throws(
    () => normalizeProfileSpec({ serviceGroups: conflicting }, data, "ini"),
    (error) => error instanceof ProfileSpecError && error.code === "incompatible_service_rule_owners",
  );
});

test("protected service groups cannot be removed, renamed, moved, or widened", () => {
  const { data, layout } = editableIniLayout();
  const protect = layout.find((group) => group.id === data.accountProtection.serviceId);
  const renamed = structuredClone(layout);
  renamed.find((group) => group.id === protect.id).name = "Claude";
  assert.throws(() => normalizeProfileSpec({ serviceGroups: renamed }, data, "ini"), /protected account service group/i);

  const moved = structuredClone(layout);
  moved.find((group) => group.id === "chatgpt").serviceIds.push(protect.id);
  moved.find((group) => group.id === protect.id).serviceIds = [];
  assert.throws(() => normalizeProfileSpec({ serviceGroups: moved }, data, "ini"), /protected account service group/i);

  const widened = structuredClone(layout);
  widened.find((group) => group.id === protect.id).routes = ["direct"];
  assert.throws(() => normalizeProfileSpec({ serviceGroups: widened }, data, "ini"), /not allowed/i);

  const removed = layout.filter((group) => group.id !== protect.id);
  assert.throws(() => normalizeProfileSpec({ serviceGroups: removed }, data, "ini"), /cannot be deleted/i);
});

test("service group names honor shared UTF-16 limits and reject unsafe Unicode", () => {
  const { data, layout } = editableIniLayout();
  const group = layout[0];
  const maximum = data.serviceGroupLimits.maxNameLength;
  group.name = "😀".repeat(Math.floor(maximum / 2));
  assert.equal(normalizeProfileSpec({ serviceGroups: layout }, data, "ini").serviceGroups[0].name, group.name);

  group.name += "😀";
  assert.throws(
    () => normalizeProfileSpec({ serviceGroups: layout }, data, "ini"),
    (error) => error.code === "invalid_service_group_name",
  );
  group.name = "lone-\ud800-surrogate";
  assert.throws(
    () => normalizeProfileSpec({ serviceGroups: layout }, data, "ini"),
    (error) => error.code === "invalid_service_group_name",
  );
  group.name = "line\u2028separator";
  assert.throws(
    () => normalizeProfileSpec({ serviceGroups: layout }, data, "ini"),
    (error) => error.code === "invalid_service_group_name",
  );
});

test("service group IDs reject trailing line terminators", () => {
  const { data, layout } = editableIniLayout();
  layout[0].id += "\n";
  assert.throws(
    () => normalizeProfileSpec({ serviceGroups: layout }, data, "ini"),
    (error) => error.code === "invalid_service_group_id",
  );
});

test("literal DIRECT and REJECT cannot be used as custom service group names", () => {
  const { data, layout } = editableIniLayout();
  layout[0].name = "DIRECT";
  assert.throws(
    () => normalizeProfileSpec({ serviceGroups: layout }, data, "ini"),
    (error) => error.code === "reserved_service_group_name",
  );
  layout[0].name = "REJECT";
  assert.throws(
    () => normalizeProfileSpec({ serviceGroups: layout }, data, "ini"),
    (error) => error.code === "reserved_service_group_name",
  );
});

test("unassigned service rules become early reject rules", () => {
  const { data, layout } = editableIniLayout();
  const flow = layout.find((group) => group.serviceIds.includes("flow-music"));
  assert.ok(flow);
  flow.serviceIds = flow.serviceIds.filter((id) => id !== "flow-music");
  const { plan } = solveSubconverterPlan({ serviceGroups: layout }, data);
  const before = plan.sections.find((section) => section.role === "legacy-before");
  assert.equal(before.rules[0].target, data.accountProtection.rejectGroup);
  assert.ok(before.rules.some((rule) => rule.url?.includes("Flow_Music_Classical") && rule.target === data.accountProtection.rejectGroup));
});

test("service choices are rejected when unavailable in the selected output format", () => {
  const data = structuredClone(runtimeData);
  data.services.push({ id: "ini-only-service", outputFormats: ["ini"] });

  assert.deepEqual(
    normalizeProfileSpec({ disabledServices: ["ini-only-service"] }, data, "ini").disabledServices,
    ["ini-only-service"],
  );
  for (const field of ["disabledServices", "preferredServices"]) {
    assert.throws(
      () => normalizeProfileSpec({ [field]: ["ini-only-service"] }, data, "yaml"),
      (error) => error instanceof ProfileSpecError && error.code === "unknown_service",
    );
  }
});

test("a shared routing rule cannot be disabled for only one owning service", () => {
  const data = structuredClone(runtimeData);
  const sharedRule = { iniKind: "geosite", iniValue: "shared-example" };
  data.services = [
    { id: "service-a", group: "Group A", outputFormats: ["ini"], ruleRefs: [sharedRule] },
    { id: "service-b", group: "Group B", outputFormats: ["ini"], ruleRefs: [sharedRule] },
  ];

  assert.throws(
    () => normalizeProfileSpec({ disabledServices: ["service-a"] }, data, "ini"),
    (error) => error instanceof ProfileSpecError && error.code === "shared_service_rule",
  );
  assert.deepEqual(
    normalizeProfileSpec({ disabledServices: ["service-a", "service-b"] }, data, "ini").disabledServices,
    ["service-a", "service-b"],
  );
});

test("disabling one service denies only its rule refs and preserves a shared group for enabled siblings", () => {
  const disabledService = runtimeData.services.find((service) => service.id === "gemini");
  const sibling = runtimeData.services.find((service) => service.id === "android-studio-ai");
  assert.ok(disabledService && sibling);
  assert.equal(disabledService.group, sibling.group);

  const { plan } = solveSubconverterPlan({ disabledServices: [disabledService.id] });
  const group = planSelectors(plan).find((selector) => selector.name === disabledService.group);
  assert.ok(group);
  assert.ok(group.candidates.some((candidate) => candidate.value !== runtimeData.groups.reject));

  const disabledRefs = new Set(disabledService.ruleRefs.map(serviceRuleReference).filter(Boolean));
  const siblingRefs = new Set(sibling.ruleRefs.map(serviceRuleReference).filter(Boolean));
  const rules = planRules(plan);
  for (const reference of disabledRefs) {
    const matching = rules.filter((rule) => serviceRuleReference(rule) === reference);
    assert.ok(matching.length > 0, `missing disabled rule ${reference}`);
    assert.ok(matching.every((rule) => rule.target === runtimeData.groups.reject));
  }
  for (const reference of siblingRefs) {
    const matching = rules.filter((rule) => serviceRuleReference(rule) === reference);
    assert.ok(matching.length > 0, `missing sibling rule ${reference}`);
    assert.ok(matching.some((rule) => rule.target === sibling.group));
  }
});

test("a service group is denied only when every INI service member is disabled", () => {
  const service = runtimeData.services.find((item) => item.id === "gemini");
  assert.ok(service);
  const members = runtimeData.services.filter((item) => (
    item.outputFormats.includes("ini") && item.group === service.group
  ));
  assert.ok(members.length > 1);

  const { plan } = solveSubconverterPlan({ disabledServices: members.map((item) => item.id) });
  const selector = planSelectors(plan).find((item) => item.name === service.group);
  assert.deepEqual(selector.candidates, [{ kind: "group-ref", value: runtimeData.groups.reject }]);
});

test("legacy-before Flow Music rules and exact service refs are denied together", () => {
  const service = runtimeData.services.find((item) => item.id === "flow-music");
  assert.ok(service);
  const { plan } = solveSubconverterPlan({ disabledServices: [service.id] });
  const legacy = plan.sections.find((section) => section.role === "legacy-before");
  const group = planGroups(plan).find((item) => item.name === service.group);
  const flowRef = serviceRuleReference({
    kind: service.ruleRefs[0].iniKind,
    url: service.ruleRefs[0].iniValue,
  });
  const matchingRules = planRules(plan).filter((rule) => serviceRuleReference(rule) === flowRef);

  assert.ok(legacy.rules.some((rule) => rule.target === runtimeData.groups.reject));
  assert.deepEqual(group.candidates, [{ kind: "group-ref", value: runtimeData.groups.reject }]);
  assert.ok(matchingRules.length > 0);
  assert.ok(matchingRules.every((rule) => rule.target === runtimeData.groups.reject));
});

test("disabling Claude denies compiler-propagated payload refs and preserves account guard order", () => {
  const { serviceId, protectedGroup, rejectGroup } = runtimeData.accountProtection;
  const service = runtimeData.services.find((item) => item.id === serviceId);
  assert.ok(service);
  assert.ok(service.ruleRefs.some((ref) => ref.iniValue.includes("AI_Claude_Classical")));
  assert.ok(service.ruleRefs.some((ref) => ref.iniKind === "geosite" && ref.iniValue === "category-ntp"));

  const { plan } = solveSubconverterPlan({ disabledServices: [serviceId] });
  const disabledRefs = new Set(service.ruleRefs.map((ref) => JSON.stringify([ref.iniKind, ref.iniValue])));
  const matchingRules = planRules(plan).filter((rule) => disabledRefs.has(serviceRuleReference(rule)));
  assert.ok(matchingRules.length >= service.ruleRefs.length);
  assert.ok(matchingRules.every((rule) => rule.target === rejectGroup));

  const protectedSelector = planGroups(plan).find((group) => group.name === protectedGroup);
  assert.deepEqual(protectedSelector.candidates, [{ kind: "group-ref", value: rejectGroup }]);
  const accountGuard = planGroups(plan).find((group) => group.name === runtimeData.groups["high-risk-account"]);
  assert.equal(accountGuard.candidates[0].value, "[]REJECT");
  const roles = plan.sections.map((section) => section.role);
  assert.ok(roles.indexOf("privacy-guard") < roles.indexOf("legacy-before"));
  assert.ok(roles.indexOf("legacy-before") < roles.indexOf("service-rule-clusters"));
});

test("allowDirect=false rewrites direct choices in rule targets and selectors", () => {
  const { plan } = solveSubconverterPlan({ allowDirect: false });
  const directNames = new Set(["DIRECT", runtimeData.groups.direct]);
  assert.ok(planRules(plan).every((rule) => !directNames.has(rule.target)));
  for (const group of [...planGroups(plan), ...planSelectors(plan)]) {
    assert.ok(group.candidates.every((candidate) => !(
      candidate.kind === "group-ref" && directNames.has(candidate.value)
    )));
  }
  const directGroup = planGroups(plan).find((group) => group.name === runtimeData.groups.direct);
  assert.deepEqual(directGroup.candidates, [{ kind: "group-ref", value: runtimeData.groups.reject }]);
});

test("disabled JP removes automatic and stable JP paths", () => {
  const { plan } = solveSubconverterPlan({ disabledNodeRegions: ["jp"] });
  const ini = renderIni(plan, runtimeData);
  assert.ok(!ini.includes(`custom_proxy_group=${runtimeData.groups.jp}\``));
  assert.ok(!ini.includes(`[]${runtimeData.groups.jp}`));
  const manual = ini.split("\n").find((line) => line.startsWith("custom_proxy_group=🚀 手動選擇"));
  assert.match(manual, /Japan/);
});

test("only mode is closed-world and honors preference order", () => {
  const { plan, resolved } = solveSubconverterPlan({
    onlyNodeRegions: ["us", "sg"],
    preferredNodeRegions: ["sg"],
  });
  assert.deepEqual(resolved.activeRegionIds, ["sg", "us"]);
  const ini = renderIni(plan, runtimeData);
  const auto = ini.split("\n").find((line) => line.startsWith(`custom_proxy_group=${runtimeData.groups.auto}\``));
  assert.ok(auto.includes(`[]${runtimeData.groups.sg}\`[]${runtimeData.groups.us}`));
  assert.doesNotMatch(auto, /其他／未識別/);
  assert.ok(!ini.includes(`custom_proxy_group=${runtimeData.groups.jp}\``));
  const manual = ini.split("\n").find((line) => line.startsWith("custom_proxy_group=🚀 手動選擇"));
  assert.match(manual, /\(\?=\.\*/);
  assert.match(manual, /Singapore/);
  assert.match(manual, /United States/);
});

test("observation-only HK can be disabled but cannot be only exit", () => {
  const resolved = resolveProfileSpec({ disabledNodeRegions: ["香港"] });
  assert.deepEqual(resolved.disabledRegionIds, ["hk"]);
  assert.throws(
    () => resolveProfileSpec({ onlyNodeRegions: ["hk"] }),
    (error) => error.code === "non_routable_only_region",
  );
});

test("preferred disabled region is rejected", () => {
  assert.throws(
    () => resolveProfileSpec({ disabledNodeRegions: ["jp"], preferredNodeRegions: ["jp"] }),
    (error) => error.code === "inactive_preferred_region",
  );
});

import { createHash } from "node:crypto";

test("worker renderer matches Python compiler parity fixtures", () => {
  for (const [name, fixture] of Object.entries(runtimeData.parityFixtures)) {
    const { plan } = solveSubconverterPlan(fixture.spec);
    const body = renderIni(plan, runtimeData).split("[custom]\n", 2)[1];
    const hash = createHash("sha256").update(body).digest("hex");
    assert.equal(hash, fixture.customBodySha256, name);
  }
});
