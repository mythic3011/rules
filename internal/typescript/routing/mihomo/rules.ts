import { isOwnershipOverrideService, validateRuleOrdering, type RuleOrderingStage } from "../semantic-validator.js";
import { compare, compilerInvariant, requiredRoute, MihomoProjectionError, type ValidatedProjectionContext } from "./types.js";

type EmittedRuleStage = Extract<
  RuleOrderingStage,
  "ownership-override" | "account-protected" | "specific-service" | "ai-all" | "category-ai"
>;

const RULE_STAGE_ORDER = {
  "ownership-override": 10,
  "account-protected": 20,
  "specific-service": 30,
  "ai-all": 40,
  "category-ai": 50,
} as const satisfies Record<EmittedRuleStage, number>;

interface RuleBundle {
  readonly stage: EmittedRuleStage;
  readonly sortKey: string;
  readonly lines: readonly string[];
}

function compareRuleBundles(left: RuleBundle, right: RuleBundle): number {
  const stageDelta = RULE_STAGE_ORDER[left.stage] - RULE_STAGE_ORDER[right.stage];
  if (stageDelta !== 0) return stageDelta;
  return compare(left.sortKey, right.sortKey);
}

function flattenRuleBundles(bundles: readonly RuleBundle[]): {
  readonly rules: readonly string[];
  readonly entries: readonly { readonly stage: EmittedRuleStage; readonly label: string }[];
} {
  const ordered = [...bundles].sort(compareRuleBundles);
  return {
    rules: ordered.flatMap((bundle) => [...bundle.lines]),
    entries: ordered.flatMap((bundle) => bundle.lines.map((label) => ({ stage: bundle.stage, label }))),
  };
}

function compileRuleBundles(ctx: ValidatedProjectionContext): RuleBundle[] {
  const bundles: RuleBundle[] = [];
  let specificOrder = 0;
  for (const service of ctx.plan.services) {
    const canonical = ctx.config.services[service.id];
    if (canonical === undefined) continue;
    const protection = ctx.config.protectionClasses[canonical.protectionClass];
    if (protection === undefined) compilerInvariant(`service ${service.id} is missing a protection class after validation`);
    for (const endpoint of service.endpoints) {
      const line = `RULE-SET,${endpoint.ruleset},${service.selector.visibleGroup}`;
      if (isOwnershipOverrideService(ctx.config, service.id)) {
        bundles.push({ stage: "ownership-override", sortKey: line, lines: [line] });
      } else if (protection.kind === "account-protected") {
        bundles.push({ stage: "account-protected", sortKey: line, lines: [line] });
      } else {
        bundles.push({ stage: "specific-service", sortKey: String(specificOrder).padStart(8, "0"), lines: [line] });
        specificOrder += 1;
      }
    }
  }
  if (ctx.profile.aiAllRoute !== undefined) {
    const line = `RULE-SET,${ctx.projection.aiAllRuleset},${requiredRoute(ctx.config, ctx.profile.aiAllRoute, ["profiles", ctx.profileId, "aiAllRoute"]).group}`;
    bundles.push({ stage: "ai-all", sortKey: "0", lines: [line] });
  }
  for (const [index, geosite] of ctx.projection.categoryGeosites.entries()) {
    const line = `GEOSITE,${geosite},${requiredRoute(ctx.config, ctx.profile.categoryAiRoute, ["profiles", ctx.profileId, "categoryAiRoute"]).group}`;
    bundles.push({ stage: "category-ai", sortKey: String(index).padStart(8, "0"), lines: [line] });
  }
  return bundles;
}

export function compileRules(ctx: ValidatedProjectionContext): readonly string[] {
  const { rules, entries } = flattenRuleBundles(compileRuleBundles(ctx));
  const ordering = validateRuleOrdering({ entries });
  if (ordering.length > 0) throw new MihomoProjectionError(ordering);
  return rules;
}
