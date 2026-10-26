import { getLanguage, setLanguage, translate, translateCatalogLabel } from "./i18n.mjs";
import { copyServiceGroups, mountServiceGroupEditor } from "./service-group-editor.js";

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

export function mountProfileOptions({ root, catalog, outputFormat, onChange = () => {}, onLanguage = () => {}, storage = globalThis.localStorage, languageFetcher = globalThis.fetch }) {
  const document = root.ownerDocument;
  const defaults = catalog.optionDefaults ?? {};
  const regions = Array.isArray(catalog.regions) ? catalog.regions : [];
  const services = Array.isArray(catalog.services)
    ? catalog.services.filter((service) => !Array.isArray(service.outputFormats) || service.outputFormats.includes(outputFormat))
    : [];
  const templates = availableTemplates(catalog, outputFormat);
  const serviceGroups = (catalog.serviceGroups ?? []).filter((group) => group.outputFormat === outputFormat);
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
    // Undefined means preserve the server's legacy behavior for an old spec.
    allowDirect: typeof defaults.allowDirect === "boolean" ? defaults.allowDirect : true,
    failClosed: typeof defaults.failClosed === "boolean" ? defaults.failClosed : true,
    advancedOpen: false,
  };

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
    if (selectedTemplate.supportsProfileOptions === false) {
      return spec;
    }
    const only = state.regionMode === "only" ? cleanedOrder(state.selectedRegions, routableRegions()) : [];
    if (state.regionMode === "only" && only.length === 0) {
      const error = new Error(translate("onlyRequiresRegion"));
      error.translationKey = "onlyRequiresRegion";
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
      writePreferences(storage, collectSpec(), outputFormat, state.serviceGroups);
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
    block.append(child(document, "h4", undefined, preference.heading));
    appendHint(document, block, preference.hint);
    const picker = document.createElement("select");
    picker.id = preference.pickerId;
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

  function render() {
    const focusedId = document.activeElement && root.contains?.(document.activeElement)
      ? document.activeElement.id
      : "";
    const captureOpen = (selector, assign) => {
      const node = root.querySelector?.(selector);
      if (node) assign(node.open);
    };
    captureOpen(".profile-advanced", (open) => { state.advancedOpen = open; });
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
    const profileHeading = child(document, "h2", undefined, "profileOptions");
    profileHeading.id = "profile-options-title";
    root.append(profileHeading);
    // One settings column, so the service-group editor can sit beside it.
    const rail = document.createElement("div");
    rail.className = "profile-rail";

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
      state.baseProfile = templateSelect.value;
      state.serviceGroups = copyServiceGroups(readPreferences(storage).serviceGroupsByTemplate?.[`${outputFormat}/${state.baseProfile}`]);
      state.selectedServiceGroup = "";
      state.resetGroupPanels = true;
      state.groupSearches = {};
      render();
      persist();
    });
    rail.append(makeLabel(document, "baseProfile", templateSelect));

    const selectedTemplate = templates.find((item) => item.id === state.baseProfile);
    if (selectedTemplate) {
      const text = translateCatalogLabel("templateDescriptions", selectedTemplate.id, selectedTemplate.description ?? "");
      if (text) {
        const description = child(document, "p", text);
        description.className = "hint template-description";
        rail.append(description);
      }
      const scope = outputFormat === "ini" ? "iniTemplateScope" : "yamlTemplateScope";
      appendHint(document, rail, scope);
    }
    if (selectedTemplate?.supportsProfileOptions === false) {
      root.append(rail);
      restoreFocus(focusedId);
      return;
    }

    const regionsSection = document.createElement("section");
    regionsSection.className = "profile-subsection";
    regionsSection.setAttribute("aria-labelledby", "region-title");
    const regionHeading = child(document, "h3", undefined, "regionRouting");
    regionHeading.id = "region-title";
    regionsSection.append(regionHeading);
    const modeRow = document.createElement("div");
    modeRow.className = "mode-row";
    for (const [value, key] of [["exclude", "excludeRegions"], ["only", "onlyRegions"]]) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "region-mode";
      input.id = `region-mode-${value}`;
      input.value = value;
      input.checked = state.regionMode === value;
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
    const regionList = document.createElement("div");
    regionList.id = "region-list";
    regionList.className = "region-grid";
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
      regionList.append(label);
    }
    regionsSection.append(regionList);
    appendHint(document, regionsSection, state.regionMode === "only" ? "regionsHelpOnly" : "regionsHelpExclude");
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

    const templateGroups = serviceGroups.filter((group) => !group.baseProfile || group.baseProfile === state.baseProfile);
    let serviceGroupEditor = null;
    if (templateGroups.length) {
      const customization = document.createElement("details");
      customization.id = "service-group-customization";
      customization.className = "profile-subsection service-group-customization";
      customization.open = state.serviceCustomizationOpen;
      customization.addEventListener("toggle", () => { state.serviceCustomizationOpen = customization.open; });
      customization.append(child(document, "summary", undefined, "serviceGroupCustomization"));
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
        onSelect(id, rerender = true, focus = false) {
          state.selectedServiceGroup = id;
          state.focusSelectedServiceGroup = focus === true;
          state.resetGroupPanels = true;
          if (rerender) render();
        },
        onChange(value) {
          state.serviceGroups = copyServiceGroups(value);
          render();
          persist();
        },
      });
      customization.append(editor);
      serviceGroupEditor = customization;
    }

    const extra = document.createElement("details");
    extra.className = "profile-subsection profile-advanced";
    extra.open = state.advancedOpen;
    extra.addEventListener("toggle", () => { state.advancedOpen = extra.open; });
    const summary = child(document, "summary", undefined, "serviceOptions");
    extra.append(summary);
    const serviceSection = document.createElement("div");
    serviceSection.className = "service-grid";
    const serviceHeading = child(document, "h4", undefined, "enabledServices");
    extra.append(serviceHeading);
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
      serviceSection.append(label);
      if (!service.name) label.lastChild.textContent = service.id;
      void input;
    }
    extra.append(serviceSection);
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
    extra.append(direct.label);
    appendHint(document, extra, "allowDirectHelp");
    const defaultsFailClosed = typeof defaults.failClosed === "boolean" ? defaults.failClosed : true;
    const failClosed = makeToggle(document, "fail-closed", state.failClosed ?? defaultsFailClosed, "failClosed", (value) => {
      state.failClosed = value;
      render();
      persist();
    });
    extra.append(failClosed.label);
    appendHint(document, extra, "failClosedHelp");
    rail.append(extra);
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
    if (!candidate || !root.contains?.(candidate)) return;
    try {
      candidate.focus({ preventScroll: true });
    } catch {
      candidate.focus?.();
    }
  }

  async function applySpec(spec) {
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) return;
    if (templates.some((item) => item.id === spec.baseProfile)) state.baseProfile = spec.baseProfile;
    const only = listOrEmpty(spec.onlyNodeRegions);
    state.regionMode = only.length ? "only" : "exclude";
    state.selectedRegions = only.length ? only : listOrEmpty(spec.disabledNodeRegions);
    state.preferredNodeRegions = listOrEmpty(spec.preferredNodeRegions);
    state.disabledServices = listOrEmpty(spec.disabledServices);
    state.preferredServices = listOrEmpty(spec.preferredServices);
    state.serviceGroups = copyServiceGroups(spec.serviceGroups);
    state.allowDirect = typeof spec.allowDirect === "boolean" ? spec.allowDirect : undefined;
    state.failClosed = typeof spec.failClosed === "boolean" ? spec.failClosed : undefined;
    if (typeof spec.language === "string") {
      const language = await setLanguage(spec.language, storage, { fetcher: languageFetcher });
      onLanguage(language);
    }
    render();
  }

  function rerenderForLanguage() {
    render();
  }

  render();
  return {
    getSpec: collectSpec,
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
