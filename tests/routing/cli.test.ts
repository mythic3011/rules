import assert from "node:assert/strict";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { INVALID_DIRECTORY, ROOT } from "#routing-test/support/paths.js";
import { deploymentFixture } from "#routing-test/support/fixtures.js";
import { runPrivateMaterializeCli, runRoutingCli } from "#routing-test/support/process-runner.js";
import { withTempDirectory } from "#routing-test/support/temp-dir.js";

test("routing CLI exits non-zero with code, path, and message for invalid input", async () => {
  await withTempDirectory("routing-cli-invalid-", async (directory) => {
    const fixture = await readFile(
      join(INVALID_DIRECTORY, "empty-proxy-server-nameserver.yaml"),
      "utf8",
    );
    await writeFile(join(directory, "00-invalid.yaml"), fixture, "utf8");
    const result = await runRoutingCli(directory);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /\[policy-invariant\]/);
    assert.match(
      result.stderr,
      /dns\.profiles\.default\.proxyServerNameserver/,
    );
    assert.match(
      result.stderr,
      /respectRules requires at least one proxyServerNameserver/,
    );
  });
});


test("materialize-private CLI returns structured redacted failure output", async () => {
  await withTempDirectory("private-materializer-cli-", async (directory) => {
    const deployment = join(directory, "deployment.json");
    const egress = join(directory, "egress.json");
    const secret = join(directory, "secret");
    const output = join(directory, "local", "ai-routing", "private.yaml");
    await writeFile(secret, "SENTINEL_SECRET_DO_NOT_PRINT");
    await chmod(secret, 0o600);
    await writeFile(
      deployment,
      JSON.stringify({
        ...deploymentFixture(),
        controller: { url: "http://127.0.0.1:9090", secretFile: secret },
      }),
    );
    await writeFile(
      egress,
      JSON.stringify({
        schemaVersion: 1,
        mode: "deployment",
        policyVersion: "1",
        services: {
          claude: {
            bindings: [
              {
                approvedId: "US-Claude-01",
                node: "SENTINEL_NODE_DO_NOT_PRINT",
              },
            ],
            revokedNodes: [],
          },
        },
      }),
    );
    const result = await runPrivateMaterializeCli(deployment, egress, output);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /\[policy-invariant\].*local/);
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      /SENTINEL_SECRET_DO_NOT_PRINT|SENTINEL_NODE_DO_NOT_PRINT/,
    );
  });
});
