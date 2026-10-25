const MAX_NODE_NAME_LENGTH = 128;
const SUPPORTED_TYPES = new Set([
  "http",
  "socks5",
  "ss",
  "vmess",
  "trojan",
  "vless",
  "hysteria2",
  "tuic",
]);
const VLESS_FLOWS = new Set(["xtls-rprx-vision"]);
const TUIC_CONGESTION_CONTROLLERS = new Set(["cubic", "new_reno", "bbr"]);
const TUIC_UDP_RELAY_MODES = new Set(["native", "quic"]);

export class NodeInputError extends Error {
  constructor(message, code = "invalid_node") {
    super(message);
    this.name = "NodeInputError";
    this.code = code;
  }
}

function fail(message, code) {
  throw new NodeInputError(message, code);
}

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail("A node link contains invalid percent encoding");
  }
}

function cleanText(value, fallback) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  if (text.length > MAX_NODE_NAME_LENGTH || /[\u0000-\u001f\u007f]/u.test(text)) {
    fail("A node name is invalid or too long");
  }
  return text;
}

function nameFromHash(hash, fallback) {
  return cleanText(hash ? decode(hash.slice(1)) : "", fallback);
}

function authorityHost(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function checkedPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("A node port must be an integer from 1 to 65535");
  }
  return port;
}

function explicitUrlPort(raw) {
  const match = raw.match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/u);
  if (!match) return "";
  const hostPort = match[1].slice(match[1].lastIndexOf("@") + 1);
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    return end >= 0 && hostPort[end + 1] === ":" ? hostPort.slice(end + 2) : "";
  }
  const colon = hostPort.lastIndexOf(":");
  return colon >= 0 && /^\d+$/u.test(hostPort.slice(colon + 1)) ? hostPort.slice(colon + 1) : "";
}

function portFromUrl(url, raw) {
  return checkedPort(url.port || explicitUrlPort(raw));
}

function checkedServer(value) {
  const server = String(value ?? "").trim();
  if (
    !server ||
    server.length > 253 ||
    /[\u0000-\u0020\u007f/\\]/u.test(server)
  ) {
    fail("A node server address is invalid");
  }
  return server;
}

function checkedUrl(raw, schemes) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("A node link is malformed");
  }
  if (!schemes.has(url.protocol.slice(0, -1).toLowerCase())) {
    fail("A node link uses an unsupported scheme", "unsupported_node_scheme");
  }
  if (!url.hostname) fail("A node link must include a server address");
  return url;
}

function ensureAllowedQuery(url, allowed) {
  const seen = new Set();
  for (const key of url.searchParams.keys()) {
    if (seen.has(key)) fail(`A node option is repeated: ${key}`, "unsupported_node_option");
    seen.add(key);
    if (!allowed.has(key)) fail(`A node option is unsupported: ${key}`, "unsupported_node_option");
  }
}

function ensureEmptyPath(url) {
  if (url.pathname && url.pathname !== "/") {
    fail("Node links cannot contain an unsupported path", "unsupported_node_option");
  }
}

function ensureAliasValuesMatch(url, aliases) {
  for (const [left, right] of aliases) {
    const leftValue = url.searchParams.get(left);
    const rightValue = url.searchParams.get(right);
    if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
      fail("Node link contains conflicting alias options", "conflicting_node_options");
    }
  }
}

function optionalBoolean(value, optionName) {
  if (value === null || value === "" || value === undefined) return false;
  if (value === true) return true;
  if (value === false) return false;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  fail(`A node option is invalid: ${optionName}`);
}

function optionalList(value) {
  if (!value) return undefined;
  const values = String(value).split(",").map((item) => item.trim()).filter(Boolean);
  return values.length ? values : undefined;
}

function decodeBase64(value) {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/").replace(/\s/gu, "");
  if (!normalized || normalized.length > 32_768 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(normalized)) {
    fail("A node link has invalid base64 data");
  }
  try {
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("A node link has invalid base64 data");
  }
}

function splitHostPort(authority) {
  const ipv6Match = authority.match(/^\[([^\]]+)\]:(\d+)$/u);
  if (ipv6Match) return [ipv6Match[1], ipv6Match[2]];
  const match = authority.match(/^(.+):(\d+)$/u);
  if (!match || match[1].includes(":")) fail("A Shadowsocks link is malformed");
  return [match[1], match[2]];
}

function parseShadowsocks(raw, index) {
  const withoutFragment = raw.split("#", 1)[0].slice("ss://".length);
  let authority = withoutFragment;
  if (!authority.includes("@")) {
    authority = decodeBase64(authority);
  }
  const at = authority.lastIndexOf("@");
  if (at <= 0 || at === authority.length - 1) fail("A Shadowsocks link is malformed");

  const credentials = authority.slice(0, at);
  const target = authority.slice(at + 1).split("?", 1)[0];
  const colon = credentials.indexOf(":");
  if (colon <= 0) {
    const decoded = decodeBase64(credentials);
    const decodedColon = decoded.indexOf(":");
    if (decodedColon <= 0) fail("A Shadowsocks link is malformed");
    return buildShadowsocks(
      decoded.slice(0, decodedColon),
      decoded.slice(decodedColon + 1),
      target,
      raw,
      index,
    );
  }
  return buildShadowsocks(
    decode(credentials.slice(0, colon)),
    decode(credentials.slice(colon + 1)),
    target,
    raw,
    index,
  );
}

function buildShadowsocks(cipher, password, target, raw, index) {
  const [server, portText] = splitHostPort(target);
  if (!cipher || !password) fail("A Shadowsocks link needs a cipher and password");
  const query = raw.split("#", 1)[0].split("?", 2)[1] ?? "";
  if (query) fail("Shadowsocks plugin and query options are unsupported", "unsupported_node_option");
  return {
    name: nameFromHash(raw.includes("#") ? `#${raw.slice(raw.indexOf("#") + 1)}` : "", `Imported ${index + 1}`),
    type: "ss",
    server: checkedServer(decode(server)),
    port: checkedPort(portText),
    cipher,
    password,
    udp: true,
  };
}

function parseVmess(raw, index) {
  const body = raw.slice("vmess://".length);
  const hashIndex = body.indexOf("#");
  const payloadText = hashIndex < 0 ? body : body.slice(0, hashIndex);
  let payload;
  try {
    payload = JSON.parse(decodeBase64(payloadText));
  } catch (error) {
    if (error instanceof NodeInputError) throw error;
    fail("A VMess link has invalid JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail("A VMess link has invalid JSON");
  }
  const allowed = new Set([
    "v", "ps", "add", "port", "id", "aid", "scy", "net", "type", "host", "path",
    "tls", "sni", "alpn", "fp", "allowInsecure",
  ]);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) fail(`A VMess option is unsupported: ${key}`, "unsupported_node_option");
  }
  const network = String(payload.net ?? "tcp").toLowerCase();
  if (!new Set(["tcp", "ws", "grpc"]).has(network)) {
    fail("This VMess network type is unsupported", "unsupported_node_option");
  }
  if (payload.type && payload.type !== "none") {
    fail("VMess TCP header obfuscation is unsupported", "unsupported_node_option");
  }
  const proxy = {
    name: cleanText(payload.ps, `Imported ${index + 1}`),
    type: "vmess",
    server: checkedServer(payload.add),
    port: checkedPort(payload.port),
    uuid: cleanText(payload.id, ""),
    alterId: Number(payload.aid ?? 0),
    cipher: cleanText(payload.scy, "auto"),
    udp: true,
  };
  if (!proxy.uuid || !Number.isInteger(proxy.alterId) || proxy.alterId < 0) {
    fail("A VMess link has invalid identity options");
  }
  if (network !== "tcp") proxy.network = network;
  if (network === "ws") {
    proxy["ws-opts"] = {
      path: cleanText(payload.path, "/"),
      headers: payload.host ? { Host: checkedServer(payload.host) } : undefined,
    };
  } else if (network === "grpc") {
    if (payload.host) fail("VMess host is unsupported for gRPC", "unsupported_node_option");
    proxy["grpc-opts"] = { "grpc-service-name": cleanText(payload.path, "") };
  } else if (payload.path || payload.host) {
    fail("VMess path and host options require WebSocket or gRPC", "unsupported_node_option");
  }
  const tls = payload.tls === "tls"
    ? true
    : payload.tls === "none" || payload.tls === ""
      ? false
      : optionalBoolean(payload.tls, "tls");
  if (tls) proxy.tls = true;
  if (payload.sni) proxy.servername = checkedServer(payload.sni);
  const alpn = optionalList(payload.alpn);
  if (alpn) proxy.alpn = alpn;
  if (payload.fp) proxy["client-fingerprint"] = cleanText(payload.fp, "");
  const allowInsecure = optionalBoolean(payload.allowInsecure, "allowInsecure");
  if (allowInsecure) proxy["skip-cert-verify"] = true;
  if ((payload.sni || payload.alpn || payload.fp || allowInsecure) && !tls) {
    fail("VMess TLS options require tls=true", "unsupported_node_option");
  }
  return proxy;
}

function parseHttpOrSocks(raw, index) {
  const url = checkedUrl(raw, new Set(["http", "https", "socks5", "socks5h"]));
  const isSocks = url.protocol === "socks5:" || url.protocol === "socks5h:";
  if (url.pathname && url.pathname !== "/") fail("Proxy links cannot contain a path", "unsupported_node_option");
  ensureAllowedQuery(url, isSocks ? new Set(["udp"]) : new Set());
  const proxy = {
    name: nameFromHash(url.hash, `Imported ${index + 1}`),
    type: isSocks ? "socks5" : "http",
    server: checkedServer(authorityHost(url.hostname)),
    port: portFromUrl(url, raw),
  };
  if (url.username || url.password) {
    proxy.username = decode(url.username);
    proxy.password = decode(url.password);
  }
  if (isSocks) {
    proxy.udp = optionalBoolean(url.searchParams.get("udp"), "udp");
  }
  if (url.protocol === "https:") proxy.tls = true;
  return proxy;
}

function queryValue(url, ...keys) {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value !== null && value !== "") return value;
  }
  return "";
}

function parseTrojan(raw, index) {
  const url = checkedUrl(raw, new Set(["trojan"]));
  ensureEmptyPath(url);
  ensureAliasValuesMatch(url, [["sni", "peer"], ["path", "serviceName"]]);
  ensureAllowedQuery(url, new Set(["sni", "peer", "alpn", "allowInsecure", "type", "path", "host", "serviceName"]));
  const network = queryValue(url, "type");
  if (network && !new Set(["ws", "grpc"]).has(network)) {
    fail("This Trojan network type is unsupported", "unsupported_node_option");
  }
  const password = decode(url.username || url.password);
  if (!password) fail("A Trojan link needs a password");
  const proxy = {
    name: nameFromHash(url.hash, `Imported ${index + 1}`),
    type: "trojan",
    server: checkedServer(authorityHost(url.hostname)),
    port: checkedPort(url.port),
    password,
    udp: true,
  };
  const sni = queryValue(url, "sni", "peer");
  if (sni) proxy.sni = checkedServer(sni);
  const alpn = optionalList(queryValue(url, "alpn"));
  if (alpn) proxy.alpn = alpn;
  if (optionalBoolean(queryValue(url, "allowInsecure"), "allowInsecure")) {
    proxy["skip-cert-verify"] = true;
  }
  if (network === "ws") {
    if (queryValue(url, "serviceName") && !queryValue(url, "path")) {
      fail("Trojan serviceName requires gRPC", "unsupported_node_option");
    }
    proxy.network = "ws";
    proxy["ws-opts"] = {
      path: cleanText(queryValue(url, "path"), "/"),
      headers: queryValue(url, "host") ? { Host: checkedServer(queryValue(url, "host")) } : undefined,
    };
  } else if (network === "grpc") {
    if (queryValue(url, "host")) fail("Trojan host is unsupported for gRPC", "unsupported_node_option");
    proxy.network = "grpc";
    proxy["grpc-opts"] = { "grpc-service-name": cleanText(queryValue(url, "serviceName", "path"), "") };
  } else if (queryValue(url, "path", "host", "serviceName")) {
    fail("Trojan path, host, and service options require WebSocket or gRPC", "unsupported_node_option");
  }
  return proxy;
}

function parseVless(raw, index) {
  const url = checkedUrl(raw, new Set(["vless"]));
  ensureEmptyPath(url);
  ensureAliasValuesMatch(url, [["path", "serviceName"]]);
  const allowed = new Set([
    "encryption", "security", "type", "host", "path", "sni", "fp", "flow", "alpn",
    "allowInsecure", "pbk", "sid", "serviceName",
  ]);
  ensureAllowedQuery(url, allowed);
  if (queryValue(url, "encryption") && queryValue(url, "encryption") !== "none") {
    fail("This VLESS encryption option is unsupported", "unsupported_node_option");
  }
  const network = queryValue(url, "type") || "tcp";
  if (!new Set(["tcp", "ws", "grpc"]).has(network)) {
    fail("This VLESS network type is unsupported", "unsupported_node_option");
  }
  const security = queryValue(url, "security") || "none";
  if (!new Set(["none", "tls", "reality"])
    .has(security)) fail("This VLESS security mode is unsupported", "unsupported_node_option");
  const uuid = decode(url.username);
  if (!uuid) fail("A VLESS link needs a UUID");
  const proxy = {
    name: nameFromHash(url.hash, `Imported ${index + 1}`),
    type: "vless",
    server: checkedServer(authorityHost(url.hostname)),
    port: checkedPort(url.port),
    uuid,
    udp: true,
  };
  if (network !== "tcp") proxy.network = network;
  if (network === "ws") {
    if (queryValue(url, "serviceName") && !queryValue(url, "path")) {
      fail("VLESS serviceName requires gRPC", "unsupported_node_option");
    }
    proxy["ws-opts"] = {
      path: cleanText(queryValue(url, "path"), "/"),
      headers: queryValue(url, "host") ? { Host: checkedServer(queryValue(url, "host")) } : undefined,
    };
  } else if (network === "grpc") {
    if (queryValue(url, "host")) fail("VLESS host is unsupported for gRPC", "unsupported_node_option");
    proxy["grpc-opts"] = { "grpc-service-name": cleanText(queryValue(url, "serviceName", "path"), "") };
  } else if (queryValue(url, "path", "host", "serviceName")) {
    fail("VLESS path, host, and service options require WebSocket or gRPC", "unsupported_node_option");
  }
  const flow = queryValue(url, "flow");
  if (flow) {
    if (!VLESS_FLOWS.has(flow)) fail("This VLESS flow is unsupported", "unsupported_node_option");
    proxy.flow = flow;
  }
  if (security === "tls") {
    proxy.tls = true;
  } else if (security === "reality") {
    const publicKey = queryValue(url, "pbk");
    if (!publicKey) fail("A VLESS Reality link needs a public key");
    proxy.tls = true;
    proxy["reality-opts"] = {
      "public-key": publicKey,
      "short-id": queryValue(url, "sid"),
    };
  } else if (queryValue(url, "sni", "fp", "alpn", "allowInsecure", "pbk", "sid")) {
    fail("VLESS TLS options require security=tls or security=reality", "unsupported_node_option");
  }
  const sni = queryValue(url, "sni");
  if (sni) proxy.servername = checkedServer(sni);
  const fingerprint = queryValue(url, "fp");
  if (fingerprint) proxy["client-fingerprint"] = cleanText(fingerprint, "");
  const alpn = optionalList(queryValue(url, "alpn"));
  if (alpn) proxy.alpn = alpn;
  if (optionalBoolean(queryValue(url, "allowInsecure"), "allowInsecure")) {
    proxy["skip-cert-verify"] = true;
  }
  return proxy;
}

function parseHysteria2(raw, index) {
  const url = checkedUrl(raw, new Set(["hysteria2", "hy2"]));
  ensureEmptyPath(url);
  ensureAllowedQuery(url, new Set(["sni", "obfs", "obfs-password", "insecure", "alpn", "pinSHA256", "mport"]));
  if (queryValue(url, "mport")) fail("Hysteria2 port hopping is unsupported", "unsupported_node_option");
  const password = decode(url.username || url.password);
  if (!password) fail("A Hysteria2 link needs a password");
  const proxy = {
    name: nameFromHash(url.hash, `Imported ${index + 1}`),
    type: "hysteria2",
    server: checkedServer(authorityHost(url.hostname)),
    port: checkedPort(url.port),
    password,
    udp: true,
  };
  const sni = queryValue(url, "sni");
  if (sni) proxy.sni = checkedServer(sni);
  const obfs = queryValue(url, "obfs");
  const obfsPassword = queryValue(url, "obfs-password");
  if (obfs && obfs !== "salamander") fail("This Hysteria2 obfuscation is unsupported", "unsupported_node_option");
  if (Boolean(obfs) !== Boolean(obfsPassword)) fail("Hysteria2 obfuscation needs both type and password");
  if (obfs) {
    proxy.obfs = obfs;
    proxy["obfs-password"] = obfsPassword;
  }
  if (optionalBoolean(queryValue(url, "insecure"), "insecure")) proxy["skip-cert-verify"] = true;
  const alpn = optionalList(queryValue(url, "alpn"));
  if (alpn) proxy.alpn = alpn;
  if (queryValue(url, "pinSHA256")) fail("Hysteria2 certificate pinning is unsupported", "unsupported_node_option");
  return proxy;
}

function parseTuic(raw, index) {
  const url = checkedUrl(raw, new Set(["tuic"]));
  ensureEmptyPath(url);
  const allowed = new Set([
    "congestion_control", "udp_relay_mode", "alpn", "sni", "allowInsecure", "reduce_rtt",
    "heartbeat", "fast_connect", "disable_sni",
  ]);
  ensureAllowedQuery(url, allowed);
  const uuid = decode(url.username);
  const password = decode(url.password);
  if (!uuid || !password) fail("A TUIC link needs a UUID and password");
  const proxy = {
    name: nameFromHash(url.hash, `Imported ${index + 1}`),
    type: "tuic",
    server: checkedServer(authorityHost(url.hostname)),
    port: checkedPort(url.port),
    uuid,
    password,
    udp: true,
  };
  const congestion = queryValue(url, "congestion_control");
  if (congestion) {
    if (!TUIC_CONGESTION_CONTROLLERS.has(congestion)) {
      fail("This TUIC congestion controller is unsupported", "unsupported_node_option");
    }
    proxy["congestion-controller"] = congestion;
  }
  const relay = queryValue(url, "udp_relay_mode");
  if (relay) {
    if (!TUIC_UDP_RELAY_MODES.has(relay)) {
      fail("This TUIC UDP relay mode is unsupported", "unsupported_node_option");
    }
    proxy["udp-relay-mode"] = relay;
  }
  const alpn = optionalList(queryValue(url, "alpn"));
  if (alpn) proxy.alpn = alpn;
  const sni = queryValue(url, "sni");
  if (sni) proxy.sni = checkedServer(sni);
  if (optionalBoolean(queryValue(url, "allowInsecure"), "allowInsecure")) proxy["skip-cert-verify"] = true;
  if (optionalBoolean(queryValue(url, "reduce_rtt"), "reduce_rtt")) proxy["reduce-rtt"] = true;
  if (optionalBoolean(queryValue(url, "fast_connect"), "fast_connect")) proxy["fast-open"] = true;
  if (queryValue(url, "heartbeat")) {
    const heartbeat = Number(queryValue(url, "heartbeat"));
    if (!Number.isFinite(heartbeat) || heartbeat <= 0) fail("TUIC heartbeat is invalid");
    proxy["heartbeat-interval"] = heartbeat;
  }
  if (optionalBoolean(queryValue(url, "disable_sni"), "disable_sni")) {
    fail("TUIC disable_sni is unsupported", "unsupported_node_option");
  }
  return proxy;
}

const ADAPTERS = new Map([
  ["socks5", parseHttpOrSocks],
  ["socks5h", parseHttpOrSocks],
  ["http", parseHttpOrSocks],
  ["https", parseHttpOrSocks],
  ["ss", parseShadowsocks],
  ["vmess", parseVmess],
  ["trojan", parseTrojan],
  ["vless", parseVless],
  ["hysteria2", parseHysteria2],
  ["hy2", parseHysteria2],
  ["tuic", parseTuic],
]);

export function recognizedNodeScheme(value) {
  const match = String(value).match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\//u);
  return match ? ADAPTERS.has(match[1].toLowerCase()) : false;
}

export function parseNodeUri(value, index = 0) {
  const raw = String(value).trim();
  const match = raw.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\//u);
  if (!match) fail("Input is not a supported node link", "unsupported_node_scheme");
  const scheme = match[1].toLowerCase();
  const adapter = ADAPTERS.get(scheme);
  if (!adapter) fail("The input uses an unsupported node scheme", "unsupported_node_scheme");
  return adapter(raw, index);
}

export function supportedProxyTypes() {
  return new Set(SUPPORTED_TYPES);
}
