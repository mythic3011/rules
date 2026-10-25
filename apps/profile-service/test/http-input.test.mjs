import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.mjs";

const env = { ASSETS: { fetch: async () => new Response("asset-shell") } };
const resolveUrl = "https://rules.example/api/v1/resolve";

function requestWith(body, headers = {}) {
  return new Request(resolveUrl, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    duplex: "half",
  });
}

test("JSON media type accepts complete parameters and rejects lookalikes", async () => {
  const body = JSON.stringify({ spec: {} });
  for (const contentType of [
    "application/json",
    'Application/JSON; charset="utf-8"',
    'application/json; note="a;b\\\"c"; charset=utf-8',
  ]) {
    assert.equal((await worker.fetch(requestWith(body, { "content-type": contentType }), env)).status, 200);
  }
  for (const contentType of [
    "application/jsonfoo",
    "application/json; charset=",
    'application/json; charset="utf-8',
    "application/json, text/plain",
    "application/json;",
  ]) {
    const response = await worker.fetch(requestWith(body, { "content-type": contentType }), env);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "invalid_content_type");
  }
});

test("declared body size accepts decimal octets and rejects invalid or excessive lengths", async () => {
  const body = JSON.stringify({ spec: {} });
  const accepted = requestWith(body, { "content-length": String(new TextEncoder().encode(body).byteLength) });
  assert.equal((await worker.fetch(accepted, env)).status, 200);
  for (const contentLength of ["-1", "1.5", "1e3", "32769"]) {
    const response = await worker.fetch(requestWith(body, { "content-length": contentLength }), env);
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, "body_too_large");
  }
});

test("streamed UTF-8 body size overrides a misleading length and cancels overflow", async () => {
  const text = JSON.stringify({ spec: { padding: "é".repeat(16_500) } });
  const bytes = new TextEncoder().encode(text);
  assert.ok(text.length < 32_768);
  assert.ok(bytes.byteLength > 32_768);
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 16_000));
      controller.enqueue(bytes.subarray(16_000));
    },
    cancel() { cancelled = true; },
  });
  const response = await worker.fetch(requestWith(body, { "content-length": "1" }), env);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "body_too_large");
  assert.equal(cancelled, true);
});

test("a JSON body exactly at the resolver byte limit is accepted", async () => {
  const json = JSON.stringify({ spec: {} });
  const body = json + " ".repeat(32_768 - json.length);
  assert.equal((await worker.fetch(requestWith(body), env)).status, 200);
});

test("managed profile read parses a case-insensitive Bearer scheme", async () => {
  const request = new Request("https://rules.example/api/v1/profiles/00000000-0000-0000-0000-000000000000", {
    headers: { authorization: `bEaReR ${"a".repeat(40)}` },
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "profile_store_unavailable");
});

test("profile JSON input requires an object", async () => {
  for (const value of [null, [], 0, "profile"]) {
    const response = await worker.fetch(requestWith(JSON.stringify(value)), env);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "invalid_request");
  }
});
