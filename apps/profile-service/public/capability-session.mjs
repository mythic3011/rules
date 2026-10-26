// Capabilities stay tab-scoped and expire absolutely; none enter localStorage.
export const CAPABILITY_TTL_MS = 30 * 60 * 1000;
const CREATED_PREFIX = "profile-created:v1:";
const LATEST_KEY = "profile-created-latest:v1";

export function createCapabilitySession(storage, { now = Date.now, onStorageError = () => {}, schedule = null, onExpire = () => {} } = {}) {
  const memory = new Map();
  const results = new Map();
  const scheduled = new Map();
  let latest = null;
  const keyFor = (id) => `profile-manage:${id}`;
  const resultKey = (id) => `${CREATED_PREFIX}${id}`;
  const valid = (entry) => entry && typeof entry.token === "string" && entry.token.length > 0
    && entry.token.length <= 256 && Number.isSafeInteger(entry.expiresAt)
    && entry.expiresAt > now() && entry.expiresAt <= now() + CAPABILITY_TTL_MS;
  function persist(key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch { onStorageError(); }
  }
  function remove(key) {
    try { storage.removeItem(key); } catch { onStorageError(); }
  }
  function forget(id) { memory.delete(id); remove(keyFor(id)); }
  function clearCreated(id) {
    results.delete(id);
    remove(resultKey(id));
    try {
      if ((latest ?? storage.getItem(LATEST_KEY)) === id) {
        latest = null;
        remove(LATEST_KEY);
      }
    } catch { onStorageError(); }
  }
  function expire(id) { forget(id); clearCreated(id); }
  function scheduleExpiry(id, entry, kind = "capability") {
    const key = `${kind}:${id}`;
    if (!schedule || scheduled.get(key) === entry.expiresAt) return;
    scheduled.set(key, entry.expiresAt);
    schedule(() => {
      if (scheduled.get(key) !== entry.expiresAt) return;
      scheduled.delete(key);
      if (entry.expiresAt > now()) { scheduleExpiry(id, entry, kind); return; }
      if (kind === "result") clearCreated(id);
      else expire(id);
      onExpire(id, kind);
    }, Math.max(1, entry.expiresAt - now()));
  }
  function set(id, token) {
    const entry = { token, expiresAt: now() + CAPABILITY_TTL_MS };
    if (!valid(entry)) return null;
    memory.set(id, entry);
    persist(keyFor(id), entry);
    scheduleExpiry(id, entry);
    return entry;
  }
  function get(id) {
    if (!id) return null;
    let entry = memory.get(id);
    if (!entry) {
      try {
        const raw = storage.getItem(keyFor(id));
        if (!raw) return null;
        // Honor existing same-tab sessions once, then apply the bounded lifetime.
        if (/^[A-Za-z0-9_-]{40,64}$/u.test(raw)) return set(id, raw);
        entry = JSON.parse(raw);
      } catch { onStorageError(); return null; }
    }
    if (!valid(entry)) { expire(id); return null; }
    memory.set(id, entry);
    scheduleExpiry(id, entry);
    return { ...entry };
  }
  function getCreated(requestedId = null) {
    let id = requestedId;
    try {
      id ??= latest ?? storage.getItem(LATEST_KEY);
      if (!id) return null;
      const value = results.get(id) ?? JSON.parse(storage.getItem(resultKey(id)) || "null");
      if (!value) return null;
      if (value.id !== id || typeof value.readToken !== "string"
        || !Number.isSafeInteger(value.revision) || !Number.isSafeInteger(value.expiresAt)
        || value.expiresAt > now() + CAPABILITY_TTL_MS) { clearCreated(id); return null; }
      // Result expiry does not revoke a separately renewed management session.
      if (value.expiresAt <= now()) { clearCreated(id); get(id); return null; }
      if (!get(id)) { clearCreated(id); return null; }
      results.set(id, value);
      scheduleExpiry(id, value, "result");
      return structuredClone(value);
    } catch { onStorageError(); if (id) clearCreated(id); return null; }
  }
  // Reopening another editor page also bounds dormant same-tab sessions.
  try {
    if (Number.isInteger(storage?.length) && typeof storage.key === "function") {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      for (const key of keys) {
        if (key?.startsWith("profile-manage:")) {
          const raw = storage.getItem(key);
          if (raw?.startsWith("{") || /^[A-Za-z0-9_-]{40,64}$/u.test(raw ?? "")) get(key.slice("profile-manage:".length));
        } else if (key?.startsWith(CREATED_PREFIX)) getCreated(key.slice(CREATED_PREFIX.length));
      }
    }
  } catch { onStorageError(); }
  return {
    set, get, forget, getCreated,
    capture(url, history) {
      const id = url.searchParams.get("id");
      const token = url.hash.slice(1);
      if (url.hash) history.replaceState(null, "", url.pathname + url.search);
      if (id && token) set(id, token);
      return id ? get(id) : null;
    },
    saveCreated(result, spec) {
      const entry = set(result.id, result.manageToken);
      if (!entry) throw new TypeError("Invalid creation result");
      const created = { id: result.id, readToken: result.readToken, revision: result.revision, spec, expiresAt: entry.expiresAt };
      results.set(result.id, created);
      latest = result.id;
      persist(resultKey(result.id), created);
      try { storage.setItem(LATEST_KEY, latest); } catch { onStorageError(); }
      scheduleExpiry(result.id, created, "result");
    },
  };
}
