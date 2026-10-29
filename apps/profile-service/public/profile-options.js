import { getLanguage, setLanguage, translate, translateCatalogLabel } from "./i18n.mjs";
import { copyServiceGroups, effectiveServiceGroups, mountServiceGroupEditor } from "./service-group-editor.js";
import { copyEditorDraft } from "./editor-state.mjs";

const PREFERENCES_KEY = "profile-service-policy-preferences";
const PREFERENCE_FIELDS = Object.freeze([
  "baseProfile",
  "disabledNodeRegions",
  "onlyNodeRegions",
  "preferredNodeRegions",
  "disabledServices",
  "preferredServices",
  "allowDirect",
  "failClosed",
]);

function readPreferences(storage) {
  try {
    const raw = storage?.getItem(PREFERENCES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writePreferences(storage, spec, outputFormat, serviceGroups) {
  if (!storage?.setItem) return;
  const cached = readPreferences(storage);
  const safe = {};
  for (const key of PREFERENCE_FIELDS) {
    if (Object.hasOwn(cached, key)) safe[key] = cached[key];
    if (Object.hasOwn(spec, key)) safe[key] = spec[key];
  }
  const groupLayouts = {};
  for (const [key, value] of Object.entries(cached.serviceGroupsByTemplate ?? {})) {
    const layout = copyServiceGroups(value);
    if (layout !== undefined) groupLayouts[key] = layout;
  }
  const layoutKey = `${outputFormat}/${spec.baseProfile}`;
  if (serviceGroups !== undefined) groupLayouts[layoutKey] = copyServiceGroups(serviceGroups);
  else delete groupLayouts[layoutKey];
  safe.serviceGroupsByTemplate = groupLayouts;
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(safe));
  } catch {
    // Saved policy defaults are optional when browser storage is unavailable.
  }
}

function child(document, tag, text, key) {
  const node = document.createElement(tag);
  if (key) {
    node.dataset.i18n = key;
    node.textContent = translate(key);
  } else if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function makeLabel(document, textKey, control) {
  const label = document.createElement("label");
  const text = child(document, "span", undefined, textKey);
  label.append(text, control);
  return label;
}

function addOption(document, select, label, value) {
  const option = document.createElement("option");
  option.textContent = label;
  option.value = value;
  select.append(option);
}

function makeToggle(document, id, checked, key, onChange) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = Boolean(checked);
  input.addEventListener("change", () => onChange(input.checked));
  const text = child(document, "span", undefined, key);
  label.append(input, text);
  return { label, input };
}

function appendHint(document, parent, key) {
  const hint = child(document, "p", undefined, key);
  hint.className = "hint";
  parent.append(hint);
}

function listOrEmpty(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function copyCustomRuleProviders(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("customRuleProviders must be an array");
  return value.map((provider, index) => {
    if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
      throw new TypeError(`customRuleProviders[${index}] must be an object`);
    }
    return { url: provider.url, behavior: provider.behavior, target: provider.target };
  });
}

function availableTemplates(catalog, outputFormat) {
  if (Array.isArray(catalog.templates)) {
    return catalog.templates.filter((template) => template.outputFormat === outputFormat);
  }
  // Older local catalogs only exposed the INI profile list.
  if (outputFormat === "ini" && Array.isArray(catalog.baseProfiles)) {
    return catalog.baseProfiles.map((profile) => ({ ...profile, outputFormat: "ini" }));
  }
  return [];
}

function moveItem(values, index, delta) {
  const next = [...values];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function getStoredRegionMode(preferences) {
  return listOrEmpty(preferences.onlyNodeRegions).length ? "only" : "exclude";
}

export function mountProfileOptions({ root, catalog, outputFormat, onChange = () => {}, onLanguage = () => {}, storage = globalThis.localStorage, languageFetcher = globalThis.fetch,
  view = "all", groupId = null, groupHref = () => "#", onNavigateGroup = () => {}, persistPreferences = true }) {
  const document = root.ownerDocument;
  const defaults = catalog.optionDefaults ?? {};
  const regions = Array.isArray(catalog.regions) ? catalog.regions : [];
  const services = Array.isArray(catalog.services)
    ? catalog.services.filter((service) => !Array.isArray(service.outputFormats) || service.outputFormats.includes(outputFormat))
    : [];
  const templates = availableTemplates(catalog, outputFormat);
  const serviceGroups = (catalog.serviceGroups ?? []).filter((group) => group.outputFormat === outputFormat);
  const providerLimits = catalog.customRuleProviderLimits ?? {};
  const maxCustomRuleProviders = Number.isSafeInteger(providerLimits.maxProviders) && providerLimits.maxProviders >= 0
    ? providerLimits.maxProviders : undefined;
  const maxCustomRuleProviderUrlLength = Number.isSafeInteger(providerLimits.maxUrlLength) && providerLimits.maxUrlLength > 0
    ? providerLimits.maxUrlLength : undefined;
  const cached = readPreferences(storage);
  const catalogDefault = catalog.defaultTemplate ?? catalog.defaultProfiles?.[outputFormat];
  const initialTemplate = templates.some((item) => item.id === cached.baseProfile)
    ? cached.baseProfile
    : templates.some((item) => item.id === catalogDefault)
      ? catalogDefault
      : templates[0]?.id ?? "";
  const state = {
    baseProfile: initialTemplate,
    regionMode: "exclude",
    selectedRegions: [],
    preferredNodeRegions: [],
    disabledServices: [],
    preferredServices: [],
    serviceGroups: copyServiceGroups(cached.serviceGroupsByTemplate?.[`${outputFormat}/${initialTemplate}`]),
    selectedServiceGroup: "",
    serviceCustomizationOpen: false,
    focusSelectedServiceGroup: false,
    servicePaletteOpen: false,
    routePaletteOpen: true,
    groupSettingsOpen: false,
    resetGroupPanels: false,
    groupSearches: {},
    groupAnnouncement: null,
    policyServiceSearch: "",
    // Undefined means preserve the server's legacy behavior for an old spec.
    allowDirect: typeof defaults.allowDirect === "boolean" ? defaults.allowDirect : true,
    failClosed: typeof defaults.failClosed === "boolean" ? defaults.failClosed : true,
    advancedOpen: false,
    additionalOpen: false,
    customRuleProviders: undefined,
    adblock: undefined,
    renderGeneration: 0,
  };
  const layoutsByTemplate = new Map();
  let pendingGroupNavigation = null;
  if (groupId) state.selectedServiceGroup = groupId;

  const storedMode = getStoredRegionMode(cached);
  state.regionMode = storedMode;
  state.selectedRegions = storedMode === "only"
    ? listOrEmpty(cached.onlyNodeRegions)
    : listOrEmpty(cached.disabledNodeRegions);
  state.preferredNodeRegions = listOrEmpty(cached.preferredNodeRegions);
  state.disabledServices = listOrEmpty(cached.disabledServices);
  state.preferredServices = listOrEmpty(cached.preferredServices);
  if (typeof cached.allowDirect === "boolean") state.allowDirect = cached.allowDirect;
  if (typeof cached.failClosed === "boolean") state.failClosed = cached.failClosed;

  function routableRegions() {
    return regions.filter((item) => item.routable);
  }

  function activeRegions() {
    const selected = new Set(state.selectedRegions);
    return routableRegions().filter((item) => state.regionMode === "only"
      ? selected.has(item.id)
      : !selected.has(item.id));
  }

  function enabledServices() {
    const disabled = new Set(state.disabledServices);
    return services.filter((item) => !disabled.has(item.id));
  }

  function pruneGroupRegions() {
    if (!state.serviceGroups) return;
    const selected = new Set(state.selectedRegions);
    const regionIds = new Set(regions.map((region) => region.id));
    state.serviceGroups = state.serviceGroups.map((group) => ({ ...group, routes: group.routes.filter((route) => {
      if (route === "other") return state.regionMode !== "only";
      if (!regionIds.has(route)) return true;
      return state.regionMode === "only" ? selected.has(route) : !selected.has(route);
    }) }));
  }

  function cleanedOrder(values, available) {
    const ids = new Set(available.map((item) => item.id));
    return values.filter((id, index) => ids.has(id) && values.indexOf(id) === index);
  }

  function collectSpec() {
    const selectedTemplate = templates.find((item) => item.id === state.baseProfile);
    if (!selectedTemplate) throw new Error(translate("chooseTemplate"));
    const spec = {
      schemaVersion: 1,
      baseProfile: state.baseProfile,
      language: getLanguage(storage),
    };
    if (selectedTemplate.supportsRuleProviderOptions === true) {
      if (state.customRuleProviders !== undefined) spec.customRuleProviders = copyCustomRuleProviders(state.customRuleProviders);
      if (typeof state.adblock === "boolean") spec.adblock = state.adblock;
    }
    if (selectedTemplate.supportsProfileOptions === false) {
      return spec;
    }
    const only = state.regionMode === "only" ? cleanedOrder(state.selectedRegions, routableRegions()) : [];
    if (state.regionMode === "only" && only.length === 0) {
      const error = new Error(translate("onlyRequiresRegion"));
      error.translationKey = "onlyRequiresRegion";
      throw error;
    }
    if (!activeRegions().length) {
      const error = new Error(translate("atLeastOneActiveRegion"));
      error.translationKey = "atLeastOneActiveRegion";
      throw error;
    }
    const disabled = state.regionMode === "exclude" ? cleanedOrder(state.selectedRegions, regions) : [];
    Object.assign(spec, {
      disabledNodeRegions: disabled,
      onlyNodeRegions: only,
      preferredNodeRegions: cleanedOrder(state.preferredNodeRegions, activeRegions()),
      disabledServices: cleanedOrder(state.disabledServices, services),
      preferredServices: cleanedOrder(state.preferredServices, enabledServices()),
    });
    // Keep local option state explicit only when supplied or changed, so saving
    // an old managed profile does not silently alter its established defaults.
    if (typeof state.allowDirect === "boolean") spec.allowDirect = state.allowDirect;
    if (typeof state.failClosed === "boolean") spec.failClosed = state.failClosed;
    if (state.serviceGroups !== undefined) spec.serviceGroups = copyServiceGroups(state.serviceGroups);
    return spec;
  }

  function persist() {
    try {
      if (persistPreferences) writePreferences(storage, collectSpec(), outputFormat, state.serviceGroups);
    } catch {
      // Invalid intermediate edits (such as an empty only-mode) are not saved.
    }
    onChange(collectSpecSafe());
  }

  function collectSpecSafe() {
    try {
      return collectSpec();
    } catch {
      return null;
    }
  }

  function renderOrderList(list, values, available, keyPrefix, update) {
    list.replaceChildren();
    const byId = new Map(available.map((item) => [item.id, item]));
    values.forEach((id, index) => {
      const item = byId.get(id);
      if (!item) return;
      const row = document.createElement("li");
      const names = keyPrefix === "region" ? "regionNames" : "serviceNames";
      const name = child(document, "span", translateCatalogLabel(names, id, item.name ?? id));
      row.append(name);
      for (const [label, delta, key] of [["↑", -1, "moveUp"], ["↓", 1, "moveDown"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.id = `${key}-${keyPrefix}-${id}`;
        button.textContent = label;
        button.title = translate(key);
        button.setAttribute("aria-label", `${translate(key)}: ${item.name ?? id}`);
        button.disabled = index + delta < 0 || index + delta >= values.length;
        button.addEventListener("click", () => update(moveItem(values, index, delta)));
        row.append(button);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.id = `remove-${keyPrefix}-preference-${id}`;
      remove.dataset.i18n = "remove";
      remove.textContent = translate("remove");
      remove.addEventListener("click", () => update(values.filter((value) => value !== id)));
      row.append(remove);
      list.append(row);
    });
  }

  function appendPreferredOrder(parent, preference) {
    const block = document.createElement("div");
    block.className = "preference-block";
    block.append(child(document, view === "all" ? "h4" : "h3", undefined, preference.heading));
    appendHint(document, block, preference.hint);
    const picker = document.createElement("select");
    picker.id = preference.pickerId;
    picker.setAttribute("aria-label", translate(preference.heading));
    const available = preference.items();
    const selected = preference.selected();
    for (const item of available) {
      if (!selected.includes(item.id)) {
        addOption(document, picker, translateCatalogLabel(preference.names, item.id, preference.labelFor(item)), item.id);
      }
    }
    const add = child(document, "button", undefined, preference.addLabel);
    add.type = "button";
    add.id = preference.addId;
    add.disabled = picker.options.length === 0;
    const addRow = document.createElement("div");
    addRow.className = "prefer-add";
    addRow.append(picker, add);
    const order = document.createElement("ol");
    order.className = "prefer-list";
    add.addEventListener("click", () => {
      const values = preference.selected();
      if (picker.value && !values.includes(picker.value)) {
        values.push(picker.value);
        render();
        persist();
      }
    });
    block.append(addRow, order);
    renderOrderList(order, selected, available, preference.prefix, (values) => {
      preference.assign(values);
      render();
      persist();
    });
    parent.append(block);
  }

  function renderTemplate(rail, selectedTemplate) {
    const templateSelect = document.createElement("select");
    templateSelect.id = "base-profile";
    for (const profile of templates) {
      addOption(document, templateSelect, translateCatalogLabel("templateNames", profile.id, profile.name), profile.id);
    }
    if (state.baseProfile && templates.some((item) => item.id === state.baseProfile)) {
      templateSelect.value = state.baseProfile;
    }
    templateSelect.disabled = templates.length === 0;
    templateSelect.addEventListener("change", () => {
      layoutsByTemplate.set(state.baseProfile, copyServiceGroups(state.serviceGroups));
      state.baseProfile = templateSelect.value;
      state.serviceGroups = copyServiceGroups(layoutsByTemplate.has(state.baseProfile)
        ? layoutsByTemplate.get(state.baseProfile)
        : readPreferences(storage).serviceGroupsByTemplate?.[`${outputFormat}/${state.baseProfile}`]);
      state.selectedServiceGroup = "";
      state.resetGroupPanels = true;
      state.groupSearches = {};
      render();
      persist();
    });
    rail.append(makeLabel(document, "baseProfile", templateSelect));

    if (selectedTemplate) {
      const text = translateCatalogLabel("templateDescriptions", selectedTemplate.id, selectedTemplate.description ?? "");
      if (text) {
        const description = child(document, "p", text);
        description.className = "hint template-description";
        rail.append(description);
      }
      const scope = outputFormat === "ini" ? "iniTemplateScope" : "yamlTemplateScope";
      appendHint(document, rail, scope);
      if (view === "template") {
        const policy = document.createElement("section");
        policy.className = "template-defaults";
        policy.append(child(document, "h2", undefined, "templateDefaultsTitle"));
        appendHint(document, policy, selectedTemplate.supportsProfileOptions === false ? "templateDefaultsFixed" : "templateDefaultsEditable");
        rail.append(policy);
      }
    }
  }

  function renderAdditionalOptions(rail, selectedTemplate) {
    const available = selectedTemplate?.supportsRuleProviderOptions === true;
    const renderGeneration = state.renderGeneration;
    const currentRender = () => state.renderGeneration === renderGeneration;
    const additional = document.createElement("details");
    additional.className = "profile-subsection profile-additional";
    additional.open = state.additionalOpen;
    additional.addEventListener("toggle", () => { state.additionalOpen = additional.open; });
    additional.append(child(document, "summary", undefined, "additionalOptions"));

    const adblock = document.createElement("select");
    adblock.id = "adblock-setting";
    adblock.disabled = !available;
    addOption(document, adblock, translate("adblockDefault"), "default");
    addOption(document, adblock, translate("adblockEnabled"), "enabled");
    addOption(document, adblock, translate("adblockDisabled"), "disabled");
    adblock.value = typeof state.adblock === "boolean" ? (state.adblock ? "enabled" : "disabled") : "default";
    adblock.addEventListener("change", () => {
      if (!currentRender()) return;
      state.adblock = adblock.value === "default" ? undefined : adblock.value === "enabled";
      persist();
    });
    additional.append(makeLabel(document, "adblock", adblock));
    appendHint(document, additional, "adblockHelp");

    additional.append(child(document, "h4", undefined, "customRuleProviders"));
    appendHint(document, additional, "customRuleProvidersHelp");
    if (!available) appendHint(document, additional, "additionalOptionsUnsupported");
    const list = document.createElement("div");
    list.id = "custom-rule-provider-list";
    list.className = "profile-provider-list";
    const providers = state.customRuleProviders ?? [];
    providers.forEach((provider, index) => {
      const row = document.createElement("div");
      row.className = "profile-provider-row";
      const url = document.createElement("input");
      url.type = "url";
      url.id = `custom-rule-provider-url-${index}`;
      url.value = provider.url ?? "";
      url.required = true;
      url.disabled = !available;
      url.autocomplete = "off";
      url.spellcheck = false;
      if (maxCustomRuleProviderUrlLength !== undefined) url.maxLength = maxCustomRuleProviderUrlLength;
      url.addEventListener("change", () => {
        if (!currentRender()) return;
        state.customRuleProviders[index].url = url.value;
        persist();
      });
      row.append(makeLabel(document, "customRuleProviderUrl", url));
      const behavior = document.createElement("select");
      behavior.id = `custom-rule-provider-behavior-${index}`;
      behavior.disabled = !available;
      addOption(document, behavior, translate("customRuleProviderClassical"), "classical");
      addOption(document, behavior, translate("customRuleProviderDomain"), "domain");
      behavior.value = provider.behavior ?? "classical";
      behavior.addEventListener("change", () => {
        if (!currentRender()) return;
        state.customRuleProviders[index].behavior = behavior.value;
        persist();
      });
      row.append(makeLabel(document, "customRuleProviderBehavior", behavior));
      const target = document.createElement("select");
      target.id = `custom-rule-provider-target-${index}`;
      target.disabled = !available;
      addOption(document, target, translate("customRuleProviderReject"), "reject");
      addOption(document, target, translate("customRuleProviderDirect"), "direct");
      addOption(document, target, translate("customRuleProviderProxy"), "proxy");
      target.value = provider.target ?? "reject";
      target.addEventListener("change", () => {
        if (!currentRender()) return;
        state.customRuleProviders[index].target = target.value;
        persist();
      });
      row.append(makeLabel(document, "customRuleProviderTarget", target));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.id = `custom-rule-provider-remove-${index}`;
      remove.textContent = translate("remove");
      remove.disabled = !available;
      remove.setAttribute("aria-label", translate("removeCustomRuleProvider", { index: index + 1 }));
      remove.addEventListener("click", () => {
        if (!currentRender()) return;
        state.customRuleProviders.splice(index, 1);
        render();
        persist();
      });
      row.append(remove);
      list.append(row);
    });
    additional.append(list);
    const add = document.createElement("button");
    add.type = "button";
    add.id = "custom-rule-provider-add";
    add.textContent = translate("addCustomRuleProvider");
    add.disabled = !available || maxCustomRuleProviders !== undefined && providers.length >= maxCustomRuleProviders;
    add.addEventListener("click", () => {
      if (!currentRender()) return;
      state.customRuleProviders = [...(state.customRuleProviders ?? []), { url: "", behavior: "classical", target: "reject" }];
      render();
      persist();
      document.getElementById?.(`custom-rule-provider-url-${state.customRuleProviders.length - 1}`)?.focus?.();
    });
    additional.append(add);
    if (maxCustomRuleProviders !== undefined && maxCustomRuleProviderUrlLength !== undefined) {
      const hint = child(document, "p", translate("customRuleProviderLimit", {
        maxProviders: maxCustomRuleProviders, maxUrlLength: maxCustomRuleProviderUrlLength,
      }));
      hint.className = "hint";
      additional.append(hint);
    }
    rail.append(additional);
  }

  function renderRegions(rail) {
    const regionsSection = document.createElement("section");
    regionsSection.className = "profile-subsection";
    regionsSection.setAttribute("aria-labelledby", "region-title");
    const regionHeading = child(document, view === "all" ? "h3" : "h2", undefined, "regionRouting");
    regionHeading.id = "region-title";
    regionsSection.append(regionHeading);
    const modeRow = document.createElement("fieldset");
    modeRow.className = "mode-row";
    modeRow.append(child(document, "legend", undefined, "regionSelectionMode"));
    for (const [value, key] of [["exclude", "excludeRegions"], ["only", "onlyRegions"]]) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "region-mode";
      input.id = `region-mode-${value}`;
      input.value = value;
      input.checked = state.regionMode === value;
      input.setAttribute("aria-describedby", "region-mode-help region-validation");
      if (validationIssues().length) input.setAttribute("aria-invalid", "true");
      input.addEventListener("change", () => {
        if (!input.checked) return;
        state.regionMode = value;
        if (value === "only") state.selectedRegions = state.selectedRegions.filter((id) => routableRegions().some((item) => item.id === id));
        pruneGroupRegions();
        render();
        persist();
      });
      label.append(input, child(document, "span", undefined, key));
      modeRow.append(label);
    }
    regionsSection.append(modeRow);
    const modeHelp = child(document, "p", undefined, state.regionMode === "only" ? "regionsHelpOnly" : "regionsHelpExclude");
    modeHelp.id = "region-mode-help";
    modeHelp.className = "hint";
    const validation = child(document, "p", validationIssues().map((issue) => translate(issue.key)).join(" "));
    validation.id = "region-validation";
    validation.className = "inline-error";
    validation.setAttribute("role", "status");
    validation.hidden = !validationIssues().length;
    regionsSection.append(modeHelp, validation);
    regionsSection.append(child(document, "h3", undefined, "routableRegions"));
    const regionList = document.createElement("div");
    regionList.id = "region-list";
    regionList.className = "region-grid";
    regionList.tabIndex = -1;
    regionList.setAttribute("role", "group");
    regionList.setAttribute("aria-label", translate("routableRegions"));
    regionList.setAttribute("aria-describedby", "region-validation");
    const filterList = document.createElement("div");
    filterList.id = "node-filter-list";
    filterList.className = "region-grid filter-region-grid";
    for (const region of regions) {
      if (state.regionMode === "only" && !region.routable) continue;
      const label = document.createElement("label");
      label.className = "region-card";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = `region-${region.id}`;
      input.value = region.id;
      input.checked = state.selectedRegions.includes(region.id);
      input.addEventListener("change", () => {
        const selected = new Set(state.selectedRegions);
        if (input.checked) selected.add(region.id);
        else selected.delete(region.id);
        state.selectedRegions = [...selected];
        state.preferredNodeRegions = cleanedOrder(state.preferredNodeRegions, activeRegions());
        pruneGroupRegions();
        render();
        persist();
      });
      const text = document.createElement("span");
      text.textContent = translateCatalogLabel("regionNames", region.id, region.name);
      const meta = document.createElement("span");
      meta.className = "region-meta";
      meta.textContent = region.routable ? region.id.toUpperCase() : `${region.id.toUpperCase()} · ${translate("nodeFilterOnly")}`;
      text.append(meta);
      label.append(input, text);
      (region.routable ? regionList : filterList).append(label);
    }
    regionsSection.append(regionList);
    if (filterList.children.length) {
      regionsSection.append(child(document, "h3", undefined, "filterOnlyRegions"));
      appendHint(document, regionsSection, "filterOnlyRegionsHelp");
      regionsSection.append(filterList);
    }
    appendPreferredOrder(regionsSection, {
      pickerId: "prefer-region-picker",
      addId: "prefer-region-add",
      prefix: "region",
      names: "regionNames",
      heading: "preferredRegionOrder",
      hint: "preferredRegionHelp",
      addLabel: "addPreferred",
      items: activeRegions,
      selected: () => state.preferredNodeRegions,
      labelFor: (item) => item.name,
      assign(values) { state.preferredNodeRegions = values; },
    });
    rail.append(regionsSection);
  }

  function renderServiceGroups(rail) {
    const templateGroups = serviceGroups.filter((group) => !group.baseProfile || group.baseProfile === state.baseProfile);
    let serviceGroupEditor = null;
    if (templateGroups.length && ["all", "services", "group"].includes(view)) {
      const customization = document.createElement(view === "all" ? "details" : "section");
      customization.id = view === "all" ? "service-group-customization" : "service-group-page";
      customization.className = "profile-subsection service-group-customization";
      customization.open = state.serviceCustomizationOpen;
      customization.addEventListener("toggle", () => { state.serviceCustomizationOpen = customization.open; });
      if (view === "all") customization.append(child(document, "summary", undefined, "serviceGroupCustomization"));
      const editor = document.createElement("section");
      editor.id = "service-group-editor";
      editor.className = "service-group-editor-content";
      mountServiceGroupEditor({
        root: editor, groups: templateGroups, regions, services,
        value: state.serviceGroups, selectedGroup: state.selectedServiceGroup,
        servicePaletteOpen: state.servicePaletteOpen,
        routePaletteOpen: state.routePaletteOpen,
        settingsOpen: state.groupSettingsOpen,
        searches: state.groupSearches,
        onSearch(key, value) { state.groupSearches[key] = value; },
        limits: catalog.serviceGroupLimits,
        reservedNames: catalog.reservedGroupNames,
        allowDirect: state.allowDirect, failClosed: state.failClosed,
        disabledRegions: state.regionMode === "exclude" ? state.selectedRegions : [],
        onlyRegions: state.regionMode === "only" ? state.selectedRegions : [],
        view: view === "all" ? "all" : view === "services" ? "list" : "detail",
        groupHref,
        announcement: state.groupAnnouncement,
        onSelect(id, rerender = true, focus = false) {
          if (view === "services" && !rerender) pendingGroupNavigation = id;
          state.selectedServiceGroup = id;
          state.focusSelectedServiceGroup = focus === true;
          state.resetGroupPanels = true;
          if (rerender) render();
        },
        onChange(value, announcement = null) {
          state.groupAnnouncement = announcement;
          state.serviceGroups = copyServiceGroups(value);
          render();
          persist();
          if (view === "services" && pendingGroupNavigation) {
            const destination = pendingGroupNavigation;
            pendingGroupNavigation = null;
            onNavigateGroup(destination);
          }
          else if (view === "group" && !state.selectedServiceGroup) onNavigateGroup(null);
        },
      });
      customization.append(editor);
      serviceGroupEditor = customization;
    }
    if (["services", "group"].includes(view) && !templateGroups.length) appendHint(document, rail, "templateOptionsUnavailable");
    return serviceGroupEditor;
  }

  function renderPolicies(rail) {
    const extra = document.createElement(view === "all" ? "details" : "section");
    extra.className = "profile-subsection profile-advanced";
    extra.open = state.advancedOpen;
    extra.addEventListener("toggle", () => { state.advancedOpen = extra.open; });
    const summary = child(document, view === "all" ? "summary" : "h2", undefined, "serviceOptions");
    extra.append(summary);
    const serviceSection = document.createElement("div");
    serviceSection.className = "service-grid";
    const serviceHeading = child(document, view === "all" ? "h4" : "h3", undefined, "enabledServices");
    extra.append(serviceHeading);
    let serviceSearch = null;
    if (view === "policies") {
      serviceSearch = document.createElement("input");
      serviceSearch.type = "search";
      serviceSearch.id = "policy-service-search";
      serviceSearch.value = state.policyServiceSearch;
      extra.append(makeLabel(document, "searchServices", serviceSearch));
    }
    const disabled = new Set(state.disabledServices);
    for (const service of services) {
      const { label, input } = makeToggle(document, `service-${service.id}`, !disabled.has(service.id), "", (enabled) => {
        const next = new Set(state.disabledServices);
        if (enabled) next.delete(service.id);
        else next.add(service.id);
        state.disabledServices = [...next];
        state.preferredServices = cleanedOrder(state.preferredServices, enabledServices());
        render();
        persist();
      });
      label.lastChild.textContent = translateCatalogLabel("serviceNames", service.id, service.name ?? service.id);
      label.dataset.search = `${service.id} ${label.lastChild.textContent}`;
      serviceSection.append(label);
      if (!service.name) label.lastChild.textContent = service.id;
      void input;
    }
    extra.append(serviceSection);
    if (serviceSearch) {
      const filter = () => {
        state.policyServiceSearch = serviceSearch.value;
        const term = serviceSearch.value.normalize("NFKC").toLocaleLowerCase();
        for (const label of serviceSection.children) label.hidden = !label.dataset.search.normalize("NFKC").toLocaleLowerCase().includes(term);
      };
      serviceSearch.addEventListener("input", filter);
      filter();
    }
    appendHint(document, extra, "serviceHelp");
    if (state.serviceGroups === undefined) {
      appendPreferredOrder(extra, {
        pickerId: "prefer-service-picker",
        addId: "prefer-service-add",
        prefix: "service",
        names: "serviceNames",
        heading: "preferredServiceOrder",
        hint: "preferredServiceHelp",
        addLabel: "addService",
        items: enabledServices,
        selected: () => state.preferredServices,
        labelFor: (item) => item.name ?? item.id,
        assign(values) { state.preferredServices = values; },
      });
    }

    const defaultsDirect = typeof defaults.allowDirect === "boolean" ? defaults.allowDirect : true;
    const direct = makeToggle(document, "allow-direct", state.allowDirect ?? defaultsDirect, "allowDirect", (value) => {
      state.allowDirect = value;
      if (!value && state.serviceGroups) state.serviceGroups = state.serviceGroups.map((group) => ({
        ...group, routes: group.routes.filter((route) => route !== "direct"),
      }));
      render();
      persist();
    });
    direct.input.indeterminate = state.allowDirect === undefined;
    extra.append(direct.label);
    if (direct.input.indeterminate) {
      const inherited = child(document, "p", undefined, "policyInherited");
      inherited.id = "direct-inherited-help";
      inherited.className = "hint";
      direct.input.setAttribute("aria-describedby", inherited.id);
      extra.append(inherited);
    }
    appendHint(document, extra, "allowDirectHelp");
    const defaultsFailClosed = typeof defaults.failClosed === "boolean" ? defaults.failClosed : true;
    const failClosed = makeToggle(document, "fail-closed", state.failClosed ?? defaultsFailClosed, "failClosed", (value) => {
      state.failClosed = value;
      render();
      persist();
    });
    failClosed.input.indeterminate = state.failClosed === undefined;
    extra.append(failClosed.label);
    if (failClosed.input.indeterminate) {
      const inherited = child(document, "p", undefined, "policyInherited");
      inherited.id = "fail-closed-inherited-help";
      inherited.className = "hint";
      failClosed.input.setAttribute("aria-describedby", inherited.id);
      extra.append(inherited);
    }
    appendHint(document, extra, "failClosedHelp");
    if (view === "policies") {
      extra.append(child(document, "h3", undefined, "fallbackBehaviorTitle"));
      appendHint(document, extra, state.failClosed !== false ? "fallbackBlockedHelp" : "fallbackTemplateHelp");
      appendHint(document, extra, "manualOrderHelp");
    }
    rail.append(extra);
  }

  function render() {
    state.renderGeneration += 1;
    const focusedId = document.activeElement && root.contains?.(document.activeElement)
      ? document.activeElement.id
      : "";
    const captureOpen = (selector, assign) => {
      const node = root.querySelector?.(selector);
      if (node) assign(node.open);
    };
    captureOpen(".profile-advanced", (open) => { state.advancedOpen = open; });
    captureOpen(".profile-additional", (open) => { state.additionalOpen = open; });
    captureOpen("#service-group-customization", (open) => { state.serviceCustomizationOpen = open; });
    if (state.resetGroupPanels) {
      state.servicePaletteOpen = false;
      state.routePaletteOpen = true;
      state.groupSettingsOpen = false;
      state.groupSearches.services = "";
      state.groupSearches.routes = "";
      state.resetGroupPanels = false;
    } else {
      captureOpen(".group-service-palette", (open) => { state.servicePaletteOpen = open; });
      captureOpen(".group-route-palette", (open) => { state.routePaletteOpen = open; });
      captureOpen(".group-settings", (open) => { state.groupSettingsOpen = open; });
    }
    root.replaceChildren();
    if (view === "all") {
      const profileHeading = child(document, "h2", undefined, "profileOptions");
      profileHeading.id = "profile-options-title";
      root.append(profileHeading);
    }
    // Routed pages mount one editor; the standalone converter uses the all view.
    const rail = document.createElement("div");
    rail.className = "profile-rail";
    const selectedTemplate = templates.find((item) => item.id === state.baseProfile);
    if (view === "all" || view === "template") renderTemplate(rail, selectedTemplate);
    if (view === "all" || view === "template") renderAdditionalOptions(rail, selectedTemplate);
    if (selectedTemplate?.supportsProfileOptions === false) {
      if (view !== "all" && view !== "template") appendHint(document, rail, "templateOptionsUnavailable");
      root.append(rail);
      restoreFocus(focusedId);
      return;
    }

    if (view === "all" || view === "regions") renderRegions(rail);

    const serviceGroupEditor = renderServiceGroups(rail);

    if (view === "all" || view === "policies") renderPolicies(rail);
    root.append(rail);
    if (serviceGroupEditor) root.append(serviceGroupEditor);
    const selectedGroup = root.querySelector?.('.group-choice[aria-checked="true"]');
    const groupList = root.querySelector?.("#service-group-list");
    if (selectedGroup?.getBoundingClientRect && groupList?.getBoundingClientRect) {
      const selectedBounds = selectedGroup.getBoundingClientRect();
      const listBounds = groupList.getBoundingClientRect();
      if (selectedBounds.left < listBounds.left || selectedBounds.right > listBounds.right) {
        groupList.scrollLeft += selectedBounds.left - listBounds.left;
      }
      if (selectedBounds.top < listBounds.top || selectedBounds.bottom > listBounds.bottom) {
        groupList.scrollTop += selectedBounds.top - listBounds.top;
      }
    }
    const focusId = state.focusSelectedServiceGroup
      ? `service-group-select-${state.selectedServiceGroup}`
      : focusedId;
    state.focusSelectedServiceGroup = false;
    restoreFocus(focusId);
  }

  function restoreFocus(id) {
    if (!id || !document.getElementById) return;
    let candidate = document.getElementById(id);
    if (id === "create-service-group" || id === "delete-service-group") {
      candidate = document.querySelector?.('.group-choice[aria-checked="true"]');
    }
    if ((!candidate || candidate.disabled) && id.startsWith("route-available-")) {
      candidate = document.getElementById(`group-route-${id.slice("route-available-".length)}`);
    } else if ((!candidate || candidate.disabled) && id.startsWith("group-service-available-")) {
      candidate = document.getElementById(`group-service-${id.slice("group-service-available-".length)}-remove`);
    }
    if (!candidate && (id.startsWith("group-route-") || id.startsWith("group-service-"))) {
      candidate = document.querySelector?.('.group-choice[aria-checked="true"]');
    }
    if ((!candidate || candidate.disabled) && id.startsWith("group-route-")) {
      const routeId = id.replace(/-(?:moveUp|moveDown|remove)$/u, "");
      candidate = document.getElementById(routeId) ?? document.getElementById("service-group-routes");
    }
    if (!candidate || !root.contains?.(candidate)) return;
    try {
      candidate.focus({ preventScroll: true });
    } catch {
      candidate.focus?.();
    }
  }

  async function applySpec(spec) {
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) return;
    const nextBaseProfile = templates.some((item) => item.id === spec.baseProfile) ? spec.baseProfile : state.baseProfile;
    const only = listOrEmpty(spec.onlyNodeRegions);
    const nextProviders = copyCustomRuleProviders(spec.customRuleProviders);
    const nextAdblock = typeof spec.adblock === "boolean" ? spec.adblock : undefined;
    state.baseProfile = nextBaseProfile;
    state.regionMode = only.length ? "only" : "exclude";
    state.selectedRegions = only.length ? only : listOrEmpty(spec.disabledNodeRegions);
    state.preferredNodeRegions = listOrEmpty(spec.preferredNodeRegions);
    state.disabledServices = listOrEmpty(spec.disabledServices);
    state.preferredServices = listOrEmpty(spec.preferredServices);
    state.serviceGroups = copyServiceGroups(spec.serviceGroups);
    state.allowDirect = typeof spec.allowDirect === "boolean" ? spec.allowDirect : undefined;
    state.failClosed = typeof spec.failClosed === "boolean" ? spec.failClosed : undefined;
    state.customRuleProviders = nextProviders;
    state.adblock = nextAdblock;
    if (typeof spec.language === "string") {
      const language = await setLanguage(spec.language, storage, { fetcher: languageFetcher });
      onLanguage(language);
    }
    render();
  }

  function getDraft() {
    return copyEditorDraft({
      baseProfile: state.baseProfile, regionMode: state.regionMode,
      selectedRegions: state.selectedRegions, preferredNodeRegions: state.preferredNodeRegions,
      disabledServices: state.disabledServices, preferredServices: state.preferredServices,
      serviceGroups: state.serviceGroups, allowDirect: state.allowDirect,
      failClosed: state.failClosed, adblock: state.adblock, customRuleProviders: state.customRuleProviders,
      language: getLanguage(storage),
    });
  }

  function validationIssues() {
    try { collectSpec(); return []; } catch (error) {
      return [{ key: error.translationKey ?? "chooseTemplate", section: error.translationKey ? "regions" : "template",
        field: error.translationKey ? "region-list" : "base-profile" }];
    }
  }

  async function applyDraft(value) {
    const draft = copyEditorDraft(value);
    if (!draft || !templates.some((template) => template.id === draft.baseProfile)) throw new TypeError("Invalid local draft");
    if (getLanguage(storage) !== draft.language) {
      const language = await setLanguage(draft.language, storage, { fetcher: languageFetcher });
      onLanguage(language);
    }
    for (const key of ["baseProfile", "regionMode", "selectedRegions", "preferredNodeRegions", "disabledServices", "preferredServices", "serviceGroups", "allowDirect", "failClosed", "adblock", "customRuleProviders"]) state[key] = draft[key];
    render();
  }

  function rerenderForLanguage() {
    render();
  }

  render();
  return {
    getSpec: collectSpec,
    getDraft,
    applyDraft,
    validate: validationIssues,
    getGroups() {
      return effectiveServiceGroups({
        groups: serviceGroups.filter((group) => !group.baseProfile || group.baseProfile === state.baseProfile),
        regions, value: state.serviceGroups, allowDirect: state.allowDirect, failClosed: state.failClosed,
        disabledRegions: state.regionMode === "exclude" ? state.selectedRegions : [],
        onlyRegions: state.regionMode === "only" ? state.selectedRegions : [],
      });
    },
    setView(next, id = null) {
      if (!["all", "template", "regions", "services", "group", "policies", "review", "success"].includes(next)) throw new TypeError("Unknown editor view");
      view = next;
      if (next === "group") state.selectedServiceGroup = id;
      render();
    },
    applySpec,
    setLanguage: rerenderForLanguage,
    savePreferences() {
      const spec = collectSpecSafe();
      if (spec) writePreferences(storage, spec, outputFormat, state.serviceGroups);
    },
    get outputFormat() { return outputFormat; },
  };
}

export const profilePreferencesStorageKey = PREFERENCES_KEY;
