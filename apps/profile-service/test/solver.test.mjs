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

test("disabled JP removes automatic and stable JP paths", () => {
  const { plan } = solveSubconverterPlan({ disabledNodeRegions: ["jp"] });
  const ini = renderIni(plan, runtimeData);
  assert.doesNotMatch(ini, /custom_proxy_group=🇯🇵 日本節點/);
  assert.doesNotMatch(ini, /custom_proxy_group=🇯🇵 JP Stable/);
  assert.doesNotMatch(ini, /\[\]🇯🇵 日本節點/);
  assert.doesNotMatch(ini, /\[\]🇯🇵 JP Stable/);
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
  const auto = ini.split("\n").find((line) => line.startsWith("custom_proxy_group=♻️ 自動選擇"));
  assert.match(auto, /\[\]🇸🇬 新加坡節點`\[\]🇺🇸 美國節點/);
  assert.doesNotMatch(auto, /其他／未識別/);
  assert.doesNotMatch(ini, /custom_proxy_group=🇯🇵 日本節點/);
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
