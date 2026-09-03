import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { z } from "zod";

import {
  RoutingConfigLoadError,
  loadRoutingConfigFromFiles,
} from "#routing/loader.js";
import {
  loadServiceCatalog,
  ServiceCatalogError,
} from "#routing/shared-catalog.js";
import { RoutingConfigSchema } from "#routing/schema.js";
import {
  canonicalServiceIdFromLegacy,
  canonicalServiceIdFromLegacyGroup,
} from "#routing/migration-adapter.js";
import {
  compileRoutingProfile,
  RoutingCompileError,
} from "#routing/compiler.js";
import {
  validateRoutingSemantics,
  validateRuleOrdering,
} from "#routing/semantic-validator.js";
import { withTempDirectory } from "#routing-test/support/temp-dir.js";
import { canonicalArtifactPath, loadCanonicalInputs } from "#routing-test/support/canonical-inputs.js";
import { loadInvalid } from "#routing-test/support/canonical-inputs.js";

test("RoutingConfigSchema rejects record IDs outside the canonical ID pattern", async () => {
  const { config } = await loadCanonicalInputs();
  const mutated = structuredClone(config);
  const windsurf = mutated.services.windsurf;
  assert.ok(windsurf !== undefined);
  mutated.services.Invalid_ID = windsurf;
  const result = RoutingConfigSchema.safeParse(mutated);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(
      result.error.issues.some(
        (entry) => entry.path.join(".") === "services.Invalid_ID",
      ),
    );
  }
});

test("RoutingConfigSchema rejects unknown root and nested object keys", async () => {
  const { config } = await loadCanonicalInputs();
  const withUnknownRoot = structuredClone(config) as unknown as Record<
    string,
    unknown
  >;
  withUnknownRoot.unexpectedRoot = true;
  const rootResult = RoutingConfigSchema.safeParse(withUnknownRoot);
  assert.equal(rootResult.success, false);
  if (!rootResult.success) {
    assert.ok(
      rootResult.error.issues.some((entry) =>
        entry.message.includes("unexpectedRoot"),
      ),
    );
  }

  const withUnknownNested = structuredClone(config);
  const windsurf = withUnknownNested.services.windsurf;
  assert.ok(windsurf !== undefined);
  const mutableWindsurf = windsurf as unknown as Record<string, unknown>;
  mutableWindsurf.unexpectedServiceField = true;
  const nestedResult = RoutingConfigSchema.safeParse(withUnknownNested);
  assert.equal(nestedResult.success, false);
    if (!nestedResult.success) {
    assert.ok(
      nestedResult.error.issues.some(
        (entry) =>
          entry.path.join(".") === "services.windsurf" &&
          entry.message.includes("unexpectedServiceField"),
      ),
    );
  }
});

for (const [fixture, expectedCode] of [
  ["claude-direct", "policy-invariant"],
  ["empty-proxy-server-nameserver", "policy-invariant"],
  ["protected-profile-override", "policy-invariant"],
  ["protected-endpoint-profile-override", "policy-invariant"],
  ["dynamic-route-stable-endpoint", "dynamic-route"],
  ["missing-ref", "missing-reference"],
  ["empty-pinned-node-list", "schema"],
] as const) {
  test(`invalid fixture ${fixture} is rejected`, async () => {
    try {
      const config = await loadInvalid(fixture);
      const issues = validateRoutingSemantics(config);
      assert.ok(issues.some((entry) => entry.code === expectedCode));
    } catch (error: unknown) {
      assert.ok(error instanceof RoutingConfigLoadError);
      assert.ok(error.issues.some((entry) => entry.code === expectedCode));
    }
  });
}

test("account-protected endpoint overrides fail semantically before compilation", async () => {
  const config = await loadInvalid("protected-endpoint-profile-override");
  const issues = validateRoutingSemantics(config);
  const path = "accessProfiles.hk.endpointOverrides.claude.service";
  assert.ok(
    issues.some(
      (entry) =>
        entry.code === "policy-invariant" &&
        entry.path.join(".") === path &&
        entry.message.includes("account-protected endpoint"),
    ),
  );
  assert.throws(
    () => compileRoutingProfile(config, "hk"),
    (error: unknown) =>
      error instanceof RoutingCompileError &&
      error.issues.some(
        (entry) =>
          entry.code === "policy-invariant" && entry.path.join(".") === path,
      ),
  );
});

test("routing config directory ignores sibling manifests owned by other schemas", async () => {
  const { config } = await loadCanonicalInputs();
  assert.equal(config.schemaVersion, 1);
  assert.ok(config.services.chatgpt !== undefined);
  assert.ok(config.accessProfiles.hk !== undefined);
});

test("routing loader hydrates catalog-owned service identity and endpoint metadata", async () => {
  const { config } = await loadCanonicalInputs();
  assert.equal(config.services.chatgpt?.displayName, "🤖 ChatGPT");
  assert.equal(config.services.chatgpt?.selector.visibleGroup, "🤖 ChatGPT");
  assert.equal(config.services.chatgpt?.endpoints.service?.ruleset, "AI_ChatGPT_Classical");
  assert.equal(config.services.opencode?.endpoints.service?.ruleset, "AI_OpenCode_Classical");
  assert.equal(config.services.windsurf?.endpoints.service?.ruleset, "AI_Windsurf_Classical");
  assert.equal(config.services.claude?.displayName, "🔐 Claude Account Guard");
  assert.equal(config.services.claude?.selector.visibleGroup, "🔐 Claude Account Guard");
});

test("service catalog validation fails closed for malformed and duplicate identities", async () => {
  await withTempDirectory("routing-service-catalog-", async (directory) => {
    const path = join(directory, "services.json");
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: 1,
        services: [
          { id: "chatgpt", providerKey: "AI_ChatGPT_Classical", group: "ChatGPT", file: "chatgpt.yaml", payload: [] },
          { id: "chatgpt", providerKey: "AI_ChatGPT_Classical_2", group: "ChatGPT 2", file: "chatgpt-2.yaml", payload: [] },
        ],
      }),
      "utf8",
    );
    await assert.rejects(
      () => loadServiceCatalog(path),
      (error: unknown) => error instanceof ServiceCatalogError && error.issues[0]?.message.includes("duplicate service id"),
    );
    await writeFile(path, "{", "utf8");
    await assert.rejects(() => loadServiceCatalog(path), ServiceCatalogError);
  });
});

test("fragment loader rejects duplicate record IDs instead of overwriting", async () => {
  await withTempDirectory("routing-config-", async (directory) => {
    const first = join(directory, "01.yaml");
    const second = join(directory, "02.yaml");
    await writeFile(
      first,
      "routeTargets:\n  reject: { kind: reject, group: REJECT }\n",
      "utf8",
    );
    await writeFile(
      second,
      "routeTargets:\n  reject: { kind: reject, group: REJECT }\n",
      "utf8",
    );
    await assert.rejects(
      () => loadRoutingConfigFromFiles([first, second]),
      (error: unknown) =>
        error instanceof RoutingConfigLoadError &&
        error.issues.some((entry) => entry.code === "duplicate-key"),
    );
  });
});

test("fragment loader rejects duplicate YAML mapping keys", async () => {
  await withTempDirectory("routing-config-", async (directory) => {
    const fixture = join(directory, "duplicate.yaml");
    await writeFile(
      fixture,
      "routeTargets:\n  reject: { kind: reject, group: REJECT }\n  reject: { kind: reject, group: REJECT }\n",
      "utf8",
    );
    await assert.rejects(
      () => loadRoutingConfigFromFiles([fixture]),
      (error: unknown) =>
        error instanceof RoutingConfigLoadError &&
        error.issues.some((entry) => entry.code === "invalid-yaml"),
    );
  });
});

test("every DNS resolver viaRoute must reference a known target", async () => {
  const { config } = await loadCanonicalInputs();
  const mutated = structuredClone(config);
  const dnsProfile = mutated.dns.profiles.default;
  assert.ok(dnsProfile !== undefined);
  const resolver = dnsProfile.proxyServerNameserver[0];
  assert.ok(resolver !== undefined);
  resolver.viaRoute = "missing-route";
  const issues = validateRoutingSemantics(mutated);
  assert.ok(
    issues.some(
      (entry) =>
        entry.code === "missing-reference" &&
        entry.path.join(".") ===
          "dns.profiles.default.proxyServerNameserver.0.viaRoute",
    ),
  );
});

test("account-protected services need proxy-only DNS in every DNS profile", async () => {
  const { config } = await loadCanonicalInputs();
  const mutated = structuredClone(config);
  const dnsProfile = mutated.dns.profiles.default;
  assert.ok(dnsProfile !== undefined);
  delete dnsProfile.servicePolicies.claude;
  const issues = validateRoutingSemantics(mutated);
  assert.ok(
    issues.some(
      (entry) =>
        entry.path.join(".") === "dns.profiles.default.servicePolicies.claude",
    ),
  );
});

test("profile-aware services must explicitly override an incompatible profile default", async () => {
  const { config } = await loadCanonicalInputs();
  const mutated = structuredClone(config);
  const hk = mutated.accessProfiles.hk;
  assert.ok(hk !== undefined);
  delete hk.serviceOverrides.windsurf;
  assert.ok(
    validateRoutingSemantics(mutated).some(
      (entry) =>
        entry.path.join(".") === "accessProfiles.hk.defaultRoute" &&
        entry.message.includes("windsurf"),
    ),
  );
});

test("stable/realtime services and non-dynamic protection classes reject selectable auto routes", async () => {
  const { config } = await loadCanonicalInputs();
  const mutated = structuredClone(config);
  const windsurf = mutated.services.windsurf;
  assert.ok(windsurf !== undefined);
  windsurf.protectionClass = "stable-session";
  windsurf.allowedRoutes.push("us-auto");
  windsurf.selector.allowedRouteRefs.push("us-auto");
  const issues = validateRoutingSemantics(mutated);
  assert.ok(
    issues.some(
      (entry) =>
        entry.code === "policy-invariant" &&
        entry.path.join(".").startsWith("services.windsurf.allowedRoutes."),
    ),
  );
  assert.ok(
    issues.some(
      (entry) =>
        entry.code === "dynamic-route" &&
        entry.path
          .join(".")
          .startsWith("services.windsurf.selector.allowedRouteRefs."),
    ),
  );
});

test("pinned egress rejects built-ins and duplicate approved node identities", async () => {
  const { config } = await loadCanonicalInputs();
  const mutated = structuredClone(config);
  const target = mutated.routeTargets["claude-us-pinned"];
  assert.ok(target !== undefined && target.kind === "pinned-egress");
  target.approvedNodes.push("direct", "US-Claude-01");
  const issues = validateRoutingSemantics(mutated);
  assert.ok(
    issues.some(
      (entry) =>
        entry.path.join(".") === "routeTargets.claude-us-pinned.approvedNodes",
    ),
  );
  assert.ok(
    issues.some(
      (entry) =>
        entry.path.join(".") ===
        "routeTargets.claude-us-pinned.approvedNodes.2",
    ),
  );
});

test("account reset conditions must be unique", async () => {
  const { config } = await loadCanonicalInputs();
  const mutated = structuredClone(config);
  const protection = mutated.protectionClasses["account-protected"];
  assert.ok(
    protection !== undefined && protection.kind === "account-protected",
  );
  const first = protection.resetOn[0];
  assert.ok(first !== undefined);
  protection.resetOn.push(first);
  assert.ok(
    validateRoutingSemantics(mutated).some(
      (entry) =>
        entry.path.join(".") === "protectionClasses.account-protected.resetOn",
    ),
  );
});

test("rule ordering contract rejects a later stage before a protected terminal reject", () => {
  const issues = validateRuleOrdering({
    entries: [
      { stage: "account-protected", label: "Claude protected rule" },
      { stage: "specific-service", label: "Windsurf" },
      { stage: "account-terminal-reject", label: "Claude terminal reject" },
    ],
  });
  assert.equal(issues[0]?.code, "rule-ordering");
});


test("migration adapter only maps legacy identities and has no generator side effect", () => {
  assert.equal(canonicalServiceIdFromLegacy("claude"), "claude");
  assert.equal(canonicalServiceIdFromLegacy("unknown"), undefined);
  assert.equal(canonicalServiceIdFromLegacyGroup("🤖 Claude"), "claude");
  assert.equal(canonicalServiceIdFromLegacyGroup("🤖 Claude "), undefined);
});

test("committed JSON Schema is generated from the Zod source", async () => {
  const { project } = await loadCanonicalInputs();
  const committed = await readFile(
    canonicalArtifactPath(project, "routing-schema"),
    "utf8",
  );
  const expected = `${JSON.stringify(z.toJSONSchema(RoutingConfigSchema), null, 2)}\n`;
  assert.equal(committed, expected);
});
