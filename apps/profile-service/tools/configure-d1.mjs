import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const baseConfigPath = path.join(appRoot, "wrangler.jsonc");
const configPath = path.join(appRoot, "wrangler.local.jsonc");
const databaseId = process.argv[2];

if (!databaseId || !/^[0-9a-f-]{20,}$/i.test(databaseId)) {
  console.error("usage: node tools/configure-d1.mjs <database-id>");
  process.exit(2);
}

const text = fs.readFileSync(baseConfigPath, "utf8");
const config = JSON.parse(text);
config.d1_databases = [
  {
    binding: "DB",
    database_name: "mythic-rules-profiles",
    database_id: databaseId,
    migrations_dir: "./migrations",
  },
];
const randomNamespace = String(100000 + Math.floor(Math.random() * 1900000000));
config.ratelimits = [
  {
    name: "PROFILE_WRITE_LIMITER",
    namespace_id: randomNamespace,
    simple: { limit: 10, period: 60 },
  },
];
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`configured DB binding in ${path.relative(process.cwd(), configPath)}`);
