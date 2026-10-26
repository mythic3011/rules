import {
  ProfileSpecError,
  normalizeProfileSpec,
  resolveProfileSpec,
  solveSubconverterPlan,
  summarizeResolvedProfile,
  runtimeData,
} from "./solver.mjs";
import { renderIni, renderIniTemplate } from "./render.mjs";
import { getProfileOptions } from "./profile_options.mjs";
import { ConverterError, convertInput } from "./converter.mjs";
import {
  StoreUnavailableError,
  createProfile,
  getManagedProfile,
  getProfileByReadToken,
  rotateReadToken,
  updateManagedProfile,
} from "./store.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};
const SUBSCRIPTION_HEADERS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;
// RFC 9110 tokens and quoted strings allow parameters without accepting media-type prefixes.
const HTTP_TOKEN = String.raw`[!#$%&'*+.^_\x60|~0-9A-Za-z-]+`;
const HTTP_QUOTED_STRING = String.raw`"(?:[\t \x21\x23-\x5b\x5d-\x7e\x80-\xff]|\\[\t \x21-\x7e\x80-\xff])*"`;
const JSON_MEDIA_TYPE_RE = new RegExp(
  String.raw`^[ \t]*application/json(?:[ \t]*;[ \t]*${HTTP_TOKEN}[ \t]*=[ \t]*(?:${HTTP_TOKEN}|${HTTP_QUOTED_STRING}))*[ \t]*$`,
  "i",
);

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function errorResponse(error) {
  if (error instanceof ConverterError) {
    const response = { error: error.code, message: error.message };
    if (Number.isSafeInteger(error.line) && error.line > 0) response.line = error.line;
    return json(response, error.status);
  }
  if (error instanceof ProfileSpecError) {
    return json({ error: error.code, message: error.message }, error.code === "body_too_large" ? 413 : 400);
  }
  if (error instanceof StoreUnavailableError) {
    return json({ error: "profile_store_unavailable", message: error.message }, 503);
  }
  console.error({ event: "profile_service_error" });
  return json({ error: "internal_error", message: "Unexpected profile service error" }, 500);
}

async function enforceWriteRateLimit(request, env, message = "Too many profile write requests") {
  if (!env?.PROFILE_WRITE_LIMITER) return null;
  const key = request.headers.get("cf-connecting-ip") || "local-development";
  const result = await env.PROFILE_WRITE_LIMITER.limit({ key });
  if (result.success) return null;
  return json(
    { error: "rate_limited", message },
    429,
    { "retry-after": "60" },
  );
}

async function readBodyText(request, maxBytes) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(bytes) || bytes > maxBytes) {
      throw new ProfileSpecError("Request body is too large", "body_too_large");
    }
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ProfileSpecError("Request body is too large", "body_too_large");
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
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ProfileSpecError("Malformed JSON body", "invalid_json");
  }
}

async function parseJson(request, maxBytes = 32_768) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!JSON_MEDIA_TYPE_RE.test(contentType)) {
    throw new ProfileSpecError("Content-Type must be application/json", "invalid_content_type");
  }
  const text = await readBodyText(request, maxBytes);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ProfileSpecError("Malformed JSON body", "invalid_json");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProfileSpecError("Request body must be an object", "invalid_request");
  }
  return body;
}

function bearer(request) {
  const value = request.headers.get("authorization") ?? "";
  const match = value.match(/^Bearer +([A-Za-z0-9_-]+)$/i);
  return match && TOKEN_RE.test(match[1]) ? match[1] : null;
}

function resolveIniPayload(input) {
  const spec = normalizeProfileSpec(input);
  const resolved = resolveProfileSpec(spec);
  const template = runtimeData.templates?.find(
    (item) => item.outputFormat === "ini" && item.id === spec.baseProfile,
  );
  if (template?.supportsProfileOptions === false) {
    const source = runtimeData.iniTemplates?.[spec.baseProfile];
    if (typeof source !== "string" || !source.trim()) {
      throw new ProfileSpecError("Registered INI template is unavailable", "profile_template_unavailable");
    }
    return {
      spec,
      summary: { baseProfile: spec.baseProfile, template: template.name, supportsProfileOptions: false },
      ini: renderIniTemplate(source, spec.language, runtimeData),
    };
  }
  const { plan } = solveSubconverterPlan(spec);
  return {
    spec,
    summary: summarizeResolvedProfile(resolved),
    ini: renderIni(plan, runtimeData, { language: spec.language }),
  };
}

async function handleResolve(request) {
  const body = await parseJson(request);
  return json(resolveIniPayload(body.spec ?? body));
}

async function handleConvert(request, env) {
  const limited = await enforceWriteRateLimit(request, env, "Too many conversion requests");
  if (limited) return limited;
  const body = await parseJson(request, 300_000);
  for (const key of Object.keys(body)) {
    if (key !== "input" && key !== "format" && key !== "spec") {
      throw new ConverterError(`Unknown converter field: ${key}`, "unknown_converter_field");
    }
  }
  const result = await convertInput({
    input: body.input,
    format: body.format ?? "auto",
    spec: body.spec,
    env,
  });
  return json(result);
}

async function handleCreate(request, env) {
  const limited = await enforceWriteRateLimit(request, env);
  if (limited) return limited;
  const body = await parseJson(request);
  // Resolve and render before persistence so every saved selection is usable.
  const { spec } = resolveIniPayload(body.spec ?? body);
  const saved = await createProfile(env, spec);
  return json(saved, 201);
}

async function handleSubscription(env, token) {
  if (!TOKEN_RE.test(token)) {
    return new Response("Not found\n", { status: 404, headers: SUBSCRIPTION_HEADERS });
  }
  const row = await getProfileByReadToken(env, token);
  if (!row) {
    return new Response("Not found\n", { status: 404, headers: SUBSCRIPTION_HEADERS });
  }
  const { ini } = resolveIniPayload(JSON.parse(row.spec_json));
  return new Response(ini, {
    headers: {
      ...SUBSCRIPTION_HEADERS,
      "content-disposition": `inline; filename=ai-profile-${row.id}.ini`,
      "cache-control": "private, max-age=300",
      etag: `W/\"${row.id}-${row.revision}\"`,
      "x-profile-revision": String(row.revision),
    },
  });
}

async function handleManagedRead(request, env, id) {
  const token = bearer(request);
  if (!token) return json({ error: "unauthorized" }, 401);
  const row = await getManagedProfile(env, id, token);
  if (!row) return json({ error: "not_found" }, 404);
  const { spec, summary } = resolveIniPayload(JSON.parse(row.spec_json));
  return json({
    id: row.id,
    revision: row.revision,
    spec,
    summary,
    updatedAt: row.updated_at,
  });
}

async function handleManagedUpdate(request, env, id) {
  const limited = await enforceWriteRateLimit(request, env);
  if (limited) return limited;
  const token = bearer(request);
  if (!token) return json({ error: "unauthorized" }, 401);
  const body = await parseJson(request);
  const { spec } = resolveIniPayload(body.spec ?? body);
  const row = await updateManagedProfile(env, id, token, spec);
  if (!row) return json({ error: "not_found" }, 404);
  return json({ id, revision: row.revision, spec });
}

async function handleRotate(request, env, id) {
  const limited = await enforceWriteRateLimit(request, env);
  if (limited) return limited;
  const token = bearer(request);
  if (!token) return json({ error: "unauthorized" }, 401);
  const result = await rotateReadToken(env, id, token);
  if (!result) return json({ error: "not_found" }, 404);
  return json(result);
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/v1/catalog") {
    const iniOptions = getProfileOptions({ outputFormat: "ini" });
    const yamlOptions = getProfileOptions({ outputFormat: "yaml" });
    return json({
      schemaVersion: runtimeData.schemaVersion,
      baseProfiles: runtimeData.baseProfiles,
      regions: iniOptions.regions,
      templates: [...iniOptions.templates, ...yamlOptions.templates],
      services: [...new Map([...iniOptions.services, ...yamlOptions.services].map((service) => [service.id, service])).values()],
      serviceGroups: [...iniOptions.serviceGroups, ...yamlOptions.serviceGroups],
      reservedGroupNames: iniOptions.reservedGroupNames,
      serviceGroupLimits: iniOptions.serviceGroupLimits,
      serviceGroupRouteLabels: iniOptions.serviceGroupRouteLabels,
      optionDefaults: iniOptions.optionDefaults,
      languages: iniOptions.languages,
    });
  }
  if (request.method === "POST" && path === "/api/v1/resolve") {
    return handleResolve(request);
  }
  if (request.method === "POST" && path === "/api/v1/convert") {
    return handleConvert(request, env);
  }
  if (request.method === "POST" && path === "/api/v1/profiles") {
    return handleCreate(request, env);
  }

  const shortSubscription = path.match(/^\/p\/([A-Za-z0-9_-]{40,64})$/);
  if (request.method === "GET" && shortSubscription) {
    return new Response(null, {
      status: 302,
      headers: { ...SUBSCRIPTION_HEADERS, location: `/p/${shortSubscription[1]}.ini` },
    });
  }

  const subscription = path.match(/^\/p\/([A-Za-z0-9_-]{40,64})\.ini$/);
  if (request.method === "GET" && subscription) {
    return handleSubscription(env, subscription[1]);
  }

  const managed = path.match(/^\/api\/v1\/profiles\/([0-9a-f-]{36})$/i);
  if (managed) {
    if (request.method === "GET") return handleManagedRead(request, env, managed[1]);
    if (request.method === "PUT") return handleManagedUpdate(request, env, managed[1]);
  }

  const rotate = path.match(/^\/api\/v1\/profiles\/([0-9a-f-]{36})\/rotate-read-token$/i);
  if (request.method === "POST" && rotate) {
    return handleRotate(request, env, rotate[1]);
  }

  if (path.startsWith("/api/") || path.startsWith("/p/")) {
    return json({ error: "not_found" }, 404);
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
