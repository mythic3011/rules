import assert from "node:assert/strict";
import test from "node:test";

import { createProfile, randomToken, sha256Hex } from "../worker/store.mjs";

test("capability tokens use 256 bits of random material", () => {
  const token = randomToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, randomToken());
});

test("D1 receives capability hashes, not plaintext tokens", async () => {
  let bound = null;
  const env = {
    DB: {
      prepare() {
        return {
          bind(...args) {
            bound = args;
            return { run: async () => ({ meta: { changes: 1 } }) };
          },
        };
      },
    },
  };
  const saved = await createProfile(env, { schemaVersion: 1, baseProfile: "ai-balanced" });
  assert.ok(bound);
  assert.equal(bound[1], await sha256Hex(saved.readToken));
  assert.equal(bound[2], await sha256Hex(saved.manageToken));
  assert.ok(!bound.includes(saved.readToken));
  assert.ok(!bound.includes(saved.manageToken));
});
