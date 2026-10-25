import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import YAML from "yaml";

import { loadCanonicalInputs } from "#routing-test/support/canonical-inputs.js";
import {
  MIHOMO_PROJECTION,
  UPSTREAM_SOURCE_MANIFEST,
} from "#routing-test/support/paths.js";

test("Mihomo projection resolves external upstream sources from the shared lock manifest", async () => {
  const { projection } = await loadCanonicalInputs();
  const manifest = JSON.parse(
    await readFile(UPSTREAM_SOURCE_MANIFEST, "utf8"),
  ) as {
    sources: Record<
      string,
      {
        label: string;
        repository: string;
        revision: string;
        rawBaseUrl: string;
      }
    >;
  };
  const locked = manifest.sources.vpsdance;
  assert.ok(locked);
  assert.deepEqual(projection.sources.vpsdance, {
    label: locked.label,
    repository: locked.repository,
    revision: locked.revision,
    rawBaseUrl: locked.rawBaseUrl,
  });
});

test("VPSDance revision is declared once in the shared manifest, not inline in Mihomo YAML", async () => {
  const text = await readFile(MIHOMO_PROJECTION, "utf8");
  const document = YAML.parse(text) as {
    sources: Record<string, unknown>;
    upstreamSourceManifest?: string;
  };
  assert.equal(document.upstreamSourceManifest, "../sources/upstream-sources.json");
  assert.deepEqual(document.sources.vpsdance, { manifestSource: "vpsdance" });
});
