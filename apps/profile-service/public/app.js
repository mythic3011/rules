import { applyTranslations, setupLanguagePicker, translate, translateCatalogLabel } from "./i18n.mjs";
import { mountProfileOptions } from "./profile-options.js";

const isManagementPage = location.pathname === "/manage";
const state = {
  catalog: null,
  options: null,
  managed: null,
  managementLoad: isManagementPage ? "loading" : "not-required",
  initialFingerprint: null,
  savedFingerprint: null,
  currentFingerprint: null,
  savedRevision: null,
  draftInvalid: false,
  draftDirty: false,
  validationKey: null,
  previewSnapshot: null,
  previewRequest: 0,
  pendingPreview: false,
  pendingSave: false,
  status: null,
  resultCreated: false,
  resultSpec: null,
};

const $ = (id) => document.getElementById(id);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(spec) {
  return stableJson(spec);
}

function reveal(node) {
  if (!node) return;
  const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  node.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  try {
    node.focus({ preventScroll: true });
  } catch {
    node.focus?.();
  }
}

function renderStatus() {
  const node = $("status");
  if (!node) return;
  const { key, values = {}, error = false } = state.status ?? {};
  node.hidden = !key;
  node.classList.toggle("error", Boolean(error));
  node.dataset.state = error ? "error" : key ? "message" : "empty";
  node.textContent = key ? translate(key, values) : "";
}

function setStatus(key, values = {}, error = false, shouldReveal = false) {
  state.status = key ? { key, values, error } : null;
  renderStatus();
  if (shouldReveal && key) reveal($("status"));
}

function renderEditorState() {
  const node = $("editor-state");
  const savedNote = $("saved-state-note");
  if (!node) return;

  let key;
  let dataState;
  if (isManagementPage && state.managementLoad === "loading") {
    key = "editorLoading";
    dataState = "loading";
  } else if (isManagementPage && state.managementLoad !== "loaded") {
    key = "editorLoadFailed";
    dataState = "load-failed";
  } else if (!isManagementPage && state.savedFingerprint === null && !state.draftDirty && !state.draftInvalid) {
    key = "editorDraft";
    dataState = "draft";
  } else if (state.validationKey) {
    key = state.validationKey;
    dataState = "invalid";
  } else if (state.draftDirty) {
    key = "editorDirty";
    dataState = "dirty";
  } else {
    key = "editorReady";
    dataState = "clean";
  }
  node.dataset.state = dataState;
  node.textContent = translate(key);

  if (savedNote) {
    const hasSavedRevision = state.savedRevision !== null && state.savedRevision !== undefined;
    savedNote.hidden = !hasSavedRevision;
    savedNote.dataset.state = state.draftDirty || state.draftInvalid ? "dirty" : "clean";
    savedNote.textContent = hasSavedRevision
      ? translate("editorSavedRevision", { revision: state.savedRevision })
      : "";
  }

  const resultNote = $("saved-result-state");
  if (resultNote) {
    resultNote.hidden = !state.resultCreated || state.savedRevision === null;
    resultNote.dataset.state = state.draftDirty || state.draftInvalid ? "dirty" : "clean";
    resultNote.textContent = resultNote.hidden
      ? ""
      : translate("resultUrlsSavedRevision", { revision: state.savedRevision });
  }
  const failClosedNote = $("result-fail-closed");
  if (failClosedNote) failClosedNote.hidden = !state.resultCreated || state.resultSpec?.failClosed !== true;
}

function renderPreviewState() {
  const stateNode = $("preview-state");
  const label = $("preview-state-label");
  const help = $("preview-state-help");
  const panel = $("preview-result");
  if (!stateNode || !label || !help) return;

  if (!state.previewSnapshot) {
    stateNode.dataset.state = "not-run";
    label.textContent = translate("previewNotRun");
    help.hidden = true;
    help.textContent = "";
    if (panel) panel.hidden = true;
    return;
  }

  const matchesDraft = !state.draftInvalid
    && state.currentFingerprint !== null
    && state.currentFingerprint === state.previewSnapshot.fingerprint;
  stateNode.dataset.state = matchesDraft ? "current" : "outdated";
  label.textContent = translate(matchesDraft ? "previewCurrent" : "previewOutdated");
  help.hidden = matchesDraft;
  help.textContent = matchesDraft ? "" : translate("previewOutdatedHelp");
  if (panel) panel.hidden = false;
  renderReadableSummary(state.previewSnapshot.summary, state.previewSnapshot.spec);
}

function serviceLabel(service) {
  return translateCatalogLabel("serviceNames", service.id, service.name ?? service.id);
}

function regionLabel(region) {
  if (typeof region === "string") {
    const catalogRegion = state.catalog?.regions?.find((item) => item.id === region);
    return translateCatalogLabel("regionNames", region, catalogRegion?.name ?? region);
  }
  return translateCatalogLabel("regionNames", region?.id, region?.name ?? region?.id ?? "");
}

function renderReadableSummary(summary, spec) {
  const list = $("preview-summary-list");
  if (!list || !summary) return;
  list.replaceChildren();

  const template = translateCatalogLabel(
    "templateNames",
    summary.baseProfile,
    summary.template ?? summary.baseProfile ?? "",
  );
  const disabledRegions = Array.isArray(summary.disabledRegions) ? summary.disabledRegions : [];
  const activeRegions = Array.isArray(summary.activeRegions) ? summary.activeRegions : [];
  const preferredRegions = Array.isArray(summary.preferredRegions) ? summary.preferredRegions : [];
  const disabledServiceIds = Array.isArray(summary.disabledServices) ? summary.disabledServices : [];
  const disabledServiceSet = new Set(disabledServiceIds);
  const catalogServices = (state.catalog?.services ?? [])
    .filter((service) => !Array.isArray(service.outputFormats) || service.outputFormats.includes("ini"));
  const services = catalogServices
    .filter((service) => !disabledServiceSet.has(service.id))
    .map(serviceLabel);
  const disabledServices = catalogServices
    .filter((service) => disabledServiceSet.has(service.id))
    .map(serviceLabel);
  const hasExplicitGroups = Array.isArray(spec?.serviceGroups);
  const assignedServiceIds = new Set((spec?.serviceGroups ?? []).flatMap((group) => group.serviceIds ?? []));
  const unassignedServices = hasExplicitGroups
    ? catalogServices.filter((service) => !assignedServiceIds.has(service.id)).map(serviceLabel)
    : [];
  const displayList = (values) => values.length ? values.join(", ") : translate("previewNone");
  const enabled = (value) => typeof value === "boolean"
    ? translate(value ? "previewEnabled" : "previewDisabled")
    : translate("previewNotApplicable");
  const supportsOptions = summary.supportsProfileOptions !== false;
  const profileValue = (values) => supportsOptions ? displayList(values) : translate("previewNotApplicable");
  const servicesValue = profileValue(services);
  const disabledServicesValue = profileValue(disabledServices);
  const unassignedServicesValue = supportsOptions && hasExplicitGroups
    ? displayList(unassignedServices)
    : translate("previewNotApplicable");
  const rows = [
    ["previewSummaryTemplate", { template }],
    ["previewSummaryActiveRegions", { regions: profileValue(activeRegions.map(regionLabel)) }],
    ["previewSummaryExcludedRegions", { regions: profileValue(disabledRegions.map(regionLabel)) }],
    ["previewSummaryPreferredRegions", { regions: profileValue(preferredRegions.map(regionLabel)) }],
    ["previewSummaryServices", { services: servicesValue }],
    ["previewSummaryDisabledServices", { services: disabledServicesValue }],
    ["previewSummaryUnassignedBlocked", { services: unassignedServicesValue }],
    ["previewSummaryFailClosed", { value: supportsOptions ? enabled(summary.failClosed) : translate("previewNotApplicable") }],
    ["previewSummaryDirect", { value: supportsOptions ? enabled(summary.allowDirect) : translate("previewNotApplicable") }],
  ];

  for (const [key, values] of rows) {
    const term = document.createElement("dt");
    term.textContent = translate(key);
    const detail = document.createElement("dd");
    detail.textContent = Object.values(values)[0];
    list.append(term, detail);
  }
}

function readDraft() {
  try {
    const spec = state.options.getSpec();
    return { spec, fingerprint: fingerprint(spec) };
  } catch (error) {
    return { error };
  }
}

function updateActionButtons() {
  const ready = Boolean(state.options);
  const managementReady = !isManagementPage || state.managementLoad === "loaded" && Boolean(state.managed);
  const preview = $("preview");
  const save = $("save");
  if (preview) preview.disabled = !ready || !managementReady || state.pendingPreview || state.draftInvalid;
  if (save) save.disabled = !ready || !managementReady || state.pendingSave || state.draftInvalid;
}

function updateDraft(spec) {
  if (isManagementPage && state.managementLoad !== "loaded") return;
  if (spec === null) {
    const current = readDraft();
    state.draftInvalid = true;
    state.validationKey = current.error?.translationKey || "editorInvalid";
    state.currentFingerprint = null;
    state.draftDirty = true;
    setStatus(state.validationKey, {}, true);
  } else {
    state.draftInvalid = false;
    state.validationKey = null;
    state.currentFingerprint = fingerprint(spec);
    const baseline = state.savedFingerprint ?? state.initialFingerprint;
    state.draftDirty = baseline === null || state.currentFingerprint !== baseline;
  }

    if (state.status?.error && spec !== null) setStatus(null);
  renderEditorState();
  renderPreviewState();
  updateActionButtons();
}

function setButtonTranslation(button, key) {
  button.dataset.i18n = key;
  button.textContent = translate(key);
}

function safeApiError(status = 0) {
  const error = new Error("Profile service request failed");
  error.status = status;
  return error;
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw safeApiError();
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw safeApiError(response.status);
  return body;
}

function localValidationKey(error) {
  return typeof error?.translationKey === "string" ? error.translationKey : null;
}

function showRequestFailure(error, fallbackKey, shouldReveal = true) {
  const key = localValidationKey(error) ?? (error?.status === 429 ? "tooManyRequests" : fallbackKey);
  setStatus(key, {}, true, shouldReveal);
}

function renderResolvedResult(result) {
  state.previewSnapshot = {
    fingerprint: result.requestFingerprint,
    summary: result.summary,
    spec: result.spec,
    ini: result.ini,
  };
  $("summary").textContent = JSON.stringify(result.summary, null, 2);
  $("ini-preview").textContent = result.ini;
  renderPreviewState();
}

async function preview() {
  if (state.pendingPreview || state.draftInvalid || (isManagementPage && state.managementLoad !== "loaded")) return;
  const draft = readDraft();
  if (draft.error) {
    updateDraft(null);
    setStatus(localValidationKey(draft.error) ?? "editorInvalid", {}, true, true);
    return;
  }

  const request = ++state.previewRequest;
  state.pendingPreview = true;
  updateActionButtons();
  setStatus("resolving");
  try {
    const result = await api("/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: draft.spec }),
    });
    if (!result?.summary || !result?.spec || typeof result.ini !== "string") throw safeApiError();
    if (request !== state.previewRequest) return;
    renderResolvedResult({
      ...result,
      requestFingerprint: draft.fingerprint,
    });
    const matchesDraft = !state.draftInvalid && state.currentFingerprint === draft.fingerprint;
    if (matchesDraft) setStatus(null);
    else if (state.draftInvalid && state.validationKey) setStatus(state.validationKey, {}, true);
    else setStatus("previewOutdated");
    reveal($("preview-result"));
  } catch (error) {
    if (request !== state.previewRequest) return;
    if (state.draftInvalid && state.validationKey) setStatus(state.validationKey, {}, true, true);
    else showRequestFailure(error, "previewFailed");
  } finally {
    if (request === state.previewRequest) {
      state.pendingPreview = false;
      updateActionButtons();
    }
  }
}

function saveResultUrls(result, spec) {
  if (![result?.id, result?.readToken, result?.manageToken].every((value) => typeof value === "string" && value.length > 0)
    || !Number.isInteger(result?.revision)) {
    throw safeApiError();
  }
  const origin = location.origin;
  $("subscription-url").value = `${origin}/p/${result.readToken}`;
  const manageUrl = `${origin}/manage?id=${encodeURIComponent(result.id)}#${result.manageToken}`;
  $("manage-url").value = manageUrl;
  $("result-manage-open").href = manageUrl;
  state.resultCreated = true;
  state.resultSpec = spec;
  $("result").hidden = false;
  $("result-intro").textContent = translate("resultIntro");
  renderEditorState();
}

function recordSaved(spec, revision) {
  const submittedFingerprint = fingerprint(spec);
  state.savedFingerprint = submittedFingerprint;
  state.initialFingerprint = submittedFingerprint;
  state.savedRevision = revision;
  state.draftInvalid = false;
  state.validationKey = null;
  const current = readDraft();
  if (current.error) {
    state.draftInvalid = true;
    state.validationKey = localValidationKey(current.error) ?? "editorInvalid";
    state.currentFingerprint = null;
    state.draftDirty = true;
  } else {
    state.currentFingerprint = current.fingerprint;
    state.draftDirty = current.fingerprint !== submittedFingerprint;
  }
  renderEditorState();
  renderPreviewState();
  updateActionButtons();
}

async function save() {
  if (state.pendingSave || state.draftInvalid || (isManagementPage && state.managementLoad !== "loaded")) return;
  const draft = readDraft();
  if (draft.error) {
    updateDraft(null);
    setStatus(localValidationKey(draft.error) ?? "editorInvalid", {}, true, true);
    return;
  }

  const updating = Boolean(state.managed);
  if (isManagementPage && !updating) {
    state.managementLoad = "failed";
    renderEditorState();
    updateActionButtons();
    setStatus("editorLoadFailed", {}, true, true);
    return;
  }

  state.pendingSave = true;
  updateActionButtons();
  setStatus(updating ? "updating" : "creating");
  try {
    const path = updating ? `/api/v1/profiles/${encodeURIComponent(state.managed.id)}` : "/api/v1/profiles";
    const headers = { "content-type": "application/json" };
    if (updating) headers.authorization = `Bearer ${state.managed.token}`;
    const result = await api(path, {
      method: updating ? "PUT" : "POST",
      headers,
      body: JSON.stringify({ spec: draft.spec }),
    });

    if (!updating) saveResultUrls(result, draft.spec);
    else if (!result || result.id !== state.managed.id || !Number.isInteger(result.revision)) throw safeApiError();
    recordSaved(draft.spec, result.revision);
    setStatus("savedRevision", { revision: result.revision });
    reveal(state.resultCreated ? $("result") : $("status"));
  } catch (error) {
    showRequestFailure(error, "saveFailed");
  } finally {
    state.pendingSave = false;
    updateActionButtons();
  }
}

function disableProfileOptions(disabled) {
  const root = $("profile-options");
  if (!root) return;
  root.setAttribute("aria-busy", disabled ? "true" : "false");
  root.inert = Boolean(disabled);
}

async function loadManagedIfPresent() {
  if (!isManagementPage) return;
  disableProfileOptions(true);
  renderEditorState();
  updateActionButtons();

  const id = new URL(location.href).searchParams.get("id");
  const fragmentToken = location.hash.slice(1);
  if (id && fragmentToken) {
    sessionStorage.setItem(`profile-manage:${id}`, fragmentToken);
    history.replaceState(null, "", `${location.pathname}?id=${encodeURIComponent(id)}`);
  }
  const token = fragmentToken || (id ? sessionStorage.getItem(`profile-manage:${id}`) : null);
  if (!id || !token) {
    state.managementLoad = "failed";
    renderEditorState();
    updateActionButtons();
    setStatus("missingManagement", {}, true, true);
    return;
  }

  try {
    const result = await api(`/api/v1/profiles/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!result?.spec || !Number.isInteger(result.revision)) throw safeApiError();
    await state.options.applySpec(result.spec);
    state.managed = { id, token };
    state.managementLoad = "loaded";
    const loaded = readDraft();
    if (loaded.error) throw loaded.error;
    state.savedFingerprint = loaded.fingerprint;
    state.initialFingerprint = loaded.fingerprint;
    state.currentFingerprint = loaded.fingerprint;
    state.savedRevision = result.revision;
    state.draftInvalid = false;
    state.draftDirty = false;
    state.validationKey = null;
    setButtonTranslation($("save"), "saveChanges");
    disableProfileOptions(false);
    renderEditorState();
    renderPreviewState();
    updateActionButtons();
    setStatus(null);
  } catch {
    state.managed = null;
    state.managementLoad = "failed";
    disableProfileOptions(true);
    renderEditorState();
    updateActionButtons();
    setStatus("editorLoadFailed", {}, true, true);
  }
}

function reportLanguageError(error) {
  const language = translateCatalogLabel("languageNames", error.language, error.language);
  const key = error.code === "language_fallback" ? "languageFallback" : "languageChangeFailed";
  setStatus(key, { language }, true, true);
}

function onLanguageChanged() {
  state.options?.setLanguage();
  if (state.options && (!isManagementPage || state.managementLoad === "loaded")) {
    const current = readDraft();
    updateDraft(current.error ? null : current.spec);
  }
  renderEditorState();
  renderPreviewState();
  renderStatus();
}

async function init() {
  updateActionButtons();
  try {
    await setupLanguagePicker(document, onLanguageChanged, reportLanguageError);
  } catch (error) {
    reportLanguageError(error);
    updateActionButtons();
    return;
  }
  if (isManagementPage) renderEditorState();
  try {
    state.catalog = await api("/api/v1/catalog");
    state.options = mountProfileOptions({
      root: $("profile-options"),
      catalog: state.catalog,
      outputFormat: "ini",
      onChange: (spec) => updateDraft(spec),
      onLanguage: (language) => applyTranslations(document, language),
    });
    const initial = readDraft();
    if (initial.error) updateDraft(null);
    else {
      state.initialFingerprint = initial.fingerprint;
      state.currentFingerprint = initial.fingerprint;
    }
    $("preview").addEventListener("click", preview);
    $("save").addEventListener("click", save);
    for (const button of document.querySelectorAll("[data-copy]")) {
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText($(button.dataset.copy).value);
          setStatus("copied", {}, false, true);
        } catch {
          setStatus("clipboardUnavailable", {}, true, true);
        }
      });
    }
    updateActionButtons();
    renderEditorState();
    renderPreviewState();
    await loadManagedIfPresent();
  } catch {
    if (isManagementPage) {
      state.managementLoad = "failed";
      disableProfileOptions(true);
      renderEditorState();
    }
    updateActionButtons();
    setStatus("builderLoadFailed", {}, true, true);
  }
}

init();
