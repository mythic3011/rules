import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.mjs";
import { runtimeData } from "../worker/solver.mjs";

class FakeD1 {
  constructor() {
    this.rows = [];
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...args) {
        return {
          async run() {
            if (sql.includes("INSERT INTO profiles")) {
              const [id, readHash, manageHash, specJson, created, updated] = args;
              db.rows.push({
                id,
                read_token_hash: readHash,
                manage_token_hash: manageHash,
                spec_json: specJson,
                revision: 1,
                created_at: created,
                updated_at: updated,
              });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET spec_json")) {
              const [specJson, updated, id, manageHash] = args;
              const row = db.rows.find((item) => item.id === id && item.manage_token_hash === manageHash);
              if (!row) return { meta: { changes: 0 } };
              row.spec_json = specJson;
              row.updated_at = updated;
              row.revision += 1;
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET read_token_hash")) {
              const [readHash, updated, id, manageHash] = args;
              const row = db.rows.find((item) => item.id === id && item.manage_token_hash === manageHash);
              if (!row) return { meta: { changes: 0 } };
              row.read_token_hash = readHash;
              row.updated_at = updated;
              row.revision += 1;
              return { meta: { changes: 1 } };
            }
            throw new Error(`Unhandled fake D1 run SQL: ${sql}`);
          },
          async first() {
            if (sql.includes("WHERE read_token_hash = ?")) {
              const [readHash] = args;
              return db.rows.find((item) => item.read_token_hash === readHash) ?? null;
            }
            if (sql.includes("WHERE id = ? AND manage_token_hash = ?")) {
              const [id, manageHash] = args;
              return db.rows.find((item) => item.id === id && item.manage_token_hash === manageHash) ?? null;
            }
            throw new Error(`Unhandled fake D1 first SQL: ${sql}`);
          },
        };
      },
    };
  }
}

function env() {
  return {
    DB: new FakeD1(),
    ASSETS: { fetch: async () => new Response("asset") },
  };
}

async function createSavedProfile(environment, spec) {
  const response = await worker.fetch(
    new Request("https://rules.example/api/v1/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec }),
    }),
    environment,
  );
  assert.equal(response.status, 201);
  return response.json();
}

test("profile catalog publishes canonical input and custom-provider limits", async () => {
  const response = await worker.fetch(new Request("https://rules.example/api/v1/catalog"), env());
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.ok(Number.isInteger(catalog.profileSpecLimits?.maxJsonBytes));
  assert.ok(catalog.profileSpecLimits.maxJsonBytes > 0);
  assert.deepEqual(catalog.customRuleProviderLimits, { maxProviders: 10, maxUrlLength: 2048 });
  assert.equal(catalog.optionDefaults.adblock, false);
  assert.deepEqual(catalog.optionDefaults.customRuleProviders, []);
  assert.equal(catalog.templates.find((template) => template.outputFormat === "yaml" && template.id === "standard").supportsRuleProviderOptions, true);
  assert.equal(catalog.templates.find((template) => template.outputFormat === "ini" && template.id === "standard").supportsRuleProviderOptions, false);
});

test("resolve and saved subscriptions preserve custom providers and canonical adblock", async () => {
  const environment = env();
  const spec = {
    adblock: true,
    customRuleProviders: [
      { url: "https://custom.example/domain.yaml", behavior: "domain", target: "proxy" },
      { url: "https://custom.example/classical.yaml", behavior: "classical", target: "direct" },
    ],
  };
  const preview = await worker.fetch(new Request("https://rules.example/api/v1/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spec }),
  }), environment);
  assert.equal(preview.status, 200);
  const resolved = await preview.json();
  assert.deepEqual(resolved.spec.customRuleProviders, spec.customRuleProviders);
  assert.equal(resolved.spec.adblock, true);
  assert.match(resolved.ini, new RegExp(runtimeData.adblockRuleProvider.url.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.match(resolved.ini, /clash-domain:https:\/\/custom\.example\/domain\.yaml/);
  assert.match(resolved.ini, /clash-classic:https:\/\/custom\.example\/classical\.yaml/);
  assert.ok(!Object.hasOwn(resolved.spec, "language"));

  const saved = await createSavedProfile(environment, resolved.spec);
  const subscription = await worker.fetch(new Request(`https://rules.example/p/${saved.readToken}.ini`), environment);
  assert.equal(subscription.status, 200);
  assert.equal(await subscription.text(), resolved.ini);

  const managed = await worker.fetch(new Request(`https://rules.example/api/v1/profiles/${saved.id}`, {
    headers: { authorization: `Bearer ${saved.manageToken}` },
  }), environment);
  assert.equal(managed.status, 200);
  const stored = await managed.json();
  assert.equal(stored.spec.adblock, true);
  assert.deepEqual(stored.spec.customRuleProviders, spec.customRuleProviders);
});

test("opaque read capability ignores query-string routing tampering", async () => {
  const environment = env();
  const saved = await createSavedProfile(environment, { disabledNodeRegions: ["jp"] });
  const response = await worker.fetch(
    new Request(`https://rules.example/p/${saved.readToken}.ini?disable=us&prefer=hk`),
    environment,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  const ini = await response.text();
  assert.ok(!ini.includes(`custom_proxy_group=${runtimeData.groups.jp}\``));
  assert.ok(ini.includes(`custom_proxy_group=${runtimeData.groups.us}\``));
});

test("short subscription URL redirects to the INI endpoint without returning the INI body", async () => {
  const environment = env();
  const saved = await createSavedProfile(environment, { disabledNodeRegions: ["jp"] });
  const response = await worker.fetch(new Request(`https://rules.example/p/${saved.readToken}?prefer=jp`), environment);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("location"), `/p/${saved.readToken}.ini`);
  assert.equal(await response.text(), "");

  const followed = await worker.fetch(new Request(new URL(response.headers.get("location"), "https://rules.example")), environment);
  assert.equal(followed.status, 200);
  const ini = await followed.text();
  assert.match(ini, /\[custom\]/);
  assert.ok(!ini.includes(`custom_proxy_group=${runtimeData.groups.jp}\``));

  const invalid = await worker.fetch(new Request("https://rules.example/p/short"), environment);
  assert.equal(invalid.status, 404);
  assert.equal(invalid.headers.get("location"), null);
});

test("subscription endpoint returns security headers on 404 responses", async () => {
  const environment = env();
  const response = await worker.fetch(
    new Request("https://rules.example/p/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.ini"),
    environment,
  );
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
});

test("read capability cannot manage profile; manage capability can", async () => {
  const environment = env();
  const saved = await createSavedProfile(environment, { disabledNodeRegions: ["hk"] });

  const denied = await worker.fetch(
    new Request(`https://rules.example/api/v1/profiles/${saved.id}`, {
      headers: { authorization: `Bearer ${saved.readToken}` },
    }),
    environment,
  );
  assert.equal(denied.status, 404);

  const allowed = await worker.fetch(
    new Request(`https://rules.example/api/v1/profiles/${saved.id}`, {
      headers: { authorization: `Bearer ${saved.manageToken}` },
    }),
    environment,
  );
  assert.equal(allowed.status, 200);
  assert.deepEqual((await allowed.json()).spec.disabledNodeRegions, ["hk"]);
});

test("editing saved ProfileSpec keeps subscription URL stable", async () => {
  const environment = env();
  const saved = await createSavedProfile(environment, { disabledNodeRegions: ["jp"] });
  const url = `https://rules.example/p/${saved.readToken}.ini`;

  const before = await worker.fetch(new Request(url), environment);
  assert.ok(!(await before.text()).includes(`custom_proxy_group=${runtimeData.groups.jp}\``));

  const update = await worker.fetch(
    new Request(`https://rules.example/api/v1/profiles/${saved.id}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${saved.manageToken}`,
      },
      body: JSON.stringify({ spec: { disabledNodeRegions: ["us"] } }),
    }),
    environment,
  );
  assert.equal(update.status, 200);
  assert.equal((await update.json()).revision, 2);

  const after = await worker.fetch(new Request(url), environment);
  const ini = await after.text();
  assert.ok(ini.includes(`custom_proxy_group=${runtimeData.groups.jp}\``));
  assert.ok(!ini.includes(`custom_proxy_group=${runtimeData.groups.us}\``));
});

test("registered static INI selections can be saved and updated through the same subscription", async () => {
  const environment = env();
  const initialSpec = { baseProfile: "standard", language: "en" };
  const saved = await createSavedProfile(environment, initialSpec);
  const url = `https://rules.example/p/${saved.readToken}.ini`;
  const before = await worker.fetch(new Request(url), environment);
  assert.equal(before.status, 200);
  assert.match(await before.text(), /\[custom\]/);

  const nextSpec = { baseProfile: "lite", language: "zh-Hant" };
  const update = await worker.fetch(new Request(`https://rules.example/api/v1/profiles/${saved.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${saved.manageToken}` },
    body: JSON.stringify({ spec: nextSpec }),
  }), environment);
  assert.equal(update.status, 200);
  assert.equal((await update.json()).revision, 2);

  const after = await worker.fetch(new Request(url), environment);
  assert.equal(after.status, 200);
  assert.equal(after.headers.get("x-profile-revision"), "2");
  const preview = await worker.fetch(new Request("https://rules.example/api/v1/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spec: nextSpec }),
  }), environment);
  assert.equal(await after.text(), (await preview.json()).ini);

  const managed = await worker.fetch(new Request(`https://rules.example/api/v1/profiles/${saved.id}`, {
    headers: { authorization: `Bearer ${saved.manageToken}` },
  }), environment);
  assert.equal(managed.status, 200);
  const { spec } = await managed.json();
  assert.equal(spec.baseProfile, "lite");
  assert.equal(spec.language, "zh-Hant");
});

test("unsupported static-template options are rejected before any profile is saved", async () => {
  const environment = env();
  for (const spec of [
    { baseProfile: "standard", allowDirect: false },
    { baseProfile: "standard", adblock: true },
    { baseProfile: "standard", customRuleProviders: [{ url: "https://custom.example/rules.yaml", behavior: "domain", target: "proxy" }] },
  ]) {
    const response = await worker.fetch(new Request("https://rules.example/api/v1/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec }),
    }), environment);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "unsupported_profile_options");
  }
  assert.equal(environment.DB.rows.length, 0);
});
