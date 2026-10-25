import { setupLanguagePicker, translate, translateCatalogLabel } from "./i18n.mjs";
import { mountProfileOptions } from "./profile-options.js";

function setStatus(node, message, error = false) {
  node.hidden = !message;
  node.classList.toggle("error", error);
  node.textContent = message;
}

function failureMessage(status) {
  if (status === 403) return translate("subscriptionHostDisabled");
  if (status === 429) return translate("tooManyRequests");
  if (status >= 500) return translate("conversionUnavailable");
  return translate("conversionFailed");
}

export function attachConverterUI(elements, fetcher = (url, options) => globalThis.fetch(url, options), getSpec) {
  let activeController = null;
  let requestVersion = 0;

  function clear(announce = true) {
    requestVersion += 1;
    activeController?.abort();
    activeController = null;
    elements.input.value = "";
    elements.format.value = "auto";
    elements.output.value = "";
    elements.nodeCount.textContent = "";
    elements.outputPanel.hidden = true;
    elements.submitButton.disabled = false;
    if (announce) {
      setStatus(elements.status, translate("inputCleared"));
      elements.input.focus?.();
    } else {
      setStatus(elements.status, "");
    }
  }

  async function copyOutput() {
    if (!elements.output.value) return;
    try {
      await globalThis.navigator.clipboard.writeText(elements.output.value);
      setStatus(elements.status, translate("yamlCopied"));
    } catch {
      setStatus(elements.status, translate("clipboardUnavailable"), true);
    }
  }

  function downloadOutput() {
    if (!elements.output.value) return;
    try {
      const blob = new Blob([elements.output.value], { type: "application/yaml;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "converted-profile.yaml";
      anchor.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setStatus(elements.status, translate("downloadStarted"));
    } catch {
      setStatus(elements.status, translate("downloadFailed"), true);
    }
  }

  async function convert(event) {
    event?.preventDefault?.();
    if (!elements.input.value.trim()) {
      setStatus(elements.status, translate("inputRequired"), true);
      elements.input.focus?.();
      return;
    }

    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const currentVersion = ++requestVersion;
    elements.submitButton.disabled = true;
    elements.output.value = "";
    elements.nodeCount.textContent = "";
    elements.outputPanel.hidden = true;
    setStatus(elements.status, translate("converting"));

    try {
      const requestBody = { input: elements.input.value, format: elements.format.value };
      if (typeof getSpec === "function") requestBody.spec = getSpec();
      const response = await fetcher("/api/v1/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });
      if (currentVersion !== requestVersion) return;
      if (!response.ok) {
        setStatus(elements.status, failureMessage(response.status), true);
        return;
      }

      let body;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (
        currentVersion !== requestVersion ||
        typeof body?.yaml !== "string" ||
        !body.yaml.trim() ||
        !Number.isSafeInteger(body.nodeCount) ||
        body.nodeCount < 0
      ) {
        if (currentVersion === requestVersion) {
          setStatus(elements.status, translate("invalidConversion"), true);
        }
        return;
      }

      elements.output.value = body.yaml;
      const unit = body.nodeCount === 1 ? translate("nodeSingular") : translate("nodePlural");
      elements.nodeCount.textContent = `${body.nodeCount} ${unit}`;
      elements.outputPanel.hidden = false;
      setStatus(elements.status, translate("conversionReady"));
    } catch {
      if (!controller.signal.aborted && currentVersion === requestVersion) {
        setStatus(elements.status, translate("networkFailed"), true);
      }
    } finally {
      if (currentVersion === requestVersion) {
        elements.submitButton.disabled = false;
        activeController = null;
      }
    }
  }

  elements.form.addEventListener("submit", convert);
  elements.clearButton.addEventListener("click", clear);
  elements.copyButton.addEventListener("click", copyOutput);
  elements.downloadButton.addEventListener("click", downloadOutput);
  return { clear, convert };
}

if (typeof document !== "undefined") {
  const byId = (id) => document.getElementById(id);
  let profileOptions = null;
  let converter = null;
  const elements = {
    form: byId("converter-form"),
    input: byId("converter-input"),
    format: byId("input-format"),
    submitButton: byId("convert-button"),
    clearButton: byId("clear-button"),
    status: byId("converter-status"),
    outputPanel: byId("output-panel"),
    output: byId("converted-yaml"),
    nodeCount: byId("node-count"),
    copyButton: byId("copy-yaml"),
    downloadButton: byId("download-yaml"),
  };
  elements.submitButton.disabled = true;
  const reportLanguageError = (error) => {
    const language = translateCatalogLabel("languageNames", error.language, error.language);
    const key = error.code === "language_fallback" ? "languageFallback" : "languageChangeFailed";
    setStatus(elements.status, translate(key, { language }), true);
  };
  async function initializeConverter() {
    try {
      await setupLanguagePicker(document, () => profileOptions?.setLanguage(), reportLanguageError);
    } catch (error) {
      setStatus(elements.status, error.message, true);
      return;
    }
    try {
      const response = await globalThis.fetch("/api/v1/catalog", { cache: "no-store" });
      if (!response.ok) throw new Error("catalog unavailable");
      const catalog = await response.json();
      profileOptions = mountProfileOptions({
        root: byId("profile-options"),
        catalog,
        outputFormat: "yaml",
      });
      converter = attachConverterUI(elements, undefined, () => profileOptions.getSpec());
      elements.submitButton.disabled = false;
      globalThis.addEventListener("pagehide", () => converter?.clear(false));
    } catch {
      setStatus(elements.status, translate("conversionUnavailable"), true);
    }
  }
  initializeConverter();
}
