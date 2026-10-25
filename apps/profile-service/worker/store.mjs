export class StoreUnavailableError extends Error {}

function requireDb(env) {
  if (!env?.DB) throw new StoreUnavailableError("D1 binding DB is not configured");
  return env.DB;
}

export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createProfile(env, spec) {
  const db = requireDb(env);
  const id = crypto.randomUUID();
  const readToken = randomToken();
  const manageToken = randomToken();
  const [readHash, manageHash] = await Promise.all([
    sha256Hex(readToken),
    sha256Hex(manageToken),
  ]);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO profiles
       (id, read_token_hash, manage_token_hash, spec_json, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(id, readHash, manageHash, JSON.stringify(spec), now, now)
    .run();
  return { id, readToken, manageToken, revision: 1 };
}

export async function getProfileByReadToken(env, token) {
  const db = requireDb(env);
  const hash = await sha256Hex(token);
  return db
    .prepare(
      `SELECT id, spec_json, revision, created_at, updated_at
       FROM profiles WHERE read_token_hash = ? LIMIT 1`,
    )
    .bind(hash)
    .first();
}

export async function getManagedProfile(env, id, manageToken) {
  const db = requireDb(env);
  const hash = await sha256Hex(manageToken);
  return db
    .prepare(
      `SELECT id, spec_json, revision, created_at, updated_at
       FROM profiles WHERE id = ? AND manage_token_hash = ? LIMIT 1`,
    )
    .bind(id, hash)
    .first();
}

export async function updateManagedProfile(env, id, manageToken, spec) {
  const db = requireDb(env);
  const hash = await sha256Hex(manageToken);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE profiles
       SET spec_json = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND manage_token_hash = ?`,
    )
    .bind(JSON.stringify(spec), now, id, hash)
    .run();
  if (!result?.meta?.changes) return null;
  return getManagedProfile(env, id, manageToken);
}

export async function rotateReadToken(env, id, manageToken) {
  const db = requireDb(env);
  const manageHash = await sha256Hex(manageToken);
  const readToken = randomToken();
  const readHash = await sha256Hex(readToken);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE profiles
       SET read_token_hash = ?, revision = revision + 1, updated_at = ?
       WHERE id = ? AND manage_token_hash = ?`,
    )
    .bind(readHash, now, id, manageHash)
    .run();
  if (!result?.meta?.changes) return null;
  return { readToken };
}
