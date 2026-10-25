import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LANGUAGES,
  getLanguage,
  languageStorageKey,
  setLanguage,
  setupLanguagePicker,
  translate,
  translateCatalogLabel,
} from "../public/i18n.mjs";
import { localeJsonFetcher } from "./ui-locale-fixtures.mjs";

function response(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

class FakePicker {
  constructor() {
    this.id = "language";
    this.value = "en";
    this.listeners = new Map();
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  async change(value) {
    this.value = value;
    return this.listeners.get("change")?.();
  }
}

class FakeDocument {
  constructor() {
    this.documentElement = {
      lang: "en",
      dataset: {},
      setAttribute(name, value) {
        const dataName = name.startsWith("data-")
          ? name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())
          : name;
        this.dataset[dataName] = value;
      },
    };
    this.picker = new FakePicker();
    this.localizedNode = { dataset: { i18n: "regionRouting" }, textContent: "" };
    this.languageOptions = ["en", "zh-Hant", "zh-Hans"].map((language) => ({
      dataset: { languageOption: language },
      textContent: language,
    }));
    this.input = { id: "converter-input", value: "" };
    this.output = { id: "converted-yaml", value: "" };
    this.nodes = [this.localizedNode, ...this.languageOptions];
  }

  getElementById(id) {
    return id === "language" ? this.picker : null;
  }

  querySelectorAll(selector) {
    if (selector === "[data-i18n]") return [this.localizedNode];
    if (selector === "[data-language-option]") return this.languageOptions;
    return [];
  }
}

class FakeStorage {
  constructor(language = null) {
    this.value = language;
  }

  getItem() { return this.value; }
  setItem(_key, value) { this.value = value; }
}

async function readLocale(language) {
  return readFile(new URL(`../public/locales/${language}.json`, import.meta.url), "utf8");
}

test("locale JSON loads at runtime and interpolated messages use the active locale", async () => {
  const storage = new FakeStorage();
  await setLanguage("zh-Hant", storage, { fetcher: localeJsonFetcher });

  assert.equal(translate("savedRevision", { revision: 7 }), "已儲存 revision 7。現有 subscription URL 仍然有效。");
  assert.equal(translateCatalogLabel("templateNames", "standard", "Standard"), "標準版");
  assert.equal(translateCatalogLabel("serviceNames", "gemini", "Google AI"), "Google Gemini");
  assert.deepEqual(Object.keys(LANGUAGES), ["en", "zh-Hant", "zh-Hans"]);
  assert.equal(getLanguage(storage), "zh-Hant");
});

test("a missing saved locale reports the failure and explicitly activates English", async () => {
  const storage = new FakeStorage("zh-Hans");
  const root = new FakeDocument();
  const failures = [];
  const status = { textContent: "" };
  const fetcher = async (url, options) => {
    if (new URL(url).pathname.endsWith("/zh-Hans.json")) return response("not found", 404);
    return localeJsonFetcher(url, options);
  };

  await setupLanguagePicker(root, () => {}, (error) => {
    failures.push(error);
    const key = error.code === "language_fallback" ? "languageFallback" : "languageChangeFailed";
    const language = translateCatalogLabel("languageNames", error.language, error.language);
    status.textContent = translate(key, { language });
  }, { fetcher, storage });

  assert.equal(failures[0].code, "language_fallback");
  assert.match(status.textContent, /Could not load Simplified Chinese strings/);
  assert.equal(root.localizedNode.textContent, "Region routing");
  assert.equal(root.languageOptions[2].textContent, "Simplified Chinese");
  assert.notEqual(root.localizedNode.textContent, "regionRouting");
  assert.equal(root.picker.value, "en");
  assert.equal(getLanguage(storage), "en");
  assert.equal(root.documentElement.dataset.i18nReady, "true");

  await root.picker.change("zh-Hans");
  assert.equal(failures[1].code, "language_resource_unavailable");
  assert.match(status.textContent, /current language is unchanged/);
  assert.equal(root.localizedNode.textContent, "Region routing");
  assert.equal(root.picker.value, "en");
  assert.equal(root.documentElement.dataset.i18nReady, "true");
});

test("fast locale changes use the newest response and preserve converter input and output", async () => {
  const en = await readLocale("en");
  const hant = await readLocale("zh-Hant");
  const hans = await readLocale("zh-Hans");
  const pending = new Map();
  const fetcher = async (url) => {
    const name = new URL(url).pathname.split("/").at(-1);
    if (name === "en.json") return response(en);
    return new Promise((resolve) => pending.set(name, resolve));
  };
  const storage = new FakeStorage("en");
  const root = new FakeDocument();
  root.input.value = "socks5://name:secret@proxy.example:1080";
  root.output.value = "proxies:\n  - name: private-node";

  await setupLanguagePicker(root, () => {}, () => assert.fail("unexpected locale error"), { fetcher, storage });
  const older = root.picker.change("zh-Hant");
  const newer = root.picker.change("zh-Hans");
  pending.get("zh-Hans.json")(response(hans));
  await newer;
  pending.get("zh-Hant.json")(response(hant));
  await older;

  assert.equal(root.picker.value, "zh-Hans");
  assert.equal(root.documentElement.lang, "zh-Hans");
  assert.equal(root.localizedNode.textContent, "地区路由");
  assert.equal(root.languageOptions[1].textContent, "繁體中文");
  assert.equal(root.documentElement.dataset.i18nReady, "true");
  assert.equal(root.input.value, "socks5://name:secret@proxy.example:1080");
  assert.equal(root.output.value, "proxies:\n  - name: private-node");
  assert.equal(storage.value, "zh-Hans");
});

test("language preference uses its dedicated nonsecret storage key", () => {
  assert.equal(languageStorageKey, "profile-service-language");
});

test("returning to the active locale cancels an older pending language selection", async () => {
  let finish;
  const fetcher = async (url, options) => new URL(url).pathname.endsWith("/zh-Hant.json")
    ? new Promise((resolve) => { finish = resolve; })
    : localeJsonFetcher(url, options);
  const root = new FakeDocument();
  const storage = new FakeStorage("en");
  await setupLanguagePicker(root, () => {}, () => assert.fail("unexpected locale error"), { fetcher, storage });
  const pending = root.picker.change("zh-Hant");
  await root.picker.change("en");
  assert.equal(root.documentElement.dataset.i18nReady, "true");
  finish(response(await readLocale("zh-Hant")));
  await pending;
  assert.equal(root.documentElement.lang, "en");
  assert.equal(root.picker.value, "en");
  assert.equal(storage.value, "en");
});

test("all static and direct-code UI translation keys exist in every JSON locale", async () => {
  const files = [
    "../public/index.html",
    "../public/converter.html",
    "../public/app.js",
    "../public/converter.js",
    "../public/profile-options.js",
    "../public/service-group-editor.js",
  ];
  const keys = new Set();
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    for (const [, key] of source.matchAll(/data-i18n(?:-aria-label|-placeholder)="([^"]+)"/gu)) keys.add(key);
    for (const [, key] of source.matchAll(/translate\(["\x27]([^"\x27]+)["\x27]/gu)) keys.add(key);
    for (const [, key] of source.matchAll(/child\(document,\s*["\x27][^"\x27]+["\x27],\s*undefined,\s*["\x27]([^"\x27]+)["\x27]/gu)) keys.add(key);
    for (const [, key] of source.matchAll(/appendHint\(document,\s*[^,]+,\s*["\x27]([^"\x27]+)["\x27]/gu)) keys.add(key);
  }

  for (const language of Object.keys(LANGUAGES)) {
    await setLanguage(language, undefined, { fetcher: localeJsonFetcher, persist: false });
    for (const key of keys) assert.doesNotThrow(() => translate(key), `${language}:${key}`);
  }
});
