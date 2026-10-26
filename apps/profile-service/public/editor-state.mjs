import { LANGUAGES } from "./i18n.mjs";
import { copyServiceGroups } from "./service-group-editor.js";

// Raw draft fields belong to this browser contract, not to the HTTP ProfileSpec.
const ARRAY_FIELDS = Object.freeze(["selectedRegions", "preferredNodeRegions", "disabledServices", "preferredServices"]);
const DRAFT_FIELDS = new Set(["baseProfile", "regionMode", ...ARRAY_FIELDS, "serviceGroups", "allowDirect", "failClosed", "language"]);
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_DRAFT_BYTES = 65_536;
const UNDO_LIMIT = 30;

export function copyEditorDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !DRAFT_FIELDS.has(key))
    || typeof value.baseProfile !== "string" || !["exclude", "only"].includes(value.regionMode)
    || !Object.hasOwn(LANGUAGES, value.language)
    || ARRAY_FIELDS.some((key) => !Array.isArray(value[key]) || value[key].some((id) => typeof id !== "string"))
    || ["allowDirect", "failClosed"].some((key) => value[key] !== undefined && typeof value[key] !== "boolean")
    || value.serviceGroups !== undefined && copyServiceGroups(value.serviceGroups) === undefined) return null;
  const draft = { baseProfile: value.baseProfile, regionMode: value.regionMode, language: value.language };
  for (const key of ARRAY_FIELDS) draft[key] = [...value[key]];
  for (const key of ["allowDirect", "failClosed"]) if (value[key] !== undefined) draft[key] = value[key];
  if (value.serviceGroups !== undefined) draft.serviceGroups = copyServiceGroups(value.serviceGroups);
  return draft;
}

export function fingerprint(value) {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${fingerprint(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createEditorState(initialDraft, revision = null) {
  let draft = copyEditorDraft(initialDraft);
  if (!draft) throw new TypeError("Invalid editor draft");
  let baseline = structuredClone(draft);
  let savedRevision = revision;
  let operation = "idle";
  let failed = false;
  let saved = false;
  let preview = null;
  let issues = [];
  const undo = [];
  const model = {
    get draft() { return structuredClone(draft); },
    get baseline() { return structuredClone(baseline); },
    get fingerprint() { return fingerprint(draft); },
    get dirty() { return fingerprint(draft) !== fingerprint(baseline); },
    get revision() { return savedRevision; },
    get operation() { return operation; },
    get preview() { return preview; },
    get previewCurrent() { return Boolean(preview && preview.fingerprint === fingerprint(draft) && !issues.length); },
    get issues() { return [...issues]; },
    get canUndo() { return undo.length > 0; },
    get state() {
      if (operation !== "idle") return operation;
      if (failed || issues.length) return "error";
      if (preview && preview.fingerprint !== fingerprint(draft)) return "preview-stale";
      if (saved && !model.dirty) return "saved";
      if (model.previewCurrent) return "preview-ready";
      return model.dirty ? "dirty" : "clean";
    },
    update(next, { remember = true } = {}) {
      const value = copyEditorDraft(next);
      if (!value) throw new TypeError("Invalid editor draft");
      if (fingerprint(value) === fingerprint(draft)) return false;
      if (remember) {
        undo.push(structuredClone(draft));
        if (undo.length > UNDO_LIMIT) undo.shift();
      }
      draft = value;
      issues = [];
      failed = false;
      saved = false;
      return true;
    },
    undo() {
      const previous = undo.pop();
      if (previous) model.update(previous, { remember: false });
      return previous !== undefined;
    },
    revert() { model.update(baseline); },
    setIssues(next) { issues = [...next]; },
    begin(next) {
      if (!["validating", "saving"].includes(next)) throw new TypeError("Invalid editor operation");
      operation = next;
      failed = false;
    },
    finish({ error = false } = {}) { operation = "idle"; failed = error; },
    previewResolved(snapshot) { preview = structuredClone(snapshot); },
    saved(submittedDraft, nextRevision) {
      const value = copyEditorDraft(submittedDraft);
      if (!value || !Number.isSafeInteger(nextRevision)) throw new TypeError("Invalid saved result");
      baseline = value;
      savedRevision = nextRevision;
      saved = true;
      failed = false;
    },
  };
  return model;
}

export function sessionDraftKey({ context, id }) {
  if (context === "manage" && !id) throw new TypeError("Managed drafts require a profile ID");
  return `profile-editor-draft:v1:${context === "manage" ? `manage:${id}` : "builder"}`;
}

export function readSessionDraft(storage, context, now = Date.now()) {
  let raw;
  try { raw = storage.getItem(sessionDraftKey(context)); } catch { return { status: "unavailable" }; }
  try {
    if (!raw) return { status: "none" };
    if (new TextEncoder().encode(raw).byteLength > MAX_DRAFT_BYTES) return { status: "invalid" };
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "invalid" };
    const draft = copyEditorDraft(value.draft);
    if (value.version !== 1 || !draft || !Number.isSafeInteger(value.updatedAt)
      || value.updatedAt > now || value.baseRevision !== null && !Number.isSafeInteger(value.baseRevision)) return { status: "invalid" };
    if (now - value.updatedAt > DRAFT_TTL_MS) return { status: "expired" };
    return { status: "found", draft, baseRevision: value.baseRevision };
  } catch { return { status: "invalid" }; }
}

export function writeSessionDraft(storage, context, draft, baseRevision, now = Date.now()) {
  const safe = copyEditorDraft(draft);
  if (!safe) return false;
  const raw = JSON.stringify({ version: 1, draft: safe, baseRevision, updatedAt: now });
  if (new TextEncoder().encode(raw).byteLength > MAX_DRAFT_BYTES) return false;
  try { storage.setItem(sessionDraftKey(context), raw); return true; } catch { return false; }
}

export function clearSessionDraft(storage, context) {
  try { storage.removeItem(sessionDraftKey(context)); return true; } catch { return false; }
}
