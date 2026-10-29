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
    showResolved(result);
    setStatus("");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function showResolved(result) {
  if (!result || typeof result.ini !== "string" || !result.summary || typeof result.summary !== "object") {
    throw new Error(translate("invalidProfilePreview"));
  }
  $("summary").textContent = JSON.stringify(result.summary, null, 2);
  $("ini-preview").textContent = result.ini;
  $("preview-result").hidden = false;
}

function downloadText(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function agentInstructions() {
  return `# Local ProfileSpec editing instructions

Use a local agent to edit a ProfileSpec JSON file with typed JSON and the current catalog. Never include capability credentials or send them to third parties.

1. Start from a fresh JSON export from the profile builder so existing choices are preserved.
2. Read the current catalog from the same profile service origin with \`GET /api/v1/catalog\`. Use only registered template, region, service, and group IDs; add provider/adblock fields only when the selected template has \`supportsRuleProviderOptions: true\`.
3. Return one raw ProfileSpec JSON object. Do not wrap it in an envelope or write INI/YAML directly.
4. The builder validates imports through \`POST /api/v1/resolve\` before applying the resolver's normalized \`spec\`. A failed preview leaves the current profile untouched.

Supported additional fields:

- \`customRuleProviders\`: optional array of \`{ "url": "https://…", "behavior": "classical" | "domain", "target": "reject" | "direct" | "proxy" }\`. Let the catalog and server preview define the accepted limits and values.
- \`adblock\`: optional boolean. When enabled, it adds the lite adblock rules only.

Custom provider URLs are not fetched by this Worker. Downstream clients fetch them, so use trusted sources and never put credentials in a URL. These additional fields require a template that supports profile options; static templates reject them. If preview rejects a field, report the server error and keep the file unchanged.
`;
}

async function importProfileFile(file) {
  if (!file) return;
  const maxBytes = state.catalog?.profileSpecLimits?.maxJsonBytes;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    setStatus(translate("profileJsonLimitUnavailable"), true);
    return;
  }
  if (file.size > maxBytes) {
    setStatus(translate("profileJsonTooLarge"), true);
    return;
  }
  setStatus(translate("profileJsonValidating"));
  try {
    const result = await api("/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: file,
    });
    // Check the server preview response before changing the current editor.
    if (!result || typeof result.ini !== "string" || !result.summary || typeof result.summary !== "object"
      || !result.spec || typeof result.spec !== "object" || Array.isArray(result.spec)) {
      throw new Error(translate("invalidProfilePreview"));
    }
    await state.options.applySpec(result.spec);
    showResolved(result);
    setStatus(translate("profileJsonImported"));
  } catch (error) {
    setStatus(translate("profileJsonImportFailed", { reason: error.message }), true);
  }
}

function exportProfileJson() {
  try {
    const spec = currentSpec();
    downloadText("openclash-profile.json", `${JSON.stringify(spec, null, 2)}\n`, "application/json;charset=utf-8");
    setStatus(translate("profileJsonExported"));
  } catch (error) {
    setStatus(error.message, true);
  }
}

function downloadAgentInstructions() {
  try {
    downloadText("profile-spec-agent-instructions.md", agentInstructions(), "text/markdown;charset=utf-8");
    setStatus(translate("agentInstructionsDownloaded"));
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
    $("subscription-url").value = `${origin}/p/${result.readToken}.ini`;
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
    $("import-profile-json").addEventListener("click", () => $("profile-json-import-file").click());
    $("profile-json-import-file").addEventListener("change", async (event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      input.value = "";
      await importProfileFile(file);
    });
    $("export-profile-json").addEventListener("click", exportProfileJson);
    $("download-agent-instructions").addEventListener("click", downloadAgentInstructions);
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
