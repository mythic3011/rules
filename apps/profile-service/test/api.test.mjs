import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.mjs";

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
  assert.doesNotMatch(body.ini, /custom_proxy_group=🇯🇵 日本節點/);
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
