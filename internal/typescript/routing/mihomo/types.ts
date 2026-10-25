import type { CompiledRoutingPlan } from "../compiler.js";
import { formatIssues, type RoutingIssue } from "../issues.js";
import type { RouteTarget, RoutingConfig } from "../schema.js";
import type { MihomoProjectionConfig } from "./schema.js";

export class MihomoProjectionError extends Error {
  public constructor(public readonly issues: readonly RoutingIssue[]) { super(formatIssues(issues)); this.name = "MihomoProjectionError"; }
}
export function issue(code: RoutingIssue["code"], path: readonly (string | number)[], message: string): RoutingIssue { return { code, path, message }; }
export function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
export function unique(values: readonly string[]): string[] { return [...new Set(values)]; }

interface SelectGroup { readonly name: string; readonly type: "select"; readonly emptyFallback: "REJECT"; readonly proxies: readonly string[]; readonly use?: readonly string[]; readonly filter?: string; }
interface UrlTestGroup { readonly name: string; readonly type: "url-test"; readonly emptyFallback: "REJECT"; readonly use: readonly string[]; readonly filter: string; readonly url: string; readonly interval: number; readonly tolerance: number; }
export type MihomoGroup = SelectGroup | UrlTestGroup;
export interface MihomoRuleProvider { readonly type: "http"; readonly behavior: "classical"; readonly format: "yaml"; readonly interval: number; readonly url: string; }
export interface MihomoDns {
  readonly respectRules: boolean;
  readonly defaultNameserver: readonly string[];
  readonly proxyServerNameserver: readonly string[];
  readonly nameserver: readonly string[];
  readonly nameserverPolicy: Readonly<Record<string, readonly string[]>>;
}
export interface MihomoFragmentIR {
  readonly metadata: { readonly provenance: string; readonly externalProxyProviders: readonly string[] };
  readonly groups: readonly MihomoGroup[];
  readonly ruleProviders: Readonly<Record<string, MihomoRuleProvider>>;
  readonly rules: readonly string[];
  readonly dns: MihomoDns;
}

export function requiredRoute(config: RoutingConfig, routeId: string, path: readonly (string | number)[]): RouteTarget {
  const target = config.routeTargets[routeId];
  if (target === undefined) throw new MihomoProjectionError([issue("missing-reference", path, `route target ${routeId} does not exist`)]);
  return target;
}

export type MihomoProjectionProfile = NonNullable<MihomoProjectionConfig["profiles"][string]>;

export interface ValidatedProjectionContext {
  readonly config: RoutingConfig;
  readonly projection: MihomoProjectionConfig;
  readonly profileId: string;
  readonly profile: MihomoProjectionProfile;
  readonly plan: CompiledRoutingPlan;
  readonly reachableRouteIds: ReadonlySet<string>;
}

export function compilerInvariant(message: string): never {
  throw new Error(`mihomo compiler invariant: ${message}`);
}
