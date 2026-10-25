import { applyTranslations, setupLanguagePicker, translate, translateCatalogLabel } from "./i18n.mjs";
import { mountProfileOptions } from "./profile-options.js";

const state = {
  catalog: null,
  options: null,
  managed: null,
};

const $ = (id) => document.getElementById(id);

function setStatus(message, error = false) {
  const node = $("status");
  node.hidden = !message;
  node.classList.toggle("error", error);
  node.textContent = message || "";
}

function setButtonTranslation(button, key) {
  button.dataset.i18n = key;
  button.textContent = translate(key);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `HTTP ${response.status}`);
  return body;
}

function currentSpec() {
  return state.options.getSpec();
}

async function preview() {
  setStatus(translate("resolving"));
  try {
    const result = await api("/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: currentSpec() }),
    });
    $("summary").textContent = JSON.stringify(result.summary, null, 2);
    $("ini-preview").textContent = result.ini;
    $("preview-result").hidden = false;
    setStatus("");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function save() {
  const updating = Boolean(state.managed);
  setStatus(translate(updating ? "updating" : "creating"));
  try {
    const spec = currentSpec();
    const path = updating ? `/api/v1/profiles/${state.managed.id}` : "/api/v1/profiles";
    const headers = { "content-type": "application/json" };
    if (updating) headers.authorization = `Bearer ${state.managed.token}`;
    const result = await api(path, {
      method: updating ? "PUT" : "POST",
      headers,
      body: JSON.stringify({ spec }),
    });

    if (updating) {
      setStatus(translate("savedRevision", { revision: result.revision }));
      return;
    }

    const origin = location.origin;
    $("subscription-url").value = `${origin}/p/${result.readToken}`;
    $("manage-url").value = `${origin}/manage?id=${encodeURIComponent(result.id)}#${result.manageToken}`;
    $("result").hidden = false;
    setStatus(translate("subscriptionCreated"));
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadManagedIfPresent() {
  if (location.pathname !== "/manage") return;
  const id = new URL(location.href).searchParams.get("id");
  const fragmentToken = location.hash.slice(1);
  if (id && fragmentToken) {
    sessionStorage.setItem(`profile-manage:${id}`, fragmentToken);
    history.replaceState(null, "", `${location.pathname}?id=${encodeURIComponent(id)}`);
  }
  const token = fragmentToken || (id ? sessionStorage.getItem(`profile-manage:${id}`) : null);
  if (!id || !token) {
    setStatus(translate("missingManagement"), true);
    return;
  }
  try {
    const result = await api(`/api/v1/profiles/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    state.managed = { id, token };
    await state.options.applySpec(result.spec);
    setButtonTranslation($("save"), "saveChanges");
    setStatus(translate("loadedRevision", { revision: result.revision }));
  } catch (error) {
    setStatus(error.message, true);
  }
}

function reportLanguageError(error) {
  const language = translateCatalogLabel("languageNames", error.language, error.language);
  const key = error.code === "language_fallback" ? "languageFallback" : "languageChangeFailed";
  setStatus(translate(key, { language }), true);
}

async function init() {
  try {
    await setupLanguagePicker(document, () => state.options?.setLanguage(), reportLanguageError);
  } catch (error) {
    setStatus(error.message, true);
    return;
  }
  try {
    state.catalog = await api("/api/v1/catalog");
    state.options = mountProfileOptions({
      root: $("profile-options"),
      catalog: state.catalog,
      outputFormat: "ini",
      onLanguage: (language) => applyTranslations(document, language),
    });
    $("preview").addEventListener("click", preview);
    $("save").addEventListener("click", save);
    for (const button of document.querySelectorAll("[data-copy]")) {
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText($(button.dataset.copy).value);
          setStatus(translate("copied"));
        } catch {
          setStatus(translate("clipboardUnavailable"), true);
        }
      });
    }
    await loadManagedIfPresent();
  } catch (error) {
    setStatus(error.message, true);
  }
}

init();
