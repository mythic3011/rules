import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { experimental_patchConfig, experimental_readRawConfig } from "wrangler";

import { DeploymentError, pinDeploymentDatabase } from "../tools/deploy.mjs";

const sourcePath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
const { rawConfig: sourceConfig } = experimental_readRawConfig({ config: sourcePath });
const configIO = { readRawConfig: experimental_readRawConfig, patchConfig: experimental_patchConfig };

function fixture(t, rawConfig) {
  const directory = mkdtempSync(path.join(tmpdir(), "profile-deploy-config-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, "wrangler.jsonc");
  writeFileSync(configPath, `// Operator comment must survive database setup.\n${JSON.stringify(rawConfig, null, 2)}\n`);
  return {
    configPath,
    read: () => experimental_readRawConfig({ config: configPath }).rawConfig,
    text: () => readFileSync(configPath, "utf8"),
  };
}

function database(config = sourceConfig) {
  return config.d1_databases.find((entry) => entry.binding === "DB");
}

test("pinning replaces the existing DB ID and preserves comments, bindings, and operator settings", (t) => {
  const original = structuredClone(sourceConfig);
  original.d1_databases.push({ binding: "ARCHIVE", database_name: "operator-archive", database_id: "archive-id" });
  original.vars = { CONVERTER_SUBSCRIPTION_HOSTS: "subscriptions.example.test" };
  const config = fixture(t, original);
  const expectedDatabase = structuredClone(database(original));

  pinDeploymentDatabase({ configPath: config.configPath, expectedDatabase, id: "selected-id" }, configIO);

  const expected = structuredClone(original);
  database(expected).database_id = "selected-id";
  assert.deepEqual(config.read(), expected);
  assert.match(config.text(), /Operator comment must survive database setup/);
  assert.equal(config.read().d1_databases.filter((entry) => entry.binding === "DB").length, 1);
});

test("pinning a named environment leaves the base and other environments unchanged", (t) => {
  const original = structuredClone(sourceConfig);
  original.env = {
    staging: { d1_databases: [{ ...database(), database_name: `${database().database_name}-staging` }] },
    production: { d1_databases: [{ ...database(), database_id: "production-id" }] },
  };
  const config = fixture(t, original);
  const expectedDatabase = structuredClone(database(original.env.staging));

  pinDeploymentDatabase({
    configPath: config.configPath, environment: "staging", expectedDatabase, id: "staging-id",
  }, configIO);

  const expected = structuredClone(original);
  database(expected.env.staging).database_id = "staging-id";
  assert.deepEqual(config.read(), expected);
});

test("a changed DB declaration stops setup without writing the configuration", async (t) => {
  for (const field of ["database_name", "database_id"]) {
    await t.test(field, (t) => {
      const original = structuredClone(sourceConfig);
      const expectedDatabase = structuredClone(database(original));
      database(original)[field] = "changed-during-setup";
      const config = fixture(t, original);
      const before = config.text();

      assert.throws(() => pinDeploymentDatabase({
        configPath: config.configPath, expectedDatabase, id: "selected-id",
      }, configIO), /database declaration changed during setup/);
      assert.equal(config.text(), before);
    });
  }
});

test("missing, duplicate, or absent environment DB bindings cannot change the base configuration", async (t) => {
  const scenarios = [
    { name: "missing DB", mutate: (config) => { config.d1_databases = []; } },
    { name: "duplicate DB", mutate: (config) => { config.d1_databases.push({ ...database(config) }); } },
    { name: "missing selected environment", environment: "staging", mutate() {} },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, (t) => {
      const original = structuredClone(sourceConfig);
      scenario.mutate(original);
      const config = fixture(t, original);
      const before = config.text();

      assert.throws(() => pinDeploymentDatabase({
        configPath: config.configPath,
        environment: scenario.environment,
        expectedDatabase: database(),
        id: "selected-id",
      }, configIO), /no longer contains exactly one DB binding/);
      assert.equal(config.text(), before);
    });
  }
});

test("config read and write failures expose a deployment error without private error details", async (t) => {
  for (const operation of ["readRawConfig", "patchConfig"]) {
    await t.test(operation, (t) => {
      const config = fixture(t, sourceConfig);
      const before = config.text();
      const io = { ...configIO, [operation]() { throw new Error("private filesystem details"); } };

      assert.throws(() => pinDeploymentDatabase({
        configPath: config.configPath, expectedDatabase: database(), id: "selected-id",
      }, io), (error) => {
        assert.ok(error instanceof DeploymentError);
        assert.match(error.message, /Could not record the D1 ID/);
        assert.doesNotMatch(error.message, /private filesystem details/);
        return true;
      });
      assert.equal(config.text(), before);
    });
  }
});
