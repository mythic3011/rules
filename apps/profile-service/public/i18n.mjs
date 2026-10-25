export const LANGUAGES = Object.freeze({
  en: { htmlLang: "en" },
  "zh-Hant": { htmlLang: "zh-Hant" },
  "zh-Hans": { htmlLang: "zh-Hans" },
});

const STORAGE_KEY = "profile-service-language";
const localeCacheByFetcher = new WeakMap();
let currentLanguage = "en";
let currentMessages = null;

export class LanguageResourceError extends Error {
  constructor(language, code = "language_resource_unavailable", cause) {
    super(`Language resource unavailable: ${language}`, { cause });
    this.name = "LanguageResourceError";
    this.language = language;
    this.code = code;
  }
}

export function normalizeLanguage(value) {
  return Object.hasOwn(LANGUAGES, value) ? value : "en";
}

function validateDictionary(language, value, reference) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LanguageResourceError(language, "invalid_language_resource");
  }
  const entries = Object.entries(value);
  const isMessage = (message) => typeof message === "string"
    || (message && typeof message === "object" && !Array.isArray(message)
      && Object.values(message).every((entry) => typeof entry === "string"));
  if (!entries.length || entries.some(([, message]) => !isMessage(message))) {
    throw new LanguageResourceError(language, "invalid_language_resource");
  }
  if (reference) {
    const expected = Object.keys(reference).sort();
    const received = entries.map(([key]) => key).sort();
    if (expected.length !== received.length || expected.some((key, index) => key !== received[index])) {
      throw new LanguageResourceError(language, "language_resource_schema_mismatch");
    }
    for (const key of expected) {
      const expectedValue = reference[key];
      const receivedValue = value[key];
      if (typeof expectedValue !== typeof receivedValue) {
        throw new LanguageResourceError(language, "language_resource_schema_mismatch");
      }
      if (typeof expectedValue === "object") {
        const expectedLabels = Object.keys(expectedValue).sort();
        const receivedLabels = Object.keys(receivedValue).sort();
        if (expectedLabels.length !== receivedLabels.length
          || expectedLabels.some((label, index) => label !== receivedLabels[index])) {
          throw new LanguageResourceError(language, "language_resource_schema_mismatch");
        }
      }
    }
  }
  return Object.freeze(Object.fromEntries(entries));
}

function cacheFor(fetcher) {
  if (typeof fetcher !== "function") throw new LanguageResourceError("en", "fetch_unavailable");
  let cache = localeCacheByFetcher.get(fetcher);
  if (!cache) {
    cache = new Map();
    localeCacheByFetcher.set(fetcher, cache);
  }
  return cache;
}

async function fetchDictionary(language, fetcher) {
  const response = await fetcher(new URL(`./locales/${language}.json`, import.meta.url), {
    method: "GET",
    cache: "no-cache",
    headers: { accept: "application/json" },
  });
  if (!response?.ok) throw new LanguageResourceError(language, "language_resource_unavailable");
  let parsed;
  try {
    parsed = await response.json();
  } catch (cause) {
    throw new LanguageResourceError(language, "invalid_language_resource", cause);
  }
  return parsed;
}

function loadLocale(language, fetcher) {
  const cache = cacheFor(fetcher);
  if (cache.has(language)) return cache.get(language);
  const pending = (async () => {
    try {
      if (language === "en") {
        return validateDictionary(language, await fetchDictionary(language, fetcher));
      }
      const [reference, localized] = await Promise.all([
        loadLocale("en", fetcher),
        fetchDictionary(language, fetcher),
      ]);
      return validateDictionary(language, localized, reference);
    } catch (error) {
      if (error instanceof LanguageResourceError) throw error;
      throw new LanguageResourceError(language, "language_resource_unavailable", error);
    }
  })();
  cache.set(language, pending);
  pending.catch(() => {
    if (cache.get(language) === pending) cache.delete(language);
  });
  return pending;
}

export function translate(key, language = currentLanguage, values = {}) {
  if (language && typeof language === "object") {
    values = language;
    language = currentLanguage;
  }
  const selected = normalizeLanguage(language);
  const messages = selected === currentLanguage ? currentMessages : null;
  let message = messages?.[key];
  if (typeof message !== "string") {
    throw new LanguageResourceError(selected, "missing_translation_key");
  }
  for (const [name, value] of Object.entries(values)) {
    message = message.replaceAll(`{${name}}`, String(value));
  }
  return message;
}

export function translateCatalogLabel(collection, id, fallback, language = currentLanguage) {
  const selected = normalizeLanguage(language);
  const messages = selected === currentLanguage ? currentMessages : null;
  return messages?.[collection]?.[id] ?? fallback;
}

export function getLanguage(storage) {
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    if (!storage) return currentLanguage;
    const stored = storage.getItem(STORAGE_KEY);
    return stored ? normalizeLanguage(stored) : currentLanguage;
  } catch {
    return currentLanguage;
  }
}

export async function setLanguage(language, storage, { fetcher = globalThis.fetch, persist = true } = {}) {
  const selected = normalizeLanguage(language);
  const messages = await loadLocale(selected, fetcher);
  currentLanguage = selected;
  currentMessages = messages;
  if (persist) {
    try {
      if (storage === undefined) storage = globalThis.localStorage;
      storage?.setItem(STORAGE_KEY, currentLanguage);
    } catch {
      // Language preference is optional when browser storage is unavailable.
    }
  }
  return currentLanguage;
}

export function applyTranslations(root = document, language = currentLanguage) {
  const selected = normalizeLanguage(language);
  if (selected !== currentLanguage || !currentMessages) {
    throw new LanguageResourceError(selected, "language_resource_not_loaded");
  }
  root.querySelectorAll?.("[data-i18n]").forEach((node) => {
    node.textContent = translate(node.dataset.i18n, selected);
  });
  root.querySelectorAll?.("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", translate(node.dataset.i18nPlaceholder, selected));
  });
  root.querySelectorAll?.("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", translate(node.dataset.i18nAriaLabel, selected));
  });
  root.querySelectorAll?.("[data-language-option]").forEach((node) => {
    const optionLanguage = normalizeLanguage(node.dataset.languageOption);
    node.textContent = translateCatalogLabel("languageNames", optionLanguage, optionLanguage, selected);
  });
  if (root.documentElement) {
    root.documentElement.lang = LANGUAGES[selected].htmlLang;
    root.documentElement.dataset.i18nReady = "true";
  }
  const picker = root.getElementById?.("language");
  if (picker) picker.value = selected;
}

export async function setupLanguagePicker(root = document, onChange = () => {}, onError = () => {}, {
  fetcher = globalThis.fetch,
  storage,
} = {}) {
  const picker = root.getElementById?.("language");
  let selected = getLanguage(storage);
  root.documentElement?.setAttribute("data-i18n-ready", "false");
  try {
    await setLanguage(selected, storage, { fetcher });
  } catch (error) {
    if (selected === "en") {
      throw error;
    }
    const failedLanguage = selected;
    try {
      selected = await setLanguage("en", storage, { fetcher });
    } catch (fallbackError) {
      onError(fallbackError);
      throw fallbackError;
    }
    onError(new LanguageResourceError(failedLanguage, "language_fallback", error));
  }
  applyTranslations(root, selected);

  if (picker) {
    let requestVersion = 0;
    picker.addEventListener("change", async () => {
      const requested = normalizeLanguage(picker.value);
      const version = ++requestVersion;
      if (requested === currentLanguage) {
        applyTranslations(root, currentLanguage);
        root.documentElement?.setAttribute("aria-busy", "false");
        return;
      }
      root.documentElement?.setAttribute("data-i18n-ready", "false");
      root.documentElement?.setAttribute("aria-busy", "true");
      try {
        const messages = await loadLocale(requested, fetcher);
        if (version !== requestVersion) return;
        currentLanguage = requested;
        currentMessages = messages;
        try {
          if (storage === undefined) storage = globalThis.localStorage;
          storage?.setItem(STORAGE_KEY, requested);
        } catch {
          // Language preference is optional when browser storage is unavailable.
        }
        applyTranslations(root, requested);
        await onChange(requested);
      } catch (error) {
        if (version !== requestVersion) return;
        picker.value = currentLanguage;
        onError(error instanceof LanguageResourceError
          ? error
          : new LanguageResourceError(requested, "language_resource_unavailable", error));
      } finally {
        if (version === requestVersion) {
          root.documentElement?.setAttribute("aria-busy", "false");
          root.documentElement?.setAttribute("data-i18n-ready", "true");
        }
      }
    });
  }
  return selected;
}

export const languageStorageKey = STORAGE_KEY;
