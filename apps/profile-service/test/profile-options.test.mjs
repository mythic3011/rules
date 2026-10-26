import assert from "node:assert/strict";
import test from "node:test";

import { mountProfileOptions, profilePreferencesStorageKey } from "../public/profile-options.js";
import { setLanguage } from "../public/i18n.mjs";
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

test("profile options filter templates and omit controls for a static template", () => {
  const { root, options } = mount();
  const templatePicker = find(root, (node) => node.id === "base-profile");
  assert.deepEqual(templatePicker.options.map((item) => item.value), ["ai-balanced", "ai-strict", "static-ini"]);

  templatePicker.value = "static-ini";
  templatePicker.dispatch("change");

  assert.equal(find(root, (node) => node.name === "region-mode"), undefined);
  assert.deepEqual(options.getSpec(), { schemaVersion: 1, baseProfile: "static-ini", language: "en" });
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
  const { options } = mount();
  await options.applySpec({ baseProfile: "ai-balanced", disabledNodeRegions: ["jp"] });
  const spec = options.getSpec();
  assert.deepEqual(spec.disabledNodeRegions, ["jp"]);
  assert.ok(!Object.hasOwn(spec, "allowDirect"));
  assert.ok(!Object.hasOwn(spec, "failClosed"));
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
