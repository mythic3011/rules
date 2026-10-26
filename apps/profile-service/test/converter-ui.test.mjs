import assert from "node:assert/strict";
import test from "node:test";

import { attachConverterUI } from "../public/converter.js";
import { loadEnglishLocale, localeJsonFetcher } from "./ui-locale-fixtures.mjs";
import { setLanguage } from "../public/i18n.mjs";

await loadEnglishLocale();

class FakeElement {
  constructor() {
    this.value = "";
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.listeners = new Map();
    this.classes = new Set();
    this.dataset = {};
    this.focusCount = 0;
    this.scrollCount = 0;
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

  focus() { this.focusCount += 1; }

  scrollIntoView() { this.scrollCount += 1; }
}

function createElements() {
  const elements = {
    form: new FakeElement(),
    input: new FakeElement(),
    format: new FakeElement(),
    submitButton: new FakeElement(),
    clearButton: new FakeElement(),
    status: new FakeElement(),
    outputPanel: new FakeElement(),
    output: new FakeElement(),
    outputTitle: new FakeElement(),
    outputSummary: new FakeElement(),
    nodeCount: new FakeElement(),
    copyButton: new FakeElement(),
    downloadButton: new FakeElement(),
  };
  elements.format.value = "auto";
  elements.outputPanel.hidden = true;
  return elements;
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

test("converter shows a localized safe reason with the original input line number", async () => {
  const elements = createElements();
  elements.input.value = "socks5://valid.example:1080\n\nnot-a-proxy";
  const ui = attachConverterUI(elements, async () => new Response(JSON.stringify({
    error: "unsupported_subscription_format",
    line: 3,
    message: "must never be displayed",
  }), { status: 400, headers: { "content-type": "application/json" } }));

  await elements.form.dispatch("submit");

  assert.match(elements.status.textContent, /^Line 3: This input does not contain a supported proxy link/u);
  assert.equal(elements.input.focusCount, 1);
  assert.equal(elements.input.scrollCount, 1);
  assert.doesNotMatch(elements.status.textContent, /must never be displayed/);

  await setLanguage("zh-Hant", undefined, { fetcher: localeJsonFetcher, persist: false });
  ui.languageChanged();
  assert.doesNotMatch(elements.status.textContent, /^Line 3:/u);
  assert.doesNotMatch(elements.status.textContent, /This input does not contain a supported proxy link/u);
  assert.match(elements.status.textContent, /3/u);
  await loadEnglishLocale();
  ui.languageChanged();
});

test("response line metadata is bounded by the submitted input snapshot", async () => {
  const elements = createElements();
  elements.input.value = "not-a-proxy";
  let resolveResponse;
  const ui = attachConverterUI(elements, () => new Promise((resolve) => {
    resolveResponse = resolve;
  }));

  const converting = elements.form.dispatch("submit");
  elements.input.value = "one\ntwo\nthree";
  resolveResponse(new Response(JSON.stringify({
    error: "unsupported_subscription_format",
    line: 3,
    message: "must never be displayed",
  }), { status: 400, headers: { "content-type": "application/json" } }));
  await converting;

  assert.equal(elements.status.textContent, "This input does not contain a supported proxy link or subscription.");
  assert.doesNotMatch(elements.status.textContent, /^Line 3:/u);
  ui.clear(false);
});

test("only mode validation is translated locally without a conversion request", async () => {
  const elements = createElements();
  elements.input.value = "socks5://proxy.example:1080";
  let requests = 0;
  attachConverterUI(elements, async () => {
    requests += 1;
    return new Response("{}", { status: 200 });
  }, () => {
    const error = new Error("Do not display raw local errors");
    error.translationKey = "onlyRequiresRegion";
    throw error;
  });

  await elements.form.dispatch("submit");

  assert.equal(requests, 0);
  assert.equal(elements.status.textContent, "Only mode requires at least one routable region.");
  assert.equal(elements.input.focusCount, 1);
  assert.doesNotMatch(elements.status.textContent, /Do not display raw local errors/u);
});

test("editing input makes the generated YAML stale and disables export actions", async () => {
  const elements = createElements();
  elements.input.value = "socks5://proxy.example:1080";
  const ui = attachConverterUI(elements, async () => new Response(JSON.stringify({
    yaml: "proxies:\n  - name: node",
    nodeCount: 1,
  }), { headers: { "content-type": "application/json" } }));

  await elements.form.dispatch("submit");
  assert.equal(elements.copyButton.disabled, false);
  assert.equal(elements.downloadButton.disabled, false);
  assert.equal(elements.outputTitle.scrollCount, 0);
  assert.equal(elements.outputPanel.scrollCount, 1);

  elements.input.value += "\nhttps://proxy.example:443";
  await elements.input.dispatch("input");

  assert.equal(elements.outputPanel.hidden, false);
  assert.equal(elements.outputSummary.dataset.state, "outdated");
  assert.equal(elements.outputSummary.dataset.i18n, "converterOutputStale");
  assert.equal(elements.copyButton.disabled, true);
  assert.equal(elements.downloadButton.disabled, true);
  assert.match(elements.status.textContent, /older snapshot/u);

  ui.languageChanged();
  assert.equal(elements.outputSummary.dataset.state, "outdated");
});

test("profile changes make the generated YAML stale", async () => {
  const elements = createElements();
  elements.input.value = "socks5://proxy.example:1080";
  const ui = attachConverterUI(elements, async () => new Response(JSON.stringify({
    yaml: "proxies:\n  - name: node",
    nodeCount: 1,
  }), { headers: { "content-type": "application/json" } }));

  await elements.form.dispatch("submit");
  ui.profileChanged();

  assert.equal(elements.outputSummary.dataset.state, "outdated");
  assert.equal(elements.copyButton.disabled, true);
  assert.equal(elements.downloadButton.disabled, true);
});

test("changing the input type makes the generated YAML stale", async () => {
  const elements = createElements();
  elements.input.value = "socks5://proxy.example:1080";
  const ui = attachConverterUI(elements, async () => new Response(JSON.stringify({
    yaml: "proxies:\n  - name: node",
    nodeCount: 1,
  }), { headers: { "content-type": "application/json" } }));

  await elements.form.dispatch("submit");
  elements.format.value = "subscription";
  await elements.format.dispatch("change");

  assert.equal(elements.outputSummary.dataset.state, "outdated");
  assert.equal(elements.copyButton.disabled, true);
  assert.equal(elements.downloadButton.disabled, true);
  ui.clear(false);
});

test("editing during a request aborts it and ignores a late result", async () => {
  const elements = createElements();
  elements.input.value = "socks5://proxy.example:1080";
  let resolveResponse;
  let requestSignal;
  const ui = attachConverterUI(elements, (_url, options) => {
    requestSignal = options.signal;
    return new Promise((resolve) => { resolveResponse = resolve; });
  });

  const pending = elements.form.dispatch("submit");
  assert.equal(elements.submitButton.disabled, true);
  elements.input.value = "socks5://changed.example:1080";
  await elements.input.dispatch("input");
  assert.equal(requestSignal.aborted, true);
  assert.equal(elements.submitButton.disabled, false);

  resolveResponse(new Response(JSON.stringify({ yaml: "proxies: []", nodeCount: 0 }), {
    headers: { "content-type": "application/json" },
  }));
  await pending;

  assert.equal(elements.outputPanel.hidden, true);
  assert.equal(elements.output.value, "");
  assert.match(elements.status.textContent, /changed during conversion/u);
  ui.clear(false);
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
