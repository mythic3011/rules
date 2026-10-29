import assert from "node:assert/strict";
import test from "node:test";
import YAML from "yaml";

import { mountProfileOptions, profilePreferencesStorageKey } from "../public/profile-options.js";
import { getLanguage, setLanguage } from "../public/i18n.mjs";
import runtimeData from "../worker/generated/runtime-data.mjs";
import { getProfileOptions } from "../worker/profile_options.mjs";
import { convertInput } from "../worker/converter.mjs";
import { renderIni, renderIniTemplate } from "../worker/render.mjs";
import { normalizeProfileSpec, solveSubconverterPlan } from "../worker/solver.mjs";
import { loadEnglishLocale, localeJsonFetcher } from "./ui-locale-fixtures.mjs";

await loadEnglishLocale();

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.value = "";
    this.textContent = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.tabIndex = 0;
    this.title = "";
    this.classList = { add() {}, remove() {} };
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
      if (this.tagName === "select" && node.tagName === "option" && !this.value) this.value = node.value;
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.value = "";
    this.append(...nodes);
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  dispatch(name, values = {}) {
    if (name === "click" && this.tagName === "summary" && this.parentNode?.tagName === "details") {
      this.parentNode.open = !this.parentNode.open;
    }
    let defaultPrevented = false;
    return this.listeners.get(name)?.({
      target: this,
      currentTarget: this,
      preventDefault() { defaultPrevented = true; },
      get defaultPrevented() { return defaultPrevented; },
      ...values,
    });
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  contains(node) {
    return walk(this).includes(node);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector) {
    const classAttributeMatch = selector.match(/^\.([\w-]+)\[([\w-]+)="([^"]+)"\]$/u);
    if (classAttributeMatch) {
      const [, className, attribute, value] = classAttributeMatch;
      return walk(this).find((node) => (node.className ?? "").split(/\s+/u).includes(className)
        && (node.getAttribute(attribute) ?? node[attribute]) === value);
    }
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      return walk(this).find((node) => (node.className ?? "").split(/\s+/u).includes(className));
    }
    if (selector.startsWith("#")) return walk(this).find((node) => node.id === selector.slice(1));
    const attributeMatch = selector.match(/^([\w-]+)?\[([\w-]+)="([^"]+)"\]$/u);
    if (attributeMatch) {
      const [, tag, attribute, value] = attributeMatch;
      return walk(this).find((node) => (!tag || node.tagName === tag)
        && (node.getAttribute(attribute) ?? node[attribute]) === value);
    }
    return walk(this).find((node) => node.tagName === selector);
  }

  get options() {
    return this.children.filter((child) => child.tagName === "option");
  }

  get lastChild() {
    return this.children.at(-1);
  }
}

class FakeDocument {
  constructor() {
    this.nodes = [];
    this.activeElement = null;
  }

  createElement(tagName) {
    const node = new FakeNode(tagName, this);
    this.nodes.push(node);
    return node;
  }

  getElementById(id) {
    return [...this.nodes].reverse().find((node) => node.id === id);
  }

  querySelector(selector) {
    return [...this.nodes].reverse().find((node) => {
      const match = selector.match(/^\.([\w-]+)\[([\w-]+)="([^"]+)"\]$/u);
      if (match) return (node.className ?? "").split(/\s+/u).includes(match[1])
        && (node.getAttribute(match[2]) ?? node[match[2]]) === match[3];
      if (selector.startsWith(".")) return (node.className ?? "").split(/\s+/u).includes(selector.slice(1));
      if (selector.startsWith("#")) return node.id === selector.slice(1);
      return false;
    });
  }
}

class FakeStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

function walk(root) {
  return [root, ...root.children.flatMap(walk)];
}

function find(root, predicate) {
  return walk(root).find(predicate);
}

function control(root, id) {
  const node = find(root, (item) => item.id === id);
  assert.ok(node, `expected control #${id}`);
  return node;
}

function change(root, id, value) {
  const node = control(root, id);
  node.value = value;
  node.dispatch("change");
  return node;
}

function click(root, id) {
  const node = control(root, id);
  node.dispatch("click");
  return node;
}

function openDetails(root, className, summaryId) {
  const details = find(root, (node) => node.tagName === "details"
    && (node.className ?? "").split(/\s+/u).includes(className));
  assert.ok(details, `expected details.${className}`);
  if (!details.open) {
    const summary = summaryId ? control(root, summaryId) : details.children.find((node) => node.tagName === "summary");
    assert.ok(summary, `expected summary for details.${className}`);
    summary.dispatch("click");
  }
  assert.equal(details.open, true);
  return details;
}

function selectServiceGroup(root, id) {
  openDetails(root, "service-group-customization");
  click(root, `service-group-select-${id}`);
  const selection = control(root, `service-group-select-${id}`);
  assert.equal(selection.getAttribute("aria-checked"), "true");
  return selection;
}

function serviceGroupMetadata(outputFormat, baseProfile) {
  const allowedRoutes = ["reject", "us", "jp", "sg", "other", "direct"];
  return [
    {
      id: "claude-guard",
      name: "Claude Account Guard",
      serviceIds: ["claude"],
      defaultRoutes: ["reject"],
      allowedRoutes,
      protected: true,
      outputFormat,
      baseProfile,
    },
    {
      id: "openai-services",
      name: "OpenAI Services",
      serviceIds: ["chatgpt"],
      defaultRoutes: ["reject", "us"],
      allowedRoutes,
      protected: false,
      outputFormat,
      baseProfile,
    },
    {
      id: "google-services",
      name: "Google Services",
      serviceIds: ["gemini", "notebooklm"],
      defaultRoutes: ["reject", "jp"],
      allowedRoutes,
      protected: false,
      outputFormat,
      baseProfile,
    },
  ];
}

function catalog() {
  const templates = [
    { id: "ai-balanced", name: "AI Balanced", outputFormat: "ini", supportsProfileOptions: true },
    { id: "ai-strict", name: "AI Strict", outputFormat: "ini", supportsProfileOptions: true },
    { id: "static-ini", name: "Static INI", outputFormat: "ini", supportsProfileOptions: false },
    { id: "ai-balanced", name: "AI Balanced YAML", outputFormat: "yaml", supportsProfileOptions: true },
    { id: "ai-strict", name: "AI Strict YAML", outputFormat: "yaml", supportsProfileOptions: true },
    { id: "static-yaml", name: "Static YAML", outputFormat: "yaml", supportsProfileOptions: false },
  ];
  return {
    templates,
    regions: [
      { id: "us", name: "United States", routable: true },
      { id: "jp", name: "Japan", routable: true },
      { id: "sg", name: "Singapore", routable: true },
    ],
    services: [
      { id: "chatgpt", name: "ChatGPT" },
      { id: "claude", name: "Claude" },
      { id: "gemini", name: "Gemini" },
      { id: "notebooklm", name: "NotebookLM" },
    ],
    serviceGroups: templates.flatMap(({ id: baseProfile, outputFormat }) => (
      serviceGroupMetadata(outputFormat, baseProfile)
    )),
    serviceGroupLimits: { maxGroups: 8, maxNameLength: 48, maxRoutesPerGroup: 8 },
    optionDefaults: { allowDirect: false, failClosed: true },
  };
}

function mount(storage = new FakeStorage(), onLanguage = () => {}, outputFormat = "ini", data = catalog(), onChange = () => {}) {
  const document = new FakeDocument();
  const root = document.createElement("section");
  const options = mountProfileOptions({ root, catalog: data, outputFormat, storage, onLanguage, onChange, languageFetcher: localeJsonFetcher });
  return { root, options, storage };
}

function mountView({ view, outputFormat = "ini", data = getProfileOptions({ outputFormat, data: runtimeData }), groupId = null, storage = new FakeStorage(), languageFetcher = localeJsonFetcher }) {
  const document = new FakeDocument();
  const root = document.createElement("section");
  const options = mountProfileOptions({
    root,
    catalog: data,
    outputFormat,
    storage,
    view,
    groupId,
    groupHref: (id) => id ? `/builder/services/${id}` : "/builder/services",
    languageFetcher,
  });
  return { root, options, storage };
}

function runtimeGroupLayout(outputFormat, baseProfile) {
  return getProfileOptions({ outputFormat, data: runtimeData }).serviceGroups
    .filter((group) => group.baseProfile === baseProfile)
    .map(({ id, name, serviceIds, defaultRoutes }) => ({
      id, name, serviceIds: [...serviceIds], routes: [...defaultRoutes],
    }));
}

function routedDraftFor(outputFormat, spec, overrides = {}) {
  const onlyRegions = [...(spec.onlyNodeRegions ?? [])];
  const selectedRegions = onlyRegions.length ? onlyRegions : [...(spec.disabledNodeRegions ?? [])];
  const regionMode = onlyRegions.length ? "only" : "exclude";
  let serviceGroups = spec.serviceGroups === undefined
    ? runtimeGroupLayout(outputFormat, spec.baseProfile)
    : structuredClone(spec.serviceGroups);
  const regionIds = new Set(runtimeData.regions.map((region) => region.id));
  const selected = new Set(selectedRegions);
  serviceGroups = serviceGroups.map((group) => ({
    ...group,
    routes: group.routes.filter((route) => {
      if (route === "direct" && spec.allowDirect === false) return false;
      if (route === "other" && regionMode === "only") return false;
      if (!regionIds.has(route)) return true;
      if (regionMode === "only") return selected.has(route);
      return !selected.has(route);
    }),
  }));
  return {
    baseProfile: spec.baseProfile,
    regionMode,
    selectedRegions,
    preferredNodeRegions: [...(spec.preferredNodeRegions ?? [])],
    disabledServices: [...(spec.disabledServices ?? [])],
    preferredServices: [...(spec.preferredServices ?? [])],
    serviceGroups: Object.hasOwn(spec, "serviceGroups") ? serviceGroups : undefined,
    allowDirect: spec.allowDirect,
    failClosed: spec.failClosed,
    language: spec.language,
    ...overrides,
  };
}

function expectedProfileSpec(outputFormat, draft) {
  const template = getProfileOptions({ outputFormat, data: runtimeData }).templates
    .find((item) => item.id === draft.baseProfile);
  if (template?.supportsProfileOptions === false) {
    return { schemaVersion: 1, baseProfile: draft.baseProfile, language: draft.language };
  }
  const spec = {
    schemaVersion: 1,
    baseProfile: draft.baseProfile,
    language: draft.language,
    disabledNodeRegions: draft.regionMode === "exclude" ? [...draft.selectedRegions] : [],
    onlyNodeRegions: draft.regionMode === "only" ? [...draft.selectedRegions] : [],
    preferredNodeRegions: [...draft.preferredNodeRegions],
    disabledServices: [...draft.disabledServices],
    preferredServices: [...draft.preferredServices],
  };
  for (const key of ["allowDirect", "failClosed", "serviceGroups"]) {
    if (draft[key] !== undefined) spec[key] = key === "serviceGroups" ? structuredClone(draft[key]) : draft[key];
  }
  return spec;
}

function renderedOutput(outputFormat, spec) {
  if (outputFormat === "ini") {
    const template = runtimeData.templates.find((item) => item.outputFormat === "ini" && item.id === spec.baseProfile);
    if (template?.supportsProfileOptions === false) {
      return renderIniTemplate(runtimeData.iniTemplates[spec.baseProfile], spec.language, runtimeData);
    }
    return renderIni(solveSubconverterPlan(spec).plan, runtimeData, { language: spec.language });
  }
  return convertInput({
    input: "socks5://127.0.0.1:1080#profile-parity-test",
    format: "proxy",
    spec,
  }).then((result) => result.yaml);
}

test("profile options filter templates and omit controls for a static template", () => {
  const { root, options } = mount();
  const templatePicker = find(root, (node) => node.id === "base-profile");
  assert.deepEqual(templatePicker.options.map((item) => item.value), ["ai-balanced", "ai-strict", "static-ini"]);

  templatePicker.value = "static-ini";
  templatePicker.dispatch("change");

  assert.equal(find(root, (node) => node.name === "region-mode"), undefined);
  assert.deepEqual(options.getSpec(), { schemaVersion: 1, baseProfile: "static-ini", language: "en" });
});

test("static YAML templates can collect provider options and stale controls cannot mutate the new render", () => {
  const data = catalog();
  data.templates.find((template) => template.id === "static-yaml").supportsRuleProviderOptions = true;
  data.customRuleProviderLimits = { maxProviders: 2, maxUrlLength: 400 };
  const { root, options } = mount(new FakeStorage(), () => {}, "yaml", data);
  const staleAdd = control(root, "custom-rule-provider-add");

  change(root, "base-profile", "static-yaml");
  assert.deepEqual(options.getSpec(), { schemaVersion: 1, baseProfile: "static-yaml", language: "en" });

  staleAdd.dispatch("click");
  assert.equal(Object.hasOwn(options.getSpec(), "customRuleProviders"), false);

  click(root, "custom-rule-provider-add");
  change(root, "custom-rule-provider-url-0", "https://rules.example/custom.yaml");
  change(root, "custom-rule-provider-behavior-0", "domain");
  change(root, "custom-rule-provider-target-0", "reject");
  change(root, "adblock-setting", "enabled");
  assert.deepEqual(options.getSpec(), {
    schemaVersion: 1,
    baseProfile: "static-yaml",
    language: "en",
    adblock: true,
    customRuleProviders: [{ url: "https://rules.example/custom.yaml", behavior: "domain", target: "reject" }],
  });
});

test("service customization is opt-in, explains the output scope, and selection/search do not change routing", () => {
  const changes = [];
  const { root } = mount(new FakeStorage(), () => {}, "ini", catalog(), (spec) => changes.push(spec));
  const disclosure = control(root, "service-group-customization");
  assert.equal(disclosure.tagName, "details");
  assert.equal(disclosure.open, false);
  assert.ok(disclosure.className.split(/\s+/u).includes("service-group-customization"));
  assert.ok(find(root, (node) => node.dataset.i18n === "iniTemplateScope"));
  assert.deepEqual(changes, []);

  openDetails(root, "service-group-customization");
  selectServiceGroup(root, "openai-services");
  const search = control(root, "service-group-search");
  search.value = "google";
  search.dispatch("input");

  assert.equal(control(root, "service-group-customization").open, true);
  assert.equal(control(root, "service-group-select-openai-services").hidden, true);
  assert.equal(control(root, "service-group-select-google-services").hidden, false);
  assert.deepEqual(changes, []);
});

test("service group radios support arrow, Home, End, Space, roving focus, and preserve the disclosure", () => {
  const { root } = mount();
  openDetails(root, "service-group-customization");
  const groupList = control(root, "service-group-list");
  assert.equal(groupList.getAttribute("role"), "radiogroup");
  assert.equal(groupList.getAttribute("aria-label"), "Groups");

  const claude = control(root, "service-group-select-claude-guard");
  assert.equal(claude.getAttribute("role"), "radio");
  assert.equal(claude.getAttribute("aria-checked"), "true");
  assert.equal(claude.tabIndex, 0);
  claude.focus();
  claude.dispatch("keydown", { key: "ArrowDown" });

  const openai = control(root, "service-group-select-openai-services");
  assert.equal(openai.getAttribute("aria-checked"), "true");
  assert.equal(openai.tabIndex, 0);
  assert.equal(control(root, "service-group-select-claude-guard").tabIndex, -1);
  assert.equal(root.ownerDocument.activeElement.id, openai.id);
  assert.equal(control(root, "service-group-customization").open, true);

  openai.dispatch("keydown", { key: "End" });
  assert.equal(control(root, "service-group-select-google-services").getAttribute("aria-checked"), "true");
  control(root, "service-group-select-google-services").dispatch("keydown", { key: "Home" });
  assert.equal(control(root, "service-group-select-claude-guard").getAttribute("aria-checked"), "true");
  control(root, "service-group-select-claude-guard").dispatch("keydown", { key: "ArrowLeft" });
  const google = control(root, "service-group-select-google-services");
  assert.equal(google.getAttribute("aria-checked"), "true");
  google.dispatch("keydown", { key: " " });
  assert.equal(control(root, "service-group-select-google-services").getAttribute("aria-checked"), "true");
  assert.equal(control(root, "service-group-customization").open, true);
});

test("empty only-region mode identifies its translation key and keeps the callback contract", () => {
  const changes = [];
  const { root, options } = mount(new FakeStorage(), () => {}, "ini", catalog(), (spec) => changes.push(spec));
  const onlyMode = find(root, (node) => node.name === "region-mode" && node.value === "only");
  onlyMode.checked = true;
  onlyMode.dispatch("change");

  assert.equal(changes.at(-1), null);
  assert.throws(() => options.getSpec(), (error) => error.translationKey === "onlyRequiresRegion");
});

test("shared controls keep typed policy state, persist only nonsecret preferences, and include selected language", async () => {
  const storage = new FakeStorage();
  storage.setItem(profilePreferencesStorageKey, JSON.stringify({ token: "private-token", input: "proxy credential", preferredNodeRegions: [] }));
  const { root, options } = mount(storage);
  const onlyMode = find(root, (node) => node.name === "region-mode" && node.value === "only");
  onlyMode.checked = true;
  onlyMode.dispatch("change");

  const us = find(root, (node) => node.tagName === "input" && node.type === "checkbox" && node.value === "us");
  us.checked = true;
  us.dispatch("change");
  const spec = options.getSpec();
  assert.deepEqual(spec.onlyNodeRegions, ["us"]);
  assert.deepEqual(spec.preferredNodeRegions, []);

  const service = find(root, (node) => node.id === "service-chatgpt");
  service.checked = false;
  service.dispatch("change");
  const direct = find(root, (node) => node.id === "allow-direct");
  direct.checked = true;
  direct.dispatch("change");
  const failClosed = find(root, (node) => node.id === "fail-closed");
  failClosed.checked = false;
  failClosed.dispatch("change");
  const advanced = find(root, (node) => node.className === "profile-subsection profile-advanced");
  advanced.open = true;
  advanced.dispatch("toggle");
  const serviceAfterToggle = find(root, (node) => node.id === "service-chatgpt");
  serviceAfterToggle.checked = false;
  serviceAfterToggle.dispatch("change");

  await setLanguage("zh-Hant", storage, { fetcher: localeJsonFetcher });
  options.setLanguage();
  const saved = JSON.parse(storage.getItem(profilePreferencesStorageKey));
  const finalSpec = options.getSpec();
  assert.deepEqual(finalSpec.onlyNodeRegions, ["us"]);
  assert.deepEqual(finalSpec.disabledServices, ["chatgpt"]);
  assert.equal(finalSpec.allowDirect, true);
  assert.equal(finalSpec.failClosed, false);
  assert.equal(finalSpec.language, "zh-Hant");
  assert.equal(find(root, (node) => node.className === "profile-subsection profile-advanced").open, true);
  assert.ok(!Object.hasOwn(saved, "language"));
  assert.ok(!Object.hasOwn(saved, "input"));
  assert.ok(!Object.hasOwn(saved, "token"));
});

test("loading a legacy spec preserves omitted direct and fail-closed behavior", async () => {
  const { options, root } = mount();
  await options.applySpec({ baseProfile: "ai-balanced", disabledNodeRegions: ["jp"] });
  const spec = options.getSpec();
  assert.deepEqual(spec.disabledNodeRegions, ["jp"]);
  assert.ok(!Object.hasOwn(spec, "allowDirect"));
  assert.ok(!Object.hasOwn(spec, "failClosed"));
  assert.equal(control(root, "allow-direct").indeterminate, true);
  assert.equal(control(root, "fail-closed").indeterminate, true);
  assert.equal(control(root, "allow-direct").getAttribute("aria-describedby"), "direct-inherited-help");
});

test("loading a managed INI profile restores its exported comment language", async () => {
  const languages = [];
  const { options } = mount(new FakeStorage(), (language) => languages.push(language));
  await options.applySpec({ baseProfile: "ai-balanced", language: "zh-Hans" });

  assert.deepEqual(languages, ["zh-Hans"]);
  assert.equal(options.getSpec().language, "zh-Hans");
});

test("related Google services retain distinct names in independent controls", async () => {
  await setLanguage("zh-Hant", new FakeStorage(), { fetcher: localeJsonFetcher, persist: false });
  const document = new FakeDocument();
  const root = document.createElement("section");
  const data = catalog();
  data.services = [
    { id: "gemini", name: "Google AI" },
    { id: "notebooklm", name: "Google AI" },
    { id: "android-studio-ai", name: "Google AI" },
    { id: "vertex-ai", name: "Google AI" },
  ];
  mountProfileOptions({ root, catalog: data, outputFormat: "ini", languageFetcher: localeJsonFetcher });

  const actualLabels = data.services.map((service) => {
    const input = find(root, (node) => node.id === `service-${service.id}`);
    return input?.parentNode?.lastChild?.textContent;
  });
  assert.deepEqual(actualLabels, ["Google Gemini", "Google NotebookLM", "Android Studio AI", "Google Vertex AI"]);
});

test("YAML template choices are filtered and carry language without static policy controls", async () => {
  const storage = new FakeStorage();
  await setLanguage("en", storage, { fetcher: localeJsonFetcher });
  const { root, options } = mount(storage, () => {}, "yaml");
  assert.ok(find(root, (node) => node.dataset.i18n === "yamlTemplateScope"));
  const templatePicker = find(root, (node) => node.id === "base-profile");
  assert.deepEqual(templatePicker.options.map((item) => item.value), ["ai-balanced", "ai-strict", "static-yaml"]);
  templatePicker.value = "static-yaml";
  templatePicker.dispatch("change");

  assert.equal(find(root, (node) => node.name === "region-mode"), undefined);
  assert.deepEqual(options.getSpec(), { schemaVersion: 1, baseProfile: "static-yaml", language: "en" });
});

test("service controls honor output format metadata while retaining legacy catalog entries", () => {
  const document = new FakeDocument();
  const root = document.createElement("section");
  const data = catalog();
  data.services = [
    { id: "ini-only", name: "INI only", outputFormats: ["ini"] },
    { id: "yaml-only", name: "YAML only", outputFormats: ["yaml"] },
    { id: "legacy", name: "Legacy service" },
  ];
  mountProfileOptions({ root, catalog: data, outputFormat: "yaml", languageFetcher: localeJsonFetcher });

  assert.ok(find(root, (node) => node.id === "service-yaml-only"));
  assert.ok(find(root, (node) => node.id === "service-legacy"));
  assert.equal(find(root, (node) => node.id === "service-ini-only"), undefined);
});

test("service groups support create, rename, related-service moves, route ordering, and deletion", () => {
  const { root, options } = mount();

  click(root, "new-service-group");
  const newName = control(root, "new-service-group-name");
  newName.value = "Google US";
  click(root, "create-service-group");
  selectServiceGroup(root, "custom-1");

  openDetails(root, "group-settings");
  const name = control(root, "service-group-name");
  name.value = "Google Americas";
  click(root, "rename-service-group");

  openDetails(root, "group-route-palette");
  click(root, "route-available-us");
  openDetails(root, "group-route-palette");
  click(root, "route-available-jp");
  click(root, "group-route-jp-moveUp");
  click(root, "group-route-us-remove");
  assert.deepEqual(
    options.getSpec().serviceGroups.find((group) => group.id === "custom-1"),
    { id: "custom-1", name: "Google Americas", serviceIds: [], routes: ["reject", "jp"] },
  );

  openDetails(root, "group-service-palette");
  click(root, "group-service-available-gemini");
  const groups = options.getSpec().serviceGroups;
  assert.deepEqual(groups.find((group) => group.id === "custom-1").serviceIds, ["gemini"]);
  assert.deepEqual(groups.find((group) => group.id === "google-services").serviceIds, ["notebooklm"]);
  assert.equal(find(root, (node) => (node.className ?? "").split(/\s+/u).includes("hint") && node.textContent.includes("Gemini")), undefined);

  openDetails(root, "group-settings");
  click(root, "move-service-group-up");
  assert.equal(control(root, "service-group-select-custom-1").getAttribute("aria-checked"), "true");
  openDetails(root, "group-settings");
  click(root, "delete-service-group");
  assert.equal(options.getSpec().serviceGroups.some((group) => group.id === "custom-1"), false);
  assert.ok(find(root, (node) => (node.className ?? "").split(/\s+/u).includes("hint") && node.textContent.includes("Gemini")));
});

test("Claude account group keeps its identity, membership, and reject route locked", () => {
  const { root } = mount();
  selectServiceGroup(root, "claude-guard");
  openDetails(root, "group-settings");

  assert.equal(control(root, "service-group-name").disabled, true);
  assert.equal(control(root, "rename-service-group").disabled, true);
  assert.equal(control(root, "delete-service-group").disabled, true);
  assert.equal(find(root, (node) => node.className === "group-service-palette"), undefined);
  assert.equal(control(root, "group-service-claude-remove").disabled, true);
  assert.equal(control(root, "service-group-start-reject").disabled, true);
  assert.equal(find(root, (node) => node.id === "group-route-reject"), undefined);
});

test("exit priority separates reject from ordered routes and explains unavailable routes", () => {
  const { root, options } = mount();
  selectServiceGroup(root, "openai-services");

  const startReject = control(root, "service-group-start-reject");
  assert.equal(startReject.disabled, true);
  assert.equal(startReject.checked, true);
  assert.equal(find(root, (node) => node.id === "group-route-reject"), undefined);

  const failClosed = control(root, "fail-closed");
  failClosed.checked = false;
  failClosed.dispatch("change");
  const editableStartReject = control(root, "service-group-start-reject");
  assert.equal(editableStartReject.disabled, false);
  assert.equal(editableStartReject.checked, true);
  editableStartReject.checked = false;
  editableStartReject.dispatch("change");
  assert.deepEqual(options.getSpec().serviceGroups.find((group) => group.id === "openai-services").routes, ["us"]);

  const onlyRegions = find(root, (node) => node.name === "region-mode" && node.value === "only");
  onlyRegions.checked = true;
  onlyRegions.dispatch("change");
  const us = find(root, (node) => node.tagName === "input" && node.type === "checkbox" && node.value === "us");
  us.checked = true;
  us.dispatch("change");
  openDetails(root, "group-route-palette");

  assert.equal(find(root, (node) => node.id === "route-available-jp"), undefined);
  const unavailable = find(root, (node) => node.className === "route-unavailable");
  assert.ok(unavailable);
  assert.ok(walk(unavailable).some((node) => node.textContent.includes("Japan")));
});

test("group, service, and exit searches filter only available choices", () => {
  const { root, options } = mount();
  const groupSearch = control(root, "service-group-search");
  groupSearch.value = "openai";
  groupSearch.dispatch("input");
  assert.equal(control(root, "service-group-select-openai-services").hidden, false);
  assert.equal(control(root, "service-group-select-google-services").hidden, true);
  selectServiceGroup(root, "openai-services");

  openDetails(root, "group-service-palette");
  const serviceSearch = control(root, "group-service-search");
  serviceSearch.value = "notebooklm";
  serviceSearch.dispatch("input");
  assert.equal(control(root, "group-service-available-notebooklm").hidden, false);
  assert.equal(control(root, "group-service-available-gemini").hidden, true);

  openDetails(root, "group-route-palette");
  const routeSearch = control(root, "group-route-search");
  routeSearch.value = "jp";
  routeSearch.dispatch("input");
  assert.equal(control(root, "route-available-jp").hidden, false);
  assert.equal(control(root, "route-available-sg").hidden, true);
  assert.equal(Object.hasOwn(options.getSpec(), "serviceGroups"), false);
});

test("service group layouts persist independently by output format and template", () => {
  const balancedIni = [
    { id: "claude-guard", name: "Claude Account Guard", serviceIds: ["claude"], routes: ["reject"] },
    { id: "openai-services", name: "OpenAI Services", serviceIds: ["chatgpt"], routes: ["reject", "us"] },
    { id: "google-services", name: "Google Services", serviceIds: ["gemini", "notebooklm"], routes: ["reject", "jp"] },
  ];
  const strictIni = [
    { id: "claude-guard", name: "Claude Account Guard", serviceIds: ["claude"], routes: ["reject"] },
    { id: "openai-services", name: "OpenAI Services", serviceIds: ["chatgpt"], routes: ["reject", "jp"] },
    { id: "google-services", name: "Google Services", serviceIds: ["gemini", "notebooklm"], routes: ["reject", "us"] },
  ];
  const balancedYaml = [
    { id: "claude-guard", name: "Claude Account Guard", serviceIds: ["claude"], routes: ["reject"] },
    { id: "openai-services", name: "OpenAI Services", serviceIds: ["chatgpt"], routes: ["reject", "sg"] },
    { id: "google-services", name: "Google Services", serviceIds: ["gemini", "notebooklm"], routes: ["reject", "us"] },
  ];
  const storage = new FakeStorage();
  storage.setItem(profilePreferencesStorageKey, JSON.stringify({
    baseProfile: "ai-balanced",
    serviceGroupsByTemplate: {
      "ini/ai-balanced": balancedIni,
      "ini/ai-strict": strictIni,
      "yaml/ai-balanced": balancedYaml,
    },
  }));

  const ini = mount(storage);
  assert.deepEqual(ini.options.getSpec().serviceGroups, balancedIni);
  selectServiceGroup(ini.root, "openai-services");
  openDetails(ini.root, "group-route-palette");
  click(ini.root, "route-available-jp");
  const editedBalancedIni = balancedIni.map((group) => group.id === "openai-services"
    ? { ...group, routes: ["reject", "us", "jp"] }
    : group);
  assert.deepEqual(ini.options.getSpec().serviceGroups, editedBalancedIni);
  change(ini.root, "base-profile", "ai-strict");
  assert.deepEqual(ini.options.getSpec().serviceGroups, strictIni);
  change(ini.root, "base-profile", "ai-balanced");
  assert.deepEqual(ini.options.getSpec().serviceGroups, editedBalancedIni);

  const yaml = mount(storage, () => {}, "yaml");
  assert.deepEqual(yaml.options.getSpec().serviceGroups, balancedYaml);
  selectServiceGroup(yaml.root, "openai-services");
  openDetails(yaml.root, "group-settings");
  control(yaml.root, "service-group-name").value = "OpenAI YAML Services";
  click(yaml.root, "rename-service-group");
  const editedBalancedYaml = balancedYaml.map((group) => group.id === "openai-services"
    ? { ...group, name: "OpenAI YAML Services" }
    : group);
  assert.deepEqual(yaml.options.getSpec().serviceGroups, editedBalancedYaml);

  const saved = JSON.parse(storage.getItem(profilePreferencesStorageKey));
  assert.deepEqual(saved.serviceGroupsByTemplate["ini/ai-balanced"], editedBalancedIni);
  assert.deepEqual(saved.serviceGroupsByTemplate["ini/ai-strict"], strictIni);
  assert.deepEqual(saved.serviceGroupsByTemplate["yaml/ai-balanced"], editedBalancedYaml);
  assert.equal(Object.hasOwn(saved, "serviceGroupsByFormat"), false);
});

test("routed profile views mount only their own task and expose semantic group navigation", async () => {
  await setLanguage("en", new FakeStorage(), { fetcher: localeJsonFetcher, persist: false });

  const all = mountView({ view: "all" });
  assert.ok(control(all.root, "base-profile"));
  assert.ok(control(all.root, "region-mode-exclude"));
  assert.ok(control(all.root, "service-group-list"));
  assert.ok(control(all.root, "allow-direct"));

  const template = mountView({ view: "template" });
  assert.ok(control(template.root, "base-profile"));
  assert.ok(find(template.root, (node) => node.className === "template-defaults"));
  assert.equal(find(template.root, (node) => node.name === "region-mode"), undefined);
  assert.equal(find(template.root, (node) => node.id === "service-group-list"), undefined);
  assert.equal(find(template.root, (node) => node.id === "allow-direct"), undefined);

  const regions = mountView({ view: "regions" });
  assert.ok(control(regions.root, "region-mode-only"));
  assert.ok(control(regions.root, "region-list"));
  assert.ok(control(regions.root, "prefer-region-picker"));
  assert.equal(find(regions.root, (node) => node.id === "base-profile"), undefined);
  assert.equal(find(regions.root, (node) => node.id === "service-group-list"), undefined);
  assert.equal(find(regions.root, (node) => node.id === "allow-direct"), undefined);

  const services = mountView({ view: "services" });
  const groupList = control(services.root, "service-group-list");
  assert.ok(groupList.children.length > 0);
  assert.ok(groupList.children.every((item) => item.tagName === "a" && item.dataset.editorLink === ""));
  assert.ok(groupList.children.every((item) => item.href === `/builder/services/${item.dataset.groupId}`));
  assert.equal(find(services.root, (node) => node.id === "service-group-name"), undefined);
  assert.equal(find(services.root, (node) => node.id === "service-group-routes"), undefined);
  assert.equal(groupList.getAttribute("role"), "group");

  const group = mountView({ view: "group", groupId: "claude" });
  assert.equal(find(group.root, (node) => node.id === "service-group-list"), undefined);
  assert.ok(control(group.root, "service-group-name"));
  assert.ok(control(group.root, "service-group-routes"));
  assert.equal(find(group.root, (node) => node.className === "group-choice"), undefined);

  const policies = mountView({ view: "policies" });
  assert.ok(control(policies.root, "allow-direct"));
  assert.ok(control(policies.root, "fail-closed"));
  assert.ok(control(policies.root, "service-chatgpt"));
  assert.ok(control(policies.root, "prefer-service-picker"));
  assert.equal(find(policies.root, (node) => node.name === "region-mode"), undefined);
  assert.equal(find(policies.root, (node) => node.id === "service-group-list"), undefined);

  for (const view of ["review", "success"]) {
    const result = mountView({ view });
    const controls = find(result.root, (node) => ["input", "select", "button", "a"].includes(node.tagName));
    assert.equal(controls, undefined, `${view} leaves summary and completion rendering to the page shell`);
  }
});

test("routed group detail refuses an unknown ID instead of silently opening the first group", () => {
  const { root } = mountView({ view: "group", groupId: "removed-group" });

  assert.equal(find(root, (node) => node.id === "service-group-name"), undefined);
  assert.equal(find(root, (node) => node.id === "service-group-list"), undefined);
  assert.ok(walk(root).some((node) => node.textContent.includes("This group is no longer in your draft")));
  const back = find(root, (node) => node.tagName === "a" && node.textContent === "Back to service groups");
  assert.ok(back);
  assert.equal(back.href, "/builder/services");
});

test("invalid only-mode drafts survive route renders and remain directly actionable", async () => {
  const { root, options } = mountView({ view: "review", outputFormat: "yaml" });
  const draft = options.getDraft();
  draft.regionMode = "only";
  draft.selectedRegions = [];
  await options.applyDraft(draft);

  options.setView("regions");
  assert.equal(options.getDraft().regionMode, "only");
  assert.deepEqual(options.getDraft().selectedRegions, []);
  assert.deepEqual(options.validate().map(({ key, section, field }) => ({ key, section, field })), [
    { key: "onlyRequiresRegion", section: "regions", field: "region-list" },
  ]);
  assert.equal(control(root, "region-mode-only").getAttribute("aria-invalid"), "true");
  assert.equal(control(root, "region-validation").hidden, false);
  assert.throws(() => options.getSpec(), (error) => error.translationKey === "onlyRequiresRegion");

  options.setView("template");
  options.setView("review");
  assert.equal(options.getDraft().regionMode, "only");
  assert.deepEqual(options.getDraft().selectedRegions, []);
  assert.equal(options.validate()[0].key, "onlyRequiresRegion");
});

test("a locale-load failure leaves an attempted draft, controls, and active language unchanged", async () => {
  const requests = [];
  const failingLocaleFetcher = async (url, init) => {
    const filename = new URL(url).pathname.split("/").at(-1);
    requests.push(filename);
    if (["zh-Hant.json", "zh-Hans.json"].includes(filename)) {
      return new Response("locale unavailable", { status: 503 });
    }
    return localeJsonFetcher(url, init);
  };
  const storage = new FakeStorage();
  await setLanguage("en", storage, { fetcher: failingLocaleFetcher, persist: false });
  const { root, options } = mountView({ view: "all", outputFormat: "yaml", storage, languageFetcher: failingLocaleFetcher });
  const baseline = {
    ...options.getDraft(),
    regionMode: "exclude",
    selectedRegions: ["hk"],
    preferredNodeRegions: ["sg", "us"],
    disabledServices: ["copilot"],
    preferredServices: ["chatgpt"],
    serviceGroups: runtimeGroupLayout("yaml", "ai-balanced").map((group) => ({
      ...group,
      routes: group.routes.filter((route) => route !== "direct"),
    })),
    allowDirect: false,
    failClosed: true,
    language: "en",
  };
  await options.applyDraft(baseline);
  const beforeDraft = options.getDraft();
  const beforeSpec = options.getSpec();
  const beforeChildren = [...root.children];
  const beforeTemplate = control(root, "base-profile");
  const beforeRegionMode = control(root, "region-mode-exclude");
  const beforeRegion = find(root, (node) => node.tagName === "input" && node.value === "hk");
  const beforeService = control(root, "service-copilot");
  const beforeGroupName = control(root, "service-group-name");
  const beforeGroupNameValue = beforeGroupName.value;
  const beforeHeading = control(root, "region-title");
  const beforeHeadingText = beforeHeading.textContent;

  const candidate = {
    ...beforeDraft,
    baseProfile: "ai-strict",
    regionMode: "only",
    selectedRegions: ["not-a-region"],
    preferredNodeRegions: ["unknown-region"],
    disabledServices: ["unknown-service"],
    preferredServices: ["unknown-service"],
    serviceGroups: [{ id: "candidate-group", name: "Partial candidate", serviceIds: ["unknown-service"], routes: ["unknown-route"] }],
    allowDirect: true,
    failClosed: false,
    language: "zh-Hant",
  };

  await assert.rejects(options.applyDraft(candidate), (error) => error.code === "language_resource_unavailable");

  assert.ok(requests.includes("en.json"), "the unique fetcher serves the English fixture");
  assert.ok(requests.includes("zh-Hant.json"), "the requested locale load fails through that fetcher");
  assert.deepEqual(options.getDraft(), beforeDraft);
  assert.deepEqual(options.getSpec(), beforeSpec);
  assert.equal(getLanguage(storage), "en");
  assert.deepEqual(root.children, beforeChildren, "a failed restore does not replace the existing DOM");
  assert.equal(control(root, "base-profile"), beforeTemplate);
  assert.equal(beforeTemplate.value, "ai-balanced");
  assert.equal(control(root, "region-mode-exclude"), beforeRegionMode);
  assert.equal(beforeRegionMode.checked, true);
  assert.equal(find(root, (node) => node.tagName === "input" && node.value === "hk"), beforeRegion);
  assert.equal(beforeRegion.checked, true);
  assert.equal(control(root, "service-copilot"), beforeService);
  assert.equal(beforeService.checked, false);
  assert.equal(control(root, "service-group-name"), beforeGroupName);
  assert.equal(beforeGroupName.value, beforeGroupNameValue);
  assert.equal(control(root, "region-title"), beforeHeading);
  assert.equal(beforeHeading.textContent, beforeHeadingText);
});

test("routed view changes preserve typed settings, region/service ordering, and group layout", async () => {
  await setLanguage("en", new FakeStorage(), { fetcher: localeJsonFetcher, persist: false });
  const { options } = mountView({ view: "template", outputFormat: "yaml" });
  const layout = runtimeGroupLayout("yaml", "ai-balanced");
  const gemini = layout.find((item) => item.id === "gemini");
  gemini.name = "Google AI US then JP";
  gemini.routes = ["us", "jp", "sg", "reject"];
  const draft = {
    ...options.getDraft(),
    regionMode: "exclude",
    selectedRegions: ["hk"],
    preferredNodeRegions: ["sg", "us", "jp"],
    disabledServices: ["copilot"],
    preferredServices: ["chatgpt", "gemini"],
    serviceGroups: layout,
    allowDirect: false,
    failClosed: true,
  };
  await options.applyDraft(draft);
  const expectedSpec = options.getSpec();
  const expectedDraft = options.getDraft();

  for (const view of ["template", "regions", "services", "group", "policies", "review", "success", "all"]) {
    options.setView(view, view === "group" ? "gemini" : null);
    assert.deepEqual(options.getDraft(), expectedDraft, `draft survives ${view}`);
    assert.deepEqual(options.getSpec(), expectedSpec, `typed profile survives ${view}`);
    const effective = options.getGroups();
    assert.equal(effective.find((item) => item.id === "gemini").name, "Google AI US then JP");
    assert.deepEqual(effective.find((item) => item.id === "gemini").routes, ["reject", "us", "jp", "sg"]);
  }
});

test("real catalog group layouts remain independent when routed template selection changes", async () => {
  await setLanguage("en", new FakeStorage(), { fetcher: localeJsonFetcher, persist: false });
  const { root, options } = mountView({ view: "template", outputFormat: "yaml" });

  options.setView("group", "gemini");
  openDetails(root, "group-settings");
  control(root, "service-group-name").value = "Balanced Google AI";
  click(root, "rename-service-group");
  const balanced = structuredClone(options.getSpec().serviceGroups);
  assert.equal(balanced.find((group) => group.id === "gemini").name, "Balanced Google AI");

  options.setView("template");
  change(root, "base-profile", "ai-strict");
  assert.equal(options.getSpec().baseProfile, "ai-strict");
  options.setView("group", "gemini");
  click(root, "group-route-jp-remove");
  const strict = structuredClone(options.getSpec().serviceGroups);
  assert.equal(strict.find((group) => group.id === "gemini").routes.includes("jp"), false);
  assert.notEqual(strict.find((group) => group.id === "gemini").name, "Balanced Google AI");

  options.setView("template");
  change(root, "base-profile", "ai-balanced");
  assert.deepEqual(options.getSpec().serviceGroups, balanced);
  change(root, "base-profile", "ai-strict");
  assert.deepEqual(options.getSpec().serviceGroups, strict);
});

test("legacy all-options and routed drafts produce identical ProfileSpecs and INI/YAML", async () => {
  const yamlBalanced = runtimeGroupLayout("yaml", "ai-balanced");
  const yamlStrict = runtimeGroupLayout("yaml", "ai-strict");
  // Exercise the account guard with a client draft that omits its reject exit.
  yamlBalanced.find((group) => group.id === runtimeData.accountProtection.serviceId).routes = ["us", "sg"];
  yamlStrict.find((group) => group.id === runtimeData.accountProtection.serviceId).routes = ["sg", "us"];

  const cases = [
    {
      outputFormat: "ini",
      spec: {
        schemaVersion: 1, baseProfile: "ai-balanced", language: "en",
        disabledNodeRegions: ["jp"], onlyNodeRegions: [], preferredNodeRegions: ["us", "sg"],
        disabledServices: ["copilot"], preferredServices: ["chatgpt"],
      },
      name: "legacy INI options preserve omitted direct and fail-closed fields",
    },
    {
      outputFormat: "ini",
      spec: { schemaVersion: 1, baseProfile: "standard", language: "zh-Hant" },
      name: "published static INI template",
    },
    {
      outputFormat: "yaml",
      spec: {
        schemaVersion: 1, baseProfile: "ai-balanced", language: "zh-Hans",
        disabledNodeRegions: [], onlyNodeRegions: ["us", "sg"], preferredNodeRegions: ["sg", "us"],
        disabledServices: ["gemini"], preferredServices: ["chatgpt", "copilot"],
        allowDirect: false, failClosed: false, serviceGroups: yamlBalanced,
      },
      name: "YAML only-region routing, disabled direct, and protected account group",
    },
    {
      outputFormat: "yaml",
      spec: {
        schemaVersion: 1, baseProfile: "ai-strict", language: "zh-Hant",
        disabledNodeRegions: ["jp"], onlyNodeRegions: [], preferredNodeRegions: ["us", "sg"],
        disabledServices: ["chatgpt"], preferredServices: ["copilot"],
        allowDirect: true, failClosed: true, serviceGroups: yamlStrict,
      },
      name: "strict YAML exit order and protected account group",
    },
    {
      outputFormat: "yaml",
      spec: { schemaVersion: 1, baseProfile: "standard", language: "en" },
      name: "published static YAML template",
    },
  ];

  for (const { outputFormat, spec, name } of cases) {
    const draft = routedDraftFor(outputFormat, spec);
    const expected = expectedProfileSpec(outputFormat, draft);
    const legacy = mountView({ view: "all", outputFormat });
    const routed = mountView({ view: "review", outputFormat });
    await legacy.options.applyDraft(draft);
    await routed.options.applyDraft(draft);

    const legacySpec = legacy.options.getSpec();
    const routedSpec = routed.options.getSpec();
    assert.deepEqual(legacySpec, expected, `${name}: legacy UI returns the expected typed contract`);
    assert.deepEqual(routedSpec, expected, `${name}: routed UI returns the expected typed contract`);
    assert.deepEqual(
      normalizeProfileSpec(legacySpec, runtimeData, outputFormat),
      normalizeProfileSpec(routedSpec, runtimeData, outputFormat),
      `${name}: server ProfileSpec normalization is view-independent`,
    );
    assert.deepEqual(legacy.options.getGroups(), routed.options.getGroups(), `${name}: effective group semantics match`);
    assert.deepEqual(await renderedOutput(outputFormat, legacySpec), await renderedOutput(outputFormat, routedSpec), `${name}: renderer output matches`);

    if (spec.serviceGroups) {
      const protectedEntry = runtimeData.serviceGroups.find((group) => group.outputFormat === outputFormat
        && group.baseProfile === spec.baseProfile && group.protected);
      const normalizedProtected = normalizeProfileSpec(legacySpec, runtimeData, outputFormat).serviceGroups
        .find((group) => group.id === protectedEntry.id);
      assert.deepEqual(normalizedProtected.routes, legacySpec.serviceGroups.find((group) => group.id === protectedEntry.id).routes);
      const effectiveProtected = routed.options.getGroups().find((group) => group.id === protectedEntry.id);
      assert.equal(effectiveProtected.routes[0], "reject", `${name}: protected group always starts blocked in the editor model`);
      if (outputFormat === "yaml") {
        const yaml = await renderedOutput(outputFormat, routedSpec);
        const config = YAML.parse(yaml);
        const accountGroup = config["proxy-groups"].find((group) => group.name === runtimeData.accountProtection.protectedGroup);
        assert.equal(accountGroup.proxies[0], runtimeData.accountProtection.rejectGroup, `${name}: rendered account group starts at REJECT`);
      } else {
        const plan = solveSubconverterPlan(routedSpec).plan;
        const accountGroup = plan.sections.flatMap((section) => section.groups ?? [])
          .find((group) => group.name === runtimeData.accountProtection.protectedGroup);
        assert.ok(accountGroup);
        assert.deepEqual(accountGroup.candidates[0], { kind: "group-ref", value: runtimeData.groups.reject });
      }
    } else if (name.startsWith("legacy INI")) {
      assert.equal(Object.hasOwn(legacySpec, "allowDirect"), false);
      assert.equal(Object.hasOwn(legacySpec, "failClosed"), false);
      assert.equal(Object.hasOwn(legacySpec, "serviceGroups"), false);
    }
  }
});
