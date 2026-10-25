import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.mjs";
import { runtimeData } from "../worker/solver.mjs";
import { defaultServiceGroupLayout } from "./service-group-fixtures.mjs";

const envWithoutDb = {
  ASSETS: {
    fetch: async () => new Response("asset-shell", { status: 200 }),
  },
};

test("POST resolve returns INI without exposing preferences in a URL", async () => {
  const request = new Request("https://rules.example/api/v1/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spec: { disabledNodeRegions: ["jp"] } }),
  });
  const response = await worker.fetch(request, envWithoutDb);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  const body = await response.json();
  assert.equal(body.spec.disabledNodeRegions[0], "jp");
  assert.match(body.ini, /\[custom\]/);
  assert.ok(!body.ini.includes(`custom_proxy_group=${runtimeData.groups.jp}\``));
});

test("arbitrary query-string preference route is not a config API", async () => {
  const response = await worker.fetch(
    new Request("https://rules.example/v1/profile/ai.ini?disable=jp"),
    envWithoutDb,
  );
  assert.equal(await response.text(), "asset-shell");
});

test("saving a profile requires D1", async () => {
  const request = new Request("https://rules.example/api/v1/profiles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spec: { disabledNodeRegions: ["hk"] } }),
  });
  const response = await worker.fetch(request, envWithoutDb);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "profile_store_unavailable");
});

test("unexpected errors keep subscription capabilities out of responses and application logs", async () => {
  const token = "x".repeat(43);
  const privateUrl = `https://rules.example/p/${token}.ini`;
  const logs = [];
  const originalError = console.error;
  console.error = (...values) => { logs.push(...values); };
  try {
    const response = await worker.fetch(new Request(privateUrl), {
      ...envWithoutDb,
      DB: { prepare() { throw new Error(`Database failure for ${privateUrl}`); } },
    });
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.ok(!body.includes(token));
    assert.deepEqual(logs, [{ event: "profile_service_error" }]);
  } finally {
    console.error = originalError;
  }
});

test("unknown renderer directives are rejected before persistence", async () => {
  const request = new Request("https://rules.example/api/v1/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spec: { rawRule: "DOMAIN-SUFFIX,example.com" } }),
  });
  const response = await worker.fetch(request, envWithoutDb);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "unknown_profile_field");
});

test("profile writes honor Cloudflare rate-limit binding when configured", async () => {
  const env = {
    ...envWithoutDb,
    PROFILE_WRITE_LIMITER: { limit: async () => ({ success: false }) },
  };
  const request = new Request("https://rules.example/api/v1/profiles", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10" },
    body: JSON.stringify({ spec: { disabledNodeRegions: ["hk"] } }),
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
});

test("catalog exposes registered output templates and safe routing controls", async () => {
  const response = await worker.fetch(new Request("https://rules.example/api/v1/catalog"), envWithoutDb);
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.ok(catalog.templates.some((template) => template.outputFormat === "ini"));
  assert.ok(catalog.templates.some((template) => template.outputFormat === "yaml"));
  assert.equal(catalog.templates.length, runtimeData.templates.length);
  for (const template of catalog.templates) assert.equal(Object.hasOwn(template, "path"), false);
  for (const region of catalog.regions) {
    for (const key of ["terms", "filterPattern", "keywords"]) assert.equal(Object.hasOwn(region, key), false);
  }
  assert.ok(catalog.services.length > 0);
  assert.equal(catalog.serviceGroups.length, runtimeData.serviceGroups.length);
  assert.deepEqual(catalog.serviceGroupLimits, runtimeData.serviceGroupLimits);
  assert.deepEqual(catalog.serviceGroupRouteLabels, runtimeData.serviceGroupRouteLabels);
  assert.deepEqual(catalog.reservedGroupNames, runtimeData.reservedGroupNames);
  assert.ok(catalog.serviceGroups.some((group) => (
    group.outputFormat === "yaml" && group.baseProfile === "ai-balanced" && group.id === "gemini"
  )));
  for (const group of catalog.serviceGroups) assert.equal(Object.hasOwn(group, "defaultRouteGroup"), false);
  assert.equal(catalog.optionDefaults.allowDirect, false);
  assert.equal(catalog.optionDefaults.failClosed, true);
  assert.deepEqual(catalog.languages, ["en", "zh-Hant", "zh-Hans"]);
});

test("resolve applies a complete service group layout and scopes HK outside global pools", async () => {
  const layout = defaultServiceGroupLayout(runtimeData, "ini", "ai-balanced");
  const chatgpt = layout.find((group) => group.id === "chatgpt");
  chatgpt.name = "ChatGPT Plus";
  chatgpt.routes = ["hk", "us", "reject"];
  const request = new Request("https://rules.example/api/v1/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spec: { failClosed: true, serviceGroups: layout } }),
  });
  const response = await worker.fetch(request, envWithoutDb);
  assert.equal(response.status, 200);
  const body = await response.json();
  const hk = runtimeData.regions.find((region) => region.id === "hk");
  assert.ok(body.ini.includes("custom_proxy_group=ChatGPT Plus`select`"));
  assert.ok(body.ini.includes(`[]${hk.group}`));
  const autoPrefix = `custom_proxy_group=${runtimeData.groups.auto}`;
  const auto = body.ini.split("\n").find((line) => line.startsWith(autoPrefix));
  assert.ok(auto);
  assert.ok(!auto.includes(`[]${hk.group}`));
  assert.deepEqual(body.spec.serviceGroups.find((group) => group.id === "chatgpt").routes, ["hk", "us", "reject"]);
});

test("registered static INI templates preview and reject unsupported policy options", async () => {
  const templates = runtimeData.templates.filter((template) => template.outputFormat === "ini" && !template.supportsProfileOptions);
  assert.ok(templates.length > 0);
  for (const template of templates) {
    const preview = await worker.fetch(new Request("https://rules.example/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: { baseProfile: template.id, language: "en" } }),
    }), envWithoutDb);
    assert.equal(preview.status, 200);
    const payload = await preview.json();
    assert.equal(payload.spec.baseProfile, template.id);
    assert.match(payload.ini, /\[custom\]/);
    assert.doesNotMatch(payload.ini, /`url-test`/);

    const rejected = await worker.fetch(new Request("https://rules.example/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: { baseProfile: template.id, disabledNodeRegions: ["jp"] } }),
    }), envWithoutDb);
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error, "unsupported_profile_options");
  }
});
