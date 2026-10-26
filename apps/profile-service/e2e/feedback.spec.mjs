import { expect, test } from "./fixtures.mjs";

async function openEditor(page, path = "/") {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await page.locator("#language").selectOption("en");
  await expect(page.locator("#base-profile")).toBeEnabled();
  await page.locator("#base-profile").selectOption("ai-balanced");
}

async function preview(page) {
  const response = page.waitForResponse((value) => (
    new URL(value.url()).pathname === "/api/v1/resolve"
    && value.request().method() === "POST"
  ));
  await page.locator("#preview").click();
  expect((await response).status()).toBe(200);
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
}

async function createProfile(page) {
  const pending = page.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/v1/resolve" && response.request().method() === "POST"
  ));
  await page.locator("#nav-review").click();
  expect((await pending).status()).toBe(200);
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
  const created = page.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/v1/profiles" && response.request().method() === "POST"
  ));
  await page.locator("#save").click();
  const response = await created;
  const profileId = await page.evaluate(async () => {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 8_000);
      const ready = () => {
        const result = document.getElementById("result");
        const read = document.getElementById("subscription-url");
        const manage = document.getElementById("manage-url");
        if (location.pathname === "/builder/success" && result && !result.hidden && read?.value && manage?.value) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        requestAnimationFrame(ready);
      };
      ready();
    });
    const read = document.getElementById("subscription-url");
    const manage = document.getElementById("manage-url");
    const link = document.getElementById("result-manage-open");
    let id = null;
    try {
      const url = new URL(manage?.value || "");
      id = url.searchParams.get("id");
    } catch {}
    if (id) sessionStorage.setItem("e2e-created-profile-id", id);
    if (read instanceof HTMLInputElement) read.value = "";
    if (manage instanceof HTMLInputElement) manage.value = "";
    link?.removeAttribute("href");
    return {
      profileId: id,
      pathname: location.pathname,
      routeProfileId: new URL(location.href).searchParams.get("profile"),
      visible: Boolean(document.getElementById("result") && !document.getElementById("result").hidden),
    };
  });
  expect(response.status()).toBe(201);
  expect(profileId).toMatchObject({
    profileId: expect.stringMatching(/^[0-9a-f-]{36}$/iu),
    pathname: "/builder/success",
    visible: true,
  });
  expect(profileId.profileId).toBe(profileId.routeProfileId);
  return profileId.profileId;
}

async function followManagementLink(page, id) {
  const navigation = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
  const started = await page.evaluate((profileId) => {
    const raw = sessionStorage.getItem(`profile-manage:${profileId}`);
    let entry;
    try { entry = JSON.parse(raw); } catch { entry = raw; }
    const token = typeof entry === "string" ? entry : entry?.token;
    if (!profileId || !token) return false;
    location.assign(`/manage?id=${encodeURIComponent(profileId)}#${encodeURIComponent(token)}`);
    return true;
  }, id);
  expect(started).toBe(true);
  await navigation;
}

async function expectManagementRoute(page, id) {
  await page.waitForFunction(() => location.pathname === "/manage"
    && location.hash === "" && document.documentElement.dataset.i18nReady === "true");
  const route = await page.evaluate(() => {
    const url = new URL(location.href);
    return { pathname: url.pathname, profileId: url.searchParams.get("id"), hasFragment: Boolean(url.hash) };
  });
  expect(route).toEqual({ pathname: "/manage", profileId: id, hasFragment: false });
}

async function locale(request, language) {
  const response = await request.get(`/locales/${language}.json`);
  expect(response.status()).toBe(200);
  return response.json();
}

test("separates stale preview, invalid draft, and saved subscription across routes", async ({ page, request }) => {
  const english = await locale(request, "en");
  const traditional = await locale(request, "zh-Hant");
  await openEditor(page);
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "draft");
  const initialPreview = page.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/v1/resolve" && response.request().method() === "POST"
  ));
  await page.locator("#nav-review").click();
  expect((await initialPreview).status()).toBe(200);
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
  await preview(page);
  await expect(page.locator("#preview-result")).toBeFocused();
  await expect(page.locator("#review-summary")).toBeVisible();
  await expect(page.locator("#preview-snapshot-note")).toBeVisible();

  await page.locator('#review-summary a[href^="/builder/regions"]').click();
  await expect(page).toHaveURL(/\/builder\/regions\?return=review$/u);
  await page.locator('#region-list input[value="us"]').check();
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "outdated");
  await page.locator("#section-continue").click();
  await expect(page).toHaveURL(/\/builder\/review$/u);
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
  const summary = JSON.parse(await page.locator("#summary").textContent());
  expect(summary.activeRegions.map((region) => region.id)).not.toContain("us");
  const createPending = page.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/v1/profiles" && response.request().method() === "POST"
  ));
  await page.locator("#save").click();
  const createResponse = await createPending;
  const profileId = await page.evaluate(async () => {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 8_000);
      const ready = () => {
        const result = document.getElementById("result");
        if (location.pathname === "/builder/success" && result && !result.hidden) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        requestAnimationFrame(ready);
      };
      ready();
    });
    const manage = document.getElementById("manage-url");
    const read = document.getElementById("subscription-url");
    const link = document.getElementById("result-manage-open");
    let id = null;
    try { id = new URL(manage?.value || "").searchParams.get("id"); } catch {}
    if (read instanceof HTMLInputElement) read.value = "";
    if (manage instanceof HTMLInputElement) manage.value = "";
    link?.removeAttribute("href");
    return {
      profileId: id,
      pathname: location.pathname,
      routeProfileId: new URL(location.href).searchParams.get("profile"),
      visible: Boolean(document.getElementById("result") && !document.getElementById("result").hidden),
    };
  });
  expect(createResponse.status()).toBe(201);
  expect(profileId).toMatchObject({
    profileId: expect.stringMatching(/^[0-9a-f-]{36}$/iu),
    pathname: "/builder/success",
    visible: true,
  });
  expect(profileId.profileId).toBe(profileId.routeProfileId);
  await page.locator("#nav-regions").click();
  await expect(page.locator('#region-list input[value="us"]')).toBeChecked();
  await page.locator('#region-list input[value="us"]').uncheck();
  await page.locator("#region-mode-only").check();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "invalid");
  await expect(page.locator("#region-validation")).toContainText(english.onlyRequiresRegion);
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "outdated");
  await expect(page.locator("#result")).toBeHidden();
  await expect(page.locator("#subscription-url")).toBeHidden();
  await expect(page.locator("#manage-url")).toBeHidden();

  await page.locator("#nav-review").click();
  await expect(page.locator("#error-summary")).toBeVisible();
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#result")).toBeHidden();

  await page.locator("#language").selectOption("zh-Hant");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await page.locator("#nav-regions").click();
  await expect(page.locator("#region-validation")).toContainText(traditional.onlyRequiresRegion);
});

test("keeps a late management edit isolated from another profile draft", async ({ page }) => {
  await openEditor(page);
  const firstIdentity = await createProfile(page);
  expect(firstIdentity).toMatch(/^[0-9a-f-]{36}$/iu);
  await followManagementLink(page, firstIdentity);
  await expectManagementRoute(page, firstIdentity);
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "clean");
  await page.locator("#nav-regions").click();
  await page.locator('#region-list input[value="us"]').check();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "dirty");

  let release;
  let intercepted = false;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/v1/profiles/*", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    intercepted = true;
    await gate;
    await route.continue();
  });
  try {
    const previewPending = page.waitForResponse((value) => (
      new URL(value.url()).pathname === "/api/v1/resolve" && value.request().method() === "POST"
    ));
    await page.locator("#nav-review").click();
    expect((await previewPending).status()).toBe(200);
    await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
    await page.locator("#save").click();
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.locator("#save")).toBeDisabled();
    await page.locator("#nav-regions").click();
    await page.locator('#region-list input[value="jp"]').check();
    release();
    await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "dirty");

    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "dirty");
    await expect(page.locator('#region-list input[value="us"]')).toBeChecked();
    await expect(page.locator('#region-list input[value="jp"]')).toBeChecked();
  } finally {
    release();
  }

  page.once("dialog", (dialog) => dialog.accept());
  await page.goto("/builder/template");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await page.locator("#language").selectOption("en");
  await page.locator("#nav-regions").click();
  await page.locator("#region-mode-only").check();
  await page.locator('#region-list input[value="us"]').check();
  const secondIdentity = await createProfile(page);
  expect(secondIdentity).toMatch(/^[0-9a-f-]{36}$/iu);
  await followManagementLink(page, secondIdentity);
  await expectManagementRoute(page, secondIdentity);
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "clean");
  await page.locator("#nav-regions").click();
  await expect(page.locator("#region-mode-only")).toBeChecked();
  await expect(page.locator('#region-list input[value="us"]')).toBeChecked();
  await expect(page.locator('#region-list input[value="jp"]')).not.toBeChecked();

  page.once("dialog", (dialog) => dialog.accept());
  const navigationToA = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame(), { timeout: 5_000 }).catch(() => null);
  const switchedToA = await page.evaluate((id) => {
    const raw = sessionStorage.getItem(`profile-manage:${id}`);
    let entry;
    try { entry = JSON.parse(raw); } catch { entry = raw; }
    const token = typeof entry === "string" ? entry : entry?.token;
    if (id && token) location.assign(`/manage?id=${encodeURIComponent(id)}#${encodeURIComponent(token)}`);
    return { navigationStarted: Boolean(id && token) };
  }, firstIdentity);
  expect(switchedToA).toEqual({ navigationStarted: true });
  expect(await navigationToA).toBeTruthy();
  await expectManagementRoute(page, firstIdentity);
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "dirty");
  await page.locator("#nav-regions").click();
  await expect(page.locator("#region-mode-exclude")).toBeChecked();
  await expect(page.locator('#region-list input[value="us"]')).toBeChecked();
  await expect(page.locator('#region-list input[value="jp"]')).toBeChecked();

  const navigationToB = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame(), { timeout: 5_000 }).catch(() => null);
  const switchedToB = await page.evaluate((id) => {
    const raw = sessionStorage.getItem(`profile-manage:${id}`);
    let entry;
    try { entry = JSON.parse(raw); } catch { entry = raw; }
    const token = typeof entry === "string" ? entry : entry?.token;
    if (id && token) location.assign(`/manage?id=${encodeURIComponent(id)}#${encodeURIComponent(token)}`);
    return { navigationStarted: Boolean(id && token) };
  }, secondIdentity);
  expect(switchedToB).toEqual({ navigationStarted: true });
  expect(await navigationToB).toBeTruthy();
  await expectManagementRoute(page, secondIdentity);
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "clean");
  await page.locator("#nav-regions").click();
  await expect(page.locator("#region-mode-only")).toBeChecked();
  await expect(page.locator('#region-list input[value="us"]')).toBeChecked();
  await expect(page.locator('#region-list input[value="jp"]')).not.toBeChecked();
});

test("blocks management writes when the capability is missing", async ({ page, request }) => {
  const english = await locale(request, "en");
  let writes = 0;
  page.on("request", (value) => {
    if (new URL(value.url()).pathname.startsWith("/api/v1/profiles")
      && ["POST", "PUT"].includes(value.method())) writes += 1;
  });
  await page.goto("/manage");
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "load-failed");
  await expect(page.locator("#status")).toContainText(english.missingManagement);
  await expect(page.locator("#save")).toBeDisabled();
  expect(writes).toBe(0);
});

test("translates safe line errors and disables actions for outdated YAML", async ({ page, request }) => {
  const english = await locale(request, "en");
  const traditional = await locale(request, "zh-Hant");
  await openEditor(page, "/converter");
  const input = page.locator("#converter-input");
  const status = page.locator("#converter-status");
  await input.fill([
    "socks5h://first.example.test:1080#US-First",
    "",
    "unsupported://synthetic-user:synthetic-pass@private.example.test:443?token=synthetic-token",
  ].join("\n"));
  await page.locator("#convert-button").click();
  await expect(status).toContainText(english.converterLineError.replace("{line}", "3").split("{reason}")[0]);
  await expect(status).not.toContainText("synthetic");
  await expect(status).not.toContainText("private.example.test");
  await page.locator("#language").selectOption("zh-Hant");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(status).toContainText(traditional.converterLineError.replace("{line}", "3").split("{reason}")[0]);

  await input.fill("socks5h://first.example.test:1080#US-First");
  await page.locator("#convert-button").click();
  await expect(status).toHaveText(traditional.conversionReady);
  await expect(page.locator("#copy-yaml")).toBeEnabled();
  await expect(page.locator("#download-yaml")).toBeEnabled();
  await expect(page.locator("#converter-output-details")).not.toHaveJSProperty("open", true);

  await page.locator("#language").selectOption("en");
  await expect(page.locator("#converter-output-summary")).toHaveAttribute("data-state", "outdated");
  await expect(page.locator("#copy-yaml")).toBeDisabled();
  await page.locator("#language").selectOption("zh-Hant");
  await page.locator("#convert-button").click();
  await expect(status).toHaveText(traditional.conversionReady);

  await input.fill("socks5h://second.example.test:1080#US-Second");
  await expect(page.locator("#converter-output-summary")).toHaveAttribute("data-state", "outdated");
  await expect(page.locator("#copy-yaml")).toBeDisabled();
  await expect(page.locator("#download-yaml")).toBeDisabled();
  await page.locator("#convert-button").click();
  await expect(status).toHaveText(traditional.conversionReady);
  await expect(page.locator("#download-yaml")).toBeEnabled();
  await page.locator('#region-list input[value="us"]').check();
  await expect(page.locator("#converter-output-summary")).toHaveAttribute("data-state", "outdated");
  await expect(page.locator("#download-yaml")).toBeDisabled();
});

test("supports service navigation, keyboard exit reordering, and focused review on a small screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await openEditor(page);
  await page.locator("#nav-services").click();
  await expect(page).toHaveURL(/\/builder\/services$/u);
  const choices = page.locator("#service-group-list a.group-choice");
  expect(await choices.count()).toBeGreaterThan(1);
  await expect(page.locator("#service-group-select-gemini")).toHaveAttribute("href", "/builder/services/gemini");
  await page.locator("#service-group-select-gemini").click();
  await expect(page).toHaveURL(/\/builder\/services\/gemini$/u);
  const routes = page.locator("#service-group-routes > [data-route]");
  expect(await routes.count()).toBeGreaterThan(1);
  const before = await routes.evaluateAll((rows) => rows.map((row) => row.dataset.route));
  const moved = page.locator(`#group-route-${before[1]}-moveUp`);
  await moved.focus();
  await moved.press("Enter");
  await expect(routes.first()).toHaveAttribute("data-route", before[1]);
  await expect(page.locator(`#group-route-${before[1]}`)).toBeFocused();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "dirty");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const pending = page.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/v1/resolve" && response.request().method() === "POST"
  ));
  await page.locator("#nav-review").click();
  expect((await pending).status()).toBe(200);
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
  await preview(page);
  await expect(page.locator("#preview-result")).toBeFocused();
  await expect(page.locator("#preview-result")).toBeInViewport({ ratio: 0.2 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
