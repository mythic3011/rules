import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { unstable_readConfig } from "wrangler";

import {
  deployProfileService,
  DeploymentError,
  parseDeployArguments,
} from "../tools/deploy.mjs";

const configPath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
const sourceConfig = unstable_readConfig({ config: configPath });
const selectedConfigPath = path.join(path.dirname(configPath), "wrangler.test.jsonc");
const selectedEnvironment = "production";

function profileConfig() {
  const config = structuredClone(sourceConfig);
  delete configuredDatabase(config).database_id;
  return config;
}

function configuredDatabase(config = sourceConfig) {
  return config.d1_databases.find((database) => database.binding === "DB");
}

function targetArguments() {
  return ["--config", selectedConfigPath, "--env", selectedEnvironment];
}

function commandArguments(calls) {
  return calls.map(({ argv }) => argv.slice(0, argv.indexOf("--config")));
}

function assertConsistentTargets(calls) {
  for (const { argv } of calls) {
    assert.deepEqual(argv.slice(-targetArguments().length), targetArguments());
  }
}

function harness({ inventory = [], inventoryOutput, inventoryResponses, failures = new Map(), pinFailure } = {}) {
  const calls = [];
  const pins = [];
  const timeline = [];
  const responses = inventoryResponses ?? [inventoryOutput ?? JSON.stringify(inventory)];
  let listCount = 0;
  const run = async (argv, options) => {
    calls.push({ argv, capture: options.capture });
    const command = argv.slice(0, argv.indexOf("--config")).join(" ");
    timeline.push({ type: "command", command });
    if (failures.has(command)) throw failures.get(command);
    if (command === "d1 list --json") {
      const response = responses[Math.min(listCount, responses.length - 1)];
      listCount += 1;
      return response;
    }
    return "";
  };
  const pinDatabase = async (id) => {
    timeline.push({ type: "pin", id });
    if (pinFailure) throw pinFailure;
    pins.push(id);
  };
  return { calls, pins, timeline, run, pinDatabase };
}

async function execute(options = {}) {
  const config = options.config ?? profileConfig();
  const state = harness(options);
  const result = await deployProfileService({
    config,
    configPath: selectedConfigPath,
    environment: selectedEnvironment,
    mode: options.mode ?? "deploy",
    run: state.run,
    pinDatabase: state.pinDatabase,
    log() {},
  });
  return { ...state, result };
}

test("argument parser supports the three deployment modes and explicit targets", () => {
  assert.equal(parseDeployArguments([]).mode, "deploy");
  assert.equal(parseDeployArguments(["--dry-run"]).mode, "check");
  assert.equal(parseDeployArguments(["--setup-only"]).mode, "setup");

  const options = parseDeployArguments([
    "--config", "./wrangler.preview.jsonc",
    "--env", selectedEnvironment,
    "--setup-only",
  ]);
  assert.equal(options.configPath, path.resolve("./wrangler.preview.jsonc"));
  assert.equal(options.environment, selectedEnvironment);
  assert.equal(options.mode, "setup");
});

test("argument parser rejects conflicting modes, missing values, and unknown flags", () => {
  for (const args of [
    ["--dry-run", "--setup-only"],
    ["--config"],
    ["--config", "--env"],
    ["--env"],
    ["--unsupported"],
  ]) {
    assert.throws(() => parseDeployArguments(args), DeploymentError, args.join(" "));
  }
});

test("check mode runs only the local packaging dry run", async () => {
  const { calls, pins } = await execute({ mode: "check" });

  assert.deepEqual(commandArguments(calls), [["deploy", "--dry-run"]]);
  assert.equal(calls[0].capture, false);
  assert.deepEqual(pins, []);
  assertConsistentTargets(calls);
});

test("setup mode reuses the configured database, migrates it, and does not publish", async () => {
  const database = configuredDatabase();
  const { calls, pins } = await execute({
    mode: "setup",
    inventory: [{ name: database.database_name, uuid: "fixture-database-id" }],
  });

  assert.deepEqual(commandArguments(calls), [
    ["deploy", "--dry-run"],
    ["d1", "list", "--json"],
    ["d1", "migrations", "apply", database.binding, "--remote"],
  ]);
  assert.equal(calls[1].capture, true);
  assert.deepEqual(pins, ["fixture-database-id"]);
  assertConsistentTargets(calls);
});

test("deploy creates and pins the configured database before migration and publication", async () => {
  const database = configuredDatabase();
  const selectedId = "created-database-id";
  const { calls, pins, timeline } = await execute({
    mode: "deploy",
    inventoryResponses: [
      JSON.stringify([]),
      JSON.stringify([{ name: database.database_name, uuid: selectedId }]),
    ],
  });

  assert.deepEqual(commandArguments(calls), [
    ["deploy", "--dry-run"],
    ["d1", "list", "--json"],
    ["d1", "create", database.database_name, "--update-config=false"],
    ["d1", "list", "--json"],
    ["d1", "migrations", "apply", database.binding, "--remote"],
    ["deploy"],
  ]);
  assert.deepEqual(pins, [selectedId]);
  assert.deepEqual(timeline.map(({ type, command, id }) => type === "pin" ? `pin:${id}` : command), [
    "deploy --dry-run",
    "d1 list --json",
    `d1 create ${database.database_name} --update-config=false`,
    "d1 list --json",
    `pin:${selectedId}`,
    `d1 migrations apply ${database.binding} --remote`,
    "deploy",
  ]);
  assertConsistentTargets(calls);
});

test("a configured D1 ID must be available and match the configured database name", async (t) => {
  const config = profileConfig();
  const database = configuredDatabase(config);
  database.database_id = "configured-database-id";

  await t.test("unavailable ID is not replaced", async () => {
    const harnessState = harness({ inventory: [] });
    await assert.rejects(
      deployProfileService({
        config,
        configPath: selectedConfigPath,
        environment: selectedEnvironment,
        run: harnessState.run,
        pinDatabase: harnessState.pinDatabase,
        log() {},
      }),
      /database_id is unavailable/,
    );
    assert.deepEqual(commandArguments(harnessState.calls), [
      ["deploy", "--dry-run"],
      ["d1", "list", "--json"],
    ]);
    assert.deepEqual(harnessState.pins, []);
    assertConsistentTargets(harnessState.calls);
  });

  await t.test("ID and name pointing to different resources fail without mutations", async () => {
    const state = harness({ inventory: [{ name: "different-configured-name", uuid: database.database_id }] });
    await assert.rejects(
      deployProfileService({
        config,
        configPath: selectedConfigPath,
        environment: selectedEnvironment,
        run: state.run,
        pinDatabase: state.pinDatabase,
        log() {},
      }),
      /name and ID refer to different resources/,
    );
    assert.deepEqual(commandArguments(state.calls), [
      ["deploy", "--dry-run"],
      ["d1", "list", "--json"],
    ]);
    assert.deepEqual(state.pins, []);
  });

  await t.test("an already pinned database is not pinned again", async () => {
    const state = harness({ inventory: [{ name: database.database_name, uuid: database.database_id }] });
    await deployProfileService({
      config,
      configPath: selectedConfigPath,
      environment: selectedEnvironment,
      mode: "setup",
      run: state.run,
      pinDatabase: state.pinDatabase,
      log() {},
    });
    assert.deepEqual(state.pins, []);
  });
});

test("ambiguous database inventory fails closed without creating a database", async () => {
  const database = configuredDatabase();
  const state = harness({ inventory: [
    { name: database.database_name, uuid: "fixture-id-one" },
    { name: database.database_name, uuid: "fixture-id-two" },
  ] });

  await assert.rejects(deployProfileService({
    config: profileConfig(), configPath: selectedConfigPath, environment: selectedEnvironment,
    run: state.run, pinDatabase: state.pinDatabase, log() {},
  }), /matches multiple resources/);
  assert.deepEqual(commandArguments(state.calls), [
    ["deploy", "--dry-run"],
    ["d1", "list", "--json"],
  ]);
});

test("malformed D1 inventory fails before any resource or schema mutation", async (t) => {
  for (const [label, inventoryOutput] of [
    ["invalid JSON", "not-json"],
    ["non-array JSON", JSON.stringify({ databases: [] })],
    ["missing database UUID", JSON.stringify([{ name: configuredDatabase().database_name }])],
  ]) {
    await t.test(label, async () => {
      const state = harness({ inventoryOutput });
      await assert.rejects(deployProfileService({
        config: profileConfig(), configPath: selectedConfigPath, environment: selectedEnvironment,
        run: state.run, pinDatabase: state.pinDatabase, log() {},
      }), DeploymentError);
      assert.deepEqual(commandArguments(state.calls), [
        ["deploy", "--dry-run"],
        ["d1", "list", "--json"],
      ]);
    });
  }
});

test("a created database must be present in the second inventory before it can be migrated", async () => {
  const database = configuredDatabase();
  const state = harness({ inventoryResponses: [JSON.stringify([]), JSON.stringify([])] });
  await assert.rejects(deployProfileService({
    config: profileConfig(), configPath: selectedConfigPath, environment: selectedEnvironment,
    run: state.run, pinDatabase: state.pinDatabase, log() {},
  }), /created database could not be identified/);
  assert.deepEqual(commandArguments(state.calls), [
    ["deploy", "--dry-run"],
    ["d1", "list", "--json"],
    ["d1", "create", database.database_name, "--update-config=false"],
    ["d1", "list", "--json"],
  ]);
  assert.deepEqual(state.pins, []);
});

test("a malformed post-create inventory prevents database pinning and migration", async () => {
  const database = configuredDatabase();
  const state = harness({ inventoryResponses: [JSON.stringify([]), "not-json"] });
  await assert.rejects(deployProfileService({
    config: profileConfig(), configPath: selectedConfigPath, environment: selectedEnvironment,
    run: state.run, pinDatabase: state.pinDatabase, log() {},
  }), DeploymentError);
  assert.deepEqual(commandArguments(state.calls), [
    ["deploy", "--dry-run"],
    ["d1", "list", "--json"],
    ["d1", "create", database.database_name, "--update-config=false"],
    ["d1", "list", "--json"],
  ]);
  assert.deepEqual(state.pins, []);
});

test("packaging, inventory, creation, and migration failures stop every later step", async (t) => {
  const database = configuredDatabase();
  const scenarios = [
    {
      label: "packaging failure prevents remote inventory access",
      failureAt: "deploy --dry-run",
      inventory: [],
      commands: [["deploy", "--dry-run"]],
    },
    {
      label: "inventory or authentication failure prevents creation",
      failureAt: "d1 list --json",
      inventory: [],
      commands: [["deploy", "--dry-run"], ["d1", "list", "--json"]],
    },
    {
      label: "creation failure prevents migration and publish",
      failureAt: `d1 create ${database.database_name} --update-config=false`,
      inventory: [],
      commands: [
        ["deploy", "--dry-run"], ["d1", "list", "--json"],
        ["d1", "create", database.database_name, "--update-config=false"],
      ],
    },
    {
      label: "migration failure prevents publish",
      failureAt: `d1 migrations apply ${database.binding} --remote`,
      inventory: [{ name: database.database_name, uuid: "fixture-database-id" }],
      commands: [
        ["deploy", "--dry-run"], ["d1", "list", "--json"],
        ["d1", "migrations", "apply", database.binding, "--remote"],
      ],
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.label, async () => {
      const state = harness({
        inventory: scenario.inventory,
        failures: new Map([[scenario.failureAt, new Error("simulated command failure")]]),
      });
      await assert.rejects(deployProfileService({
        config: profileConfig(), configPath: selectedConfigPath, environment: selectedEnvironment,
        run: state.run, pinDatabase: state.pinDatabase, log() {},
      }), /simulated command failure/);
      assert.deepEqual(commandArguments(state.calls), scenario.commands);
      assertConsistentTargets(state.calls);
      if (scenario.failureAt.startsWith("d1 migrations apply")) {
        assert.deepEqual(state.pins, ["fixture-database-id"]);
      } else {
        assert.deepEqual(state.pins, []);
      }
    });
  }
});

test("a configuration pin failure prevents migration and publication", async () => {
  const database = configuredDatabase();
  const state = harness({
    inventory: [{ name: database.database_name, uuid: "fixture-database-id" }],
    pinFailure: new Error("simulated config pin failure"),
  });
  await assert.rejects(deployProfileService({
    config: profileConfig(), configPath: selectedConfigPath, environment: selectedEnvironment,
    run: state.run, pinDatabase: state.pinDatabase, log() {},
  }), /simulated config pin failure/);
  assert.deepEqual(commandArguments(state.calls), [
    ["deploy", "--dry-run"],
    ["d1", "list", "--json"],
  ]);
  assert.deepEqual(state.pins, []);
});

test("unconfigured TOML databases fail before remote setup while pinned TOML databases can deploy", async () => {
  const config = profileConfig();
  const configPath = selectedConfigPath.replace(/\.jsonc$/u, ".toml");
  const state = harness();
  await assert.rejects(deployProfileService({
    config, configPath, run: state.run, pinDatabase: state.pinDatabase, log() {},
  }), /Automatic D1 setup requires a JSON or JSONC config/);
  assert.deepEqual(state.calls, []);
  assert.deepEqual(state.pins, []);

  const database = configuredDatabase(config);
  database.database_id = "configured-toml-database-id";
  const pinned = harness({ inventory: [{ name: database.database_name, uuid: database.database_id }] });
  await deployProfileService({
    config, configPath, run: pinned.run, pinDatabase: pinned.pinDatabase, log() {},
  });
  assert.deepEqual(commandArguments(pinned.calls), [
    ["deploy", "--dry-run"],
    ["d1", "list", "--json"],
    ["d1", "migrations", "apply", database.binding, "--remote"],
    ["deploy"],
  ]);
  assert.deepEqual(pinned.pins, []);
});

test("deployment source keeps variables while disabling capability-bearing logs and traces", () => {
  assert.equal(sourceConfig.keep_vars, true);
  assert.equal(sourceConfig.observability.logs.invocation_logs, false);
  assert.equal(sourceConfig.observability.traces.enabled, false);
});
