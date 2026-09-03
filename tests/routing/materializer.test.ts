import assert from "node:assert/strict";
import { chmod, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import YAML from "yaml";

import {
  materializePrivateProfile,
  PrivateMaterializerError,
} from "#routing/private-materializer.js";
import { loadCanonicalInputs } from "#routing-test/support/canonical-inputs.js";
import { deploymentFixture, egressFixture } from "#routing-test/support/fixtures.js";
import { withPrivateMaterializerHarness } from "#routing-test/support/private-materializer-harness.js";

test("private materializer preserves the candidate except allowed private deltas and never reports secrets or nodes", async () => {
  await withPrivateMaterializerHarness(async (harness) => {
    const { local, secret, output, plan, options, candidate: candidatePath } = harness;
    const deployment = {
      ...harness.deployment,
      controller: { url: "http://127.0.0.1:9090", secretFile: secret },
    };
    const egress = structuredClone(harness.egress);
    const bindings = (
      egress.services as Record<
        string,
        {
          bindings: Array<{
            approvedId: string;
            node: string;
            provider: string;
          }>;
        }
      >
    ).claude?.bindings;
    assert.ok(bindings !== undefined);
    bindings[0] = {
      approvedId: "US-Claude-01",
      node: "節點 A + (safe)",
      provider: "provider1",
    };
    bindings[1] = {
      approvedId: "US-Claude-02",
      node: "node [B]?",
      provider: "provider1",
    };
    const report = await materializePrivateProfile(
      candidatePath,
      output,
      plan,
      deployment,
      egress,
      options,
    );
    assert.deepEqual(report, {
      changedGroups: ["🔐 Claude Account Guard"],
      controllerChanged: true,
      startupGate: "still-required",
    });
    assert.doesNotMatch(JSON.stringify(report), /private-secret-value|節點 A/);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    const rendered = YAML.parse(await readFile(output, "utf8")) as Record<
      string,
      unknown
    >;
    const groups = rendered["proxy-groups"] as Array<Record<string, unknown>>;
    const account = groups.find(
      (group) => group.name === "🔐 Claude Account Guard",
    );
    assert.deepEqual(account?.proxies, ["REJECT"]);
    assert.deepEqual(account?.use, ["provider1"]);
    assert.equal(
      account?.filter,
      "^(?:節點 A \\+ \\(safe\\)|node \\[B\\]\\?)$",
    );
    assert.doesNotThrow(() => new RegExp(String(account?.filter), "u"));
    assert.equal(rendered["external-controller"], "127.0.0.1:9090");
    assert.equal(rendered.secret, "private-secret-value");
    assert.ok((rendered.rules as string[]).includes("MATCH,🐟 漏網之魚"));
    const candidate = YAML.parse(
      await readFile(
      candidatePath,
        "utf8",
      ),
    ) as Record<string, unknown>;
    const normalized = structuredClone(rendered);
    delete normalized["external-controller"];
    delete normalized.secret;
    const normalizedGroup = (
      normalized["proxy-groups"] as Array<Record<string, unknown>>
    ).find((group) => group.name === "🔐 Claude Account Guard");
    assert.ok(normalizedGroup !== undefined);
    delete normalizedGroup.use;
    delete normalizedGroup.filter;
    delete candidate["external-controller"];
    delete candidate.secret;
    assert.deepEqual(normalized, candidate);

    const unauthorized = structuredClone(egress);
    (
      (
        unauthorized.services as Record<
          string,
          { bindings: Array<{ provider: string }> }
        >
      ).claude?.bindings[0] as { provider: string }
    ).provider = "other-provider";
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidatePath,
          output,
          plan,
          deployment,
          unauthorized,
          options,
        ),
      (error: unknown) =>
        error instanceof PrivateMaterializerError &&
        !error.message.includes("private-secret-value"),
    );
    const unsafe = structuredClone(egress);
    (
      (unsafe.services as Record<string, { bindings: Array<{ node: string }> }>)
        .claude?.bindings[0] as { node: string }
    ).node = "bad\u0001node";
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidatePath,
          output,
          plan,
          deployment,
          unsafe,
          options,
        ),
      PrivateMaterializerError,
    );
    const example = { ...deployment, mode: "example" };
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidatePath,
          output,
          plan,
          example,
          egress,
          options,
        ),
      PrivateMaterializerError,
    );
  }, { secretValue: "private-secret-value" });
});

test("private materializer rejects malformed deployment or egress inputs", async () => {
  await withPrivateMaterializerHarness(async (harness) => {
    const { candidate: candidatePath, output, plan, options, deployment, egress } = harness;

    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidatePath,
          output,
          plan,
          { invalid: "deployment" },
          egress,
          options,
        ),
      (error: unknown) =>
        error instanceof PrivateMaterializerError &&
        error.issues.some(
          (entry) =>
            entry.path.join(".") === "local" &&
            entry.message === "router-local input has invalid shape",
        ),
    );

    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidatePath,
          output,
          plan,
          deployment,
          { invalid: "egress" },
          options,
        ),
      (error: unknown) =>
        error instanceof PrivateMaterializerError &&
        error.issues.some(
          (entry) =>
            entry.path.join(".") === "local" &&
            entry.message === "router-local input has invalid shape",
        ),
    );
  });
});

test("private materializer rejects shape drift, duplicates, unsafe paths, and cleans failed atomic output", async () => {
  await withPrivateMaterializerHarness(async (harness) => {
    const { directory, local, candidate, source, output, plan, options, deployment, egress } = harness;
    const original = YAML.parse(await readFile(candidate, "utf8")) as Record<
      string,
      unknown
    >;
    const run = async (
      value: Record<string, unknown>,
      output = join(local, "out.yaml"),
    ): Promise<void> => {
      await writeFile(candidate, YAML.stringify(value));
      await materializePrivateProfile(
        candidate,
        output,
        plan,
        deployment,
        egress,
        options,
      );
    };
    const account = (
      original["proxy-groups"] as Array<Record<string, unknown>>
    ).find((group) => group.name === "🔐 Claude Account Guard");
    assert.ok(account !== undefined);
    const duplicate = structuredClone(original);
    (duplicate["proxy-groups"] as Array<unknown>).push(
      structuredClone(account),
    );
    await assert.rejects(() => run(duplicate), PrivateMaterializerError);
    const drift = structuredClone(original);
    const driftGroup = (
      drift["proxy-groups"] as Array<Record<string, unknown>>
    ).find((group) => group.name === "🔐 Claude Account Guard");
    assert.ok(driftGroup !== undefined);
    driftGroup.use = ["provider1"];
    await assert.rejects(() => run(drift), PrivateMaterializerError);
    await assert.rejects(
      () => run(original, join(directory, "outside.yaml")),
      PrivateMaterializerError,
    );
    await assert.rejects(
      () => run(original, join(local, "..", "..", "evil.yaml")),
      PrivateMaterializerError,
    );
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          candidate,
          plan,
          deployment,
          egress,
          options,
        ),
      PrivateMaterializerError,
    );
    const outputDirectory = join(local, "existing-output");
    await mkdir(outputDirectory);
    await assert.rejects(() => run(original, outputDirectory));
    assert.equal((await stat(outputDirectory)).isDirectory(), true);
    assert.equal(
      (await (await import("node:fs/promises")).readdir(local)).some((name) =>
        name.startsWith(".materialize-"),
      ),
      false,
    );
    const duplicateNode = structuredClone(egress);
    const bindings = (
      duplicateNode.services as Record<
        string,
        { bindings: Array<{ node: string }> }
      >
    ).claude?.bindings;
    assert.ok(bindings !== undefined);
    const first = bindings[0];
    const second = bindings[1];
    assert.ok(first !== undefined && second !== undefined);
    second.node = first.node;
    await writeFile(candidate, YAML.stringify(original));
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          join(local, "duplicate-node.yaml"),
          plan,
          deployment,
          duplicateNode,
          options,
        ),
      PrivateMaterializerError,
    );

    const maliciousRules = structuredClone(original);
    (maliciousRules.rules as string[]).unshift("MATCH,DIRECT");
    await writeFile(candidate, YAML.stringify(maliciousRules));
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          join(local, "malicious-rules.yaml"),
          plan,
          deployment,
          egress,
          options,
        ),
      (error: unknown) =>
        error instanceof PrivateMaterializerError &&
        error.issues.some((entry) => entry.path.join(".") === "candidate"),
    );
    const maliciousDns = structuredClone(original);
    (
      (maliciousDns.dns as Record<string, unknown>).nameserver as unknown[]
    ).push("https://example.invalid/dns-query");
    await writeFile(candidate, YAML.stringify(maliciousDns));
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          join(local, "malicious-dns.yaml"),
          plan,
          deployment,
          egress,
          options,
        ),
      PrivateMaterializerError,
    );
    const maliciousProvider = structuredClone(original);
    (
      (
        maliciousProvider["proxy-providers"] as Record<
          string,
          Record<string, unknown>
        >
      ).provider1 as Record<string, unknown>
    ).type = "file";
    await writeFile(candidate, YAML.stringify(maliciousProvider));
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          join(local, "malicious-provider.yaml"),
          plan,
          deployment,
          egress,
          options,
        ),
      PrivateMaterializerError,
    );
    await writeFile(candidate, await readFile(source));
    const escaped = join(directory, "escaped");
    await mkdir(escaped);
    await symlink(escaped, join(local, "escape"));
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          join(local, "escape", "private.yaml"),
          plan,
          deployment,
          egress,
          options,
        ),
      PrivateMaterializerError,
    );
    const trusted = join(directory, "trusted");
    const escapedRoot = join(directory, "escaped-root");
    await mkdir(trusted);
    await chmod(trusted, 0o700);
    await mkdir(escapedRoot);
    await chmod(escapedRoot, 0o700);
    await symlink(escapedRoot, join(trusted, "local"));
    const escapedRootOptions = {
      ...options,
      allowedOutputRoot: join(trusted, "local", "ai-routing"),
      trustedBaseRoot: trusted,
    };
    await assert.rejects(
      () =>
        materializePrivateProfile(
          candidate,
          join(trusted, "local", "ai-routing", "private.yaml"),
          plan,
          deployment,
          egress,
          escapedRootOptions,
        ),
      PrivateMaterializerError,
    );
  });
});
