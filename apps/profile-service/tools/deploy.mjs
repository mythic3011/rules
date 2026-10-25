import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultConfig = path.join(appRoot, "wrangler.jsonc");
const require = createRequire(import.meta.url);

export class DeploymentError extends Error {}

export function parseDeployArguments(args) {
  const options = { mode: "deploy", configPath: defaultConfig, environment: "" };
  let selectedMode = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run" || argument === "--setup-only") {
      if (selectedMode) throw new DeploymentError("Choose either --dry-run or --setup-only.");
      options.mode = argument === "--dry-run" ? "check" : "setup";
      selectedMode = true;
    } else if (argument === "--config" || argument === "--env") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new DeploymentError(`${argument} requires a value.`);
      if (argument === "--config") options.configPath = path.resolve(value);
      else options.environment = value;
    } else {
      throw new DeploymentError(`Unsupported deployment option: ${argument}`);
    }
  }
  return options;
}

function databaseDeclaration(config) {
  const declarations = config.d1_databases?.filter((database) => database.binding === "DB");
  if (declarations?.length !== 1 || typeof declarations[0].database_name !== "string" || !declarations[0].database_name.trim()) {
    throw new DeploymentError("The selected Wrangler configuration must name exactly one DB database.");
  }
  const database = declarations[0];
  if (database.database_name.startsWith("-") || database.database_name !== database.database_name.trim()) {
    throw new DeploymentError("The DB database name must be explicit and cannot start with a dash.");
  }
  if (config.observability?.logs?.invocation_logs !== false || config.observability?.traces?.enabled === true) {
    throw new DeploymentError("Disable invocation logs and request traces to protect subscription capability URLs.");
  }
  return database;
}

function parseDatabases(output) {
  let databases;
  try {
    databases = JSON.parse(output);
  } catch {
    throw new DeploymentError("Wrangler returned invalid database inventory JSON; setup stopped.");
  }
  if (!Array.isArray(databases) || databases.some((database) => !database
    || typeof database.name !== "string" || typeof database.uuid !== "string" || !database.uuid)) {
    throw new DeploymentError("Wrangler returned an invalid database inventory; setup stopped.");
  }
  return databases;
}

export async function deployProfileService({
  config, configPath = defaultConfig, environment = "", mode = "deploy", run, pinDatabase, log = console.log,
}) {
  if (!["check", "setup", "deploy"].includes(mode)) throw new DeploymentError("Unknown deployment mode.");
  const database = databaseDeclaration(config);
  if (mode !== "check" && typeof pinDatabase !== "function") {
    throw new DeploymentError("Database setup requires an explicit configuration writer.");
  }
  if (mode !== "check" && !database.database_id && ![".json", ".jsonc"].includes(path.extname(configPath))) {
    throw new DeploymentError("Automatic D1 setup requires a JSON or JSONC config. For TOML, configure database_id before deploying.");
  }
  const target = ["--config", configPath, "--env", environment];
  const command = (args, capture = false) => run([...args, ...target], { capture });

  // Packaging must succeed before any remote resource or schema is changed.
  log("Checking Worker packaging locally.");
  await command(["deploy", "--dry-run"]);
  if (mode === "check") return;

  log("Checking the configured D1 database.");
  let databases = parseDatabases(await command(["d1", "list", "--json"], true));
  const matches = databases.filter((item) => database.database_id
    ? item.uuid === database.database_id : item.name === database.database_name);
  if (matches.length > 1) throw new DeploymentError("The configured database matches multiple resources; select an exact database_id.");
  if (database.database_id && !matches.length) {
    throw new DeploymentError("The configured database_id is unavailable in this account; no replacement was created.");
  }
  if (matches.length && matches[0].name !== database.database_name) {
    throw new DeploymentError("The configured database name and ID refer to different resources.");
  }
  let selected = matches[0];
  if (!selected) {
    log("Creating the configured D1 database.");
    await command(["d1", "create", database.database_name, "--update-config=false"]);
    databases = parseDatabases(await command(["d1", "list", "--json"], true));
    const created = databases.filter((item) => item.name === database.database_name);
    if (created.length !== 1) throw new DeploymentError("The created database could not be identified; no migrations were applied.");
    [selected] = created;
  }
  if (!database.database_id) {
    log("Recording the selected D1 ID in the deployment configuration.");
    await pinDatabase(selected.uuid);
  }

  log("Applying pending D1 migrations.");
  await command(["d1", "migrations", "apply", database.binding, "--remote"]);
  if (mode === "setup") {
    log("Database setup complete. The Worker has not been published.");
    return;
  }
  log("Deploying the Worker and browser assets.");
  await command(["deploy"]);
}

function runWrangler(args, { capture }) {
  const packagePath = require.resolve("wrangler/package.json");
  const cli = path.join(path.dirname(packagePath), "bin", "wrangler.js");
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: appRoot,
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    throw new DeploymentError("Wrangler failed; deployment stopped. Resolve the error above and retry.");
  }
  return result.stdout;
}

export function pinDeploymentDatabase({ configPath, environment = "", expectedDatabase, id }, { readRawConfig, patchConfig }) {
  try {
    const { rawConfig } = readRawConfig({ config: configPath });
    const target = environment ? rawConfig.env?.[environment] : rawConfig;
    const databases = target?.d1_databases;
    if (!Array.isArray(databases) || databases.filter((database) => database.binding === "DB").length !== 1) {
      throw new DeploymentError("The selected configuration no longer contains exactly one DB binding; no migrations were applied.");
    }
    const current = databases.find((database) => database.binding === "DB");
    if (current.database_name !== expectedDatabase.database_name || current.database_id !== expectedDatabase.database_id) {
      throw new DeploymentError("The database declaration changed during setup; no migrations were applied.");
    }
    const updated = databases.map((database) => database.binding === "DB" ? { ...database, database_id: id } : database);
    const patch = { d1_databases: updated };
    patchConfig(configPath, environment ? { env: { [environment]: patch } } : patch, false);
  } catch (error) {
    if (error instanceof DeploymentError) throw error;
    throw new DeploymentError("Could not record the D1 ID. Check that the selected config is valid and writable; no migrations were applied.", { cause: error });
  }
}

async function main() {
  const options = parseDeployArguments(process.argv.slice(2));
  if (!existsSync(new URL("../../../pnpm-lock.yaml", import.meta.url))
    || !existsSync(new URL("../../../pnpm-workspace.yaml", import.meta.url))) {
    throw new DeploymentError("Use the full repository checkout and install its frozen pnpm workspace before deploying.");
  }
  const { unstable_readConfig, experimental_readRawConfig, experimental_patchConfig } = await import("wrangler");
  const config = unstable_readConfig({ config: options.configPath, env: options.environment });
  const expectedDatabase = databaseDeclaration(config);
  const pinDatabase = (id) => pinDeploymentDatabase({ ...options, expectedDatabase, id }, {
    readRawConfig: experimental_readRawConfig, patchConfig: experimental_patchConfig,
  });
  await deployProfileService({ config, ...options, run: runWrangler, pinDatabase });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof DeploymentError ? error.message : "Could not read the deployment configuration. Check the Wrangler configuration and installed dependencies.");
    process.exitCode = 1;
  });
}
