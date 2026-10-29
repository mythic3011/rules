import runtimeData from "./generated/runtime-data.mjs";
import {
  CUSTOM_RULE_PROVIDER_LIMITS,
  ProfileSpecError,
  normalizeProfileSpec,
  protectedRuleTargets,
  resolveProfileSpec,
  serviceRouteGroupName,
} from "./solver.mjs";

function clone(value) {
  return structuredClone(value);
}

function profileTemplate(data, outputFormat, id) {
  return data.templates?.find((item) => item.outputFormat === outputFormat && item.id === id);
}

export function getProfileOptions({ outputFormat, data = runtimeData } = {}) {
  if (outputFormat !== "ini" && outputFormat !== "yaml") {
    throw new ProfileSpecError(`Unsupported output format: ${outputFormat}`, "unknown_output_format");
  }
  const regions = (data.regions ?? []).map(({ terms, filterPattern, keywords, ...region }) => region);
  return {
    schemaVersion: data.schemaVersion,
    outputFormat,
    defaultTemplate: data.defaultProfiles?.[outputFormat] ?? "ai-balanced",
    templates: (data.templates ?? [])
      .filter((template) => template.outputFormat === outputFormat)
      .map(({ id, outputFormat: format, name, description, supportsProfileOptions }) => ({
        id,
        outputFormat: format,
        name,
        description,
        supportsProfileOptions,
        supportsRuleProviderOptions: outputFormat === "yaml" || supportsProfileOptions,
      })),
    regions,
    services: (data.services ?? [])
      .filter((service) => !Array.isArray(service.outputFormats) || service.outputFormats.includes(outputFormat))
      .map(({ id, name, outputFormats }) => ({ id, name, outputFormats })),
    serviceGroups: (data.serviceGroups ?? [])
      .filter((group) => group.outputFormat === outputFormat)
      .map(({ id, name, outputFormat: format, baseProfile, serviceIds, defaultRoutes, allowedRoutes, protected: isProtected }) => ({
        id,
        name,
        outputFormat: format,
        baseProfile,
        serviceIds: [...serviceIds],
        defaultRoutes: [...defaultRoutes],
        allowedRoutes: [...allowedRoutes],
        protected: isProtected,
      })),
    reservedGroupNames: [...(data.reservedGroupNames ?? [])],
    serviceGroupLimits: data.serviceGroupLimits,
    serviceGroupRouteLabels: { ...(data.serviceGroupRouteLabels ?? {}) },
    languages: Object.keys(data.render.localized ?? {}),
    optionDefaults: {
      allowDirect: false,
      failClosed: true,
      language: data.render.defaultLanguage,
      adblock: false,
      customRuleProviders: [],
    },
    customRuleProviderLimits: { ...CUSTOM_RULE_PROVIDER_LIMITS },
  };
}

function groupName(data, key) {
  return data.groups?.[key];
}

function normalizedPattern(pattern) {
  let body = pattern ?? "";
  if (body.startsWith("(?i)")) body = body.slice(4);
  if (body.startsWith("^")) body = body.slice(1);
  if (body.endsWith("$")) body = body.slice(0, -1);
  return body;
}

function negativeFilter(existing, terms) {
  if (!terms.length) return existing;
  const blocked = terms.map((term) => `(?:${term})`).join("|");
  const body = normalizedPattern(existing);
  return body
    ? `(?i)^(?!.*(?:${blocked}))(?:${body})$`
    : `(?i)^(?!.*(?:${blocked})).*$`;
}

function positiveFilter(existing, terms) {
  if (!terms.length) return existing;
  const allowed = terms.map((term) => `(?:${term})`).join("|");
  const body = normalizedPattern(existing);
  return body
    ? `(?i)^(?=.*(?:${allowed}))(?:${body})$`
    : `(?i)^(?=.*(?:${allowed})).*$`;
}

function unionFilter(existing, terms) {
  if (!terms.length) return existing;
  const patterns = [existing, ...terms].filter(Boolean).map((pattern) => pattern.replace(/^\(\?i\)/, ""));
  return `(?i)(?:${patterns.map((pattern) => `(?:${pattern})`).join("|")})`;
}

function reorderChoices(choices, groupToRegion, order, removed) {
  const filtered = choices.filter((choice) => !removed.has(choice));
  const ranks = new Map(order.map((region, index) => [region, index]));
  const regional = filtered
    .filter((choice) => Object.hasOwn(groupToRegion, choice))
    .sort((left, right) => (ranks.get(groupToRegion[left]) ?? 10000) - (ranks.get(groupToRegion[right]) ?? 10000));
  let index = 0;
  return filtered.map((choice) => Object.hasOwn(groupToRegion, choice) ? regional[index++] : choice);
}

function splitRule(rule) {
  if (typeof rule !== "string") return null;
  const fields = rule.split(",");
  const targetIndex = fields.at(-1)?.trim().toLowerCase() === "no-resolve"
    ? fields.length - 2
    : fields.length - 1;
  return targetIndex > 0 ? { fields, targetIndex } : null;
}

function ruleTarget(rule) {
  const parsed = splitRule(rule);
  return parsed?.fields[parsed.targetIndex]?.trim().replace(/^['"]|['"]$/g, "") ?? null;
}

function ruleWithTarget(rule, target) {
  const parsed = splitRule(rule);
  if (!parsed) return rule;
  parsed.fields[parsed.targetIndex] = target;
  return parsed.fields.join(",");
}

function yamlRuleRef(rule) {
  if (typeof rule !== "string") return null;
  const fields = rule.split(",");
  const kind = fields[0]?.trim().replace(/^['"]|['"]$/g, "").toUpperCase();
  const value = fields[1]?.trim().replace(/^['"]|['"]$/g, "");
  return kind && value ? `${kind}:${value}` : null;
}

function serviceGroups(data) {
  return (data.services ?? []).filter((service) => service.id && service.group);
}

function serviceGroupCatalog(data, outputFormat, baseProfile) {
  return (data.serviceGroups ?? []).filter((group) => (
    group.outputFormat === outputFormat && group.baseProfile === baseProfile
  ));
}

function serviceGroupRouteChoices(layout, data, failClosed, sourceByService, protectedGroup = false) {
  const reject = data.accountProtection?.rejectGroup ?? data.groups.reject;
  const choices = layout.routes.length
    ? layout.routes.map((route) => (
      route === "default" && layout.serviceIds.length
        ? sourceByService.get(layout.serviceIds[0])?.defaultRouteGroup
        : serviceRouteGroupName(route, data)
    ))
    : [reject];
  if (choices.some((choice) => typeof choice !== "string" || !choice)) {
    throw new ProfileSpecError("Service group route metadata has no renderer target", "invalid_profile_data");
  }
  const unique = [...new Set(choices)];
  return protectedGroup || failClosed === true
    ? [reject, ...unique.filter((choice) => choice !== reject)]
    : unique;
}

function addScopedYamlRegionGroups(profile, resolved, data, regionIds) {
  const groups = profile["proxy-groups"] ?? [];
  const existingNames = new Set(groups.map((group) => group.name));
  const active = new Set(resolved.activeRegionIds);
  const disabled = new Set(resolved.disabledRegionIds);
  for (const regionId of data.routableRegionOrder ?? []) {
    if (!active.has(regionId)) disabled.add(regionId);
  }
  const blockedTerms = [...disabled]
    .sort()
    .map((regionId) => data.regions.find((region) => region.id === regionId)?.terms)
    .filter(Boolean);
  const provider = groups.find((group) => Array.isArray(group.use) && group.use.length)?.use;
  if (regionIds.length && !provider?.length) {
    throw new ProfileSpecError("Node provider is missing for service-scoped regions", "invalid_profile_data");
  }
  const additions = [];
  const orderedRegionIds = [...new Set(regionIds)].sort((left, right) => (
    data.regions.findIndex((region) => region.id === left) - data.regions.findIndex((region) => region.id === right)
  ));
  for (const regionId of orderedRegionIds) {
    const region = data.regions.find((item) => item.id === regionId);
    if (!region || typeof region.group !== "string" || typeof region.filterPattern !== "string") {
      throw new ProfileSpecError(`Service-scoped region metadata is unavailable: ${regionId}`, "invalid_profile_data");
    }
    if (existingNames.has(region.group)) continue;
    additions.push({
      name: region.group,
      type: "select",
      use: [...provider],
      filter: negativeFilter(region.filterPattern, blockedTerms),
      proxies: [data.groups.reject],
    });
    existingNames.add(region.group);
  }
  if (additions.length) {
    const otherIndex = groups.findIndex((group) => group.name === data.otherRegionGroup);
    groups.splice(otherIndex < 0 ? groups.length : otherIndex, 0, ...additions);
  }
  profile["proxy-groups"] = groups;
}

function applyYamlServiceGroupLayout(profile, resolved, data, services) {
  if (!Object.hasOwn(resolved.spec, "serviceGroups")) return null;
  const metadata = serviceGroupCatalog(data, "yaml", resolved.spec.baseProfile);
  const sourceNames = new Set(metadata.map((group) => group.name));
  const sourceByService = new Map(metadata.flatMap((group) => group.serviceIds.map((serviceId) => [serviceId, group])));
  const protectedEntry = metadata.find((group) => group.protected);
  if (!protectedEntry) throw new ProfileSpecError("Protected service group metadata is missing", "invalid_profile_data");

  const groupForService = new Map();
  const groupMembers = new Map();
  for (const layout of resolved.spec.serviceGroups) {
    groupMembers.set(layout.name, new Set(layout.serviceIds));
    for (const serviceId of layout.serviceIds) groupForService.set(serviceId, layout.name);
  }
  const targetByRef = new Map();
  const unassignedRefs = new Set();
  const reject = data.accountProtection?.rejectGroup ?? data.groups.reject;
  for (const service of services) {
    const groupName = groupForService.get(service.id);
    const target = groupName ?? reject;
    for (const ref of service.ruleRefs ?? []) {
      if (typeof ref.yamlKind !== "string" || typeof ref.yamlValue !== "string" || !ref.yamlValue) continue;
      const key = `${ref.yamlKind.toUpperCase()}:${ref.yamlValue}`;
      const existing = targetByRef.get(key);
      if (existing !== undefined && existing !== target) {
        throw new ProfileSpecError("Services sharing an exact routing rule have incompatible groups", "incompatible_service_rule_owners");
      }
      targetByRef.set(key, target);
      if (!groupName) unassignedRefs.add(key);
    }
  }

  const regionIds = [...new Set(resolved.spec.serviceGroups.flatMap((group) => (
    group.routes.filter((route) => data.regions.some((region) => region.id === route))
  )))];
  addScopedYamlRegionGroups(profile, resolved, data, regionIds);

  const existingGroups = profile["proxy-groups"] ?? [];
  const existingByName = new Map(existingGroups.map((group) => [group.name, group]));
  const protectedLayout = resolved.spec.serviceGroups.find((group) => group.id === protectedEntry.id);
  if (!protectedLayout) throw new ProfileSpecError("The protected account service group cannot be deleted", "protected_service_group");
  const layoutGroups = resolved.spec.serviceGroups.map((layout) => {
    const protectedGroup = layout.id === protectedEntry.id;
    const sourceName = protectedGroup
      ? protectedEntry.name
      : (layout.serviceIds.map((serviceId) => sourceByService.get(serviceId)?.name).find(Boolean) ?? layout.name);
    const original = existingByName.get(sourceName);
    if (protectedGroup && !original) {
      throw new ProfileSpecError("Protected account group is missing from the profile", "invalid_profile_data");
    }
    const group = original ? clone(original) : { type: "select" };
    group.name = layout.name;
    group.type = "select";
    group.proxies = serviceGroupRouteChoices(layout, data, resolved.failClosed, sourceByService, protectedGroup);
    delete group.use;
    delete group.filter;
    delete group["exclude-filter"];
    delete group.url;
    delete group.interval;
    delete group.tolerance;
    if (Object.hasOwn(group, "default-selected") && !group.proxies.includes(group["default-selected"])) {
      delete group["default-selected"];
    }
    return group;
  });
  const firstServiceIndex = existingGroups.findIndex((group) => sourceNames.has(group.name));
  const retained = existingGroups.filter((group) => !sourceNames.has(group.name));
  const insertionIndex = firstServiceIndex < 0
    ? retained.length
    : existingGroups.slice(0, firstServiceIndex).filter((group) => !sourceNames.has(group.name)).length;
  profile["proxy-groups"] = [
    ...retained.slice(0, insertionIndex),
    ...layoutGroups,
    ...retained.slice(insertionIndex),
  ];

  return { groupForService, groupMembers, targetByRef, unassignedRefs };
}

function applyRegionOptions(profile, resolved, data) {
  const active = new Set(resolved.activeRegionIds);
  const groupToRegion = { ...(data.regionGroups ?? {}), ...(data.stableRegionGroups ?? {}) };
  const removed = new Set(
    Object.entries(groupToRegion)
      .filter(([, region]) => !active.has(region))
      .map(([group]) => group),
  );
  if (!resolved.includeOtherRegion && data.otherRegionGroup) removed.add(data.otherRegionGroup);

  const orderedGroups = (profile["proxy-groups"] ?? []).filter(
    (group) => group && typeof group.name === "string" && !removed.has(group.name),
  );
  const regionsById = new Map((data.regions ?? []).map((region) => [region.id, region]));
  const disabledIds = new Set(resolved.disabledRegionIds);
  for (const regionId of data.routableRegionOrder ?? []) {
    if (!active.has(regionId)) disabledIds.add(regionId);
  }
  const blockedTerms = [...disabledIds]
    .sort()
    .map((regionId) => regionsById.get(regionId)?.terms)
    .filter(Boolean);
  const allowedTerms = resolved.activeRegionIds
    .map((regionId) => regionsById.get(regionId)?.terms)
    .filter(Boolean);
  for (const group of orderedGroups) {
    if (Array.isArray(group.proxies)) {
      group.proxies = reorderChoices(group.proxies, groupToRegion, resolved.activeRegionIds, removed);
    }
    if (Array.isArray(group.use) && group.use.length) {
      group.filter = resolved.includeOtherRegion
        ? negativeFilter(group.filter, blockedTerms)
        : positiveFilter(group.filter, allowedTerms);
    }
    if (group.name === data.otherRegionGroup && typeof group["exclude-filter"] === "string") {
      group["exclude-filter"] = unionFilter(group["exclude-filter"], blockedTerms);
    }
  }
  profile["proxy-groups"] = orderedGroups;
}

function applyServiceOptions(profile, resolved, data) {
  const services = serviceGroups(data).filter(
    (service) => !Array.isArray(service.outputFormats) || service.outputFormats.includes("yaml"),
  );
  const customLayout = applyYamlServiceGroupLayout(profile, resolved, data, services);
  const groupMembers = customLayout?.groupMembers ?? new Map();
  if (!customLayout) {
    for (const service of services) {
      const members = groupMembers.get(service.group) ?? new Set();
      members.add(service.id);
      groupMembers.set(service.group, members);
    }
  }
  const serviceGroupNames = new Set(groupMembers.keys());
  const disabled = new Set(resolved.disabledServiceIds);
  const reject = groupName(data, "reject") ?? "REJECT";
  const disabledGroupNames = new Set(
    [...groupMembers.entries()]
      .filter(([, members]) => members.size > 0 && [...members].every((id) => disabled.has(id)))
      .map(([group]) => group),
  );
  const disabledRuleRefs = new Set(
    services
      .filter((service) => disabled.has(service.id))
      .flatMap((service) => service.ruleRefs ?? [])
      .filter((ref) => ref.yamlKind && ref.yamlValue)
      .map((ref) => `${ref.yamlKind.toUpperCase()}:${ref.yamlValue}`),
  );
  for (const reference of customLayout?.unassignedRefs ?? []) disabledRuleRefs.add(reference);
  const serviceRuleRefs = new Set(services.flatMap((service) => service.ruleRefs ?? [])
    .filter((ref) => ref.yamlKind && ref.yamlValue)
    .map((ref) => `${ref.yamlKind.toUpperCase()}:${ref.yamlValue}`));
  const rules = profile.rules;
  const denyRules = [];
  if (Array.isArray(rules)) {
    for (const rule of rules) {
      if (disabledRuleRefs.has(yamlRuleRef(rule))) denyRules.push(ruleWithTarget(rule, reject));
    }
    const rewritten = rules.map((rule) => {
      const reference = yamlRuleRef(rule);
      if (customLayout?.targetByRef.has(reference)) {
        const target = disabledRuleRefs.has(reference) ? reject : customLayout.targetByRef.get(reference);
        return ruleWithTarget(rule, target);
      }
      return disabledRuleRefs.has(reference) ? ruleWithTarget(rule, reject) : rule;
    });
    const firstServiceRule = rules.findIndex((rule) => (
      serviceRuleRefs.has(yamlRuleRef(rule)) || serviceGroupNames.has(ruleTarget(rule))
    ));
    if (denyRules.length && firstServiceRule >= 0) rewritten.splice(firstServiceRule, 0, ...new Set(denyRules));
    profile.rules = rewritten;
  }

  const groups = profile["proxy-groups"] ?? [];
  for (const group of groups) {
    if (disabledGroupNames.has(group.name)) {
      group.proxies = [reject];
      delete group.use;
    }
  }

  const preferredGroupNames = [];
  const byServiceId = new Map(services.map((service) => [
    service.id,
    customLayout ? customLayout.groupForService.get(service.id) : service.group,
  ]));
  for (const serviceId of resolved.preferredServiceIds) {
    const name = byServiceId.get(serviceId);
    if (name && !preferredGroupNames.includes(name)) preferredGroupNames.push(name);
  }
  if (preferredGroupNames.length && !customLayout) {
    const slots = [];
    const serviceEntries = [];
    for (let index = 0; index < groups.length; index += 1) {
      if (serviceGroupNames.has(groups[index]?.name)) {
        slots.push(index);
        serviceEntries.push(groups[index]);
      }
    }
    const remaining = serviceEntries
      .filter((group) => !preferredGroupNames.includes(group.name))
      .map((group) => group.name);
    const desiredNames = [...preferredGroupNames, ...remaining];
    const byName = new Map(serviceEntries.map((group) => [group.name, group]));
    const ordered = desiredNames.map((name) => byName.get(name)).filter(Boolean);
    slots.forEach((slot, index) => { groups[slot] = ordered[index]; });
  }
}

function applyTrafficGuards(profile, resolved, data) {
  const reject = groupName(data, "reject") ?? "REJECT";
  const direct = groupName(data, "direct") ?? "DIRECT";
  const fallback = groupName(data, "fallback");
  const automatic = groupName(data, "auto");
  const groups = profile["proxy-groups"] ?? [];

  if (resolved.allowDirect === false) {
    for (const group of groups) {
      if (group.name === direct) {
        group.proxies = [reject];
        continue;
      }
      if (!Array.isArray(group.proxies)) continue;
      const filtered = group.proxies.filter((choice) => choice !== "DIRECT" && choice !== direct);
      group.proxies = filtered.length ? filtered : [reject];
      if (group["default-selected"] === "DIRECT" || group["default-selected"] === direct) {
        delete group["default-selected"];
      }
    }
    if (Array.isArray(profile.rules)) {
      profile.rules = profile.rules.map((rule) => (
        ruleTarget(rule) === "DIRECT" || ruleTarget(rule) === direct
          ? ruleWithTarget(rule, reject)
          : rule
      ));
    }
    const dns = profile.dns;
    if (dns) {
      const routesDirectly = (resolver) => typeof resolver === "string"
        && ["DIRECT", direct].includes(resolver.split("#")[1]);
      const proxyResolvers = dns.nameserver?.filter((resolver) => !routesDirectly(resolver));
      if (!proxyResolvers?.length) {
        throw new ProfileSpecError("Proxy DNS resolvers are missing from the profile", "invalid_profile_data");
      }
      const routedResolvers = (resolvers) => resolvers.flatMap((resolver) => (
        routesDirectly(resolver) ? proxyResolvers : [resolver]
      ));
      for (const key of ["default-nameserver", "nameserver", "fallback"]) {
        if (Array.isArray(dns[key])) dns[key] = [...new Set(routedResolvers(dns[key]))];
      }
      dns["direct-nameserver"] = [...proxyResolvers];
      for (const [selector, resolvers] of Object.entries(dns["nameserver-policy"] ?? {})) {
        const values = Array.isArray(resolvers) ? resolvers : [resolvers];
        dns["nameserver-policy"][selector] = [...new Set(routedResolvers(values))];
      }
      // Proxy-host lookups retain their independent encrypted bootstrap to avoid a DNS cycle.
    }
  }

  if (resolved.failClosed === true) {
    for (const group of groups) {
      if (group.type !== "select" || group.name === reject || group.name === direct) continue;
      const first = group.proxies?.[0] === "REJECT" ? "REJECT" : reject;
      group.proxies = [first, ...(group.proxies ?? []).filter((choice) => choice !== reject && choice !== "REJECT")];
      if (Object.hasOwn(group, "default-selected")) group["default-selected"] = first;
    }
  }

  if (resolved.failClosed !== undefined && fallback) {
    const selectedFallback = resolved.failClosed ? reject : (automatic ?? reject);
    for (const group of groups) {
      if (group.name === fallback) group.proxies = [selectedFallback];
    }
  }
}

function applyAccountProtection(profile, resolved, data) {
  const protection = data.accountProtection;
  if (!protection) return;
  const protectedGroup = profile["proxy-groups"]?.find((group) => group.name === protection.protectedGroup);
  if (!protectedGroup) {
    throw new ProfileSpecError("Protected account group is missing from the profile", "invalid_profile_data");
  }
  const reject = protection.rejectGroup;
  const disabled = resolved.disabledServiceIds.includes(protection.serviceId);
  const rejecting = new Set(["REJECT", reject, groupName(data, "reject")]);
  protectedGroup.proxies = [reject, ...(disabled ? [] : (protectedGroup.proxies ?? []).filter((choice) => !rejecting.has(choice)))];
  if (disabled) delete protectedGroup.use;
  if (Object.hasOwn(protectedGroup, "default-selected")) protectedGroup["default-selected"] = reject;
}

const RULE_PROVIDER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

function customRuleTarget(target, data, baseProfile, profile) {
  const key = target === "reject" ? "reject" : target === "direct" ? "direct" : "manual";
  const groups = profile["proxy-groups"];
  const names = new Set(groups.map((group) => group?.name).filter((name) => typeof name === "string"));
  const canonical = data.groups?.[key];
  if (typeof canonical === "string" && names.has(canonical)) return canonical;
  if (target === "proxy") {
    const templateGroup = profileTemplate(data, "yaml", baseProfile)?.dnsEgressGroup;
    if (typeof templateGroup === "string" && names.has(templateGroup)) return templateGroup;
  }
  if (target === "direct" || target === "reject") {
    const builtin = target === "direct" ? "DIRECT" : "REJECT";
    const candidates = groups.filter((group) => (
      group?.type === "select" && Array.isArray(group.proxies)
      && group.proxies.length === 1 && group.proxies[0] === builtin
    ));
    const uniqueNames = [...new Set(candidates.map((group) => group.name).filter((name) => typeof name === "string"))];
    if (uniqueNames.length === 1) return uniqueNames[0];
  }
  throw new ProfileSpecError(`Custom rule target metadata is unavailable: ${target}`, "invalid_profile_data");
}

function providerNameAndPath(preferredName, providers, paths) {
  if (typeof preferredName !== "string" || !RULE_PROVIDER_NAME_RE.test(preferredName)) {
    throw new ProfileSpecError("Rule provider name metadata is invalid", "invalid_profile_data");
  }
  let name = preferredName;
  let suffix = 2;
  let path = `./ruleset/${name}.yaml`;
  while (Object.hasOwn(providers, name) || paths.has(path)) {
    name = `${preferredName}_${suffix}`;
    path = `./ruleset/${name}.yaml`;
    suffix += 1;
  }
  paths.add(path);
  return { name, path };
}

function yamlRuleKind(rule) {
  return rule.split(",", 1)[0].trim().toUpperCase();
}

function yamlRuleTarget(rule) {
  const fields = rule.split(",");
  return yamlRuleKind(rule) === "MATCH" ? fields[1]?.trim() : fields[2]?.trim();
}

function applyCustomRuleProviders(profile, resolved, data) {
  const entries = [];
  if (resolved.adblock) {
    const provider = data.adblockRuleProvider;
    if (!provider || typeof provider.name !== "string" || typeof provider.url !== "string" || !provider.url || provider.behavior !== "domain") {
      throw new ProfileSpecError("Canonical adblock provider metadata is unavailable", "invalid_profile_data");
    }
    entries.push({ preferredName: provider.name, url: provider.url, behavior: provider.behavior, target: "reject" });
  }
  for (const [index, provider] of resolved.customRuleProviders.entries()) {
    entries.push({ preferredName: `Profile_Custom_Rule_${index + 1}`, ...provider });
  }
  if (!entries.length) return;
  const interval = data.ruleProviderIntervals?.yaml;
  if (!Number.isInteger(interval) || interval < 1) {
    throw new ProfileSpecError("Canonical YAML rule provider interval is unavailable", "invalid_profile_data");
  }
  const providers = profile["rule-providers"];
  const rules = profile.rules;
  if (!providers || typeof providers !== "object" || Array.isArray(providers) || !Array.isArray(rules) || !Array.isArray(profile["proxy-groups"])) {
    throw new ProfileSpecError("YAML profile has no rule-provider insertion point", "invalid_profile_data");
  }
  const matches = rules.flatMap((rule, index) => typeof rule === "string" && yamlRuleKind(rule) === "MATCH" ? [index] : []);
  if (matches.length !== 1 || matches[0] !== rules.length - 1) {
    throw new ProfileSpecError("YAML profile must contain one terminal MATCH rule", "invalid_profile_data");
  }
  const paths = new Set(Object.values(providers).filter((provider) => provider && typeof provider === "object" && typeof provider.path === "string").map((provider) => provider.path));
  const addedRules = [];
  for (const entry of entries) {
    const { name, path } = providerNameAndPath(entry.preferredName, providers, paths);
    providers[name] = { type: "http", behavior: entry.behavior, format: "yaml", interval, url: entry.url, path };
    addedRules.push(`RULE-SET,${name},${customRuleTarget(entry.target, data, resolved.spec.baseProfile, profile)}`);
  }
  const matchIndex = matches[0];
  const targets = protectedRuleTargets(data);
  let lastProtectedRule = -1;
  for (let index = 0; index < matchIndex; index += 1) if (targets.has(yamlRuleTarget(rules[index]))) lastProtectedRule = index;
  let insertionIndex = matchIndex;
  for (let index = lastProtectedRule + 1; index < matchIndex; index += 1) {
    const fields = rules[index].split(",");
    if (yamlRuleKind(rules[index]) === "GEOIP" && fields[1]?.trim().toLowerCase() !== "private") {
      insertionIndex = index;
      break;
    }
  }
  if (rules.slice(insertionIndex, matchIndex).some((rule) => targets.has(yamlRuleTarget(rule)))) {
    throw new ProfileSpecError("Protected account rules occur after the custom-rule insertion point", "invalid_profile_data");
  }
  rules.splice(insertionIndex, 0, ...addedRules);
}

export function resolveOutputProfile({ outputFormat, spec = {}, data = runtimeData } = {}) {
  const normalized = normalizeProfileSpec(spec, data, outputFormat);
  const template = profileTemplate(data, outputFormat, normalized.baseProfile);
  const profile = data.outputProfiles?.[outputFormat]?.[normalized.baseProfile];
  if (!template || !profile || typeof profile !== "object") {
    throw new ProfileSpecError(
      `Profile template is unavailable: ${outputFormat}/${normalized.baseProfile}`,
      "profile_template_unavailable",
    );
  }
  const resolved = resolveProfileSpec(normalized, data, outputFormat);
  const output = clone(profile);

  if (template.supportsProfileOptions) {
    applyRegionOptions(output, resolved, data);
    applyServiceOptions(output, resolved, data);
    applyTrafficGuards(output, resolved, data);
    applyAccountProtection(output, resolved, data);
  }
  applyCustomRuleProviders(output, resolved, data);
  return output;
}

export function profileCommentHeader(language, data = runtimeData) {
  const localized = data.render.localized?.[language];
  if (language !== undefined && !localized) {
    throw new ProfileSpecError(`Unsupported profile language: ${language}`, "invalid_language");
  }
  return localized ? localized.header.map((line) => line.replace(/^;\s?/, "# ")).join("\n") : "";
}

function yamlCommentLines(value) {
  return Array.isArray(value) && value.length > 0 && value.every((line) => (
    typeof line === "string" && line.startsWith("#")
    && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(line)
  ));
}

export function profileCommentText(language, spec = {}, data = runtimeData) {
  if (language === undefined) return "";
  const localized = data.render.localized?.[language];
  if (!localized) throw new ProfileSpecError(`Unsupported profile language: ${language}`, "invalid_language");
  const copy = localized.yaml;
  if (!copy || !yamlCommentLines(copy.header)) throw new ProfileSpecError("Canonical YAML comment metadata is unavailable", "invalid_profile_data");
  const comments = [...copy.header];
  const policyKey = spec?.baseProfile === "ai-strict" ? "strict" : spec?.baseProfile === "ai-balanced" || !spec?.baseProfile ? "balanced" : null;
  if (policyKey) {
    const lines = copy.policyNotes?.[policyKey];
    const title = copy.titles?.[policyKey];
    if (!yamlCommentLines(lines) || typeof title !== "string" || !title || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(title)) throw new ProfileSpecError("Canonical YAML policy comments are incomplete", "invalid_profile_data");
    comments.push(`# ${title}`, ...lines);
  }
  if (spec?.adblock === true) {
    const line = copy.optionalProviderNotes?.adblock;
    if (!yamlCommentLines([line])) throw new ProfileSpecError("Canonical adblock comment is unavailable", "invalid_profile_data");
    comments.push(line);
  }
  if (Array.isArray(spec?.customRuleProviders) && spec.customRuleProviders.length > 0) {
    const line = copy.optionalProviderNotes?.customRuleProviders;
    if (!yamlCommentLines([line])) throw new ProfileSpecError("Canonical custom rule comment is unavailable", "invalid_profile_data");
    comments.push(line);
  }
  return comments.join("\n");
}
