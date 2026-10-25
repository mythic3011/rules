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

// Catalog objects are treated as immutable after the first lookup.
const regionAliasMaps = new WeakMap();

function regionAliases(data) {
  let aliases = regionAliasMaps.get(data);
  if (!aliases) {
    aliases = buildRegionAliasMap(data);
    regionAliasMaps.set(data, aliases);
  }
  return aliases;
}

export function canonicalizeRegion(value, data = runtimeData) {
  const key = normalizeAlias(value);
  if (!key) throw new ProfileSpecError("Region value cannot be empty", "empty_region");
  const region = regionAliases(data).get(key);
  if (!region) throw new ProfileSpecError(`Unknown region: ${value}`, "unknown_region");
  return region;
}

function canonicalizeMany(values, data, field = "Region") {
  if (!Array.isArray(values)) {
    throw new ProfileSpecError(`${field} fields must be arrays`, "invalid_option_list");
  }
  return dedupe(values.map((value) => canonicalizeRegion(value, data)));
}

function canonicalizeServices(values, data, field, outputFormat) {
  if (!Array.isArray(values)) {
    throw new ProfileSpecError(`${field} must be an array`, "invalid_option_list");
  }
  const services = data.services ?? [];
  const known = new Set(services
    .filter((service) => Array.isArray(service.outputFormats) && service.outputFormats.includes(outputFormat))
    .map((service) => service.id));
  return dedupe(values.map((value) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new ProfileSpecError("Service IDs must be non-empty strings", "invalid_service");
    }
    const serviceId = value.trim();
    if (!known.has(serviceId)) {
      throw new ProfileSpecError(`Unknown service: ${value}`, "unknown_service");
    }
    return serviceId;
  }));
}

const SERVICE_GROUP_NAME_UNSAFE_RE = /[,`\[\]\\\p{Cc}\u2028\u2029]/u;
const SERVICE_GROUP_ROUTE_RE = /^[a-z][a-z0-9-]*$/;

function isWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function serviceGroupLimits(data) {
  const limits = data.serviceGroupLimits;
  if (
    !limits || !Number.isInteger(limits.maxGroups) || limits.maxGroups < 1
    || !Number.isInteger(limits.maxNameLength) || limits.maxNameLength < 1
    || !Number.isInteger(limits.maxIdLength) || limits.maxIdLength < 1
    || !Number.isInteger(limits.maxRoutesPerGroup) || limits.maxRoutesPerGroup < 1
  ) {
    throw new ProfileSpecError("Service group limits are unavailable", "invalid_profile_data");
  }
  return limits;
}

function metadataServiceGroups(data, outputFormat, baseProfile) {
  if (!Array.isArray(data.serviceGroups)) return [];
  return data.serviceGroups.filter((group) => (
    group?.outputFormat === outputFormat && group?.baseProfile === baseProfile
  ));
}

function serviceGroupCatalog(data, outputFormat, baseProfile, profile) {
  if (!Array.isArray(data.serviceGroups)) {
    throw new ProfileSpecError("Service group metadata is unavailable", "invalid_profile_data");
  }
  const catalog = metadataServiceGroups(data, outputFormat, baseProfile);
  if (!catalog.length) {
    throw new ProfileSpecError("Service group metadata is unavailable for this output format", "invalid_profile_data");
  }
  if (
    !Array.isArray(data.reservedGroupNames)
    || data.reservedGroupNames.some((name) => typeof name !== "string")
    || !data.serviceGroupRouteLabels
    || typeof data.serviceGroupRouteLabels !== "object"
    || Array.isArray(data.serviceGroupRouteLabels)
    || Object.values(data.serviceGroupRouteLabels).some((name) => typeof name !== "string" || !name)
  ) {
    throw new ProfileSpecError("Service group registry metadata is invalid", "invalid_profile_data");
  }

  const services = (data.services ?? []).filter((service) => (
    Array.isArray(service.outputFormats) && service.outputFormats.includes(outputFormat)
  ));
  const knownServices = new Set(services.map((service) => service.id));
  const knownRegions = new Set((data.regions ?? []).map((region) => region.id));
  const specialRoutes = new Set(Object.keys(data.serviceGroupRouteLabels ?? {}));
  const serviceSource = new Map();
  const protectedEntries = [];
  const sourceNames = new Set();
  const definedGroupNames = outputFormat === "ini"
    ? new Set((data.plan?.sections ?? []).flatMap((section) => (
      section.type === "groups"
        ? section.groups.map((group) => group.name)
        : section.type === "selectors" ? section.selectors.map((selector) => selector.group.name) : []
    )))
    : new Set((profile?.["proxy-groups"] ?? []).map((group) => group.name));
  for (const entry of catalog) {
    if (
      typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(entry.id)
      || typeof entry.name !== "string" || !entry.name.trim()
      || !Array.isArray(entry.serviceIds) || !entry.serviceIds.length
      || !Array.isArray(entry.defaultRoutes) || !Array.isArray(entry.allowedRoutes)
      || typeof entry.protected !== "boolean"
    ) {
      throw new ProfileSpecError("Service group metadata is invalid", "invalid_profile_data");
    }
    if (sourceNames.has(entry.name)) {
      throw new ProfileSpecError("Service group metadata contains duplicate names", "invalid_profile_data");
    }
    sourceNames.add(entry.name);
    if (entry.protected) protectedEntries.push(entry);
    const memberIds = new Set();
    for (const serviceId of entry.serviceIds) {
      if (typeof serviceId !== "string" || !knownServices.has(serviceId) || memberIds.has(serviceId) || serviceSource.has(serviceId)) {
        throw new ProfileSpecError("Service group metadata has invalid service membership", "invalid_profile_data");
      }
      memberIds.add(serviceId);
      serviceSource.set(serviceId, entry);
    }
    const allowed = new Set(entry.allowedRoutes);
    if (
      allowed.size !== entry.allowedRoutes.length
      || !allowed.has("reject")
      || entry.allowedRoutes.some((route) => typeof route !== "string" || (!specialRoutes.has(route) && !knownRegions.has(route)))
      || entry.defaultRoutes.some((route) => !allowed.has(route))
      || entry.allowedRoutes.some((route) => typeof serviceRouteGroupName(route, data) !== "string")
      || (allowed.has("default") && (
        typeof entry.defaultRouteGroup !== "string" || !entry.defaultRouteGroup
        || !definedGroupNames.has(entry.defaultRouteGroup)
      ))
    ) {
      throw new ProfileSpecError("Service group metadata has invalid route choices", "invalid_profile_data");
    }
  }
  if (protectedEntries.length !== 1 || serviceSource.size !== knownServices.size) {
    throw new ProfileSpecError("Service group metadata does not cover the output format", "invalid_profile_data");
  }
  const protection = data.accountProtection;
  const protectedEntry = protectedEntries[0];
  if (
    protectedEntry.id !== protection?.serviceId
    || protectedEntry.name !== protection?.protectedGroup
    || protectedEntry.serviceIds.length !== 1
    || protectedEntry.serviceIds[0] !== protection?.serviceId
  ) {
    throw new ProfileSpecError("Protected service group metadata does not match account protection", "invalid_profile_data");
  }
  return { catalog, services, serviceSource, protectedEntry, sourceNames };
}

export function serviceRouteGroupName(route, data = runtimeData) {
  const registeredLabel = data.serviceGroupRouteLabels?.[route];
  if (typeof registeredLabel === "string" && registeredLabel) return registeredLabel;
  return data.regions?.find((region) => region.id === route)?.group;
}

function reservedServiceGroupNames(data, profile, sourceNames) {
  const reserved = new Set([...(data.reservedGroupNames ?? [])].filter((name) => !sourceNames.has(name)));
  const add = (name) => {
    if (typeof name === "string" && name && !sourceNames.has(name)) reserved.add(name);
  };
  const serviceIds = new Set((data.services ?? []).map((service) => service.id));
  for (const [key, name] of Object.entries(data.groups ?? {})) {
    if (!serviceIds.has(key)) add(name);
  }
  for (const region of data.regions ?? []) add(region.group);
  for (const group of profile?.["proxy-groups"] ?? []) add(group.name);
  return reserved;
}

function normalizeServiceGroups(input, data, outputFormat, baseProfile, profile) {
  const { catalog, services, serviceSource, protectedEntry, sourceNames } = serviceGroupCatalog(data, outputFormat, baseProfile, profile);
  const limits = serviceGroupLimits(data);
  const reservedNames = reservedServiceGroupNames(data, profile, sourceNames);
  const protectedServiceId = data.accountProtection.serviceId;
  const serviceGroupIds = new Set();
  const groupNames = new Set();
  const assignedServices = new Set();
  const knownRegions = new Set((data.regions ?? []).map((region) => region.id));
  const globalDisabledRegions = new Set(input.disabledNodeRegions ?? []);
  const globalOnlyRegions = new Set(input.onlyNodeRegions ?? []);
  const routeUniverses = catalog.map((entry) => entry.allowedRoutes);
  const emptyGroupRoutes = [...new Set(routeUniverses.flat())];

  if (!Array.isArray(input.serviceGroups)) {
    throw new ProfileSpecError("serviceGroups must be an array", "invalid_service_groups");
  }
  if (input.serviceGroups.length > limits.maxGroups) {
    throw new ProfileSpecError(`serviceGroups exceeds the limit of ${limits.maxGroups}`, "too_many_service_groups");
  }
  const normalized = input.serviceGroups.map((raw, index) => {
    const at = `serviceGroups[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ProfileSpecError(`${at} must be an object`, "invalid_service_group");
    }
    for (const key of Object.keys(raw)) {
      if (!["id", "name", "serviceIds", "routes"].includes(key)) {
        throw new ProfileSpecError(`Unknown ${at} field: ${key}`, "unknown_service_group_field");
      }
    }
    const { id, name, serviceIds, routes } = raw;
    if (typeof id !== "string" || id !== id.trim() || id.length > limits.maxIdLength || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new ProfileSpecError(`${at}.id must be a lowercase slug`, "invalid_service_group_id");
    }
    if (serviceGroupIds.has(id)) {
      throw new ProfileSpecError(`Duplicate service group ID: ${id}`, "duplicate_service_group_id");
    }
    serviceGroupIds.add(id);
    if (
      typeof name !== "string" || !name.trim() || name !== name.trim() || name.length > limits.maxNameLength
      || !isWellFormedUnicode(name) || SERVICE_GROUP_NAME_UNSAFE_RE.test(name)
    ) {
      throw new ProfileSpecError(`${at}.name contains an unsafe or invalid group name`, "invalid_service_group_name");
    }
    if (reservedNames.has(name)) {
      throw new ProfileSpecError(`Service group name is reserved: ${name}`, "reserved_service_group_name");
    }
    if (groupNames.has(name)) {
      throw new ProfileSpecError(`Duplicate service group name: ${name}`, "duplicate_service_group_name");
    }
    groupNames.add(name);
    if (!Array.isArray(serviceIds)) {
      throw new ProfileSpecError(`${at}.serviceIds must be an array`, "invalid_service_group_members");
    }
    const members = new Set();
    for (const serviceId of serviceIds) {
      if (typeof serviceId !== "string" || !serviceSource.has(serviceId)) {
        throw new ProfileSpecError(`Unknown service group member: ${serviceId}`, "unknown_service");
      }
      if (members.has(serviceId) || assignedServices.has(serviceId)) {
        throw new ProfileSpecError(`Service is assigned more than once: ${serviceId}`, "duplicate_service_group_member");
      }
      members.add(serviceId);
      assignedServices.add(serviceId);
    }
    if (!Array.isArray(routes)) {
      throw new ProfileSpecError(`${at}.routes must be an array`, "invalid_service_group_routes");
    }
    if (routes.length > limits.maxRoutesPerGroup) {
      throw new ProfileSpecError(`${at}.routes exceeds the route limit`, "too_many_service_group_routes");
    }
    const routeSet = new Set();
    for (const route of routes) {
      if (typeof route !== "string" || !SERVICE_GROUP_ROUTE_RE.test(route)) {
        throw new ProfileSpecError(`${at}.routes contains an invalid route token`, "invalid_service_group_route");
      }
      if (routeSet.has(route)) {
        throw new ProfileSpecError(`Duplicate route in ${at}: ${route}`, "duplicate_service_group_route");
      }
      routeSet.add(route);
    }

    const protectedMembers = [...members].filter((serviceId) => serviceId === protectedServiceId);
    const protectedGroup = protectedMembers.length > 0;
    if (protectedGroup) {
      if (
        id !== protectedEntry.id || name !== protectedEntry.name
        || serviceIds.length !== 1 || serviceIds[0] !== protectedServiceId
      ) {
        throw new ProfileSpecError("The protected account service group cannot be renamed, moved, or merged", "protected_service_group");
      }
    } else if (id === protectedEntry.id || name === protectedEntry.name) {
      throw new ProfileSpecError("The protected account service group is reserved", "protected_service_group");
    }

    let allowedRoutes = emptyGroupRoutes;
    if (members.size) {
      const entries = [...members].map((serviceId) => serviceSource.get(serviceId));
      allowedRoutes = entries[0].allowedRoutes.filter((route) => entries.every((entry) => entry.allowedRoutes.includes(route)));
    }
    if (routes.some((route) => !allowedRoutes.includes(route))) {
      const invalid = routes.find((route) => !allowedRoutes.includes(route));
      throw new ProfileSpecError(`Route is not allowed for ${name}: ${invalid}`, "unsupported_service_group_route");
    }
    if (routes.includes("default") && members.size) {
      const defaultTargets = new Set([...members].map((serviceId) => serviceSource.get(serviceId).defaultRouteGroup));
      const [defaultTarget] = defaultTargets;
      if (defaultTargets.size !== 1 || typeof defaultTarget !== "string" || !defaultTarget) {
        throw new ProfileSpecError(
          `Services in ${name} do not share the same default route group`,
          "incompatible_service_group_route",
        );
      }
    }
    for (const route of routes) {
      if (route === "direct" && input.allowDirect === false) {
        throw new ProfileSpecError(`Direct routing is disabled: ${name}`, "conflicting_service_group_route");
      }
      if (route === "other" && globalOnlyRegions.size) {
        throw new ProfileSpecError(`Other-region routing conflicts with onlyNodeRegions: ${name}`, "conflicting_service_group_route");
      }
      if (knownRegions.has(route)) {
        if (globalDisabledRegions.has(route)) {
          throw new ProfileSpecError(`Service route uses a globally disabled region: ${route}`, "conflicting_service_group_route");
        }
        if (globalOnlyRegions.size && !globalOnlyRegions.has(route)) {
          throw new ProfileSpecError(`Service route is outside onlyNodeRegions: ${route}`, "conflicting_service_group_route");
        }
      }
    }
    return { id, name, serviceIds: [...serviceIds], routes: [...routes] };
  });

  if (!normalized.some((group) => group.id === protectedEntry.id)) {
    throw new ProfileSpecError("The protected account service group cannot be deleted", "protected_service_group");
  }
  const groupForService = new Map();
  for (const group of normalized) {
    for (const serviceId of group.serviceIds) groupForService.set(serviceId, group.id);
  }
  const refOwners = new Map();
  for (const service of services) {
    for (const ref of service.ruleRefs ?? []) {
      const kind = outputFormat === "ini" ? ref.iniKind : ref.yamlKind;
      const value = outputFormat === "ini" ? ref.iniValue : ref.yamlValue;
      if (typeof kind !== "string" || typeof value !== "string" || !value) continue;
      const key = JSON.stringify([kind, value]);
      const owners = refOwners.get(key) ?? new Set();
      owners.add(service.id);
      refOwners.set(key, owners);
    }
  }
  for (const owners of refOwners.values()) {
    const assignments = new Set([...owners].map((serviceId) => groupForService.get(serviceId) ?? null));
    if (assignments.size > 1) {
      throw new ProfileSpecError(
        "Services sharing an exact routing rule must remain in one service group or all be unassigned",
        "incompatible_service_rule_owners",
      );
    }
  }
  return normalized;
}

function iniRuleReference(rule) {
  const value = rule?.iniValue;
  if (typeof rule?.iniKind !== "string" || typeof value !== "string" || !value) return null;
  return JSON.stringify([rule.iniKind, value]);
}

function serviceIniRuleOwners(data) {
  const owners = new Map();
  for (const service of data.services ?? []) {
    if (!Array.isArray(service.outputFormats) || !service.outputFormats.includes("ini")) continue;
    for (const ruleRef of service.ruleRefs ?? []) {
      const reference = iniRuleReference(ruleRef);
      if (!reference) continue;
      const serviceOwners = owners.get(reference) ?? new Set();
      serviceOwners.add(service.id);
      owners.set(reference, serviceOwners);
    }
  }
  return owners;
}

function validateServiceRuleOwnership(disabledServices, data) {
  const disabled = new Set(disabledServices);
  for (const owners of serviceIniRuleOwners(data).values()) {
    const disabledOwners = [...owners].filter((serviceId) => disabled.has(serviceId));
    const enabledOwners = [...owners].filter((serviceId) => !disabled.has(serviceId));
    if (disabledOwners.length && enabledOwners.length) {
      const serviceId = disabledOwners.sort()[0];
      throw new ProfileSpecError(
        `Cannot disable service ${serviceId}: its routing rule is shared with enabled services`,
        "shared_service_rule",
      );
    }
  }
}

function templateFor(data, outputFormat, baseProfile) {
  const template = data.templates?.find(
    (item) => item.outputFormat === outputFormat && item.id === baseProfile,
  );
  if (template) return template;
  if (outputFormat === "ini" && !data.templates && data.baseProfiles?.some((item) => item.id === baseProfile)) {
    return { id: baseProfile, outputFormat: "ini", supportsProfileOptions: true };
  }
  return null;
}

export function normalizeProfileSpec(input, data = runtimeData, outputFormat = "ini") {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ProfileSpecError("Profile spec must be an object");
  }

  const allowed = new Set([
    "schemaVersion",
    "baseProfile",
    "disabledNodeRegions",
    "onlyNodeRegions",
    "preferredNodeRegions",
    "disabledServices",
    "preferredServices",
    "allowDirect",
    "failClosed",
    "language",
    "serviceGroups",
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
  if (!new Set(["ini", "yaml"]).has(outputFormat)) {
    throw new ProfileSpecError(`Unsupported output format: ${outputFormat}`, "unknown_output_format");
  }
  const template = templateFor(data, outputFormat, baseProfile);
  if (!template) {
    throw new ProfileSpecError(`Unsupported base profile: ${baseProfile}`, "unknown_base_profile");
  }

  const spec = {
    schemaVersion: 1,
    baseProfile,
    disabledNodeRegions: canonicalizeMany(input.disabledNodeRegions ?? [], data),
    onlyNodeRegions: canonicalizeMany(input.onlyNodeRegions ?? [], data),
    preferredNodeRegions: canonicalizeMany(input.preferredNodeRegions ?? [], data),
  };
  const disabledServices = canonicalizeServices(input.disabledServices ?? [], data, "disabledServices", outputFormat);
  const preferredServices = canonicalizeServices(input.preferredServices ?? [], data, "preferredServices", outputFormat);
  const conflictingServices = disabledServices.filter((service) => preferredServices.includes(service));
  if (conflictingServices.length) {
    throw new ProfileSpecError(
      `A disabled service cannot also be preferred: ${conflictingServices.join(", ")}`,
      "conflicting_service_options",
    );
  }
  if (outputFormat === "ini") validateServiceRuleOwnership(disabledServices, data);
  if (input.allowDirect !== undefined && typeof input.allowDirect !== "boolean") {
    throw new ProfileSpecError("allowDirect must be a boolean", "invalid_boolean_option");
  }
  if (input.failClosed !== undefined && typeof input.failClosed !== "boolean") {
    throw new ProfileSpecError("failClosed must be a boolean", "invalid_boolean_option");
  }
  if (input.language !== undefined && !Object.hasOwn(data.render?.localized ?? {}, input.language)) {
    throw new ProfileSpecError("language must be en, zh-Hant, or zh-Hans", "invalid_language");
  }

  const hasServiceGroups = Object.hasOwn(input, "serviceGroups");
  const hasUnsupportedOptions = spec.disabledNodeRegions.length
    || spec.onlyNodeRegions.length
    || spec.preferredNodeRegions.length
    || disabledServices.length
    || preferredServices.length
    || input.allowDirect !== undefined
    || input.failClosed !== undefined
    || hasServiceGroups;
  if (!template.supportsProfileOptions && hasUnsupportedOptions) {
    throw new ProfileSpecError(
      `Profile options are not supported by the ${baseProfile} ${outputFormat.toUpperCase()} template`,
      "unsupported_profile_options",
    );
  }
  const serviceGroups = hasServiceGroups
    ? normalizeServiceGroups(
      {
        ...input,
        disabledNodeRegions: spec.disabledNodeRegions,
        onlyNodeRegions: spec.onlyNodeRegions,
      },
      data,
      outputFormat,
      baseProfile,
      data.outputProfiles?.[outputFormat]?.[baseProfile],
    )
    : undefined;
  if (Object.hasOwn(input, "disabledServices")) spec.disabledServices = disabledServices;
  if (Object.hasOwn(input, "preferredServices")) spec.preferredServices = preferredServices;
  if (Object.hasOwn(input, "allowDirect")) spec.allowDirect = input.allowDirect;
  if (Object.hasOwn(input, "failClosed")) spec.failClosed = input.failClosed;
  if (Object.hasOwn(input, "language")) spec.language = input.language;
  if (hasServiceGroups) spec.serviceGroups = serviceGroups;
  return spec;
}

export function resolveProfileSpec(input, data = runtimeData, outputFormat = "ini") {
  const spec = normalizeProfileSpec(input, data, outputFormat);
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

  const disabledServices = spec.disabledServices ?? [];
  const preferredServices = spec.preferredServices ?? [];
  const invalidPreferredServices = preferredServices.filter((service) => disabledServices.includes(service));
  if (invalidPreferredServices.length) {
    throw new ProfileSpecError(
      `Preferred services must remain enabled: ${invalidPreferredServices.join(", ")}`,
      "inactive_preferred_service",
    );
  }

  return {
    spec,
    disabledRegionIds: spec.disabledNodeRegions,
    activeRegionIds: orderedActive,
    preferredRegionIds: preferred,
    disabledServiceIds: disabledServices,
    preferredServiceIds: preferredServices,
    allowDirect: spec.allowDirect,
    failClosed: spec.failClosed,
    language: spec.language,
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

function serviceRuleReference(rule) {
  const value = rule.url ?? rule.value;
  if (typeof rule.kind !== "string" || typeof value !== "string" || !value) return null;
  return JSON.stringify([rule.kind, value]);
}

function serviceGroupCandidates(layout, data, failClosed, sourceByService, protectedGroup = false) {
  const reject = data.accountProtection?.rejectGroup ?? data.groups.reject;
  const routed = layout.routes.length
    ? layout.routes.map((route) => {
      if (route === "default" && layout.serviceIds.length) {
        return sourceByService.get(layout.serviceIds[0])?.defaultRouteGroup;
      }
      return serviceRouteGroupName(route, data);
    })
    : [reject];
  if (routed.some((name) => typeof name !== "string" || !name)) {
    throw new ProfileSpecError("Service group route metadata has no renderer target", "invalid_profile_data");
  }
  const unique = [...new Set(routed)];
  const ordered = protectedGroup || failClosed === true
    ? [reject, ...unique.filter((name) => name !== reject)]
    : unique;
  return ordered.map((value) => ({ kind: "group-ref", value }));
}

function addScopedIniRegionGroups(plan, regionIds, data, blockedTerms) {
  const knownGroupNames = new Set();
  for (const section of plan.sections) {
    if (section.type === "groups") for (const group of section.groups) knownGroupNames.add(group.name);
    if (section.type === "selectors") for (const selector of section.selectors) knownGroupNames.add(selector.group.name);
  }
  const regionalSection = plan.sections.find((section) => section.role === "automatic-region-groups" && section.type === "groups");
  const orderedRegionIds = [...new Set(regionIds)].sort((left, right) => (
    data.regions.findIndex((region) => region.id === left) - data.regions.findIndex((region) => region.id === right)
  ));
  const additions = [];
  for (const regionId of orderedRegionIds) {
    const region = data.regions.find((entry) => entry.id === regionId);
    if (!region || typeof region.group !== "string" || typeof region.filterPattern !== "string") {
      throw new ProfileSpecError(`Service-scoped region metadata is unavailable: ${regionId}`, "invalid_profile_data");
    }
    if (knownGroupNames.has(region.group)) continue;
    if (!regionalSection) {
      throw new ProfileSpecError("Regional group section is unavailable", "invalid_profile_data");
    }
    additions.push({
      name: region.group,
      kind: "select",
      candidates: [{ kind: "group-ref", value: data.groups.reject }],
      filterPattern: negativeFilter(region.filterPattern, blockedTerms),
    });
    knownGroupNames.add(region.group);
  }
  if (additions.length) {
    const otherIndex = regionalSection.groups.findIndex((group) => group.name === data.otherRegionGroup);
    regionalSection.groups.splice(otherIndex < 0 ? regionalSection.groups.length : otherIndex, 0, ...additions);
  }
}

function applyIniServiceGroups(plan, resolved, data, blockedTerms) {
  if (!Object.hasOwn(resolved.spec, "serviceGroups")) return null;
  const { services, protectedEntry, sourceNames, serviceSource } = serviceGroupCatalog(data, "ini", resolved.spec.baseProfile);
  const layouts = resolved.spec.serviceGroups;
  const groupForService = new Map();
  const layoutById = new Map(layouts.map((group) => [group.id, group]));
  const membersByName = new Map();
  for (const group of layouts) {
    membersByName.set(group.name, new Set(group.serviceIds));
    for (const serviceId of group.serviceIds) {
      groupForService.set(serviceId, group.name);
    }
  }
  const reject = data.accountProtection?.rejectGroup ?? data.groups.reject;
  const targetByRef = new Map();
  const unassignedRefs = new Set();
  for (const service of services) {
    const target = groupForService.get(service.id) ?? reject;
    for (const ref of service.ruleRefs ?? []) {
      if (typeof ref.iniKind !== "string" || typeof ref.iniValue !== "string" || !ref.iniValue) continue;
      const key = JSON.stringify([ref.iniKind, ref.iniValue]);
      const existing = targetByRef.get(key);
      if (existing !== undefined && existing !== target) {
        throw new ProfileSpecError("Services sharing an exact routing rule have incompatible groups", "incompatible_service_rule_owners");
      }
      targetByRef.set(key, target);
      if (!groupForService.has(service.id)) unassignedRefs.add(key);
    }
  }

  if (unassignedRefs.size) {
    const denies = new Map();
    for (const section of plan.sections) {
      if (section.type === "rules") {
        const retained = [];
        for (const rule of section.rules) {
          const reference = serviceRuleReference(rule);
          if (reference && unassignedRefs.has(reference)) denies.set(reference, { ...rule, target: reject });
          else retained.push(rule);
        }
        section.rules = retained;
      } else if (section.type === "clusters") {
        for (const cluster of section.clusters) {
          const retained = [];
          for (const rule of cluster.rules) {
            const reference = serviceRuleReference(rule);
            if (reference && unassignedRefs.has(reference)) denies.set(reference, { ...rule, target: reject });
            else retained.push(rule);
          }
          cluster.rules = retained;
        }
      }
    }
    if (denies.size) {
      const before = plan.sections.find((section) => section.type === "rules" && section.role === "legacy-before");
      if (!before) throw new ProfileSpecError("Service deny rules have no safe insertion point", "invalid_profile_data");
      before.rules.unshift(...denies.values());
    }
  }

  const neededRegions = layouts.flatMap((group) => group.routes.filter((route) => (
    data.regions.some((region) => region.id === route)
  )));
  addScopedIniRegionGroups(plan, [...new Set(neededRegions)], data, blockedTerms);

  for (const section of plan.sections) {
    if (section.type === "rules") {
      section.rules = section.rules.map((rule) => {
        const ref = serviceRuleReference(rule);
        if (!ref || !targetByRef.has(ref)) return rule;
        return { ...rule, target: targetByRef.get(ref) };
      });
    } else if (section.type === "clusters") {
      for (const cluster of section.clusters) {
        cluster.rules = cluster.rules.map((rule) => {
          const ref = serviceRuleReference(rule);
          if (!ref || !targetByRef.has(ref)) return rule;
          return { ...rule, target: targetByRef.get(ref) };
        });
      }
    } else if (section.type === "selectors" && section.role === "service-selectors") {
      section.selectors = layouts
        .filter((layout) => !layout.serviceIds.includes(protectedEntry.id))
        .map((layout) => ({
          comments: [],
          group: {
            type: "select-group",
            name: layout.name,
            candidates: serviceGroupCandidates(layout, data, resolved.failClosed, serviceSource),
          },
        }));
    } else if (section.type === "groups") {
      if (section.role !== "account-group") {
        section.groups = section.groups.filter((group) => !sourceNames.has(group.name));
      }
      for (const group of section.groups) {
        if (group.name === protectedEntry.name) {
          const protectedLayout = layoutById.get(protectedEntry.id);
          if (!protectedLayout) {
            throw new ProfileSpecError("The protected account service group cannot be deleted", "protected_service_group");
          }
          group.candidates = serviceGroupCandidates(protectedLayout, data, true, serviceSource, true);
        }
      }
    }
  }
  return {
    groupForService,
    membersByName,
    customNames: new Set(layouts.filter((group) => !group.serviceIds.includes(protectedEntry.id)).map((group) => group.name)),
    unassignedRefs,
    targetByRef,
    sourceNames,
    protectedGroupName: protectedEntry.name,
  };
}

export function solveSubconverterPlan(input, data = runtimeData) {
  const resolved = resolveProfileSpec(input, data);
  if (resolved.spec.baseProfile !== "ai-balanced") {
    throw new ProfileSpecError(
      `The INI policy solver only renders the ai-balanced profile: ${resolved.spec.baseProfile}`,
      "static_template_not_supported_by_solver",
    );
  }
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

  const customServiceLayout = applyIniServiceGroups(plan, resolved, data, blockedTerms);

  const orderingGroups = { ...data.regionGroups, ...data.stableRegionGroups };
  const iniServices = (data.services ?? []).filter(
    (service) => Array.isArray(service.outputFormats) && service.outputFormats.includes("ini"),
  );
  const serviceGroups = new Map(iniServices.map((service) => [
    service.id,
    customServiceLayout ? customServiceLayout.groupForService.get(service.id) : service.group,
  ]));
  const serviceGroupMembers = new Map();
  if (customServiceLayout) {
    for (const [groupName, members] of customServiceLayout.membersByName) {
      serviceGroupMembers.set(groupName, members);
    }
  } else {
    for (const service of iniServices) {
      if (typeof service.group !== "string" || !service.group) continue;
      const members = serviceGroupMembers.get(service.group) ?? new Set();
      members.add(service.id);
      serviceGroupMembers.set(service.group, members);
    }
  }
  const disabledServices = new Set(resolved.disabledServiceIds);
  const disabledServiceGroups = new Set(
    [...serviceGroupMembers]
      .filter(([, members]) => members.size > 0 && [...members].every((serviceId) => disabledServices.has(serviceId)))
      .map(([group]) => group),
  );
  const accountProtection = data.accountProtection ?? {};
  if (
    disabledServices.has(accountProtection.serviceId) &&
    typeof accountProtection.protectedGroup === "string" &&
    accountProtection.protectedGroup
  ) {
    disabledServiceGroups.add(accountProtection.protectedGroup);
  }
  const reject = accountProtection.rejectGroup ?? data.groups.reject;
  const disabledRuleRefs = new Set(
    [...serviceIniRuleOwners(data)]
      .filter(([, owners]) => [...owners].some((serviceId) => disabledServices.has(serviceId)))
      .map(([reference]) => reference),
  );
  for (const reference of customServiceLayout?.unassignedRefs ?? []) disabledRuleRefs.add(reference);
  const directTargets = new Set(["DIRECT", data.groups.direct]);
  const rejectFirst = (candidates) => {
    if (resolved.failClosed !== true) return candidates;
    const rejectCandidate = { kind: "group-ref", value: reject };
    return [rejectCandidate, ...candidates.filter((candidate) => candidate.value !== reject)];
  };
  const rewriteRules = (rules) => rules.map((rule) => {
    const reference = serviceRuleReference(rule);
    if (customServiceLayout && reference && customServiceLayout.targetByRef.has(reference)) {
      const target = customServiceLayout.targetByRef.get(reference);
      if (customServiceLayout.unassignedRefs.has(reference) || disabledRuleRefs.has(reference)) {
        return { ...rule, target: reject };
      }
      if (target !== rule.target) return { ...rule, target };
    }
    if (disabledServiceGroups.has(rule.target)) return { ...rule, target: reject };
    if (resolved.allowDirect === false && directTargets.has(rule.target)) return { ...rule, target: reject };
    return rule;
  });

  const serviceRuleSection = plan.sections.find(
    (section) => section.type === "clusters" && section.role === "service-rule-clusters",
  );
  for (const section of plan.sections) {
    if (section.type === "rules") {
      section.rules = rewriteRules(section.rules);
      continue;
    }
    if (section.type === "clusters") {
      const needsDenyRules = resolved.disabledServiceIds.length || customServiceLayout?.unassignedRefs.size;
      if (section !== serviceRuleSection || !needsDenyRules) {
        for (const cluster of section.clusters) cluster.rules = rewriteRules(cluster.rules);
      } else {
        const denyRules = [];
        const retainedClusters = [];
        for (const cluster of section.clusters) {
          const activeRules = [];
          for (const rule of cluster.rules) {
            if (disabledRuleRefs.has(serviceRuleReference(rule))) {
              denyRules.push({ ...rule, target: reject });
            } else {
              activeRules.push(rule);
            }
          }
          if (activeRules.length) {
            retainedClusters.push({
              ...cluster,
              rules: rewriteRules(activeRules),
            });
          }
        }
        const uniqueDenyRules = [...new Map(denyRules.map((rule) => [JSON.stringify(rule), rule])).values()];
        if (uniqueDenyRules.length) {
          retainedClusters.unshift({ source: "service", rules: uniqueDenyRules });
        }
        section.clusters = retainedClusters;
      }
      continue;
    }
    if (section.type === "selectors") {
      for (const selector of section.selectors) {
        if (disabledServiceGroups.has(selector.group.name)) {
          selector.group.candidates = [{ kind: "group-ref", value: reject }];
        } else {
          let candidates = customServiceLayout?.customNames.has(selector.group.name)
            ? selector.group.candidates
            : reorderCandidates(
              selector.group.candidates,
              orderingGroups,
              resolved.activeRegionIds,
              removedGroups,
            );
          if (resolved.allowDirect === false) {
            if (selector.group.name === data.groups.direct) {
              candidates = [{ kind: "group-ref", value: reject }];
            } else {
              candidates = candidates.map((candidate) => (
                candidate.kind === "group-ref" && directTargets.has(candidate.value)
                  ? { kind: "group-ref", value: reject }
                  : candidate
              ));
            }
          }
          selector.group.candidates = rejectFirst(candidates);
        }
      }
      const preferredGroups = customServiceLayout ? [] : resolved.preferredServiceIds
        .map((id) => serviceGroups.get(id))
        .filter((group) => group && section.selectors.some((selector) => selector.group.name === group));
      if (preferredGroups.length) {
        const byName = new Map(section.selectors.map((selector) => [selector.group.name, selector]));
        const orderedNames = [...new Set(preferredGroups)];
        orderedNames.push(...[...byName.keys()].filter((name) => !orderedNames.includes(name)));
        section.selectors = orderedNames.map((name) => byName.get(name));
      }
      continue;
    }
    if (section.type !== "groups") continue;

    section.groups = section.groups
      .filter((group) => !removedGroups.has(group.name))
      .map((group) => {
        if (disabledServiceGroups.has(group.name)) {
          group.candidates = [{ kind: "group-ref", value: reject }];
        } else if (customServiceLayout && group.name === customServiceLayout.protectedGroupName) {
          // Preserve approved exit ordering; the protected selector already has REJECT first.
        } else {
          group.candidates = reorderCandidates(
          group.candidates ?? [],
          orderingGroups,
          resolved.activeRegionIds,
          removedGroups,
          );
        }
        if (resolved.allowDirect === false) {
          if (group.name === data.groups.direct) {
            group.candidates = [{ kind: "group-ref", value: reject }];
          } else {
            group.candidates = group.candidates.map((candidate) => (
              candidate.kind === "group-ref" && directTargets.has(candidate.value)
                ? { kind: "group-ref", value: reject }
                : candidate
            ));
          }
        }
        if (group.name === data.groups.fallback && resolved.failClosed !== undefined) {
          const target = resolved.failClosed ? reject : data.groups.auto;
          group.candidates = [{ kind: "group-ref", value: target }];
        }
        if (!group.candidates.length) group.candidates = [{ kind: "group-ref", value: reject }];
        group.candidates = rejectFirst(group.candidates);
        const hasNodeFilter = group.type === "proxy-group" && group.filterPattern != null;
        if (hasNodeFilter && !Object.hasOwn(data.regionGroups, group.name) && group.kind === "select") {
          group.filterPattern = resolved.includeOtherRegion
            ? negativeFilter(group.filterPattern, blockedTerms)
            : positiveFilter(group.filterPattern, allowedTerms);
        } else if (hasNodeFilter && group.name === data.otherRegionGroup) {
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
    if (section.type === "selectors" && section.selectors.length === 0) continue;
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
    disabledServices: resolved.disabledServiceIds,
    preferredServices: resolved.preferredServiceIds,
    allowDirect: resolved.allowDirect,
    failClosed: resolved.failClosed,
    language: resolved.language,
    includeOtherRegion: resolved.includeOtherRegion,
  };
}

export { runtimeData };
