import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import YAML from "yaml";

import { loadMihomoProjectionConfig } from "../../internal/typescript/routing/mihomo-projection.js";

test("Mihomo projection resolves external upstream sources from the shared lock manifest", async () => {
  const projection = await loadMihomoProjectionConfig(
    "internal/config/ai-routing/mihomo.yaml",
  );
  const manifest = JSON.parse(
    await readFile("internal/config/ai-routing/upstream-sources.json", "utf8"),
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
  const text = await readFile("internal/config/ai-routing/mihomo.yaml", "utf8");
  const document = YAML.parse(text) as {
    sources: Record<string, unknown>;
    upstreamSourceManifest?: string;
  };
  assert.equal(document.upstreamSourceManifest, "upstream-sources.json");
  assert.deepEqual(document.sources.vpsdance, { manifestSource: "vpsdance" });
});
