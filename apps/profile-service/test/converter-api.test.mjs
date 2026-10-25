import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.mjs";

const envWithoutDb = {
  ASSETS: {
    fetch: async () => new Response("asset-shell", { status: 200 }),
  },
};

function convertRequest(body) {
  return new Request("https://rules.example/api/v1/convert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST convert returns canonical inline YAML with private no-store headers", async () => {
  const response = await worker.fetch(
    convertRequest({ input: "socks5h://user:secret@proxy.example:1080#Imported", format: "proxy" }),
    envWithoutDb,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const body = await response.json();
  assert.equal(body.nodeCount, 1);
  assert.match(body.yaml, /type: inline/u);
  assert.match(body.yaml, /MATCH,/u);
  assert.match(body.yaml, /secret/u);
});

test("converter returns sanitized errors and rejects unknown request fields", async () => {
  const invalid = await worker.fetch(
    convertRequest({ input: "socks5h://user:secret@proxy.example:1080?plugin=secret" }),
    envWithoutDb,
  );
  assert.equal(invalid.status, 400);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.error, "unsupported_node_option");
  assert.doesNotMatch(invalidBody.message, /secret|proxy\.example/u);

  const unknown = await worker.fetch(
    convertRequest({ input: "socks5://proxy.example:1080", source: "external" }),
    envWithoutDb,
  );
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error, "unknown_converter_field");
});

test("remote subscription links fail closed when no exact host is configured", async () => {
  const response = await worker.fetch(
    convertRequest({ input: "https://feeds.example.net/sub?token=private", format: "subscription" }),
    envWithoutDb,
  );
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, "subscription_host_not_allowed");
  assert.doesNotMatch(body.message, /feeds\.example|private/u);
});

test("mixed proxy links and denied subscriptions return one sanitized error without partial YAML", async () => {
  const response = await worker.fetch(
    convertRequest({
      input: [
        "socks5h://synthetic-user:synthetic-pass@socks.example.net:1080#Local",
        "https://proxy.example.net:443#HTTPS",
        "https://unapproved-one.example.net/sub?token=synthetic-one",
        "https://unapproved-two.example.net/sub?token=synthetic-two",
      ].join("\n"),
      format: "auto",
    }),
    envWithoutDb,
  );
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, "subscription_host_not_allowed");
  assert.equal(Object.hasOwn(body, "yaml"), false);
  assert.doesNotMatch(body.message, /synthetic|unapproved|socks\.example/u);
});

test("converter rejects oversized streamed JSON request bodies", async () => {
  const body = `{"input":"${"x".repeat(300_001)}"}`;
  const response = await worker.fetch(
    new Request("https://rules.example/api/v1/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    envWithoutDb,
  );
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "body_too_large");
});

test("converter requests honor the configured rate limiter", async () => {
  const env = {
    ...envWithoutDb,
    PROFILE_WRITE_LIMITER: { limit: async () => ({ success: false }) },
  };
  const response = await worker.fetch(
    convertRequest({ input: "socks5://proxy.example:1080", format: "proxy" }),
    env,
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal((await response.json()).message, "Too many conversion requests");
});
