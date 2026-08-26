const state = {
  catalog: null,
  preferred: [],
  managed: null,
};

const $ = (id) => document.getElementById(id);

function setStatus(message, error = false) {
  const node = $("status");
  node.hidden = !message;
  node.classList.toggle("error", error);
  node.textContent = message || "";
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `HTTP ${response.status}`);
  return body;
}

function regionMode() {
  return document.querySelector('input[name="region-mode"]:checked').value;
}

function selectedRegions() {
  return [...document.querySelectorAll(".region-check:checked")].map((item) => item.value);
}

function currentSpec() {
  const mode = regionMode();
  const selected = selectedRegions();
  if (mode === "only" && selected.length === 0) {
    throw new Error("Only mode至少要揀一個 routable region。 ");
  }
  return {
    schemaVersion: 1,
    baseProfile: $("base-profile").value,
    disabledNodeRegions: mode === "exclude" ? selected : [],
    onlyNodeRegions: mode === "only" ? selected : [],
    preferredNodeRegions: state.preferred.filter((id) => {
      if (mode === "only") return selected.includes(id);
      return !selected.includes(id);
    }),
  };
}

function activeRoutableRegions() {
  const mode = regionMode();
  const selected = new Set(selectedRegions());
  return state.catalog.regions.filter((region) => {
    if (!region.routable) return false;
    return mode === "only" ? selected.has(region.id) : !selected.has(region.id);
  });
}

function renderPreferred() {
  const active = new Set(activeRoutableRegions().map((region) => region.id));
  state.preferred = state.preferred.filter((id) => active.has(id));
  const byId = new Map(state.catalog.regions.map((region) => [region.id, region]));
  const list = $("prefer-list");
  list.innerHTML = "";
  state.preferred.forEach((id, index) => {
    const li = document.createElement("li");
    li.textContent = byId.get(id)?.name ?? id;
    for (const [label, delta] of [["↑", -1], ["↓", 1]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = index + delta < 0 || index + delta >= state.preferred.length;
      button.addEventListener("click", () => {
        const next = [...state.preferred];
        [next[index], next[index + delta]] = [next[index + delta], next[index]];
        state.preferred = next;
        renderPreferred();
      });
      li.append(button);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.preferred = state.preferred.filter((value) => value !== id);
      renderPreferred();
    });
    li.append(remove);
    list.append(li);
  });

  const picker = $("prefer-picker");
  picker.innerHTML = "";
  for (const region of activeRoutableRegions()) {
    if (state.preferred.includes(region.id)) continue;
    picker.add(new Option(region.name, region.id));
  }
  $("prefer-add").disabled = !picker.options.length;
}

function renderRegions() {
  const mode = regionMode();
  const container = $("region-list");
  const previous = new Set(selectedRegions());
  container.innerHTML = "";
  for (const region of state.catalog.regions) {
    if (mode === "only" && !region.routable) continue;
    const label = document.createElement("label");
    label.className = "region-card";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "region-check";
    input.value = region.id;
    input.checked = previous.has(region.id);
    input.addEventListener("change", renderPreferred);
    const text = document.createElement("span");
    text.textContent = region.name;
    const meta = document.createElement("span");
    meta.className = "region-meta";
    meta.textContent = region.routable ? region.id.toUpperCase() : `${region.id.toUpperCase()} · node filter only`;
    text.append(meta);
    label.append(input, text);
    container.append(label);
  }
  $("region-hint").textContent = mode === "only"
    ? "Closed-world mode：未 tick 嘅 routable region同未識別節點都唔會成為 routing candidate。"
    : "Exclude mode：tick 嘅 region會由 region groups、stable groups同 generic node filters移除。";
  renderPreferred();
}

function applySpec(spec) {
  $("base-profile").value = spec.baseProfile;
  const mode = spec.onlyNodeRegions?.length ? "only" : "exclude";
  document.querySelector(`input[name="region-mode"][value="${mode}"]`).checked = true;
  renderRegions();
  const selected = new Set(mode === "only" ? spec.onlyNodeRegions : spec.disabledNodeRegions);
  for (const input of document.querySelectorAll(".region-check")) input.checked = selected.has(input.value);
  state.preferred = [...(spec.preferredNodeRegions ?? [])];
  renderPreferred();
}

async function preview() {
  setStatus("Resolving profile…");
  try {
    const result = await api("/api/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: currentSpec() }),
    });
    $("summary").textContent = JSON.stringify(result.summary, null, 2);
    $("ini-preview").textContent = result.ini;
    $("preview-result").hidden = false;
    setStatus("");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function save() {
  setStatus(state.managed ? "Updating saved profile…" : "Creating opaque subscription…");
  try {
    if (state.managed) {
      const result = await api(`/api/v1/profiles/${state.managed.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${state.managed.token}`,
        },
        body: JSON.stringify({ spec: currentSpec() }),
      });
      setStatus(`Saved revision ${result.revision}. Existing subscription URL remains valid.`);
      return;
    }

    const result = await api("/api/v1/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: currentSpec() }),
    });
    const origin = location.origin;
    $("subscription-url").value = `${origin}/p/${result.readToken}.ini`;
    $("manage-url").value = `${origin}/manage?id=${encodeURIComponent(result.id)}#${result.manageToken}`;
    $("result").hidden = false;
    setStatus("Subscription created. Read URL同management capability已分開。");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadManagedIfPresent() {
  if (location.pathname !== "/manage") return;
  const id = new URL(location.href).searchParams.get("id");
  const fragmentToken = location.hash.slice(1);
  if (id && fragmentToken) {
    sessionStorage.setItem(`profile-manage:${id}`, fragmentToken);
    history.replaceState(null, "", `${location.pathname}?id=${encodeURIComponent(id)}`);
  }
  const token = fragmentToken || (id ? sessionStorage.getItem(`profile-manage:${id}`) : null);
  if (!id || !token) {
    setStatus("Management link缺少 profile ID 或 capability token。", true);
    return;
  }
  try {
    const result = await api(`/api/v1/profiles/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    state.managed = { id, token };
    applySpec(result.spec);
    $("save").textContent = "Save changes";
    setStatus(`Loaded revision ${result.revision}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function init() {
  try {
    state.catalog = await api("/api/v1/catalog");
    for (const profile of state.catalog.baseProfiles) {
      $("base-profile").add(new Option(profile.name, profile.id));
    }
    for (const radio of document.querySelectorAll('input[name="region-mode"]')) {
      radio.addEventListener("change", renderRegions);
    }
    $("prefer-add").addEventListener("click", () => {
      const value = $("prefer-picker").value;
      if (value && !state.preferred.includes(value)) state.preferred.push(value);
      renderPreferred();
    });
    $("preview").addEventListener("click", preview);
    $("save").addEventListener("click", save);
    for (const button of document.querySelectorAll("[data-copy]")) {
      button.addEventListener("click", () => navigator.clipboard.writeText($(button.dataset.copy).value));
    }
    renderRegions();
    await loadManagedIfPresent();
  } catch (error) {
    setStatus(error.message, true);
  }
}

init();
