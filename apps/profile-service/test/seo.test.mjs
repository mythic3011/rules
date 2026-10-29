import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../worker/index.mjs";

const publicDir = new URL("../public/", import.meta.url);

test("public tool pages have useful descriptions and social metadata without a fixed origin", async () => {
  const [builder, converter] = await Promise.all([
    readFile(new URL("index.html", publicDir), "utf8"),
    readFile(new URL("converter.html", publicDir), "utf8"),
  ]);

  for (const [html, title] of [[builder, "OpenClash Profile Builder"], [converter, "OpenClash Online YAML Converter"]]) {
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.match(html, /<meta property="og:type" content="website">/);
    assert.ok(html.includes(`<meta property="og:title" content="${title}">`));
    assert.match(html, /<meta property="og:description" content="[^"]+">/);
    assert.match(html, /<meta name="twitter:card" content="summary">/);
    assert.ok(html.includes(`<meta name="twitter:title" content="${title}">`));
    assert.match(html, /<meta name="twitter:description" content="[^"]+">/);
    assert.doesNotMatch(html, /<link rel="canonical"/);
  }
});

test("robots and LLM discovery files describe only the public tools and exclude private routes", async () => {
  const [robots, llms, headers] = await Promise.all([
    readFile(new URL("robots.txt", publicDir), "utf8"),
    readFile(new URL("llms.txt", publicDir), "utf8"),
    readFile(new URL("_headers", publicDir), "utf8"),
  ]);

  assert.match(robots, /Disallow: \/manage/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/p\//);
  assert.match(headers, /\/manage\*[\s\S]*?X-Robots-Tag: noindex, nofollow, noarchive/);
  assert.match(llms, /`\/` — Build an INI custom-template subscription/);
  assert.match(llms, /`\/converter\.html` — Convert proxy links/);
  assert.match(llms, /should not be indexed or reproduced/);
  assert.doesNotMatch(llms, /https?:\/\//);
});

test("API and opaque subscription responses carry noindex headers", async () => {
  const apiResponse = await worker.fetch(new Request("https://rules.example/api/v1/catalog"), {
    ASSETS: { fetch: async () => new Response("asset") },
  });
  assert.equal(apiResponse.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");

  const subscriptionResponse = await worker.fetch(new Request(`https://rules.example/p/${"x".repeat(43)}.ini`), {
    ASSETS: { fetch: async () => new Response("asset") },
    DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
  });
  assert.equal(subscriptionResponse.status, 404);
  assert.equal(subscriptionResponse.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
});
