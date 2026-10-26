export const EDITOR_SECTIONS = Object.freeze(["template", "regions", "services", "policies", "review"]);

export function parseEditorRoute(value) {
  const url = value instanceof URL ? value : new URL(value, "https://editor.invalid");
  const parts = url.pathname.replace(/\/$/u, "").split("/").filter(Boolean);
  const context = parts[0] === "manage" ? "manage" : "builder";
  const id = context === "manage" ? url.searchParams.get("id") : null;
  const section = parts[1] || "template";
  let groupId = null;
  try { groupId = parts[2] ? decodeURIComponent(parts[2]) : null; } catch { return null; }
  if (parts.length && !["builder", "manage"].includes(parts[0])) return null;
  if (![...EDITOR_SECTIONS, "success"].includes(section) || parts.length > 3) return null;
  if (groupId && (section !== "services" || !/^[a-z0-9][a-z0-9-]*$/u.test(groupId))) return null;
  if (context === "manage" && section === "success") return null;
  return { context, id, section, groupId, returnToReview: url.searchParams.get("return") === "review",
    ...(section === "success" ? { resultId: url.searchParams.get("profile") } : {}) };
}

export function editorHref(section, { context = "builder", id, groupId, resultId, returnToReview = false } = {}) {
  if (![...EDITOR_SECTIONS, "success"].includes(section)) throw new TypeError("Unknown editor section");
  let path = `/${context === "manage" ? "manage" : "builder"}/${section}`;
  if (section === "services" && groupId) path += `/${encodeURIComponent(groupId)}`;
  const query = new URLSearchParams();
  if (context === "manage" && id) query.set("id", id);
  if (returnToReview) query.set("return", "review");
  if (section === "success" && resultId) query.set("profile", resultId);
  return `${path}${query.size ? `?${query}` : ""}`;
}

export function mountEditorRouter({ window, onNavigate, acceptRoute = () => true }) {
  const positions = new Map();
  let currentUrl = window.location.pathname + window.location.search;
  function remember() {
    positions.set(currentUrl, { y: window.scrollY, focus: window.document.activeElement?.id });
  }
  function navigate(href, { replace = false } = {}) {
    const next = new URL(href, window.location.origin);
    const route = parseEditorRoute(next);
    if (next.origin !== window.location.origin || !route || !acceptRoute(route)) return false;
    remember();
    window.history[replace ? "replaceState" : "pushState"](null, "", next.pathname + next.search);
    currentUrl = next.pathname + next.search;
    onNavigate(parseEditorRoute(next), null);
    return true;
  }
  window.addEventListener("popstate", () => {
    remember();
    currentUrl = window.location.pathname + window.location.search;
    onNavigate(parseEditorRoute(window.location.href), positions.get(currentUrl) ?? null);
  });
  window.document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[data-editor-link]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (navigate(link.href)) event.preventDefault();
  });
  return { navigate };
}
