import { setupLanguagePicker, translate, translateCatalogLabel } from "./i18n.mjs";
import { mountProfileOptions } from "./profile-options.js";

const ERROR_TRANSLATION_KEYS = Object.freeze({
  invalid_node: "converterErrorInvalidNode",
  unsupported_node_scheme: "converterErrorUnsupportedNodeScheme",
  unsupported_node_option: "converterErrorUnsupportedNodeOption",
  conflicting_node_options: "converterErrorConflictingNodeOptions",
  invalid_subscription_url: "converterErrorInvalidSubscriptionUrl",
  subscription_host_not_allowed: "subscriptionHostDisabled",
  subscription_redirect_rejected: "converterErrorSubscriptionRedirectRejected",
  subscription_fetch_failed: "converterErrorSubscriptionFetchFailed",
  unsupported_subscription_format: "converterErrorUnsupportedSubscriptionFormat",
  no_nodes: "converterErrorNoNodes",
  too_many_nodes: "converterErrorTooManyNodes",
  node_too_large: "converterErrorNodeTooLarge",
});

function setStatus(node, message, error = false) {
  node.hidden = !message;
  node.classList.toggle("error", error);
  node.textContent = message;
}

function failureMessage(status) {
  if (status === 403) return "subscriptionHostDisabled";
  if (status === 429) return "tooManyRequests";
  if (status >= 500) return "conversionUnavailable";
  return "conversionFailed";
}

function scrollTo(node) {
  if (!node?.scrollIntoView) return;
  const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  node.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

export function attachConverterUI(elements, fetcher = (url, options) => globalThis.fetch(url, options), getSpec) {
  let activeController = null;
  let requestVersion = 0;
  let statusDescriptor = null;
  let outputNodeCount = null;
  let outputIsStale = false;

  function renderStatus() {
    if (!statusDescriptor) {
      setStatus(elements.status, "");
      delete elements.status.dataset.statusKey;
      delete elements.status.dataset.statusValues;
      return;
    }
    const { key, values, error, reasonKey } = statusDescriptor;
    const translatedValues = reasonKey ? { ...values, reason: translate(reasonKey) } : values;
    setStatus(elements.status, translate(key, translatedValues), error);
    elements.status.dataset.statusKey = key;
    elements.status.dataset.statusValues = JSON.stringify({ ...values, ...(reasonKey ? { reasonKey } : {}) });
  }

  function showMessage(key, values = {}, error = false, reasonKey = null) {
    statusDescriptor = { key, values, error, reasonKey };
    renderStatus();
  }

  function clearMessage() {
    statusDescriptor = null;
    renderStatus();
  }

  function renderOutputSummary() {
    if (!elements.outputSummary) return;
    const key = outputIsStale ? "converterOutputStale" : "converterOutputSummary";
    elements.outputSummary.dataset.i18n = key;
    elements.outputSummary.dataset.state = outputIsStale ? "outdated" : "current";
    elements.outputSummary.textContent = translate(key);
  }

  function renderNodeCount() {
    if (!Number.isSafeInteger(outputNodeCount) || outputNodeCount < 0) {
      elements.nodeCount.textContent = "";
      return;
    }
    const unit = outputNodeCount === 1 ? translate("nodeSingular") : translate("nodePlural");
    elements.nodeCount.textContent = `${outputNodeCount} ${unit}`;
  }

  function currentOutputExists() {
    return typeof elements.output.value === "string" && elements.output.value.length > 0;
  }

  function updateOutputActions() {
    const unavailable = !currentOutputExists() || outputIsStale;
    elements.copyButton.disabled = unavailable;
    elements.downloadButton.disabled = unavailable;
  }

  function setOutputStale(stale) {
    outputIsStale = stale;
    renderOutputSummary();
    updateOutputActions();
  }

  function clearOutput() {
    elements.output.value = "";
    outputNodeCount = null;
    elements.nodeCount.textContent = "";
    elements.outputPanel.hidden = true;
    setOutputStale(false);
  }

  function cancelActiveRequest() {
    const hadActiveRequest = activeController !== null;
    if (hadActiveRequest) {
      requestVersion += 1;
      activeController.abort();
      activeController = null;
    }
    elements.submitButton.disabled = false;
    return hadActiveRequest;
  }

  function focusInput() {
    elements.input.focus?.();
    scrollTo(elements.input);
  }

  function showResponseFailure(status, body, submittedLineCount) {
    const code = typeof body?.error === "string" && Object.hasOwn(ERROR_TRANSLATION_KEYS, body.error)
      ? body.error
      : null;
    const reasonKey = code ? ERROR_TRANSLATION_KEYS[code] : null;
    const statusKey = failureMessage(status);
    const key = status >= 500 || status === 429
      ? statusKey
      : reasonKey ?? statusKey;

    const line = body?.line;
    if (reasonKey
      && status < 500
      && status !== 429
      && Number.isSafeInteger(line)
      && line >= 1
      && line <= submittedLineCount) {
      showMessage("converterLineError", { line }, true, reasonKey);
    } else {
      showMessage(key, {}, true);
    }
    focusInput();
  }

  function invalidateForEdit() {
    const hadActiveRequest = cancelActiveRequest();
    if (currentOutputExists()) {
      elements.outputPanel.hidden = false;
      setOutputStale(true);
      showMessage("converterOutputStale");
    } else {
      clearOutput();
      if (hadActiveRequest) showMessage("converterRequestChanged", {}, true);
      else clearMessage();
    }
  }

  function clear(announce = true) {
    cancelActiveRequest();
    elements.input.value = "";
    elements.format.value = "auto";
    clearOutput();
    if (announce) {
      showMessage("inputCleared");
      elements.input.focus?.();
    } else {
      clearMessage();
    }
  }

  async function copyOutput() {
    if (!currentOutputExists() || outputIsStale || elements.copyButton.disabled) return;
    const version = requestVersion;
    const yaml = elements.output.value;
    try {
      await globalThis.navigator.clipboard.writeText(yaml);
      if (version === requestVersion && !outputIsStale) showMessage("yamlCopied");
    } catch {
      if (version === requestVersion && !outputIsStale) showMessage("clipboardUnavailable", {}, true);
    }
  }

  function downloadOutput() {
    if (!currentOutputExists() || outputIsStale || elements.downloadButton.disabled) return;
    try {
      const blob = new Blob([elements.output.value], { type: "application/yaml;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "converted-profile.yaml";
      anchor.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      showMessage("downloadStarted");
    } catch {
      showMessage("downloadFailed", {}, true);
    }
  }

  async function convert(event) {
    event?.preventDefault?.();
    if (!elements.input.value.trim()) {
      showMessage("inputRequired", {}, true);
      focusInput();
      return;
    }

    cancelActiveRequest();
    const currentVersion = ++requestVersion;
    const requestBody = { input: elements.input.value, format: elements.format.value };
    const submittedLineCount = requestBody.input.split(/\r?\n/u).length;
    if (typeof getSpec === "function") {
      try {
        requestBody.spec = getSpec();
      } catch (error) {
        const key = error?.translationKey === "onlyRequiresRegion" ? "onlyRequiresRegion" : "conversionFailed";
        showMessage(key, {}, true);
        focusInput();
        return;
      }
    }

    const controller = new AbortController();
    activeController = controller;
    elements.submitButton.disabled = true;
    showMessage("converting");

    try {
      const response = await fetcher("/api/v1/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });
      if (currentVersion !== requestVersion) return;
      if (!response.ok) {
        let body = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        if (currentVersion === requestVersion) showResponseFailure(response.status, body, submittedLineCount);
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
          showMessage("invalidConversion", {}, true);
          focusInput();
        }
        return;
      }

      elements.output.value = body.yaml;
      outputNodeCount = body.nodeCount;
      renderNodeCount();
      elements.outputPanel.hidden = false;
      setOutputStale(false);
      showMessage("conversionReady");
      scrollTo(elements.outputPanel);
      elements.outputTitle?.focus?.({ preventScroll: true });
    } catch {
      if (!controller.signal.aborted && currentVersion === requestVersion) {
        showMessage("networkFailed", {}, true);
        focusInput();
      }
    } finally {
      if (currentVersion === requestVersion) {
        elements.submitButton.disabled = false;
        activeController = null;
      }
    }
  }

  elements.form.addEventListener("submit", convert);
  elements.input.addEventListener("input", invalidateForEdit);
  elements.format.addEventListener("change", invalidateForEdit);
  elements.clearButton.addEventListener("click", clear);
  elements.copyButton.addEventListener("click", copyOutput);
  elements.downloadButton.addEventListener("click", downloadOutput);
  updateOutputActions();
  renderOutputSummary();
  return {
    clear,
    convert,
    profileChanged: invalidateForEdit,
    languageChanged() {
      if (activeController || currentOutputExists()) invalidateForEdit();
      renderStatus();
      renderNodeCount();
      renderOutputSummary();
    },
    showMessage,
  };
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
    outputTitle: byId("output-title"),
    outputSummary: byId("converter-output-summary"),
    nodeCount: byId("node-count"),
    copyButton: byId("copy-yaml"),
    downloadButton: byId("download-yaml"),
  };
  elements.submitButton.disabled = true;
  let startupStatus = null;
  const renderStartupStatus = () => {
    if (startupStatus) {
      setStatus(elements.status, translate(startupStatus.key, startupStatus.values), startupStatus.error);
    }
  };
  const showStartupStatus = (key, values = {}, error = false) => {
    startupStatus = { key, values, error };
    renderStartupStatus();
  };
  const reportLanguageError = (error) => {
    const language = translateCatalogLabel("languageNames", error.language, error.language);
    const key = error.code === "language_fallback" ? "languageFallback" : "languageChangeFailed";
    if (converter) converter.showMessage(key, { language }, true);
    else showStartupStatus(key, { language }, true);
  };
  async function initializeConverter() {
    try {
      await setupLanguagePicker(document, () => {
        profileOptions?.setLanguage();
        converter?.languageChanged();
        if (!converter) renderStartupStatus();
      }, reportLanguageError);
    } catch {
      showStartupStatus("conversionUnavailable", {}, true);
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
        onChange: () => converter?.profileChanged(),
        onLanguage: () => converter?.languageChanged(),
      });
      converter = attachConverterUI(elements, undefined, () => profileOptions.getSpec());
      if (startupStatus) converter.showMessage(startupStatus.key, startupStatus.values, startupStatus.error);
      startupStatus = null;
      elements.submitButton.disabled = false;
      globalThis.addEventListener("pagehide", () => converter?.clear(false));
    } catch {
      showStartupStatus("conversionUnavailable", {}, true);
    }
  }
  initializeConverter();
}
