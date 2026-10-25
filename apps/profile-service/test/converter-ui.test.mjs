import assert from "node:assert/strict";
import test from "node:test";

import { attachConverterUI } from "../public/converter.js";
import { loadEnglishLocale } from "./ui-locale-fixtures.mjs";

await loadEnglishLocale();

class FakeElement {
  constructor() {
    this.value = "";
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  async dispatch(name, event = {}) {
    return this.listeners.get(name)?.({ preventDefault() {}, ...event });
  }

  focus() {}
}

function createElements() {
  return {
    form: new FakeElement(),
    input: new FakeElement(),
    format: new FakeElement(),
    submitButton: new FakeElement(),
    clearButton: new FakeElement(),
    status: new FakeElement(),
    outputPanel: new FakeElement(),
    output: new FakeElement(),
    nodeCount: new FakeElement(),
    copyButton: new FakeElement(),
    downloadButton: new FakeElement(),
  };
}

test("converter posts the selected input type without putting credentials in the request URL", async () => {
  const elements = createElements();
  const secretInput = "socks5h://alice:private-pass@proxy.example:1080?auth=private-token";
  elements.input.value = secretInput;
  elements.format.value = "proxy";
  let request;
  attachConverterUI(elements, async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ yaml: "proxies:\n  - name: node", nodeCount: 1 }), {
      headers: { "content-type": "application/json" },
    });
  });

  await elements.form.dispatch("submit");

  assert.equal(request.url, "/api/v1/convert");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.cache, "no-store");
  assert.deepEqual(JSON.parse(request.options.body), { input: secretInput, format: "proxy" });
  assert.equal(elements.output.value, "proxies:\n  - name: node");
  assert.equal(elements.nodeCount.textContent, "1 node");
  assert.equal(elements.outputPanel.hidden, false);
  assert.doesNotMatch(elements.status.textContent, /private-pass|private-token|alice/);

  await elements.clearButton.dispatch("click");
  assert.equal(elements.input.value, "");
  assert.equal(elements.output.value, "");
  assert.equal(elements.outputPanel.hidden, true);
});

test("converter sends the shared typed policy spec separately from input format", async () => {
  const elements = createElements();
  elements.input.value = "socks5://proxy.example:1080";
  elements.format.value = "auto";
  const spec = {
    baseProfile: "ai-balanced",
    disabledNodeRegions: ["hk"],
    onlyNodeRegions: [],
    preferredNodeRegions: ["us", "jp", "sg"],
    disabledServices: ["chatgpt"],
    preferredServices: ["claude"],
    allowDirect: false,
    failClosed: true,
    language: "zh-Hant",
  };
  let requestBody;
  attachConverterUI(elements, async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ yaml: "proxies: []", nodeCount: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }, () => spec);

  await elements.form.dispatch("submit");

  assert.deepEqual(requestBody, { input: elements.input.value, format: "auto", spec });
  assert.equal(elements.outputPanel.hidden, false);
});

test("converter hides backend error details that could contain the submitted URL", async () => {
  const elements = createElements();
  const secretInput = "https://alice:private-pass@feed.example/list?token=private-token";
  elements.input.value = secretInput;
  elements.format.value = "subscription";
  attachConverterUI(elements, async () => new Response(JSON.stringify({
    error: "invalid_subscription",
    message: `Could not parse ${secretInput}`,
  }), { status: 400, headers: { "content-type": "application/json" } }));

  await elements.form.dispatch("submit");

  assert.equal(elements.outputPanel.hidden, true);
  assert.match(elements.status.textContent, /Could not convert this input/);
  assert.doesNotMatch(elements.status.textContent, /private-pass|private-token|alice|feed\.example/);
});

test("clearing while a conversion is pending aborts it and prevents stale output", async () => {
  const elements = createElements();
  elements.input.value = "https://feed.example/list";
  let aborted = false;
  attachConverterUI(elements, (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    });
  }));

  const pending = elements.form.dispatch("submit");
  assert.equal(elements.submitButton.disabled, true);
  await elements.clearButton.dispatch("click");
  await pending;

  assert.equal(aborted, true);
  assert.equal(elements.submitButton.disabled, false);
  assert.equal(elements.input.value, "");
  assert.equal(elements.output.value, "");
  assert.equal(elements.outputPanel.hidden, true);
  assert.equal(elements.status.textContent, "Input and output cleared.");
});
