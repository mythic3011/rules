import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.mjs";

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

test("opaque read capability ignores query-string routing tampering", async () => {
  const environment = env();
  const saved = await createSavedProfile(environment, { disabledNodeRegions: ["jp"] });
  const response = await worker.fetch(
    new Request(`https://rules.example/p/${saved.readToken}.ini?disable=us&prefer=hk`),
    environment,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(
    response.headers.get("content-security-policy"),
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  const ini = await response.text();
  assert.doesNotMatch(ini, /custom_proxy_group=🇯🇵 日本節點/);
  assert.match(ini, /custom_proxy_group=🇺🇸 美國節點/);
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
  assert.doesNotMatch(await before.text(), /custom_proxy_group=🇯🇵 日本節點/);

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
  assert.match(ini, /custom_proxy_group=🇯🇵 日本節點/);
  assert.doesNotMatch(ini, /custom_proxy_group=🇺🇸 美國節點/);
});
