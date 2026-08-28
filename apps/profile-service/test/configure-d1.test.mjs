import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const configPath = path.join(appRoot, "wrangler.local.jsonc");
const scriptPath = path.join(appRoot, "tools", "configure-d1.mjs");

test("configure-d1 script generates local configuration with random rate limit namespace", () => {
  const dummyDbId = "12345678-abcd-ef01-2345-6789abcdef01";

  // Clean up any existing generated local config
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }

  try {
    execFileSync(process.execPath, [scriptPath, dummyDbId]);
    assert.equal(fs.existsSync(configPath), true);

    const content = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(content);

    assert.equal(config.d1_databases[0].database_id, dummyDbId);
    assert.ok(config.ratelimits[0].namespace_id);
    const namespaceNum = Number(config.ratelimits[0].namespace_id);
    assert.ok(namespaceNum >= 100000 && namespaceNum < 1900100000);
  } finally {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  }
});
