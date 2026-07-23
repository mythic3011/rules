import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { ZodError } from "zod";

import { formatIssues, type RoutingIssue } from "./issues.js";
import {
  RoutingConfigFragmentSchema,
  RoutingConfigSchema,
  type RoutingConfig,
} from "./schema.js";

export class RoutingConfigLoadError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) {
    super(formatIssues(issues));
    this.name = "RoutingConfigLoadError";
  }
}

type Fragment = Record<string, unknown>;
const RECORD_SECTIONS = new Set([
  "routeTargets",
  "protectionClasses",
  "services",
  "accessProfiles",
]);

function zodIssues(error: ZodError): RoutingIssue[] {
  return error.issues.map((issue) => ({
    code: "schema",
    path: issue.path.map(String),
    message: issue.message,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeFragments(fragments: readonly { path: string; value: Fragment }[]): Fragment {
  const merged: Fragment = {};
  const issues: RoutingIssue[] = [];

  for (const fragment of fragments) {
    for (const [section, value] of Object.entries(fragment.value)) {
      if (RECORD_SECTIONS.has(section)) {
        if (!isRecord(value)) {
          issues.push({ code: "schema", path: [section], message: "must be a record" });
          continue;
        }
        const current = merged[section];
        const destination: Record<string, unknown> = isRecord(current) ? current : {};
        for (const [id, item] of Object.entries(value)) {
          if (Object.hasOwn(destination, id)) {
            issues.push({
              code: "duplicate-key",
              path: [section, id],
              message: `declared more than once, including ${fragment.path}`,
            });
            continue;
          }
          destination[id] = item;
        }
        merged[section] = destination;
        continue;
      }

      if (section === "dns" && isRecord(value)) {
        const current = merged.dns;
        const destination: Record<string, unknown> = isRecord(current) ? current : {};
        for (const [key, item] of Object.entries(value)) {
          if (key === "profiles" && isRecord(item)) {
            const profiles = isRecord(destination.profiles) ? destination.profiles : {};
            for (const [id, profile] of Object.entries(item)) {
              if (Object.hasOwn(profiles, id)) {
                issues.push({
                  code: "duplicate-key",
                  path: ["dns", "profiles", id],
                  message: `declared more than once, including ${fragment.path}`,
                });
              } else {
                profiles[id] = profile;
              }
            }
            destination.profiles = profiles;
          } else if (Object.hasOwn(destination, key)) {
            issues.push({
              code: "duplicate-key",
              path: ["dns", key],
              message: `declared more than once, including ${fragment.path}`,
            });
          } else {
            destination[key] = item;
          }
        }
        merged.dns = destination;
        continue;
      }

      if (Object.hasOwn(merged, section)) {
        issues.push({
          code: "duplicate-key",
          path: [section],
          message: `declared more than once, including ${fragment.path}`,
        });
      } else {
        merged[section] = value;
      }
    }
  }

  if (issues.length > 0) {
    throw new RoutingConfigLoadError(issues);
  }
  return merged;
}

export async function loadRoutingConfigFromFiles(paths: readonly string[]): Promise<RoutingConfig> {
  const fragments: { path: string; value: Fragment }[] = [];
  const issues: RoutingIssue[] = [];

  for (const path of paths) {
    const source = await readFile(path, "utf8");
    const document = parseDocument(source, { uniqueKeys: true });
    if (document.errors.length > 0) {
      for (const error of document.errors) {
        issues.push({ code: "invalid-yaml", path: [path], message: error.message });
      }
      continue;
    }
    const parsed = document.toJS();
    const result = RoutingConfigFragmentSchema.safeParse(parsed);
    if (!result.success) {
      issues.push(...zodIssues(result.error));
      continue;
    }
    fragments.push({ path, value: result.data });
  }
  if (issues.length > 0) {
    throw new RoutingConfigLoadError(issues);
  }

  const merged = mergeFragments(fragments);
  const result = RoutingConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new RoutingConfigLoadError(zodIssues(result.error));
  }
  return result.data;
}

export async function loadRoutingConfig(directory: string): Promise<RoutingConfig> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort();
  if (paths.length === 0) {
    throw new RoutingConfigLoadError([
      { code: "invalid-yaml", path: [directory], message: "contains no YAML manifests" },
    ]);
  }
  return loadRoutingConfigFromFiles(paths);
}
