import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  checkRoutingArtifacts,
  expectedRoutingArtifacts,
  RoutingArtifactCheckError,
} from "#routing/routing-artifacts.js";
import { compileRoutingProfile } from "#routing/compiler.js";
import {
  compileMihomoFragment,
  renderMihomoFragment,
} from "#routing/mihomo-projection.js";
import YAML from "yaml";
import { withTempDirectory } from "#routing-test/support/temp-dir.js";
import { canonicalArtifactName, canonicalArtifactPath, loadCanonicalInputs } from "#routing-test/support/canonical-inputs.js";
import { MIHOMO_PROJECTION, ROOT, VALID_DIRECTORY } from "#routing-test/support/paths.js";

test("all canonical profiles have deterministic plan and non-standalone fragment artifacts", async () => {
  const { project, config, projection } = await loadCanonicalInputs();
  for (const profileId of Object.keys(config.accessProfiles).sort()) {
    assert.ok(projection.profiles[profileId] !== undefined);
    const plan = await readFile(
      canonicalArtifactPath(project, "profile-plan", profileId),
      "utf8",
    );
    const fragment = await readFile(
      canonicalArtifactPath(project, "mihomo-fragment", profileId),
      "utf8",
    );
    assert.equal(
      plan,
      `${JSON.stringify(compileRoutingProfile(config, profileId), null, 2)}\n`,
    );
    assert.equal(
      fragment,
      renderMihomoFragment(
        compileMihomoFragment(config, projection, profileId),
      ),
    );
    assert.equal(fragment.includes("MATCH,"), false);
    const parsed = YAML.parse(fragment) as Record<string, unknown>;
    const groups = parsed["proxy-groups"] as Array<Record<string, unknown>>;
    assert.equal(
      groups.some((group) => String(group.name).endsWith(" Auto")),
      false,
    );
    assert.equal(
      groups.some((group) => group.name === "🔐 Claude US Pinned"),
      false,
    );
    const rules = parsed.rules as string[];
    const deepmind = rules.findIndex((rule) =>
      rule.startsWith("GEOSITE,google-deepmind,"),
    );
    const category = rules.findIndex((rule) =>
      rule.startsWith("GEOSITE,category-ai-!cn,"),
    );
    assert.equal(deepmind >= 0 && category === deepmind + 1, true);
    assert.equal(
      rules[deepmind]?.split(",").at(-1),
      rules[category]?.split(",").at(-1),
    );
  }
});

test("artifact checker is read-only and rejects missing, stale, and changed outputs", async () => {
  const { project, config, projection } = await loadCanonicalInputs();
  const expected = expectedRoutingArtifacts(config, projection, project);
  await withTempDirectory("routing-artifacts-", async (directory) => {
    for (const [name, content] of expected)
      await writeFile(join(directory, name), content, "utf8");
    await checkRoutingArtifacts(config, projection, directory, project);
    await writeFile(
      join(directory, canonicalArtifactName(project, "shadow-candidate")),
      "shadow owns this artifact\n",
      "utf8",
    );
    await writeFile(join(directory, canonicalArtifactName(project, "shadow-parity-report")), "{}\n", "utf8");
    await checkRoutingArtifacts(config, projection, directory, project);

    const missing = canonicalArtifactName(project, "profile-plan");
    await rm(join(directory, missing));
    await assert.rejects(
      () => checkRoutingArtifacts(config, projection, directory, project),
      (error: unknown) =>
        error instanceof RoutingArtifactCheckError &&
        error.issues.some(
          (entry) =>
            entry.path.at(-1) === missing && entry.message.includes("missing"),
        ),
    );
    assert.equal(
      await readFile(join(directory, canonicalArtifactName(project, "mihomo-fragment")), "utf8"),
      expected.get(canonicalArtifactName(project, "mihomo-fragment")),
    );

    await writeFile(
      join(directory, missing),
      expected.get(missing) ?? "",
      "utf8",
    );
    await writeFile(
      join(directory, "obsolete.plan.json"),
      "obsolete\n",
      "utf8",
    );
    await assert.rejects(
      () => checkRoutingArtifacts(config, projection, directory, project),
      (error: unknown) =>
        error instanceof RoutingArtifactCheckError &&
        error.issues.some(
          (entry) =>
            entry.path.at(-1) === "obsolete.plan.json" &&
            entry.message.includes("stale"),
        ),
    );
    await rm(join(directory, "obsolete.plan.json"));

    const changed = canonicalArtifactName(project, "profile-plan", "jp");
    await writeFile(join(directory, changed), "changed\n", "utf8");
    await assert.rejects(
      () => checkRoutingArtifacts(config, projection, directory, project),
      (error: unknown) =>
        error instanceof RoutingArtifactCheckError &&
        error.issues.some(
          (entry) =>
            entry.path.at(-1) === changed &&
            entry.message.includes("differs"),
        ),
    );
  });
});
