import { applyTranslations, setupLanguagePicker, translate, translateCatalogLabel } from "./i18n.mjs";
import { mountProfileOptions } from "./profile-options.js";
import { EDITOR_SECTIONS, editorHref, mountEditorRouter, parseEditorRoute } from "./builder-router.mjs";
import { clearSessionDraft, createEditorState, fingerprint, readSessionDraft, writeSessionDraft } from "./editor-state.mjs";
import { createCapabilitySession } from "./capability-session.mjs";

const $ = (id) => document.getElementById(id);
const management = location.pathname === "/manage" || location.pathname.startsWith("/manage/");
let storage = null;
let storageUnavailable = false;
try { storage = sessionStorage; } catch { storageUnavailable = true; }
const capabilities = createCapabilitySession(storage, {
  onStorageError() { storageUnavailable = true; },
  schedule: (callback, delay) => window.setTimeout(callback, delay),
  onExpire(id, kind) {
    if (document.documentElement.dataset.i18nReady !== "true") return;
    if (kind === "capability" && management && context.id === id) managementExpired();
    else { renderState(); renderSuccess(); }
  },
});
// Remove a management fragment before any catalog, profile, or locale request.
if (management) capabilities.capture(new URL(location.href), history);
const context = { context: management ? "manage" : "builder", id: management ? new URL(location.href).searchParams.get("id") : null };
const state = {
  route: parseEditorRoute(location.href), catalog: null, options: null, model: null, router: null,
  managementLoad: management ? "loading" : "not-required", status: null, recovery: null,
  draftNotice: null, previewRequest: 0, previewController: null, applyingDraft: false,
};
const sectionKeys = {
  template: "sectionTemplate", regions: "sectionRegions", services: "sectionServices",
  policies: "sectionPolicies", review: "sectionReview", success: "subscriptionCreated",
};
const descriptionKeys = {
  template: "templatePageHelp", regions: "regionsPageHelp", services: "servicesPageHelp",
  policies: "policiesPageHelp", review: "reviewPageHelp", success: "successPageHelp",
};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function link(text, href, className) {
  const node = element("a", text, className);
  node.href = href;
  node.dataset.editorLink = "";
  return node;
}
function href(section, extra = {}) { return editorHref(section, { ...context, ...extra }); }
function reveal(node) {
  if (!node) return;
  node.focus({ preventScroll: true });
  node.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}
function ready() { return Boolean(state.model && (!management || state.managementLoad === "loaded")); }
function setStatus(key, values = {}, error = false) {
  state.status = key ? { key, values, error } : null;
  renderStatus();
}
function renderStatus() {
  const completion = state.route?.section === "success";
  $("status").hidden = !state.status || completion && !["copied", "clipboardUnavailable"].includes(state.status.key);
  $("status").classList.toggle("error", Boolean(state.status?.error));
  $("status").textContent = state.status ? translate(state.status.key, state.status.values) : "";
}
function templateLabel(id) {
  const item = state.catalog?.templates?.find((template) => template.outputFormat === "ini" && template.id === id);
  return translateCatalogLabel("templateNames", id, item?.name ?? id);
}
function regionLabel(id) {
  return translateCatalogLabel("regionNames", id, state.catalog?.regions?.find((region) => region.id === id)?.name ?? id);
}
function serviceLabel(id) {
  return translateCatalogLabel("serviceNames", id, state.catalog?.services?.find((service) => service.id === id)?.name ?? id);
}
function groupLabel(group) {
  const canonical = state.catalog?.serviceGroups?.find((item) => item.id === group.id && item.name === group.name);
  return canonical ? translateCatalogLabel("serviceGroupNames", group.id,
    translateCatalogLabel("serviceNames", group.id, group.name)) : group.name;
}
function displayList(values) { return values.length ? values.join(", ") : translate("previewNone"); }
function enabled(value) { return typeof value === "boolean" ? translate(value ? "previewEnabled" : "previewDisabled") : translate("policyInherited"); }
function supportsOptions(id = state.model?.draft.baseProfile) {
  return state.catalog?.templates?.find((template) => template.id === id && template.outputFormat === "ini")?.supportsProfileOptions !== false;
}
function validateDraft() {
  if (!state.model || !state.options) return;
  state.model.setIssues(state.options.validate());
}
function persistDraft() {
  if (!ready()) return;
  const success = management && !state.model.dirty
    ? clearSessionDraft(storage, context)
    : writeSessionDraft(storage, context, state.model.draft, state.model.revision);
  if (!success) storageUnavailable = true;
}
function draftChanged() {
  if (!ready() || state.applyingDraft) return;
  state.model.update(state.options.getDraft());
  validateDraft();
  persistDraft();
  if (state.status) setStatus(null);
  renderState();
  renderNavigation();
  renderValidation();
  renderButtons();
}
function renderState() {
  const model = state.model;
  const completion = state.route?.section === "success" ? capabilities.getCreated(state.route.resultId ?? null) : null;
  let key = "editorLoading";
  let dataState = "loading";
  if (management && state.managementLoad === "failed") {
    key = "editorLoadFailed"; dataState = "load-failed";
  } else if (model) {
    if (model.operation === "saving") { key = "updating"; dataState = "saving"; }
    else if (model.operation === "validating") { key = "validatingConfiguration"; dataState = "validating"; }
    else if (model.issues.length) { key = "editorInvalid"; dataState = "invalid"; }
    else if (model.dirty) { key = "editorDirty"; dataState = "dirty"; }
    else if (management || model.revision !== null) { key = model.state === "saved" ? "configurationSaved" : "editorReady"; dataState = "clean"; }
    else { key = "editorDraft"; dataState = "draft"; }
  }
  $("editor-state").dataset.state = dataState;
  $("editor-state").dataset.modelState = model?.state ?? dataState;
  $("editor-state").textContent = translate(key);
  $("saved-state-note").hidden = model?.revision === null || model?.revision === undefined;
  $("saved-state-note").textContent = model?.revision !== null && model?.revision !== undefined
    ? translate("editorSavedRevision", { revision: model.revision }) : "";
  const current = model?.previewCurrent;
  const previewKey = !model?.preview ? "previewNotRun" : current ? "previewCurrent" : "previewOutdated";
  $("preview-state").dataset.state = !model?.preview ? "not-run" : current ? "current" : "outdated";
  $("preview-state-label").textContent = translate(previewKey);
  $("preview-state-help").hidden = !model?.preview || current;
  $("preview-state-help").textContent = current ? "" : translate("previewOutdatedHelp");
  $("preview-result").hidden = !model?.preview;
  $("preview-snapshot-note").textContent = translate(current ? "previewMatchesDraft" : "previewOutdatedHelp");
  $("draft-storage-note").hidden = !storageUnavailable && !state.draftNotice;
  $("draft-storage-note").textContent = storageUnavailable ? translate("draftStorageUnavailable") : state.draftNotice ? translate(state.draftNotice) : "";
  $("draft-recovery").hidden = !state.recovery;
  if (state.recovery) $("draft-recovery-message").textContent = translate("draftRevisionConflict", {
    localRevision: state.recovery.baseRevision, revision: model?.revision,
  });
  $("profile-context").textContent = completion
    ? translate("createdProfileContext", { template: templateLabel(completion.spec.baseProfile) }) : model
    ? translate(management ? "managementProfileContext" : "builderProfileContext", {
      template: templateLabel(model.draft.baseProfile), id: context.id ?? "",
    }) : translate(management ? "managementContext" : "builderContext");
  const safety = $("safety-summary");
  safety.replaceChildren();
  const safetySpec = completion?.spec ?? model?.draft;
  if (model && ready() && supportsOptions(safetySpec.baseProfile)) {
    safety.append(element("strong", translate("safetyStatusTitle")));
    for (const [keyName, value] of [["previewSummaryFailClosed", safetySpec.failClosed], ["previewSummaryDirect", safetySpec.allowDirect]]) {
      safety.append(element("p", `${translate(keyName)}: ${enabled(value)}`));
    }
    if (!completion) safety.append(link(translate("editPolicies"), href("policies")));
  }
  renderStatus();
}
function renderButtons() {
  const available = ready() && !state.applyingDraft;
  const busy = state.model?.operation !== "idle";
  $("preview").disabled = !available || busy || Boolean(state.options?.validate().length);
  $("save").disabled = !available || busy || !state.model?.previewCurrent || Boolean(state.model?.issues.length)
    || Boolean(state.recovery) || management && !state.model?.dirty;
  $("save").textContent = translate(management ? "saveChanges" : "createSubscription");
  $("undo").disabled = !available || !state.model?.canUndo;
  $("cancel-changes").disabled = !available || !state.model?.dirty;
  $("language").disabled = state.applyingDraft;
  $("profile-options").inert = !available;
  $("profile-options").setAttribute("aria-busy", state.applyingDraft ? "true" : "false");
}
function renderValidation() {
  const issues = state.model?.issues ?? [];
  $("error-summary").hidden = !issues.length;
  $("error-list").replaceChildren();
  for (const message of document.querySelectorAll("[data-editor-validation-for]")) {
    const control = $(message.dataset.editorValidationFor);
    if (control) {
      control.removeAttribute("aria-invalid");
      const describedBy = (control.getAttribute("aria-describedby") ?? "").split(/\s+/u).filter((id) => id && id !== message.id);
      if (describedBy.length) control.setAttribute("aria-describedby", describedBy.join(" "));
      else control.removeAttribute("aria-describedby");
    }
    message.remove();
  }
  for (const issue of issues) {
    const item = element("li");
    const target = link(translate(issue.key), href(issue.section, { returnToReview: true }));
    delete target.dataset.editorLink;
    target.dataset.errorField = issue.field;
    item.append(target);
    $("error-list").append(item);
    let control = $(issue.field);
    if (!control && issue.section === "services" && state.route?.groupId) control = $("service-group-members");
    if (!control || issue.field === "error-summary") continue;
    if (issue.field === "region-list" && $("region-validation")?.textContent) continue;
    const message = element("p", translate(issue.key), "inline-error");
    message.id = `field-error-${control.id}`;
    message.dataset.editorValidationFor = control.id;
    const describedBy = new Set((control.getAttribute("aria-describedby") ?? "").split(/\s+/u).filter(Boolean));
    describedBy.add(message.id);
    control.setAttribute("aria-invalid", "true");
    control.setAttribute("aria-describedby", [...describedBy].join(" "));
    control.insertAdjacentElement("afterend", message);
  }
}
function renderNavigation() {
  const nav = $("section-navigation");
  nav.replaceChildren();
  for (const section of EDITOR_SECTIONS) {
    const target = link(translate(sectionKeys[section]), href(section));
    target.id = `nav-${section}`;
    if (state.route?.section === section) target.setAttribute("aria-current", "page");
    nav.append(target);
  }
  const route = state.route;
  if (!route) return;
  const group = route.groupId && state.options?.getGroups().find((item) => item.id === route.groupId);
  $("page-title").textContent = group ? groupLabel(group) : translate(route.groupId ? "groupEditorTitle" : sectionKeys[route.section]);
  $("page-description").textContent = translate(route.groupId ? "groupPageHelp" : descriptionKeys[route.section]);
  document.title = `${$("page-title").textContent} · OpenClash Profile Builder`;
  const footer = $("section-actions");
  footer.hidden = route.section === "success";
  const reviewing = route.section === "review";
  $("review-actions").hidden = !reviewing;
  $("section-continue").hidden = reviewing;
  $("quick-review").hidden = route.section !== "template";
  $("quick-review").href = href("review");
  const index = EDITOR_SECTIONS.indexOf(route.section);
  $("section-back").hidden = index <= 0 && !route.groupId;
  $("section-back").href = href(route.groupId ? "services" : EDITOR_SECTIONS[Math.max(0, index - 1)]);
  $("section-back").textContent = translate(route.groupId ? "backToGroups" : "backAction");
  const continuing = $("section-continue");
  continuing.href = href(route.returnToReview ? "review" : route.groupId ? "services" : EDITOR_SECTIONS[Math.min(index + 1, EDITOR_SECTIONS.length - 1)]);
  continuing.textContent = translate(route.returnToReview ? "returnToReview" : route.groupId ? "doneAction" : "continueAction");
  continuing.classList.toggle("primary", route.section !== "services" || Boolean(route.groupId));
}
function summarySection(titleKey, section, rows) {
  const block = element("section", undefined, "review-section");
  const head = element("div", undefined, "review-section-heading");
  head.append(element("h2", translate(titleKey)));
  const edit = link(translate("editSection", { section: translate(sectionKeys[section]) }), href(section, { returnToReview: true }));
  head.append(edit);
  block.append(head);
  const list = element("dl");
  for (const [key, value] of rows) list.append(element("dt", translate(key)), element("dd", value));
  block.append(list);
  $("review-summary").append(block);
  return block;
}
function renderReview() {
  if (state.route?.section !== "review" || !state.model || !ready()) return;
  const draft = state.model.draft;
  const applies = supportsOptions();
  const notApplicable = translate("previewNotApplicable");
  const value = (text) => applies ? text : notApplicable;
  const regions = (state.catalog.regions ?? []).filter((region) => region.routable);
  const active = regions.filter((region) => draft.regionMode === "only"
    ? draft.selectedRegions.includes(region.id) : !draft.selectedRegions.includes(region.id));
  const excluded = draft.regionMode === "exclude" ? draft.selectedRegions : regions.filter((region) => !draft.selectedRegions.includes(region.id)).map((region) => region.id);
  const effectiveSpec = state.options.validate().length ? null : state.options.getSpec();
  const services = state.catalog.services.filter((service) => !service.outputFormats || service.outputFormats.includes("ini"));
  $("review-summary").replaceChildren();
  summarySection("sectionTemplate", "template", [["baseProfile", templateLabel(draft.baseProfile)]]);
  summarySection("sectionRegions", "regions", [
    ["previewSummaryActiveRegions", value(displayList(active.map((region) => regionLabel(region.id))))],
    ["previewSummaryExcludedRegions", value(displayList(excluded.map(regionLabel)))],
    ["previewSummaryPreferredRegions", value(displayList((effectiveSpec?.preferredNodeRegions ?? []).map(regionLabel)))],
  ]);
  const groups = applies ? state.options.getGroups() : [];
  const groupSection = summarySection("sectionServices", "services", [["groupsLabel", value(translate("reviewGroupCount", { count: groups.length }))]]);
  const groupList = element("ul", undefined, "review-group-list");
  for (const group of groups) {
    const item = element("li");
    item.append(link(groupLabel(group), href("services", { groupId: group.id, returnToReview: true })),
      element("span", translate("groupCounts", { services: group.serviceIds.length, exits: group.routes.filter((route) => route !== "reject").length })));
    groupList.append(item);
  }
  groupSection.append(groupList);
  const assigned = new Set(groups.flatMap((group) => group.serviceIds));
  const unassigned = services.filter((service) => !assigned.has(service.id));
  if (applies && draft.serviceGroups !== undefined && unassigned.length) groupSection.append(element("p", translate("unassignedServicesHint", {
    services: unassigned.map((service) => serviceLabel(service.id)).join(", "),
  }), "warning"));
  summarySection("sectionPolicies", "policies", [
    ["enabledServices", value(displayList(services.filter((service) => !draft.disabledServices.includes(service.id)).map((service) => serviceLabel(service.id))))],
    ["previewSummaryDisabledServices", value(displayList(draft.disabledServices.map(serviceLabel)))],
    ["preferredServiceOrder", value(draft.serviceGroups === undefined ? displayList((effectiveSpec?.preferredServices ?? []).map(serviceLabel)) : translate("customGroupOrderHelp"))],
    ["previewSummaryFailClosed", value(enabled(draft.failClosed))],
    ["previewSummaryDirect", value(enabled(draft.allowDirect))],
    ["fallbackBehaviorTitle", value(translate(draft.failClosed === true ? "fallbackBlockedHelp" : draft.failClosed === false ? "fallbackTemplateHelp" : "fallbackLegacyHelp"))],
  ]);
}
function renderSuccess() {
  const result = capabilities.getCreated(state.route?.resultId ?? null);
  const available = state.route?.section === "success" && Boolean(result);
  $("result").hidden = !available;
  $("success-unavailable").hidden = state.route?.section !== "success" || available;
  if (!available) {
    $("subscription-url").value = "";
    $("manage-url").value = "";
    $("result-manage-open").href = "/manage";
    return;
  }
  const token = capabilities.get(result.id)?.token;
  $("subscription-url").value = `${location.origin}/p/${result.readToken}`;
  const manageUrl = `${location.origin}/manage?id=${encodeURIComponent(result.id)}#${token}`;
  $("manage-url").value = manageUrl;
  $("result-manage-open").href = manageUrl;
  $("saved-result-state").textContent = translate("resultUrlsSavedRevision", { revision: result.revision });
  $("result-fail-closed").hidden = result.spec?.failClosed !== true;
  $("profile-context").textContent = translate("createdProfileContext", { template: templateLabel(result.spec.baseProfile) });
}
function renderRoute(route, position = null, { focus = true } = {}) {
  state.route = route;
  document.querySelector(".editor-status-bar").hidden = route?.section === "success";
  if (!route) {
    renderNavigation(); renderState(); renderValidation(); renderButtons();
    $("page-title").textContent = translate("pageNotFound");
    $("page-description").textContent = translate("pageNotFoundHelp");
    $("profile-options").hidden = true;
    $("review-page").hidden = true;
    $("result").hidden = true;
    $("section-actions").hidden = true;
    $("success-unavailable").hidden = true;
    $("not-found").hidden = false;
    $("not-found-link").href = href("template");
    return;
  }
  $("not-found").hidden = true;
  state.options?.setView(route.groupId ? "group" : route.section, route.groupId);
  $("profile-options").hidden = ["review", "success"].includes(route.section);
  $("review-page").hidden = route.section !== "review";
  renderNavigation();
  renderState();
  renderReview();
  renderSuccess();
  renderValidation();
  renderButtons();
  if (focus) requestAnimationFrame(() => {
    if (position) {
      const target = position.focus ? $(position.focus) : null;
      (target ?? $("page-title")).focus({ preventScroll: true });
      window.scrollTo({ top: position.y, behavior: "instant" });
    } else {
      $("page-title").focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  });
  if (route.section === "review" && ready() && !state.model.previewCurrent && !state.model.issues.length && state.model.operation === "idle") void preview(false);
}
function apiError(status = 0, code = "") { return Object.assign(new Error("Profile request failed"), { status, code }); }
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { cache: "no-store", ...options }); } catch { throw apiError(); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw apiError(response.status, typeof body?.error === "string" ? body.error : "");
  return body;
}
function failureKey(error, fallback) { return error.status === 429 ? "tooManyRequests" : fallback; }
function serverIssue(error) {
  if (error.status !== 400) return null;
  if (error.code === "no_active_region") return { key: "atLeastOneActiveRegion", section: "regions", field: "region-list" };
  if (/region/u.test(error.code)) return { key: "validationRegionsServer", section: "regions", field: "region-list" };
  if (/service|group/u.test(error.code)) return { key: "validationGroupsServer", section: "services", field: "service-group-list" };
  if (/profile|template/u.test(error.code)) return { key: "validationTemplateServer", section: "template", field: "base-profile" };
  return { key: "validationConfigurationServer", section: "review", field: "error-summary" };
}
async function preview(shouldFocus = true) {
  if (!ready() || state.model.operation !== "idle") return;
  validateDraft();
  if (state.model.issues.length) { renderValidation(); if (shouldFocus) reveal($("error-summary")); return; }
  const submittedDraft = state.model.draft;
  const requestFingerprint = fingerprint(submittedDraft);
  const spec = state.options.getSpec();
  const request = ++state.previewRequest;
  state.previewController?.abort();
  const controller = new AbortController();
  state.previewController = controller;
  state.model.begin("validating");
  setStatus("validatingConfiguration");
  renderState(); renderButtons();
  try {
    const result = await api("/api/v1/resolve", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ spec }), signal: controller.signal,
    });
    if (request !== state.previewRequest) return;
    if (!result?.spec || !result?.summary || typeof result.ini !== "string") throw apiError();
    state.model.previewResolved({ fingerprint: requestFingerprint, spec: result.spec, summary: result.summary, ini: result.ini });
    $("summary").textContent = JSON.stringify(result.summary, null, 2);
    $("ini-preview").textContent = result.ini;
    setStatus(state.model.previewCurrent ? "validationSucceeded" : "previewOutdated");
    if (shouldFocus && state.route?.section === "review") reveal($("preview-result"));
  } catch (error) {
    if (request !== state.previewRequest) return;
    const issue = serverIssue(error);
    if (issue && state.model.fingerprint === requestFingerprint) state.model.setIssues([{ ...issue, source: "server" }]);
    setStatus(failureKey(error, "previewFailed"), {}, true);
    state.model.finish({ error: true });
    renderValidation();
    if (shouldFocus) reveal(issue ? $("error-summary") : $("status"));
    return;
  } finally {
    if (request === state.previewRequest) {
      if (state.model.operation === "validating") state.model.finish();
      renderState(); renderButtons(); renderReview(); renderValidation();
    }
  }
}
async function save() {
  if (!ready() || state.model.operation !== "idle" || !state.model.previewCurrent || state.model.issues.length || state.recovery) return;
  const submittedDraft = state.model.draft;
  const spec = state.options.getSpec();
  const token = management ? capabilities.get(context.id)?.token : null;
  if (management && !token) { managementExpired(); return; }
  state.model.begin("saving");
  setStatus(management ? "updating" : "creating");
  renderState(); renderButtons();
  try {
    const headers = { "content-type": "application/json" };
    if (management) headers.authorization = `Bearer ${token}`;
    const result = await api(management ? `/api/v1/profiles/${encodeURIComponent(context.id)}` : "/api/v1/profiles", {
      method: management ? "PUT" : "POST", headers, body: JSON.stringify({ spec }),
    });
    if (!Number.isSafeInteger(result?.revision) || typeof result.id !== "string"
      || management && result.id !== context.id
      || !management && ![result.readToken, result.manageToken].every((value) => typeof value === "string" && value.length > 0)) throw apiError();
    if (!management) capabilities.saveCreated(result, spec);
    state.model.saved(submittedDraft, result.revision);
    state.model.finish();
    persistDraft();
    setStatus(state.model.dirty ? "savedWithNewerDraft" : "savedRevision", { revision: result.revision });
    if (!management) state.router.navigate(href("success", { resultId: result.id }));
    else reveal($("status"));
  } catch (error) {
    state.model.finish({ error: true });
    setStatus(failureKey(error, "saveFailedRetained"), {}, true);
    reveal($("status"));
  } finally { renderState(); renderButtons(); }
}
async function confirmAction(titleKey, helpKey) {
  const dialog = $("confirm-dialog");
  $("confirm-title").textContent = translate(titleKey);
  $("confirm-description").textContent = translate(helpKey);
  dialog.returnValue = "cancel";
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    dialog.showModal();
  });
}
async function applyModelDraft() {
  state.applyingDraft = true;
  renderButtons();
  try {
    await state.options.applyDraft(state.model.draft);
    validateDraft(); persistDraft();
    renderRoute(state.route, null, { focus: false });
  } catch {
    // An unavailable locale must not leave the model describing an unapplied draft.
    state.model.update(state.options.getDraft(), { remember: false });
    validateDraft();
    renderState(); renderValidation();
    setStatus("draftRestoreFailed", {}, true);
    return false;
  } finally { state.applyingDraft = false; renderButtons(); }
  return true;
}
function managementExpired() {
  state.managementLoad = "failed";
  setStatus("managementSessionExpired", {}, true);
  renderState(); renderButtons();
}
async function loadManagement() {
  const session = capabilities.get(context.id);
  if (!context.id || !session) {
    state.managementLoad = "failed";
    setStatus("missingManagement", {}, true);
    return false;
  }
  try {
    const result = await api(`/api/v1/profiles/${encodeURIComponent(context.id)}`, { headers: { authorization: `Bearer ${session.token}` } });
    if (!result?.spec || !Number.isSafeInteger(result.revision)) throw apiError();
    await state.options.applySpec(result.spec);
    state.model = createEditorState(state.options.getDraft(), result.revision);
    state.managementLoad = "loaded";
    return true;
  } catch {
    state.managementLoad = "failed";
    setStatus("editorLoadFailed", {}, true);
    return false;
  }
}
async function restoreSessionDraft() {
  const local = readSessionDraft(storage, context);
  if (local.status === "none") return;
  if (local.status === "unavailable") { storageUnavailable = true; return; }
  if (local.status !== "found") {
    state.draftNotice = local.status === "expired" ? "localDraftExpired" : "draftRestoreFailed";
    return;
  }
  if (management && local.baseRevision !== state.model.revision) { state.recovery = local; return; }
  try {
    await state.options.applyDraft(local.draft);
    state.model.update(state.options.getDraft());
    state.draftNotice = "localDraftRestored";
  } catch { state.draftNotice = "draftRestoreFailed"; }
}
function bindEvents() {
  $("preview").addEventListener("click", () => void preview());
  $("save").addEventListener("click", () => void save());
  $("undo").addEventListener("click", async () => {
    if (state.model?.undo()) { setStatus(null); await applyModelDraft(); }
  });
  $("cancel-changes").addEventListener("click", async () => {
    if (await confirmAction("cancelChanges", "cancelChangesHelp")) {
      state.model.revert(); setStatus(null); await applyModelDraft();
    }
  });
  $("restore-draft").addEventListener("click", async () => {
    if (!state.recovery) return;
    state.model.update(state.recovery.draft);
    if (await applyModelDraft()) {
      state.recovery = null;
      state.draftNotice = "localDraftRestored";
      renderState(); renderButtons();
    }
  });
  $("discard-recovery").addEventListener("click", async () => {
    if (await confirmAction("discardLocalDraft", "discardLocalDraftHelp")) {
      if (!clearSessionDraft(storage, context)) storageUnavailable = true;
      state.recovery = null; renderState(); renderButtons();
    }
  });
  document.addEventListener("click", (event) => {
    const target = event.target.closest?.("a[data-error-field]");
    if (!target || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    state.router.navigate(target.href);
    requestAnimationFrame(() => reveal($(target.dataset.errorField) ?? $("page-title")));
  });
  for (const button of document.querySelectorAll("[data-copy]")) button.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($(button.dataset.copy).value); setStatus("copied"); }
    catch { setStatus("clipboardUnavailable", {}, true); }
  });
  window.addEventListener("beforeunload", (event) => {
    if (state.model?.dirty || state.model?.operation === "saving") { event.preventDefault(); event.returnValue = ""; }
  });
}
async function languageChanged() {
  const serverIssues = state.model?.issues.filter((issue) => issue.source === "server") ?? [];
  state.options?.setLanguage();
  draftChanged();
  if (serverIssues.length) state.model.setIssues([...state.model.issues, ...serverIssues]);
  if (state.model) renderRoute(state.route, null, { focus: false });
}
async function init() {
  try {
    await setupLanguagePicker(document, languageChanged, (error) => setStatus(
      error.code === "language_fallback" ? "languageFallback" : "languageChangeFailed",
      { language: translateCatalogLabel("languageNames", error.language, error.language) }, true));
    renderState();
    state.catalog = await api("/api/v1/catalog");
    state.options = mountProfileOptions({
      root: $("profile-options"), catalog: state.catalog, outputFormat: "ini", storage: null,
      persistPreferences: false, view: state.route?.groupId ? "group" : state.route?.section ?? "template", groupId: state.route?.groupId,
      onChange: draftChanged, onLanguage: () => applyTranslations(document),
      groupHref: (id) => href("services", { groupId: id, returnToReview: state.route?.returnToReview }),
      onNavigateGroup: (id) => state.router.navigate(href("services", { groupId: id, returnToReview: state.route?.returnToReview })),
    });
    if (management) await loadManagement();
    else state.model = createEditorState(state.options.getDraft());
    if (ready()) { await restoreSessionDraft(); validateDraft(); }
    const route = state.route;
    if (route && ["/", "/builder"].includes(location.pathname)) history.replaceState(null, "", href("template"));
    state.router = mountEditorRouter({ window, acceptRoute: (next) => next.context === context.context && next.id === context.id,
      onNavigate: (next, position) => renderRoute(next, position) });
    bindEvents();
    renderRoute(route);
  } catch {
    if (management) state.managementLoad = "failed";
    if (document.documentElement.dataset.i18nReady === "true") {
      setStatus("builderLoadFailed", {}, true); renderState(); renderButtons();
    } else $("boot-error").hidden = false;
  }
}
$("reload-editor").addEventListener("click", () => location.reload());
void init();
