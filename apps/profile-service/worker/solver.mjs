import runtimeData from "./generated/runtime-data.mjs";

export class ProfileSpecError extends Error {
  constructor(message, code = "invalid_profile_spec") {
    super(message);
    this.name = "ProfileSpecError";
    this.code = code;
  }
}

function normalizeAlias(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("en-US")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function dedupe(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function buildRegionAliasMap(data = runtimeData) {
  const aliases = new Map();
  for (const region of data.regions) {
    const values = [region.id, region.name, ...region.countryCodes, ...region.aliases];
    for (const value of values) {
      const key = normalizeAlias(value);
      if (!key) continue;
      const existing = aliases.get(key);
      if (existing && existing !== region.id) {
        throw new ProfileSpecError(`Ambiguous region alias: ${value}`);
      }
      aliases.set(key, region.id);
    }
  }
  return aliases;
}

export function canonicalizeRegion(value, data = runtimeData) {
  const key = normalizeAlias(value);
  if (!key) throw new ProfileSpecError("Region value cannot be empty", "empty_region");
  const region = buildRegionAliasMap(data).get(key);
  if (!region) throw new ProfileSpecError(`Unknown region: ${value}`, "unknown_region");
  return region;
}

function canonicalizeMany(values, data) {
  if (!Array.isArray(values)) {
    throw new ProfileSpecError("Region fields must be arrays", "invalid_region_list");
  }
  return dedupe(values.map((value) => canonicalizeRegion(value, data)));
}

export function normalizeProfileSpec(input, data = runtimeData) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ProfileSpecError("Profile spec must be an object");
  }

  const allowed = new Set([
    "schemaVersion",
    "baseProfile",
    "disabledNodeRegions",
    "onlyNodeRegions",
    "preferredNodeRegions",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new ProfileSpecError(`Unknown profile field: ${key}`, "unknown_profile_field");
    }
  }

  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) {
    throw new ProfileSpecError("Unsupported profile schemaVersion");
  }

  const baseProfile = input.baseProfile ?? "ai-balanced";
  if (!data.baseProfiles.some((profile) => profile.id === baseProfile)) {
    throw new ProfileSpecError(`Unsupported base profile: ${baseProfile}`, "unknown_base_profile");
  }

  return {
    schemaVersion: 1,
    baseProfile,
    disabledNodeRegions: canonicalizeMany(input.disabledNodeRegions ?? [], data),
    onlyNodeRegions: canonicalizeMany(input.onlyNodeRegions ?? [], data),
    preferredNodeRegions: canonicalizeMany(input.preferredNodeRegions ?? [], data),
  };
}

export function resolveProfileSpec(input, data = runtimeData) {
  const spec = normalizeProfileSpec(input, data);
  const routable = [...data.routableRegionOrder];
  const routableSet = new Set(routable);

  const invalidOnly = spec.onlyNodeRegions.filter((region) => !routableSet.has(region));
  if (invalidOnly.length) {
    throw new ProfileSpecError(
      `onlyNodeRegions can contain routable regions only: ${invalidOnly.join(", ")}`,
      "non_routable_only_region",
    );
  }

  const disabledSet = new Set(spec.disabledNodeRegions);
  const onlySet = new Set(spec.onlyNodeRegions);
  const conflict = spec.onlyNodeRegions.filter((region) => disabledSet.has(region));
  if (conflict.length) {
    throw new ProfileSpecError(
      `Region cannot be both disabled and required: ${conflict.join(", ")}`,
      "conflicting_region_constraints",
    );
  }

  const active = spec.onlyNodeRegions.length
    ? routable.filter((region) => onlySet.has(region))
    : routable.filter((region) => !disabledSet.has(region));

  if (!active.length) {
    throw new ProfileSpecError("Profile must keep at least one routable region", "no_active_region");
  }

  const activeSet = new Set(active);
  const invalidPreferred = spec.preferredNodeRegions.filter((region) => !activeSet.has(region));
  if (invalidPreferred.length) {
    throw new ProfileSpecError(
      `Preferred regions must remain active: ${invalidPreferred.join(", ")}`,
      "inactive_preferred_region",
    );
  }

  const preferred = spec.preferredNodeRegions;
  const orderedActive = [
    ...preferred,
    ...active.filter((region) => !preferred.includes(region)),
  ];

  return {
    spec,
    disabledRegionIds: spec.disabledNodeRegions,
    activeRegionIds: orderedActive,
    preferredRegionIds: preferred,
    includeOtherRegion: spec.onlyNodeRegions.length === 0,
  };
}

function negativeFilter(existing, blockedTerms) {
  if (!blockedTerms.length) return existing;
  const blocked = blockedTerms.map((term) => `(?:${term})`).join("|");
  if (!existing) return `(?i)^(?!.*(?:${blocked})).*$`;

  let body = existing;
  if (body.startsWith("(?i)")) body = body.slice(4);
  if (body.startsWith("^")) body = body.slice(1);
  if (body.endsWith("$")) body = body.slice(0, -1);
  return `(?i)^(?!.*(?:${blocked}))(?:${body})$`;
}

function positiveFilter(existing, allowedTerms) {
  if (!allowedTerms.length) return existing;
  const allowed = allowedTerms.map((term) => `(?:${term})`).join("|");
  if (!existing) return `(?i)^(?=.*(?:${allowed})).*$`;

  let body = existing;
  if (body.startsWith("(?i)")) body = body.slice(4);
  if (body.startsWith("^")) body = body.slice(1);
  if (body.endsWith("$")) body = body.slice(0, -1);
  return `(?i)^(?=.*(?:${allowed}))(?:${body})$`;
}

function reorderCandidates(candidates, groupToRegion, activeOrder, removedGroups) {
  const filtered = candidates.filter(
    (candidate) => !(candidate.kind === "group-ref" && removedGroups.has(candidate.value)),
  );
  const rank = new Map(activeOrder.map((region, index) => [region, index]));
  const regionCandidates = filtered
    .filter((candidate) => candidate.kind === "group-ref" && groupToRegion[candidate.value])
    .sort((a, b) => {
      const ar = rank.get(groupToRegion[a.value]) ?? 10000;
      const br = rank.get(groupToRegion[b.value]) ?? 10000;
      return ar - br;
    });
  let index = 0;
  return filtered.map((candidate) => {
    if (candidate.kind === "group-ref" && groupToRegion[candidate.value]) {
      return regionCandidates[index++];
    }
    return candidate;
  });
}

export function solveSubconverterPlan(input, data = runtimeData) {
  const resolved = resolveProfileSpec(input, data);
  const plan = structuredClone(data.plan);
  const activeSet = new Set(resolved.activeRegionIds);

  const removedGroups = new Set();
  for (const [group, region] of Object.entries(data.regionGroups)) {
    if (!activeSet.has(region)) removedGroups.add(group);
  }
  if (!resolved.includeOtherRegion) removedGroups.add(data.otherRegionGroup);
  for (const [group, region] of Object.entries(data.stableRegionGroups)) {
    if (!activeSet.has(region)) removedGroups.add(group);
  }

  const effectiveDisabled = new Set(resolved.disabledRegionIds);
  for (const region of data.routableRegionOrder) {
    if (!activeSet.has(region)) effectiveDisabled.add(region);
  }
  const regionById = new Map(data.regions.map((region) => [region.id, region]));
  const blockedTerms = [...effectiveDisabled]
    .sort()
    .map((region) => regionById.get(region)?.terms)
    .filter(Boolean);
  const allowedTerms = resolved.activeRegionIds
    .map((region) => regionById.get(region)?.terms)
    .filter(Boolean);

  const orderingGroups = { ...data.regionGroups, ...data.stableRegionGroups };

  for (const section of plan.sections) {
    if (section.type === "selectors") {
      for (const selector of section.selectors) {
        selector.group.candidates = reorderCandidates(
          selector.group.candidates,
          orderingGroups,
          resolved.activeRegionIds,
          removedGroups,
        );
      }
      continue;
    }
    if (section.type !== "groups") continue;

    section.groups = section.groups
      .filter((group) => !removedGroups.has(group.name))
      .map((group) => {
        group.candidates = reorderCandidates(
          group.candidates ?? [],
          orderingGroups,
          resolved.activeRegionIds,
          removedGroups,
        );
        if (group.type === "proxy-group" && group.kind === "select") {
          group.filterPattern = resolved.includeOtherRegion
            ? negativeFilter(group.filterPattern, blockedTerms)
            : positiveFilter(group.filterPattern, allowedTerms);
        } else if (group.type === "proxy-group" && group.name === data.otherRegionGroup) {
          group.filterPattern = negativeFilter(group.filterPattern, blockedTerms);
        }
        return group;
      });
  }

  const defined = new Set();
  for (const section of plan.sections) {
    if (section.type === "groups") {
      for (const group of section.groups) defined.add(group.name);
    } else if (section.type === "selectors") {
      for (const selector of section.selectors) defined.add(selector.group.name);
    }
  }
  for (const section of plan.sections) {
    const groups = section.type === "groups"
      ? section.groups
      : section.type === "selectors"
        ? section.selectors.map((selector) => selector.group)
        : [];
    for (const group of groups) {
      for (const candidate of group.candidates ?? []) {
        if (candidate.kind === "group-ref" && !defined.has(candidate.value)) {
          throw new ProfileSpecError(
            `Profile solver produced dangling group reference: ${candidate.value}`,
            "dangling_group_reference",
          );
        }
      }
    }
  }

  return { resolved, plan };
}

export function summarizeResolvedProfile(resolved, data = runtimeData) {
  const byId = new Map(data.regions.map((region) => [region.id, region]));
  return {
    baseProfile: resolved.spec.baseProfile,
    activeRegions: resolved.activeRegionIds.map((id) => ({ id, name: byId.get(id)?.name ?? id })),
    disabledRegions: resolved.disabledRegionIds.map((id) => ({ id, name: byId.get(id)?.name ?? id })),
    preferredRegions: resolved.preferredRegionIds.map((id) => ({ id, name: byId.get(id)?.name ?? id })),
    includeOtherRegion: resolved.includeOtherRegion,
  };
}

export { runtimeData };
