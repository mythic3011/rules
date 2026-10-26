import assert from "node:assert/strict";
import test from "node:test";
import { copyEditorDraft, createEditorState, DRAFT_TTL_MS, fingerprint, readSessionDraft, writeSessionDraft } from "../public/editor-state.mjs";
import { CAPABILITY_TTL_MS, createCapabilitySession } from "../public/capability-session.mjs";
import { editorHref, parseEditorRoute } from "../public/builder-router.mjs";

const draft = (overrides = {}) => ({ baseProfile: "ai-balanced", language: "en", regionMode: "exclude",
  selectedRegions: [], preferredNodeRegions: [], disabledServices: [], preferredServices: [], allowDirect: false, failClosed: true, ...overrides });
class Storage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test("preview freshness, undo, and saved baselines are independent", () => {
  const model = createEditorState(draft());
  model.previewResolved({ fingerprint: model.fingerprint, spec: {}, ini: "initial" });
  assert.equal(model.state, "preview-ready");
  model.update(draft({ preferredNodeRegions: ["us", "jp"] }));
  assert.equal(model.state, "preview-stale");
  assert.equal(model.dirty, true);
  assert.equal(model.preview.ini, "initial");
  model.undo();
  assert.equal(model.previewCurrent, true);
  assert.equal(model.dirty, false);
});

test("a late save acknowledges only the submitted draft, preserving newer and invalid edits", () => {
  const model = createEditorState(draft(), 4);
  const submitted = draft({ selectedRegions: ["jp"] });
  model.update(submitted);
  model.begin("saving");
  model.update(draft({ regionMode: "only" }));
  model.setIssues([{ key: "onlyRequiresRegion", section: "regions", field: "region-list" }]);
  model.saved(submitted, 5);
  model.finish();
  assert.equal(model.revision, 5);
  assert.deepEqual(model.baseline, submitted);
  assert.equal(model.dirty, true);
  assert.equal(model.state, "error");
  assert.equal(model.draft.regionMode, "only");
  model.revert();
  assert.equal(model.dirty, false);
  assert.equal(model.draft.regionMode, "exclude");
});

test("fingerprints ignore object key order while preserving array and language changes", () => {
  assert.equal(fingerprint({ a: 1, b: [2, 3] }), fingerprint({ b: [2, 3], a: 1 }));
  assert.notEqual(fingerprint(draft()), fingerprint(draft({ language: "zh-Hant" })));
  assert.notEqual(fingerprint(["us", "jp"]), fingerprint(["jp", "us"]));
});

test("invalid intermediate drafts survive session restore without crossing profile contexts", () => {
  const storage = new Storage();
  const builder = { context: "builder" };
  const managed = { context: "manage", id: "first" };
  const other = { context: "manage", id: "second" };
  assert.equal(writeSessionDraft(storage, builder, draft({ regionMode: "only" }), null, 100), true);
  assert.equal(writeSessionDraft(storage, managed, draft({ selectedRegions: ["us"] }), 7, 100), true);
  assert.equal(readSessionDraft(storage, builder, 101).draft.regionMode, "only");
  assert.deepEqual(readSessionDraft(storage, managed, 101).draft.selectedRegions, ["us"]);
  assert.equal(readSessionDraft(storage, managed, 101).baseRevision, 7);
  assert.equal(readSessionDraft(storage, other, 101).status, "none");
  assert.equal(readSessionDraft(storage, builder, 101 + DRAFT_TTL_MS).status, "expired");
});

test("session drafts whitelist nonsecret raw fields and report denied storage", () => {
  const storage = new Storage();
  assert.equal(copyEditorDraft({ ...draft(), manageToken: "private" }), null);
  assert.equal(copyEditorDraft({ ...draft(), failClosed: "false" }), null);
  assert.equal(writeSessionDraft(storage, { context: "builder" }, { ...draft(), manageToken: "private" }, null), false);
  assert.equal(storage.values.size, 0);
  const denied = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(readSessionDraft(denied, { context: "builder" }).status, "unavailable");
  assert.equal(writeSessionDraft(denied, { context: "builder" }, draft(), null), false);
});

test("management capability capture strips the fragment and expires after a bounded tab session", () => {
  let time = 100;
  const storage = new Storage();
  const vault = createCapabilitySession(storage, { now: () => time });
  const calls = [];
  const token = "local-synthetic-capability";
  const url = new URL(`https://editor.invalid/manage?id=first#${token}`);
  vault.capture(url, { replaceState(...args) { calls.push(args); } });
  assert.equal(vault.get("first").token, token);
  assert.equal(calls[0][2], "/manage?id=first");
  assert.doesNotMatch(JSON.stringify(calls), new RegExp(token));
  assert.equal(createCapabilitySession(storage, { now: () => time }).get("first").token, token);
  time += CAPABILITY_TTL_MS;
  assert.equal(vault.get("first"), null);
  assert.equal(storage.getItem("profile-manage:first"), null);
});

test("created links are recoverable in the same tab and never extend capability expiry", () => {
  let time = 100;
  const storage = new Storage();
  const vault = createCapabilitySession(storage, { now: () => time });
  vault.saveCreated({ id: "first", readToken: "read", manageToken: "manage", revision: 1 }, { baseProfile: "ai-balanced" });
  const recovered = createCapabilitySession(storage, { now: () => time });
  assert.equal(recovered.getCreated().readToken, "read");
  assert.equal(recovered.get("first").expiresAt, 100 + CAPABILITY_TTL_MS);
  time += CAPABILITY_TTL_MS;
  assert.equal(recovered.getCreated(), null);
  assert.equal(storage.getItem("profile-created:v1:first"), null);
  assert.equal(storage.getItem("profile-manage:first"), null);
});

test("active expiry erases capabilities and creation metadata without waiting for another request", () => {
  let time = 100;
  const storage = new Storage();
  const scheduled = [];
  const expired = [];
  const vault = createCapabilitySession(storage, { now: () => time,
    schedule: (callback, delay) => scheduled.push({ callback, delay }), onExpire: (id) => expired.push(id) });
  vault.saveCreated({ id: "first", readToken: "read", manageToken: "manage", revision: 1 }, {});
  assert.equal(scheduled[0].delay, CAPABILITY_TTL_MS);
  time += CAPABILITY_TTL_MS;
  scheduled[0].callback();
  assert.deepEqual(expired, ["first"]);
  assert.equal(vault.getCreated(), null);
  assert.equal(vault.get("first"), null);
  assert.equal(storage.values.size, 0);
});

test("reopening the editor purges expired dormant sessions for other profiles", () => {
  const storage = new Storage();
  const earlier = createCapabilitySession(storage, { now: () => 100 });
  earlier.set("first", "synthetic");
  earlier.set("second", "synthetic");
  createCapabilitySession(storage, { now: () => 101 + CAPABILITY_TTL_MS });
  assert.equal(storage.values.size, 0);
});

test("separate success records retain each profile's links across later creates", () => {
  const storage = new Storage();
  const vault = createCapabilitySession(storage, { now: () => 100 });
  vault.saveCreated({ id: "first", readToken: "read-first", manageToken: "manage-first", revision: 1 }, {});
  vault.saveCreated({ id: "second", readToken: "read-second", manageToken: "manage-second", revision: 1 }, {});
  assert.equal(vault.getCreated("first").readToken, "read-first");
  assert.equal(vault.getCreated("second").readToken, "read-second");
  assert.equal(vault.getCreated().id, "second");
  const restored = createCapabilitySession(storage, { now: () => 101 });
  assert.equal(restored.getCreated("first").readToken, "read-first");
  assert.equal(restored.getCreated("unknown"), null);
});

test("expired success metadata does not revoke a subsequently renewed management capability", () => {
  let time = 100;
  const storage = new Storage();
  const scheduled = [];
  const vault = createCapabilitySession(storage, { now: () => time, schedule: (callback, delay) => scheduled.push({ callback, delay }) });
  vault.saveCreated({ id: "first", readToken: "read", manageToken: "manage", revision: 1 }, {});
  time += CAPABILITY_TTL_MS - 100;
  vault.set("first", "renewed");
  time += 101;
  assert.equal(vault.getCreated("first"), null);
  assert.equal(vault.get("first").token, "renewed");
  scheduled[0].callback();
  scheduled[1].callback();
  assert.equal(vault.getCreated("first"), null);
  assert.equal(vault.get("first").token, "renewed");
});

test("dormant legacy raw capabilities are migrated into a bounded session on startup", () => {
  const storage = new Storage();
  storage.setItem("profile-manage:first", "a".repeat(43));
  const scheduled = [];
  createCapabilitySession(storage, { now: () => 100, schedule: (callback, delay) => scheduled.push({ callback, delay }) });
  assert.equal(JSON.parse(storage.getItem("profile-manage:first")).expiresAt, 100 + CAPABILITY_TTL_MS);
  assert.equal(scheduled[0].delay, CAPABILITY_TTL_MS);
});

test("editor links encode only profile identity and bounded review return state", () => {
  const link = editorHref("services", { context: "manage", id: "first", groupId: "google-ai", returnToReview: true });
  assert.equal(link, "/manage/services/google-ai?id=first&return=review");
  assert.deepEqual(parseEditorRoute(link), { context: "manage", id: "first", section: "services", groupId: "google-ai", returnToReview: true });
  assert.equal(parseEditorRoute("/manage?id=first").section, "template");
  assert.equal(parseEditorRoute("/builder/services/%2Fetc"), null);
  assert.equal(parseEditorRoute("/builder/services/%FF"), null);
  assert.equal(parseEditorRoute("/builder/regions/unexpected"), null);
  assert.equal(parseEditorRoute("/manage/success"), null);
  assert.equal(parseEditorRoute(editorHref("success", { resultId: "public-profile-id" })).resultId, "public-profile-id");
  assert.equal(parseEditorRoute("/builder/review?return=https://outside.invalid").returnToReview, false);
});
