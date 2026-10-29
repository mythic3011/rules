import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";
import test from "node:test";

const cli = resolve(import.meta.dirname, "../tools/profile-agent.mjs");

async function startFixture() {
  const seen = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    seen.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body });
    const result = request.url === "/api/v1/catalog"
      ? { schemaVersion: 1, templates: [] }
      : request.method === "POST" && request.url === "/api/v1/resolve"
        ? { spec: body.spec ?? body, summary: { baseProfile: "ai-balanced" } }
        : request.method === "POST" && request.url === "/api/v1/profiles"
          ? { id: "profile-id", readToken: "read-capability", manageToken: "manage-capability", revision: 1 }
        : request.method === "GET" && request.url === "/api/v1/profiles/secret-token"
          ? { error: "sensitive-manage-token" }
          : request.method === "GET" && request.url === "/api/v1/profiles/profile-id"
            ? { id: "profile-id", revision: 1, spec: { baseProfile: "ai-balanced" } }
            : request.method === "PUT" && request.url === "/api/v1/profiles/profile-id"
              ? { id: "profile-id", revision: 2, spec: body.spec ?? body }
              : { error: "not_found" };
    response.writeHead(result.error ? 404 : request.method === "POST" && request.url === "/api/v1/profiles" ? 201 : 200, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(result));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, seen, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function invoke(fixture, command, { input = "", env = {} } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, "--base-url", fixture.baseUrl, ...command], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolveResult({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

test("profile agent exposes catalog, resolve, managed CRUD with JSON-only stdout", async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.server.close());
  const spec = {
    schemaVersion: 1,
    baseProfile: "ai-balanced",
    adblock: true,
    customRuleProviders: [{
      url: "https://example.org/rules.yaml",
      behavior: "domain",
      target: "reject",
    }],
  };

  const catalog = await invoke(fixture, ["catalog"]);
  assert.equal(catalog.code, 0);
  assert.deepEqual(JSON.parse(catalog.stdout), { schemaVersion: 1, templates: [] });
  assert.equal(catalog.stderr, "");

  const resolved = await invoke(fixture, ["resolve", "-"], { input: JSON.stringify({ spec }) });
  assert.equal(resolved.code, 0);
  assert.deepEqual(JSON.parse(resolved.stdout).spec, spec);

  const created = await invoke(fixture, ["create", "-"], { input: JSON.stringify({ spec }) });
  assert.equal(created.code, 0);
  assert.equal(JSON.parse(created.stdout).manageToken, "manage-capability");

  const credential = "sensitive-manage-token";
  const managed = await invoke(fixture, ["get", "profile-id"], { env: { PROFILE_MANAGE_TOKEN: credential } });
  assert.equal(managed.code, 0);
  assert.equal(fixture.seen.at(-1).authorization, `Bearer ${credential}`);

  const updated = await invoke(fixture, ["update", "profile-id", "-"], {
    input: JSON.stringify({ spec }), env: { PROFILE_MANAGE_TOKEN: credential },
  });
  assert.equal(updated.code, 0);
  assert.equal(JSON.parse(updated.stdout).revision, 2);
  assert.equal(fixture.seen.at(-1).authorization, `Bearer ${credential}`);
});

test("profile agent never writes management credentials to output or errors", async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.server.close());
  const credential = "sensitive-manage-token";
  const result = await invoke(fixture, ["get", "missing-id"], { env: { PROFILE_MANAGE_TOKEN: credential } });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /HTTP 404, not_found/);
  assert.equal(result.stderr.includes(credential), false);

  const malformedError = await invoke(fixture, ["get", "secret-token"], { env: { PROFILE_MANAGE_TOKEN: credential } });
  assert.equal(malformedError.code, 1);
  assert.match(malformedError.stderr, /request_failed/);
  assert.equal(malformedError.stderr.includes(credential), false);
});

test("profile agent bounds JSON read from stdin", async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.server.close());
  const input = JSON.stringify({ value: "x".repeat(300_001) });
  const result = await invoke(fixture, ["resolve", "-"], { input });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /JSON input exceeds 300000 bytes/);
  assert.equal(fixture.seen.length, 0);
});
