import {
  ProfileSpecError,
  normalizeProfileSpec,
  resolveProfileSpec,
  solveSubconverterPlan,
  summarizeResolvedProfile,
  runtimeData,
} from "./solver.mjs";
import { renderIni } from "./render.mjs";
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
};
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function errorResponse(error) {
  if (error instanceof ProfileSpecError) {
    return json({ error: error.code, message: error.message }, 400);
  }
  if (error instanceof StoreUnavailableError) {
    return json({ error: "profile_store_unavailable", message: error.message }, 503);
  }
  console.error(error);
  return json({ error: "internal_error", message: "Unexpected profile service error" }, 500);
}

async function enforceWriteRateLimit(request, env) {
  if (!env?.PROFILE_WRITE_LIMITER) return null;
  const key = request.headers.get("cf-connecting-ip") || "local-development";
  const result = await env.PROFILE_WRITE_LIMITER.limit({ key });
  if (result.success) return null;
  return json(
    { error: "rate_limited", message: "Too many profile write requests" },
    429,
    { "retry-after": "60" },
  );
}

async function parseJson(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ProfileSpecError("Content-Type must be application/json", "invalid_content_type");
  }
  const text = await request.text();
  if (text.length > 32_768) {
    throw new ProfileSpecError("Request body is too large", "body_too_large");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProfileSpecError("Malformed JSON body", "invalid_json");
  }
}

function bearer(request) {
  const value = request.headers.get("authorization") ?? "";
  if (!value.startsWith("Bearer ")) return null;
  const token = value.slice(7).trim();
  return TOKEN_RE.test(token) ? token : null;
}

function canonicalPayload(spec) {
  const normalized = normalizeProfileSpec(spec);
  const resolved = resolveProfileSpec(normalized);
  return { normalized, resolved };
}

async function handleResolve(request) {
  const body = await parseJson(request);
  const { normalized, resolved } = canonicalPayload(body.spec ?? body);
  const solved = solveSubconverterPlan(normalized);
  const ini = renderIni(solved.plan, runtimeData);
  return json({
    spec: normalized,
    summary: summarizeResolvedProfile(resolved),
    ini,
  });
}

async function handleCreate(request, env) {
  const limited = await enforceWriteRateLimit(request, env);
  if (limited) return limited;
  const body = await parseJson(request);
  const normalized = normalizeProfileSpec(body.spec ?? body);
  // Full solve before persistence so invalid/dangling specs never enter D1.
  solveSubconverterPlan(normalized);
  const saved = await createProfile(env, normalized);
  return json(saved, 201);
}

async function handleSubscription(env, token) {
  if (!TOKEN_RE.test(token)) return new Response("Not found\n", { status: 404 });
  const row = await getProfileByReadToken(env, token);
  if (!row) return new Response("Not found\n", { status: 404 });
  const spec = JSON.parse(row.spec_json);
  const solved = solveSubconverterPlan(spec);
  const ini = renderIni(solved.plan, runtimeData);
  return new Response(ini, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `inline; filename=ai-profile-${row.id}.ini`,
      "cache-control": "private, max-age=300",
      etag: `W/\"${row.id}-${row.revision}\"`,
      "x-profile-revision": String(row.revision),
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

async function handleManagedRead(request, env, id) {
  const token = bearer(request);
  if (!token) return json({ error: "unauthorized" }, 401);
  const row = await getManagedProfile(env, id, token);
  if (!row) return json({ error: "not_found" }, 404);
  const spec = JSON.parse(row.spec_json);
  const resolved = resolveProfileSpec(spec);
  return json({
    id: row.id,
    revision: row.revision,
    spec,
    summary: summarizeResolvedProfile(resolved),
    updatedAt: row.updated_at,
  });
}

async function handleManagedUpdate(request, env, id) {
  const limited = await enforceWriteRateLimit(request, env);
  if (limited) return limited;
  const token = bearer(request);
  if (!token) return json({ error: "unauthorized" }, 401);
  const body = await parseJson(request);
  const spec = normalizeProfileSpec(body.spec ?? body);
  solveSubconverterPlan(spec);
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
    return json({
      schemaVersion: runtimeData.schemaVersion,
      baseProfiles: runtimeData.baseProfiles,
      regions: runtimeData.regions.map(({ terms, filterPattern, keywords, ...publicRegion }) => publicRegion),
    });
  }
  if (request.method === "POST" && path === "/api/v1/resolve") {
    return handleResolve(request);
  }
  if (request.method === "POST" && path === "/api/v1/profiles") {
    return handleCreate(request, env);
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
