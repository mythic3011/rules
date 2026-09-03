import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "../../..");
export const VALID_DIRECTORY = join(
  ROOT,
  "internal",
  "config",
  "ai-routing",
  "core",
);
export const INVALID_DIRECTORY = join(
  ROOT,
  "tests",
  "fixtures",
  "routing",
  "invalid",
);
export const MIHOMO_PROJECTION = join(
  ROOT,
  "internal",
  "config",
  "ai-routing",
  "projections",
  "mihomo.yaml",
);
export const SHADOW_PARITY = join(
  ROOT,
  "internal",
  "config",
  "ai-routing",
  "projections",
  "parity.yaml",
);
export const SHADOW_TEMPLATE = join(
  ROOT,
  "internal",
  "templates",
  "ai-routing",
  "full-relaxed-shadow.yaml.tpl",
);
export const RELAXED_BASE = join(ROOT, "cfg", "yaml", "Custom_Clash_AI.yaml");
export const ROUTING_CLI = join(
  ROOT,
  "internal",
  "typescript",
  "routing",
  "cli.ts",
);
export const CONTROLLER_SCRIPT = join(
  ROOT,
  "setup",
  "openclash",
  "scripts",
  "ai-routing-controller.sh",
);
export const UPSTREAM_SOURCE_MANIFEST = join(
  ROOT,
  "internal",
  "config",
  "ai-routing",
  "sources",
  "upstream-sources.json",
);
