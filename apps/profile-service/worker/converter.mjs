import YAML from "yaml";

import { profileCommentHeader, resolveOutputProfile } from "./profile_options.mjs";
import {
  NodeInputError,
  parseNodeUri,
  recognizedNodeScheme,
  supportedProxyTypes,
} from "./node-adapters.mjs";

const MAX_INPUT_CHARACTERS = 262_144;
const MAX_SUBSCRIPTION_BYTES = 262_144;
const MAX_REMOTE_URLS = 5;
const MAX_NODE_COUNT = 100;
const MAX_NODE_LINE_LENGTH = 8_192;
const FETCH_TIMEOUT_MS = 5_000;
const ALLOWED_PROVIDER_METADATA = ["filter", "exclude-filter"];
const BLOCKED_SUBSCRIPTION_SUFFIXES = new Set(["localhost", "local", "internal", "test", "invalid", "example"]);
const RESERVED_BUILTIN_NAMES = new Set([
  "DIRECT", "REJECT", "REJECT-DROP", "PASS", "GLOBAL", "COMPATIBLE",
]);

export class ConverterError extends Error {
  constructor(message, code = "invalid_converter_input", status = 400) {
    super(message);
    this.name = "ConverterError";
    this.code = code;
    this.status = status;
  }
}

function reject(message, code, status) {
  throw new ConverterError(message, code, status);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeBase64(text) {
  const normalized = text.replace(/-/gu, "+").replace(/_/gu, "/").replace(/\s/gu, "");
  if (!normalized || normalized.length > MAX_SUBSCRIPTION_BYTES || !/^[A-Za-z0-9+/]*={0,2}$/u.test(normalized)) {
    return null;
  }
  try {
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function hasProxyYamlShape(text) {
  return /^\s*(?:---\s*)?(?:proxies\s*:|proxy-groups\s*:)/mu.test(text);
}

function boundedNodeLine(line) {
  if (line.length > MAX_NODE_LINE_LENGTH) {
    reject("A node entry exceeds the size limit", "node_too_large", 413);
  }
  return line.trim();
}

function nameKey(name) {
  return String(name).trim().toLowerCase();
}

function uniqueNodeNames(nodes, reservedNames = []) {
  const used = new Set([
    ...RESERVED_BUILTIN_NAMES,
    ...reservedNames.filter((name) => typeof name === "string").map(nameKey),
  ].map(nameKey));
  return nodes.map((node) => {
    const base = String(node.name ?? "").trim();
    let name = base;
    let suffix = 2;
    while (used.has(nameKey(name))) {
      name = `${base} (${suffix})`;
      suffix += 1;
    }
    used.add(nameKey(name));
    return name === base ? node : { ...node, name };
  });
}

function parseUriLines(text) {
  const lines = text.split(/\r?\n/u)
    .map(boundedNodeLine)
    .filter((line) => line && !line.startsWith("#"));
  if (!lines.length) reject("No proxy nodes were found", "no_nodes");
  if (lines.length > MAX_NODE_COUNT) reject("A maximum of 100 proxy nodes is allowed", "too_many_nodes", 413);
  const nodes = lines.map((line, index) => {
    if (!recognizedNodeScheme(line)) {
      reject("Subscription content must contain supported proxy links", "unsupported_subscription_format");
    }
    try {
      return parseNodeUri(line, index);
    } catch (error) {
      if (error instanceof NodeInputError) {
        reject(`Node ${index + 1}: ${error.message}`, error.code);
      }
      throw error;
    }
  });
  return nodes;
}

function assertJsonValue(value, depth = 0, seen = new Set()) {
  if (depth > 24) reject("A Clash proxy entry is nested too deeply", "invalid_clash_yaml");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) reject("A Clash proxy entry contains a non-finite number", "invalid_clash_yaml");
    return value;
  }
  if (typeof value !== "object") reject("A Clash proxy entry contains an unsupported value", "invalid_clash_yaml");
  if (seen.has(value)) reject("Clash YAML aliases are unsupported", "invalid_clash_yaml");
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => assertJsonValue(item, depth + 1, seen));
    seen.delete(value);
    return result;
  }
  if (!isRecord(value)) reject("A Clash proxy entry must use standard YAML values", "invalid_clash_yaml");
  const result = Object.create(null);
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      reject("A Clash proxy entry contains a reserved key", "invalid_clash_yaml");
    }
    result[key] = assertJsonValue(child, depth + 1, seen);
  }
  seen.delete(value);
  return result;
}

function validateClashNodes(text) {
  let document;
  try {
    document = YAML.parseDocument(text, {
      uniqueKeys: true,
      version: "1.2",
      schema: "core",
      prettyErrors: false,
    });
  } catch {
    reject("Clash YAML could not be parsed", "invalid_clash_yaml");
  }
  if (document.errors.length || document.warnings.length) {
    reject("Clash YAML has invalid or unsupported syntax", "invalid_clash_yaml");
  }
  let parsed;
  try {
    parsed = document.toJS({ mapAsMap: false, maxAliasCount: 0 });
  } catch {
    reject("Clash YAML could not be read", "invalid_clash_yaml");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.proxies)) {
    reject("Clash YAML must contain a proxies list", "invalid_clash_yaml");
  }
  if (!parsed.proxies.length) reject("No proxy nodes were found", "no_nodes");
  if (parsed.proxies.length > MAX_NODE_COUNT) {
    reject("A maximum of 100 proxy nodes is allowed", "too_many_nodes", 413);
  }
  const allowedTypes = supportedProxyTypes();
  const nodes = parsed.proxies.map((rawNode) => {
    const node = assertJsonValue(rawNode);
    if (!isRecord(node)) reject("Every Clash proxy entry must be an object", "invalid_clash_yaml");
    if (typeof node.type !== "string" || !allowedTypes.has(node.type)) {
      reject("Clash YAML contains an unsupported proxy type", "unsupported_node_type");
    }
    if (
      typeof node.name !== "string" ||
      !node.name.trim() ||
      node.name.length > 128 ||
      /[\u0000-\u001f\u007f]/u.test(node.name)
    ) {
      reject("Every Clash proxy entry needs a valid name", "invalid_clash_yaml");
    }
    if (
      typeof node.server !== "string" ||
      !node.server.trim() ||
      node.server.length > 253 ||
      /[\u0000-\u0020\u007f/\\]/u.test(node.server)
    ) {
      reject("Every Clash proxy entry needs a valid server", "invalid_clash_yaml");
    }
    if (!Number.isInteger(node.port) || node.port < 1 || node.port > 65535) {
      reject("Every Clash proxy entry needs a valid port", "invalid_clash_yaml");
    }
    return { ...node, name: node.name.trim(), server: node.server.trim() };
  });
  return nodes;
}

function parseSubscriptionText(rawText) {
  let text = String(rawText).replace(/^\uFEFF/u, "").trim();
  if (!text) reject("Input is empty", "empty_input");
  if (text.length > MAX_INPUT_CHARACTERS) reject("Input exceeds the 256 KiB limit", "input_too_large", 413);
  if (hasProxyYamlShape(text)) return validateClashNodes(text);

  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 1 && !recognizedNodeScheme(lines[0])) {
    const decoded = decodeBase64(lines[0]);
    if (decoded) {
      text = decoded.replace(/^\uFEFF/u, "").trim();
      if (hasProxyYamlShape(text)) return validateClashNodes(text);
    }
  }
  return parseUriLines(text);
}

function allowedHostSet(env) {
  const raw = env?.CONVERTER_SUBSCRIPTION_HOSTS;
  if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) return new Set();
  if (typeof raw !== "string") {
    reject("Subscription host allowlist configuration is invalid", "converter_configuration_invalid", 503);
  }
  const hosts = raw.split(",").map((host) => host.trim().toLowerCase());
  const validHosts = hosts.every((host) => {
    const labels = host.split(".");
    return host.length <= 253 && labels.length >= 2 && labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)
    ) && !BLOCKED_SUBSCRIPTION_SUFFIXES.has(labels.at(-1));
  });
  if (!validHosts) {
    reject("Subscription host allowlist configuration is invalid", "converter_configuration_invalid", 503);
  }
  return new Set(hosts);
}

function validateSubscriptionUrl(raw, allowedHosts) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    reject("Subscription URL is invalid", "invalid_subscription_url");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  const isIpLiteral = hostname.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname);
  const localHost = hostname === "localhost" || [...BLOCKED_SUBSCRIPTION_SUFFIXES].some((suffix) =>
    hostname.endsWith(`.${suffix}`)
  );
  if (url.protocol !== "https:" || url.username || url.password || isIpLiteral || localHost || (url.port && url.port !== "443")) {
    reject("Remote subscriptions must use an approved HTTPS URL", "invalid_subscription_url");
  }
  if (!allowedHosts.has(hostname)) {
    reject("Remote subscription host is not approved", "subscription_host_not_allowed", 403);
  }
  return url.href;
}

async function readBoundedResponse(response, maxBytes) {
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    await response.body?.cancel();
    reject("Combined remote subscriptions exceed the 256 KiB limit", "subscription_too_large", 413);
  }
  if (!response.body) reject("Remote subscription has no content", "subscription_fetch_failed", 502);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        reject("Combined remote subscriptions exceed the 256 KiB limit", "subscription_too_large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    bytes: total,
  };
}

async function fetchSubscription(url, fetcher, maxBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "text/plain, application/yaml, text/yaml" },
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      reject("Remote subscription redirects are not supported", "subscription_redirect_rejected", 422);
    }
    if (!response.ok) {
      await response.body?.cancel();
      reject("Remote subscription could not be fetched", "subscription_fetch_failed", 502);
    }
    return await readBoundedResponse(response, maxBytes);
  } catch (error) {
    if (error instanceof ConverterError) throw error;
    reject("Remote subscription could not be fetched", "subscription_fetch_failed", 502);
  } finally {
    clearTimeout(timer);
  }
}

function hasExplicitPort(text) {
  const authority = text.match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/u)?.[1] ?? "";
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  return hostPort.startsWith("[")
    ? /^\[[^\]]+\]:\d+$/u.test(hostPort)
    : /:\d+$/u.test(hostPort);
}

function isTopLevelRemoteSubscription(text, format) {
  if (format === "proxy") return false;
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    if ((url.pathname && url.pathname !== "/") || url.search) return true;
    if (!hasExplicitPort(text)) return true;
    return format === "subscription";
  } catch {
    return false;
  }
}

function sourceLines(text) {
  return text.split(/\r?\n/u)
    .map(boundedNodeLine)
    .filter((line) => line && !line.startsWith("#"));
}

function parseDirectLines(lines) {
  if (!lines.length) return [];
  return parseUriLines(lines.join("\n"));
}

function prepareTopLevelInput(source, format) {
  const text = String(source).replace(/^\uFEFF/u, "").trim();
  if (!text) reject("Input is empty", "empty_input");
  if (text.length > MAX_INPUT_CHARACTERS) reject("Input exceeds the 256 KiB limit", "input_too_large", 413);
  if (format !== "proxy" && hasProxyYamlShape(text)) {
    return { nodes: validateClashNodes(text), remoteUrls: [] };
  }

  const lines = sourceLines(text);
  if (format !== "proxy" && lines.length === 1 && !recognizedNodeScheme(lines[0])) {
    const decoded = decodeBase64(lines[0]);
    if (decoded) {
      // A pasted Base64 subscription is parsed as one document. Links inside it never trigger fetches.
      return { nodes: parseSubscriptionText(decoded), remoteUrls: [] };
    }
  }
  if (!lines.length) reject("No proxy nodes or subscriptions were found", "no_nodes");

  const nodeLines = [];
  const remoteUrls = [];
  for (const line of lines) {
    if (isTopLevelRemoteSubscription(line, format)) {
      remoteUrls.push(line);
    } else {
      nodeLines.push(line);
    }
  }
  if (remoteUrls.length > MAX_REMOTE_URLS) {
    reject("A maximum of 5 remote subscription URLs is allowed", "too_many_subscriptions", 413);
  }
  return { nodes: parseDirectLines(nodeLines), remoteUrls };
}

function clonePlainValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function reservedProfileNames(profile) {
  const names = [];
  for (const group of profile["proxy-groups"] ?? []) {
    if (isRecord(group) && typeof group.name === "string") names.push(group.name);
  }
  for (const proxy of profile.proxies ?? []) {
    if (isRecord(proxy) && typeof proxy.name === "string") names.push(proxy.name);
  }
  for (const key of ["proxy-providers", "rule-providers"]) {
    if (isRecord(profile[key])) names.push(...Object.keys(profile[key]));
  }
  return names;
}

function profileWithNodes(baseProfile, nodes) {
  if (!isRecord(baseProfile)) reject("Canonical profile data is unavailable", "canonical_profile_unavailable", 503);
  const profile = clonePlainValue(baseProfile);
  if (!isRecord(profile["proxy-providers"]) || !isRecord(profile["proxy-providers"].provider1)) {
    reject("Canonical profile data is incomplete", "canonical_profile_unavailable", 503);
  }
  const provider = profile["proxy-providers"].provider1;
  const inlineProvider = Object.create(null);
  for (const key of ALLOWED_PROVIDER_METADATA) {
    if (Object.hasOwn(provider, key)) inlineProvider[key] = provider[key];
  }
  inlineProvider.type = "inline";
  inlineProvider.payload = uniqueNodeNames(nodes, reservedProfileNames(profile));
  profile["proxy-providers"].provider1 = inlineProvider;
  return profile;
}

export async function convertInput({ input, format = "auto", spec, env = {}, fetcher = globalThis.fetch, profile }) {
  if (typeof input !== "string" || !input.trim()) reject("Input is required", "invalid_input");
  if (input.length > MAX_INPUT_CHARACTERS) reject("Input exceeds the 256 KiB limit", "input_too_large", 413);
  if (!new Set(["auto", "proxy", "subscription"]).has(format)) {
    reject("Format must be auto, proxy, or subscription", "invalid_format");
  }
  const outputProfile = profile ?? resolveOutputProfile({ outputFormat: "yaml", spec });
  const source = input.trim();
  const inputData = prepareTopLevelInput(source, format);
  let nodes = inputData.nodes;
  if (nodes.length > MAX_NODE_COUNT) {
    reject("A maximum of 100 proxy nodes is allowed", "too_many_nodes", 413);
  }
  if (inputData.remoteUrls.length) {
    if (typeof fetcher !== "function") reject("Remote subscriptions are unavailable", "subscription_fetch_failed", 503);
    const allowedHosts = allowedHostSet(env);
    // Validate every explicit remote before any fetch so a denied entry cannot leave a partial conversion.
    const urls = inputData.remoteUrls.map((value) => validateSubscriptionUrl(value, allowedHosts));
    let downloadedBytes = 0;
    for (const url of urls) {
      const remainingBytes = MAX_SUBSCRIPTION_BYTES - downloadedBytes;
      if (remainingBytes <= 0) {
        reject("Combined remote subscriptions exceed the 256 KiB limit", "subscription_too_large", 413);
      }
      const downloaded = await fetchSubscription(url, fetcher, remainingBytes);
      downloadedBytes += downloaded.bytes;
      const importedNodes = parseSubscriptionText(downloaded.text);
      if (nodes.length + importedNodes.length > MAX_NODE_COUNT) {
        reject("A maximum of 100 proxy nodes is allowed", "too_many_nodes", 413);
      }
      nodes = [...nodes, ...importedNodes];
    }
  }
  if (!nodes.length) reject("No proxy nodes were found", "no_nodes");
  const config = profileWithNodes(outputProfile, nodes);
  let yaml;
  try {
    yaml = YAML.stringify(config, { lineWidth: 0, sortMapEntries: false });
    const comment = profileCommentHeader(spec?.language);
    if (comment) yaml = `${comment}\n${yaml}`;
  } catch {
    reject("Canonical profile could not be serialized", "profile_serialization_failed", 500);
  }
  return { yaml, nodeCount: nodes.length };
}

export function parseSubscriptionContent(input) {
  return uniqueNodeNames(parseSubscriptionText(input));
}
