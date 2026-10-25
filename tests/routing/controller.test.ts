import assert from "node:assert/strict";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import {
  executeControllerTransaction,
  type StartupGate,
} from "#routing/runtime-controller.js";
import { withTempDirectory } from "#routing-test/support/temp-dir.js";
import { CONTROLLER_SCRIPT, MIHOMO_PROJECTION, ROOT, VALID_DIRECTORY } from "#routing-test/support/paths.js";
import { deploymentFixture, egressFixture, stateFixture } from "#routing-test/support/fixtures.js";
import { assertRedactedControllerFailure, assertRedactedControllerTranscript, controllerFixture, FakeControllerApi, firstHiddenUpdate, passingStartupGate } from "#routing-test/support/controller-harness.js";
import { runShellAction, runShellPreview } from "#routing-test/support/process-runner.js";

test("controller startup gate fails before any controller API call and redacts gate detail", async () => {
  const { plan, local, preview } = await controllerFixture();
  const firstHidden = firstHiddenUpdate(preview);
  const api = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
  );
  const failingGate: StartupGate = {
    async proveProtectedPathClosed(): Promise<void> {
      throw new Error("SENTINEL_GATE_SECRET");
    },
  };

  await assert.rejects(
    () =>
      executeControllerTransaction(
        api,
        local.deployment,
        plan,
        local.state,
        failingGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "startup-gate",
        "startup-gate-failed",
        0,
      ),
  );
  assert.deepEqual(api.transcript, []);
  assertRedactedControllerTranscript(api);
});

test("controller locks and verifies account guards before hidden writes without changing visible services", async () => {
  const { plan, local, preview } = await controllerFixture();
  const firstHidden = firstHiddenUpdate(preview);
  assert.equal(preview[0]?.phase, "lock");
  assert.ok(
    preview
      .filter((item) => item.phase === "hidden-update")
      .every((item) => item.group.startsWith("@profile/")),
  );
  assert.equal(
    preview.some((item) => item.group === "🌊 Windsurf"),
    false,
  );
  const previewRead = preview.find(
    (item) => item.phase === "hidden-read" && item.group === firstHidden.group,
  );
  const previewWrite = preview.find(
    (item) =>
      item.phase === "hidden-update" && item.group === firstHidden.group,
  );
  const previewReadback = [...preview]
    .reverse()
    .find(
      (item) => item.phase === "verify" && item.group === firstHidden.group,
    );
  assert.ok(
    previewRead !== undefined &&
      previewWrite !== undefined &&
      previewReadback !== undefined,
  );
  assert.ok(preview.indexOf(previewRead) < preview.indexOf(previewWrite));
  assert.ok(preview.indexOf(previewWrite) < preview.indexOf(previewReadback));

  const api = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
  );
  const result = await executeControllerTransaction(
    api,
    local.deployment,
    plan,
    local.state,
    passingStartupGate,
  );

  const accountLock = "PUT 🔐 Claude Account Guard=REJECT";
  const accountReadback = "GET 🔐 Claude Account Guard";
  const firstHiddenRead = `GET ${firstHidden.group}`;
  assert.ok(
    api.transcript.indexOf(accountLock) <
      api.transcript.indexOf(accountReadback),
  );
  assert.ok(
    api.transcript.indexOf(accountReadback) <
      api.transcript.indexOf(firstHiddenRead),
  );
  assert.ok(
    api.transcript.indexOf(`PUT ${firstHidden.group}=${firstHidden.target}`) <
      api.transcript.lastIndexOf(firstHiddenRead),
  );
  assert.equal(
    api.transcript.some((line) => line.startsWith("PUT 🌊 Windsurf=")),
    false,
  );
  assert.equal(api.selectionFor("🔐 Claude Account Guard"), "REJECT");
  assert.equal(result.rolledBack, false);
  assert.ok(
    result.operations.some(
      (operation) =>
        operation.phase === "verify" && operation.group === firstHidden.group,
    ),
  );
  assertRedactedControllerTranscript(api);
});

test("controller redacts account API and readback failures before hidden writes", async () => {
  const { plan, local, preview } = await controllerFixture();
  const firstHidden = firstHiddenUpdate(preview);
  const failingApi = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
    ["🔐 Claude Account Guard=REJECT"],
  );

  await assert.rejects(
    () =>
      executeControllerTransaction(
        failingApi,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "account-lock",
        "api-call-failed",
        0,
      ),
  );
  assert.equal(
    failingApi.transcript.some((line) => line.startsWith("GET @profile/")),
    false,
  );
  assertRedactedControllerTranscript(failingApi);

  const mismatchApi = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
    [],
    new Map([["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"]]),
  );
  await assert.rejects(
    () =>
      executeControllerTransaction(
        mismatchApi,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "account-readback",
        "readback-mismatch",
        0,
      ),
  );
  assert.equal(
    mismatchApi.transcript.some((line) => line.startsWith("GET @profile/")),
    false,
  );
  assertRedactedControllerTranscript(mismatchApi);
});

test("controller rolls back hidden selections only and preserves account locks on hidden failure", async () => {
  const { plan, local, preview } = await controllerFixture();
  const firstHidden = firstHiddenUpdate(preview);
  const api = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
    [`${firstHidden.group}=${firstHidden.target}`],
  );

  await assert.rejects(
    () =>
      executeControllerTransaction(
        api,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "hidden-update",
        "api-call-failed",
        0,
      ),
  );
  assert.equal(api.transcript.at(-1), `PUT ${firstHidden.group}=DIRECT`);
  assert.equal(
    api.transcript.filter(
      (line) => line === "PUT 🔐 Claude Account Guard=REJECT",
    ).length,
    1,
  );
  assert.equal(
    api.transcript.some((line) => line.startsWith("PUT 🌊 Windsurf=")),
    false,
  );
  assertRedactedControllerTranscript(api);

  const rollbackFailure = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, "DIRECT"],
    ]),
    [
      `${firstHidden.group}=${firstHidden.target}`,
      `${firstHidden.group}=DIRECT`,
    ],
  );
  await assert.rejects(
    () =>
      executeControllerTransaction(
        rollbackFailure,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "hidden-update",
        "api-call-failed",
        1,
      ),
  );
  assertRedactedControllerTranscript(rollbackFailure);
});

test("controller rolls back a hidden selector when its post-write readback mismatches", async () => {
  const { plan, local, preview } = await controllerFixture();
  const firstHidden = firstHiddenUpdate(preview);
  const previous = "PREVIOUS-HIDDEN-FIRST";
  const api = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, previous],
    ]),
    [],
    new Map(),
    new Map([[firstHidden.group, [previous, "MISMATCHED-HIDDEN-READBACK"]]]),
  );

  await assert.rejects(
    () =>
      executeControllerTransaction(
        api,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "hidden-readback",
        "readback-mismatch",
        0,
      ),
  );
  const write = `PUT ${firstHidden.group}=${firstHidden.target}`;
  const rollback = `PUT ${firstHidden.group}=${previous}`;
  assert.ok(
    api.transcript.indexOf(`GET ${firstHidden.group}`) <
      api.transcript.indexOf(write),
  );
  assert.ok(
    api.transcript.indexOf(write) <
      api.transcript.lastIndexOf(`GET ${firstHidden.group}`),
  );
  assert.equal(api.transcript.at(-1), rollback);
  assert.equal(api.selectionFor(firstHidden.group), previous);
  assert.equal(api.selectionFor("🔐 Claude Account Guard"), "REJECT");
  assert.equal(
    api.transcript.filter(
      (line) => line === "PUT 🔐 Claude Account Guard=REJECT",
    ).length,
    1,
  );
  assert.equal(
    api.transcript.some((line) => line.startsWith("PUT 🌊 Windsurf=")),
    false,
  );
  assertRedactedControllerTranscript(api);
});

test("controller restores every recorded hidden selector in reverse order after a later hidden write failure", async () => {
  const { plan, local, preview } = await controllerFixture();
  const hidden = preview.filter(
    (
      operation,
    ): operation is {
      readonly phase: "hidden-update";
      readonly group: string;
      readonly target: string;
    } => operation.phase === "hidden-update" && operation.target !== undefined,
  );
  assert.ok(hidden.length >= 2);
  const [firstHidden, secondHidden] = hidden;
  if (firstHidden === undefined || secondHidden === undefined)
    throw new Error("expected two hidden profile operations");
  const firstPrevious = "PREVIOUS-HIDDEN-FIRST";
  const secondPrevious = "PREVIOUS-HIDDEN-SECOND";
  const api = new FakeControllerApi(
    new Map([
      ["🔐 Claude Account Guard", "SENTINEL_APPROVED_NODE"],
      [firstHidden.group, firstPrevious],
      [secondHidden.group, secondPrevious],
    ]),
    [`${secondHidden.group}=${secondHidden.target}`],
  );

  await assert.rejects(
    () =>
      executeControllerTransaction(
        api,
        local.deployment,
        plan,
        local.state,
        passingStartupGate,
      ),
    (error: unknown) =>
      assertRedactedControllerFailure(
        error,
        "hidden-update",
        "api-call-failed",
        0,
      ),
  );
  assert.deepEqual(api.transcript.slice(-2), [
    `PUT ${secondHidden.group}=${secondPrevious}`,
    `PUT ${firstHidden.group}=${firstPrevious}`,
  ]);
  assert.equal(api.selectionFor(firstHidden.group), firstPrevious);
  assert.equal(api.selectionFor(secondHidden.group), secondPrevious);
  assert.equal(api.selectionFor("🔐 Claude Account Guard"), "REJECT");
  assert.equal(
    api.transcript.filter(
      (line) => line === "PUT 🔐 Claude Account Guard=REJECT",
    ).length,
    1,
  );
  assert.equal(
    api.transcript.some((line) => line.startsWith("PUT 🌊 Windsurf=")),
    false,
  );
  assertRedactedControllerTranscript(api);
});

test("POSIX controller preview consumes line-preserving jsonfilter output and rejects unsupported IPv6 spelling", async () => {
  await withTempDirectory("routing-controller-preview-", async (directory) => {
    const tools = join(directory, "tools");
    const plan = join(directory, "controller-plan.json");
    const deployment = join(directory, "deployment.json");
    const egress = join(directory, "approved-egress.json");
    const state = join(directory, "state.json");
    const secret = join(directory, "controller.secret");
    const curlLog = join(directory, "curl-transcript.log");
    const jsonfilter = join(tools, "jsonfilter");
    const curl = join(tools, "curl");
    const jshn = join(tools, "jshn.sh");
    await new Promise<void>((resolvePromise, rejectPromise) => {
      spawn("mkdir", ["-p", tools])
        .once("error", rejectPromise)
        .once("close", (code) =>
          code === 0
            ? resolvePromise()
            : rejectPromise(new Error("mkdir failed")),
        );
    });
    await Promise.all([
      writeFile(plan, "{}\n"),
      writeFile(deployment, "{}\n"),
      writeFile(egress, '{"node":"EXAMPLE node 🤖 with spaces"}\n'),
      writeFile(state, "{}\n"),
      writeFile(secret, "example-token-never-printed\n"),
    ]);
    await writeFile(
      curl,
      "#!/bin/sh\ncase \"$*\" in *'/proxies'*) printf '%s\\n' 'GET /proxies' > \"$AI_ROUTING_TEST_CURL_LOG\" ;; *) exit 2 ;; esac\n",
      "utf8",
    );
    await writeFile(
      jshn,
      "json_init() { :; }\njson_add_string() { :; }\njson_dump() { printf '%s' '{}'; }\n",
      "utf8",
    );
    const fakeJsonfilter = [
      "#!/bin/sh",
      "expr=",
      "while [ $# -gt 0 ]; do",
      "  if [ $1 = -e ]; then expr=$2; shift 2; else shift; fi",
      "done",
      "case $expr in",
      "  '@.policyVersion') printf '%s\\n' '1' ;;",
      "  '@.controller.url') printf '%s\\n' ${AI_ROUTING_TEST_URL:-http://127.0.0.1:9090} ;;",
      "  '@.controller.secretFile') printf '%s\\n' $AI_ROUTING_TEST_SECRET ;;",
      "  '@.activeMode') printf '%s\\n' 'hk' ;;",
      "  '@.accountProtected[*].visibleGroup') printf '%s\\n' '🔐 Claude Account Guard' ;;",
      "  '@.modes.hk.hiddenSelections[#]') printf '%s\\n' '2' ;;",
      "  '@.modes.hk.hiddenSelections[0].group') printf '%s\\n' '@profile/windsurf' ;;",
      "  '@.modes.hk.hiddenSelections[0].target') printf '%s\\n' '🇺🇸 US Stable' ;;",
      "  '@.modes.hk.hiddenSelections[1].group') printf '%s\\n' '@profile/huggingface' ;;",
      "  '@.modes.hk.hiddenSelections[1].target') printf '%s\\n' 'DIRECT' ;;",
      "  *) exit 2 ;;",
      "esac",
      "",
    ].join("\n");
    await writeFile(jsonfilter, fakeJsonfilter, "utf8");
    await Promise.all([chmod(curl, 0o755), chmod(jsonfilter, 0o755)]);
    const environment = {
      PATH: `${tools}:${process.env.PATH ?? ""}`,
      AI_ROUTING_PLAN: plan,
      AI_ROUTING_DEPLOYMENT: deployment,
      AI_ROUTING_EGRESS: egress,
      AI_ROUTING_STATE: state,
      AI_ROUTING_JSHN: jshn,
      AI_ROUTING_TEST_SECRET: secret,
      AI_ROUTING_TEST_CURL_LOG: curlLog,
    };
    const preview = await runShellPreview(
      CONTROLLER_SCRIPT,
      environment,
    );
    assert.equal(preview.exitCode, 0, preview.stderr);
    assert.match(preview.stdout, /reconciliation is disabled/);
    assert.match(
      preview.stdout,
      /no controller API, secret file, local binding, or runtime-state input is read/,
    );
    assert.doesNotMatch(preview.stdout, /example-token-never-printed/);
    assert.doesNotMatch(preview.stderr, /example-token-never-printed/);
    assert.doesNotMatch(preview.stdout, /🌊 Windsurf/);
  });
});

test("POSIX reconcile is an explicit fail-closed stub and performs no API calls", async () => {
  await withTempDirectory("routing-reconcile-", async (directory) => {
    const tools = join(directory, "tools");
    await mkdir(tools);
    const plan = join(directory, "plan.json");
    const deployment = join(directory, "deployment.json");
    const egress = join(directory, "egress.json");
    const state = join(directory, "state.json");
    const secret = join(directory, "secret");
    const transcript = join(directory, "transcript");
    const jsonfilter = join(tools, "jsonfilter");
    const curl = join(tools, "curl");
    const jshn = join(tools, "jshn.sh");
    await Promise.all([
      writeFile(plan, "{}"),
      writeFile(deployment, "{}"),
      writeFile(egress, "{}"),
      writeFile(state, "{}"),
      writeFile(secret, "non-newline-secret"),
    ]);
    await writeFile(
      jshn,
      [
        "json_init() { :; }",
        "json_add_string() { :; }",
        "json_dump() { printf '%s' '{\\\"name\\\":\\\"safe\\\"}'; }",
        "",
      ].join("\n"),
    );
    await writeFile(
      jsonfilter,
      [
        "#!/bin/sh",
        "file=",
        "expr=",
        "while [ $# -gt 0 ]; do case $1 in -i) file=$2; shift 2 ;; -e) expr=$2; shift 2 ;; *) shift ;; esac; done",
        "input=$(cat ${file:-/dev/stdin})",
        "case $expr in",
        "  '@.policyVersion') printf '%s\\n' 1 ;;",
        "  '@.controller.url') printf '%s\\n' http://127.0.0.1:9090 ;;",
        "  '@.controller.secretFile') printf '%s\\n' $AI_ROUTING_RECONCILE_SECRET ;;",
        "  '@.api.versionPath') printf '%s\\n' /version ;;",
        "  '@.version') printf '%s\\n' 1.19.0 ;;",
        "  '@.accountProtected[#]') printf '%s\\n' 1 ;;",
        "  '@.accountProtected[0].lockRequest.proxyPath') printf '%s\\n' /proxies/%F0%9F%94%90%20Claude%20Account%20Guard ;;",
        "  '@.accountProtected[0].lockRequest.target') printf '%s\\n' REJECT ;;",
        "  '@.activeMode') printf '%s\\n' hk ;;",
        "  '@.modes.hk.hiddenSelections[#]') printf '%s\\n' 1 ;;",
        "  '@.modes.hk.hiddenSelections[0].group') printf '%s\\n' @profile/windsurf ;;",
        "  '@.modes.hk.hiddenSelections[0].proxyPath') printf '%s\\n' /proxies/%40profile%2Fwindsurf ;;",
        "  '@.modes.hk.hiddenSelections[0].target') printf '%s\\n' DIRECT ;;",
        "  '@.type') printf '%s\\n' Selector ;;",
        "  '@.now') case $input in *HIDDEN*) printf '%s\\n' DIRECT ;; *) printf '%s\\n' REJECT ;; esac ;;",
        "  '@.all[*]') printf '%s\\n' REJECT; printf '%s\\n' DIRECT ;;",
        "  *) exit 2 ;;",
        "esac",
        "",
      ].join("\n"),
    );
    await writeFile(
      curl,
      [
        "#!/bin/sh",
        'printf \'%s\\n\' "$*" >> "$AI_ROUTING_RECONCILE_TRANSCRIPT"',
        "case \"$*\" in *--request*PUT*) printf 204 ;; *%40profile%2Fwindsurf*) printf '%s' HIDDEN ;; *) printf '%s' ACCOUNT ;; esac",
        "",
      ].join("\n"),
    );
    await Promise.all([chmod(jsonfilter, 0o755), chmod(curl, 0o755)]);
    const env = {
      PATH: `${tools}:${process.env.PATH ?? ""}`,
      AI_ROUTING_PLAN: plan,
      AI_ROUTING_DEPLOYMENT: deployment,
      AI_ROUTING_EGRESS: egress,
      AI_ROUTING_STATE: state,
      AI_ROUTING_JSHN: jshn,
      AI_ROUTING_RECONCILE_SECRET: secret,
      AI_ROUTING_RECONCILE_TRANSCRIPT: transcript,
    };
    const result = await runShellAction(
      CONTROLLER_SCRIPT,
      "--reconcile",
      env,
    );
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /reconcile is disabled/);
    await assert.rejects(() => readFile(transcript, "utf8"));
  });
});

test("tampered account lock targets and paths never reach the disabled controller API", async () => {
  await withTempDirectory("routing-reconcile-tamper-", async (directory) => {
    const curl = join(directory, "curl");
    const transcript = join(directory, "curl.log");
    await writeFile(
      curl,
      `#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"${transcript}\"\nexit 99\n`,
    );
    await chmod(curl, 0o755);
    for (const tamperedLock of [
      { proxyPath: "/proxies/another-group", target: "US-Claude-01" },
      { proxyPath: "/proxies/%44IRECT", target: "DIRECT" },
    ]) {
      const plan = join(directory, `${tamperedLock.target}.json`);
      await writeFile(
        plan,
        JSON.stringify({
          accountProtected: [
            {
              visibleGroup: "🔐 Claude Account Guard",
              lockRequest: tamperedLock,
            },
          ],
        }),
      );
      const result = await runShellAction(
        CONTROLLER_SCRIPT,
        "--reconcile",
        {
          PATH: `${directory}:${process.env.PATH ?? ""}`,
          AI_ROUTING_PLAN: plan,
        },
      );
      assert.notEqual(result.exitCode, 0);
      assert.match(result.stderr, /reconcile is disabled/);
    }
    await assert.rejects(() => readFile(transcript, "utf8"));
  });
});
