import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";

import { buildRoutingArtifacts, buildRoutingInputArtifacts } from "#routing/artifacts/build.js";
import { compileIniMvpPlan } from "#routing/ini-mvp-plan.js";
import { loadRoutingContext } from "#routing/project/loader.js";
import { withTempDirectory } from "#routing-test/support/temp-dir.js";

test("INI compiler orders region keys by code units independent of locale", async () => {
  const { config, projection } = await loadRoutingContext();
  const entries = Object.entries(projection.regions);
  const firstEntry = entries[0];
  const secondEntry = entries[1];
  assert.ok(firstEntry !== undefined);
  assert.ok(secondEntry !== undefined);

  const orderedProjection = {
    ...projection,
    regions: Object.fromEntries([
      ["a", firstEntry[1]],
      ["A", secondEntry[1]],
      ...entries.slice(2),
    ]),
  };
  const plan = compileIniMvpPlan(config, orderedProjection);

  assert.deepEqual(
    plan.groups.slice(0, 2).map((group) => group.name),
    [secondEntry[1].stableGroup, firstEntry[1].stableGroup],
  );
});

test("routing build APIs order artifact paths by code units independent of locale", async () => {
  const context = await loadRoutingContext();

  await withTempDirectory("routing-ordering-", async (directory) => {
    const regionsSchemaOutput = join(directory, "A-regions-schema.json");
    const schemaOutput = join(directory, "a-schema.json");
    const orderedContext = {
      ...context,
      project: {
        ...context.project,
        generatedArtifactDirectory: join(directory, "generated"),
        regionsSchemaOutput,
        regionsV1Output: join(directory, "_regions-v1.json"),
        schemaOutput,
      },
    };

    for (const artifacts of [
      await buildRoutingInputArtifacts(orderedContext),
      await buildRoutingArtifacts(orderedContext),
    ]) {
      const upperIndex = artifacts.findIndex((artifact) => artifact.path === regionsSchemaOutput);
      const lowerIndex = artifacts.findIndex((artifact) => artifact.path === schemaOutput);
      assert.ok(upperIndex >= 0);
      assert.ok(lowerIndex >= 0);
      assert.ok(upperIndex < lowerIndex);
    }
  });
});
