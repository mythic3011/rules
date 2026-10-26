import { expect, test } from "./fixtures.mjs";
import YAML from "yaml";
import { runtimeData } from "../worker/solver.mjs";

async function previewIni(page) {
  const pending = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/v1/resolve" && response.request().method() === "POST"
  );
  await page.locator("#preview").click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const payload = await response.json();
  await expect(page.locator("#ini-preview")).toHaveText(payload.ini);
  return payload;
}

async function captureSuccess(page, key, checkRead = false) {
  return page.evaluate(async ({ key, checkRead }) => {
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
    const result = document.getElementById("result");
    const readInput = document.getElementById("subscription-url");
    const managementInput = document.getElementById("manage-url");
    const managementLink = document.getElementById("result-manage-open");
    let readUrl = null;
    let manageUrl = null;
    try { readUrl = new URL(readInput?.value || ""); } catch {}
    try { manageUrl = new URL(managementInput?.value || ""); } catch {}
    const routeUrl = new URL(location.href);
    const profileId = manageUrl?.searchParams.get("id") ?? null;
    const priorReadUrl = sessionStorage.getItem(`e2e-success-${key}-read`);
    const priorProfileId = sessionStorage.getItem(`e2e-success-${key}-id`);
    if (readUrl) sessionStorage.setItem(`e2e-success-${key}-read`, readUrl.href);
    if (profileId) sessionStorage.setItem(`e2e-success-${key}-id`, profileId);
    if (key === "a" && readUrl) sessionStorage.setItem("e2e-profile-subscription", readUrl.href);
    let subscription = { status: null, redirected: false, redirectedToIni: false, revision: null, hasIni: false };
    if (checkRead && readUrl) {
      const path = readUrl.pathname.replace(/\.ini$/u, "");
      const response = await fetch(`${readUrl.origin}${path}`, { cache: "no-store", redirect: "follow" });
      subscription = {
        status: response.status,
        redirected: response.redirected,
        redirectedToIni: /\.ini$/u.test(new URL(response.url).pathname),
        revision: response.headers.get("x-profile-revision"),
        hasIni: (await response.text()).includes("[custom]"),
      };
    }
    const metadata = {
      pathname: routeUrl.pathname,
      routeProfileId: routeUrl.searchParams.get("profile"),
      profileId,
      resultVisible: Boolean(result && !result.hidden),
      readStepVisible: Boolean(document.getElementById("result-import-step")?.getClientRects().length),
      managementStepVisible: Boolean(document.getElementById("result-manage-step")?.getClientRects().length),
      failClosedVisible: Boolean(document.getElementById("result-fail-closed")?.getClientRects().length),
      readLinkValid: Boolean(readUrl && readUrl.origin === location.origin && /^\/p\/[A-Za-z0-9_-]{40,64}$/u.test(readUrl.pathname)),
      managementLinkValid: Boolean(manageUrl && manageUrl.origin === location.origin && manageUrl.pathname === "/manage"),
      managementIdMatchesRoute: profileId === routeUrl.searchParams.get("profile"),
      managementCapabilityInFragment: Boolean(manageUrl?.hash),
      managementQueryHasOnlyId: Boolean(manageUrl && [...manageUrl.searchParams.keys()].every((name) => name === "id")),
      linksHaveSeparatePaths: Boolean(readUrl && manageUrl && readUrl.pathname !== manageUrl.pathname),
      restoredReadLink: Boolean(priorReadUrl && readUrl?.href === priorReadUrl),
      restoredManagementProfile: Boolean(priorProfileId && profileId === priorProfileId),
      profileIdDifferentFromSavedA: key !== "b" || profileId !== sessionStorage.getItem("e2e-success-a-id"),
      subscription,
    };
    if (readInput instanceof HTMLInputElement) readInput.value = "";
    if (managementInput instanceof HTMLInputElement) managementInput.value = "";
    managementLink?.removeAttribute("href");
    return metadata;
  }, { key, checkRead });
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

async function expectManagementRoute(page, pathname, id) {
  await page.waitForFunction(() => location.pathname.startsWith("/manage")
    && location.hash === "" && document.documentElement.dataset.i18nReady === "true");
  const route = await page.evaluate(() => {
    const url = new URL(location.href);
    return { pathname: url.pathname, profileId: url.searchParams.get("id"), hasFragment: Boolean(url.hash) };
  });
  expect(route).toEqual({ pathname, profileId: id, hasFragment: false });
}

function serviceGroupPolicy(catalog, outputFormat, baseProfile, serviceId) {
  return catalog.serviceGroups.find((group) => (
    group.outputFormat === outputFormat
    && group.baseProfile === baseProfile
    && group.serviceIds.includes(serviceId)
  ));
}

async function openDetails(page, detailsSelector, summarySelector) {
  const details = page.locator(detailsSelector);
  if (!await details.evaluate((node) => node.open)) {
    await page.locator(summarySelector ?? `${detailsSelector} > summary`).click();
  }
  await expect(details).toHaveJSProperty("open", true);
}

async function selectServiceGroup(page, id) {
  await openDetails(page, "#service-group-customization");
  const selection = page.locator(`#service-group-select-${id}`);
  await selection.click();
  await expect(selection).toHaveAttribute("aria-checked", "true");
}

async function createAndAssignServiceGroup(page, { initialName, name, serviceId, routes }) {
  await openDetails(page, "#service-group-customization");
  await openDetails(page, ".group-create", "#new-service-group");
  await page.locator("#new-service-group-name").fill(initialName);
  await page.locator("#create-service-group").click();
  const selectedId = await page.locator('#service-group-editor [aria-checked="true"]').getAttribute("id");
  const id = selectedId?.replace(/^service-group-select-/u, "");
  expect(id).toBeTruthy();
  await selectServiceGroup(page, id);
  await openDetails(page, ".group-settings");
  await page.locator("#service-group-name").fill(name);
  await page.locator("#rename-service-group").click();

  const palette = page.locator(".group-service-palette");
  if (!await palette.evaluate((node) => node.open)) {
    await palette.locator(":scope > summary").click();
  }
  await page.locator(`#group-service-available-${serviceId}`).dragTo(page.locator("#service-group-members"));
  await expect(page.locator(`#group-service-${serviceId}-remove`)).toBeVisible();
  for (const route of routes) {
    await openDetails(page, ".group-route-palette");
    await page.locator(`#route-available-${route}`).dragTo(page.locator("#service-group-routes"));
    await expect(page.locator(`#group-route-${route}`)).toBeVisible();
  }
  return id;
}

function expectIniServiceRulesTarget(ini, serviceId, target) {
  const service = runtimeData.services.find((item) => item.id === serviceId);
  expect(service).toBeTruthy();
  const references = service.ruleRefs.filter((reference) => reference.iniKind && reference.iniValue);
  const matching = ini.split(/\r?\n/u).filter((line) => references.some((reference) => line.includes(reference.iniValue)));
  expect(matching.length).toBeGreaterThan(0);
  for (const line of matching) {
    if (line.startsWith("ruleset=")) {
      expect(line.slice("ruleset=".length).split(",", 1)[0].trim()).toBe(target);
      continue;
    }
    const fields = line.split(",");
    const targetIndex = fields.at(-1)?.trim().toLowerCase() === "no-resolve" ? -2 : -1;
    expect(fields[targetIndex]?.trim()).toBe(target);
  }
}

test.beforeEach(async ({ request }) => {
  let response;
  try {
    response = await request.get("/api/v1/catalog", { timeout: 5_000 });
  } catch {
    throw new Error("The local Wrangler backend is unavailable. Start it with the profile-service dev command first.");
  }
  expect(response.status()).toBe(200);
  const catalog = await response.json();
  expect(Array.isArray(catalog.baseProfiles)).toBe(true);
  expect(catalog.baseProfiles.length).toBeGreaterThan(0);
});

test("routes a profile draft through review, success, and management without changing generated policy behavior", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", () => pageErrors.push("pageerror"));
  const loadedLocales = new Set();
  page.on("response", (response) => {
    const match = new URL(response.url()).pathname.match(/^\/locales\/(en|zh-Hant|zh-Hans)\.json$/u);
    if (match && response.status() === 200) loadedLocales.add(match[1]);
  });

  await page.goto("/builder/template");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await page.locator("#language").selectOption("en");
  await expect(page.locator("#language")).toHaveValue("en");
  await expect(page.locator("#base-profile option").first()).toBeAttached();
  await page.locator("#base-profile").selectOption("ai-balanced");
  await expect(page).toHaveURL(/\/builder\/template$/u);

  const profileCatalog = await page.evaluate(async () => (await fetch("/api/v1/catalog")).json());
  const geminiPolicy = serviceGroupPolicy(profileCatalog, "ini", "ai-balanced", "gemini");
  expect(geminiPolicy).toBeTruthy();
  expect(geminiPolicy.allowedRoutes).toContain("us");

  await page.locator("#nav-policies").click();
  await expect(page).toHaveURL(/\/builder\/policies$/u);
  await expect(page.locator("#fail-closed")).toBeChecked();
  await page.locator("#allow-direct").uncheck();

  await page.locator("#nav-regions").click();
  await expect(page).toHaveURL(/\/builder\/regions$/u);
  for (const region of ["us", "jp", "sg"]) {
    await page.locator("#prefer-region-picker").selectOption(region);
    await page.locator("#prefer-region-add").click();
  }

  await page.locator("#nav-services").click();
  await expect(page).toHaveURL(/\/builder\/services$/u);
  await page.locator("#new-service-group-name").fill("Gemini Routing E2E");
  await page.locator("#create-service-group").click();
  await expect(page).toHaveURL(/\/builder\/services\/custom-1$/u);
  await page.locator(".group-service-palette > summary").click();
  await page.locator("#group-service-available-gemini").click();
  await openDetails(page, ".group-route-palette");
  await page.locator("#route-available-us").click();
  await page.locator("#route-available-jp").click();
  await page.locator("#group-route-jp-moveUp").click();
  expect(await page.locator("#service-group-routes > [data-route]").evaluateAll((rows) => rows.map((row) => row.dataset.route)))
    .toEqual(["jp", "us"]);
  await openDetails(page, ".group-settings");
  await page.locator("#service-group-name").fill("Gemini Routing E2E");
  await page.locator("#rename-service-group").click();
  await page.locator("#section-continue").click();
  await expect(page).toHaveURL(/\/builder\/services$/u);

  await page.locator("#nav-review").click();
  await expect(page).toHaveURL(/\/builder\/review$/u);
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
  await expect(page.locator("#save")).toBeEnabled();
  await expect(page.locator("#review-summary")).toContainText("Gemini Routing E2E");
  await expect(page.locator(".technical-details")).not.toHaveJSProperty("open", true);
  const reviewed = await previewIni(page);
  const directGroup = reviewed.ini.split(/\r?\n/u).find((line) => line.startsWith("custom_proxy_group=🎯 全球直連"));
  expect(directGroup).toContain("[]⛔ 拒絕");
  expect(reviewed.ini).not.toContain("[]🎯 全球直連");
  const customGroupLine = reviewed.ini.split(/\r?\n/u).find((line) => line.startsWith("custom_proxy_group=Gemini Routing E2E`"));
  expect(customGroupLine).toContain(runtimeData.regions.find((region) => region.id === "jp").group);
  expect(customGroupLine).toContain(runtimeData.regions.find((region) => region.id === "us").group);
  expect(customGroupLine.indexOf(runtimeData.regions.find((region) => region.id === "jp").group))
    .toBeLessThan(customGroupLine.indexOf(runtimeData.regions.find((region) => region.id === "us").group));
  expect(reviewed.summary.preferredRegions.map((region) => region.id)).toEqual(["us", "jp", "sg"]);

  const resolvedLanguages = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/v1/resolve") return;
    resolvedLanguages.push(request.postDataJSON()?.spec?.language);
  });
  for (const [language, previewLabel] of [["zh-Hant", "預覽"], ["zh-Hans", "预览"], ["en", "Preview"]]) {
    const resolving = page.waitForResponse((response) => (
      new URL(response.url()).pathname === "/api/v1/resolve" && response.request().method() === "POST"
    ));
    await page.locator("#language").selectOption(language);
    await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
    await expect(page.locator("#language")).toHaveValue(language);
    await expect(page.locator("#preview")).toHaveText(previewLabel);
    const resolveResponse = await resolving;
    expect(resolveResponse.status()).toBe(200);
    const preview = await resolveResponse.json();
    await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
    await expect(page.locator("#preview-result")).toBeVisible();
    await expect(page.locator("#ini-preview")).toContainText("[custom]");
    await expect(page.locator("#ini-preview")).toHaveText(preview.ini);
    const summary = preview.summary;
    expect(summary.preferredRegions.map((region) => region.id)).toEqual(["us", "jp", "sg"]);
  }
  expect(resolvedLanguages).toEqual(["zh-Hant", "zh-Hans", "en"]);
  expect([...loadedLocales].sort()).toEqual(["en", "zh-Hans", "zh-Hant"]);
  await expect(page.locator("#language")).toHaveValue("en");

  await page.locator("#language").selectOption("en");
  await expect(page.locator("#language")).toHaveValue("en");
  const createResponsePending = page.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/v1/profiles" && response.request().method() === "POST"
  ));
  await page.locator("#save").click();
  const createResponse = await createResponsePending;
  const initialSubscription = await captureSuccess(page, "a", true);
  expect(createResponse.status()).toBe(201);
  expect(initialSubscription).toMatchObject({
    pathname: "/builder/success",
    routeProfileId: expect.stringMatching(/^[0-9a-f-]{36}$/iu),
    profileId: expect.stringMatching(/^[0-9a-f-]{36}$/iu),
    resultVisible: true,
    readStepVisible: true,
    managementStepVisible: true,
    failClosedVisible: true,
    readLinkValid: true,
    managementLinkValid: true,
    managementIdMatchesRoute: true,
    managementCapabilityInFragment: true,
    managementQueryHasOnlyId: true,
    linksHaveSeparatePaths: true,
    subscription: {
      status: 200,
      redirected: true,
      redirectedToIni: true,
      revision: "1",
      hasIni: true,
    },
  });

  await page.locator("#nav-template").click();
  await expect(page).toHaveURL(/\/builder\/template$/u);
  await page.locator("#base-profile").selectOption("standard");
  const secondResolvePending = page.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/v1/resolve" && response.request().method() === "POST"
  ));
  await page.locator("#nav-review").click();
  expect((await secondResolvePending).status()).toBe(200);
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
  const secondCreatePending = page.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/v1/profiles" && response.request().method() === "POST"
  ));
  await page.locator("#save").click();
  const secondCreate = await secondCreatePending;
  const secondSuccess = await captureSuccess(page, "b");
  expect(secondCreate.status()).toBe(201);
  expect(secondSuccess).toMatchObject({
    pathname: "/builder/success",
    routeProfileId: expect.stringMatching(/^[0-9a-f-]{36}$/iu),
    profileId: expect.stringMatching(/^[0-9a-f-]{36}$/iu),
    managementIdMatchesRoute: true,
    profileIdDifferentFromSavedA: true,
  });
  expect(secondSuccess.profileId).not.toBe(initialSubscription.profileId);

  await page.goBack();
  await expect(page).toHaveURL(/\/builder\/review$/u);
  await page.goBack();
  await expect(page).toHaveURL(/\/builder\/template$/u);
  await page.goBack();
  const restoredSuccess = await captureSuccess(page, "a");
  expect(restoredSuccess).toMatchObject({
    pathname: "/builder/success",
    routeProfileId: initialSubscription.profileId,
    profileId: initialSubscription.profileId,
    managementIdMatchesRoute: true,
    restoredReadLink: true,
    restoredManagementProfile: true,
  });

  await followManagementLink(page, initialSubscription.profileId);
  await expectManagementRoute(page, "/manage", initialSubscription.profileId);
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "clean");
  await expect(page.locator("#saved-state-note")).toContainText("1");
  const capabilityHandling = await page.evaluate(() => {
    const url = new URL(location.href);
    const id = url.searchParams.get("id");
    const entry = JSON.parse(sessionStorage.getItem(`profile-manage:${id}`) || "null");
    const token = typeof entry === "string" ? entry : entry?.token;
    return {
      fragmentRemoved: location.hash === "",
      capabilityIsTabScoped: Boolean(token),
      capabilityAbsentFromQuery: [...url.searchParams.values()].every((value) => value !== token),
      capabilityAbsentFromLocalStorage: !Object.values(localStorage).some((value) => value === token),
    };
  });
  expect(capabilityHandling).toEqual({
    fragmentRemoved: true,
    capabilityIsTabScoped: true,
    capabilityAbsentFromQuery: true,
    capabilityAbsentFromLocalStorage: true,
  });

  await page.locator("#language").selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await expect(page.locator("#language")).toHaveValue("en");

  await page.locator("#nav-regions").click();
  await page.locator('#region-list input[value="sg"]').check();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "dirty");
  await page.locator("#nav-review").click();
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
  const saveResponsePending = page.waitForResponse((response) => (
    new URL(response.url()).pathname.startsWith("/api/v1/profiles/") && response.request().method() === "PUT"
  ));
  await page.locator("#save").click();
  const saveResponse = await saveResponsePending;
  expect(saveResponse.status()).toBe(200);
  await expect(page.locator("#status")).toContainText("Saved revision 2.");

  await page.reload();
  await expect(page.locator("#saved-state-note")).toContainText("2");
  await page.locator("#nav-regions").click();
  await expect(page.locator('#region-list input[value="sg"]')).toBeChecked();
  await page.locator("#nav-services").click();
  await page.locator("#service-group-select-custom-1").click();
  await expectManagementRoute(page, "/manage/services/custom-1", initialSubscription.profileId);
  await expect(page.locator("#service-group-name")).toHaveValue("Gemini Routing E2E");
  await expect(page.locator("#group-service-gemini-remove")).toBeVisible();
  expect(await page.locator("#service-group-routes > [data-route]").evaluateAll((rows) =>
    rows.map((row) => row.dataset.route)
  )).toEqual(["jp", "us"]);
  await expect(page.locator("#service-group-start-reject")).toBeChecked();
  const savedSubscription = await page.evaluate(async () => {
    const url = new URL(sessionStorage.getItem("e2e-profile-subscription"));
    const extensionlessPath = url.pathname.replace(/\.ini$/u, "");
    const response = await fetch(`${url.origin}${extensionlessPath}`, {
      cache: "no-store",
      redirect: "follow",
    });
    const finalPath = new URL(response.url).pathname;
    return {
      status: response.status,
      redirected: response.redirected,
      redirectedToIni: /\.ini$/u.test(finalPath),
      revision: response.headers.get("x-profile-revision"),
      hasIni: (await response.text()).includes("[custom]"),
    };
  });
  expect(savedSubscription).toEqual({
    status: 200,
    redirected: true,
    redirectedToIni: true,
    revision: "2",
    hasIni: true,
  });
  expect(pageErrors).toHaveLength(0);
});

test("converts real inputs, downloads policy YAML, clears and navigates without leaking page errors", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", () => pageErrors.push("pageerror"));

  await page.goto("/");
  await page.getByRole("link", { name: "Online YAML converter" }).click();
  await expect(page).toHaveURL(/\/converter$/u);
  await expect(page.getByRole("heading", { name: "Online YAML converter" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await page.locator("#language").selectOption("en");
  await expect(page.locator("#language")).toHaveValue("en");
  await expect(page.locator('#base-profile option[value="ai-balanced"]')).toBeAttached();

  const yamlTemplateIds = await page.locator("#base-profile option").evaluateAll((options) =>
    options.map((option) => option.value)
  );
  expect(yamlTemplateIds).toEqual(expect.arrayContaining(["ai-balanced", "ai-strict", "standard"]));

  const input = page.locator("#converter-input");
  const format = page.locator("#input-format");
  const output = page.locator("#converted-yaml");
  const status = page.locator("#converter-status");
  const readyByLanguage = {
    en: "YAML ready. Node selection stays manual after import.",
    "zh-Hant": "YAML 已準備好。匯入後仍由你手動選節點。",
    "zh-Hans": "YAML 已准备好。导入后仍由你手动选择节点。",
  };
  const convert = async (value, inputFormat = "auto") => {
    const language = await page.locator("#language").inputValue();
    await format.selectOption(inputFormat);
    await input.fill(value);
    await page.locator("#convert-button").click();
    await expect(status).toHaveText(readyByLanguage[language]);
    await expect(page.locator("#output-panel")).toBeVisible();
    return output.inputValue();
  };

  await page.locator("#base-profile").selectOption("ai-balanced");
  await page.locator('input[name="region-mode"][value="only"]').check();
  await page.locator('#region-list input[value="us"]').check();
  await page.locator(".profile-advanced > summary").click();
  await page.locator("#service-chatgpt").uncheck();
  await page.locator("#allow-direct").uncheck();
  const profileCatalog = await page.evaluate(async () => (await fetch("/api/v1/catalog")).json());
  const geminiPolicy = serviceGroupPolicy(profileCatalog, "yaml", "ai-balanced", "gemini");
  expect(geminiPolicy).toBeTruthy();
  expect(geminiPolicy.allowedRoutes).toContain("us");
  await createAndAssignServiceGroup(page, {
    initialName: "Gemini YAML draft",
    name: "Gemini US Only",
    serviceId: "gemini",
    routes: ["us"],
  });
  const mixedYaml = await convert([
    "socks5h://e2e-user:e2e-pass@socks.example.test:1080#US-E2E-Node",
    "https://https.example.test:443#HTTPS-E2E",
    "vless://01234567-89ab-cdef-0123-456789abcdef@vless.example.test:443?security=reality&pbk=synthetic-key&sni=vless.example.test&fp=chrome&flow=xtls-rprx-vision#VLESS-E2E",
  ].join("\n"));
  expect(mixedYaml).toMatch(/^# Generated by Profile Builder/u);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-yaml").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("converted-profile.yaml");
  const downloadStream = await download.createReadStream();
  const downloadChunks = [];
  for await (const chunk of downloadStream) downloadChunks.push(Buffer.from(chunk));
  const downloadedYaml = Buffer.concat(downloadChunks).toString("utf8");
  expect(downloadedYaml === mixedYaml).toBe(true);

  const config = YAML.parse(downloadedYaml);
  const importedProvider = config["proxy-providers"].provider1;
  expect(importedProvider.type).toBe("inline");
  expect(importedProvider.payload).toEqual([
    {
      name: "US-E2E-Node",
      type: "socks5",
      server: "socks.example.test",
      port: 1080,
      username: "e2e-user",
      password: "e2e-pass",
      udp: false,
    },
    {
      name: "HTTPS-E2E",
      type: "http",
      server: "https.example.test",
      port: 443,
      tls: true,
    },
    {
      name: "VLESS-E2E",
      type: "vless",
      server: "vless.example.test",
      port: 443,
      uuid: "01234567-89ab-cdef-0123-456789abcdef",
      tls: true,
      flow: "xtls-rprx-vision",
      servername: "vless.example.test",
      "client-fingerprint": "chrome",
      "reality-opts": { "public-key": "synthetic-key", "short-id": "" },
      udp: true,
    },
  ]);
  expect(importedProvider).not.toHaveProperty("url");
  expect(importedProvider).not.toHaveProperty("path");
  expect(importedProvider).not.toHaveProperty("header");
  expect(importedProvider).not.toHaveProperty("override");

  const groups = new Map(config["proxy-groups"].map((group) => [group.name, group]));
  const usRoute = runtimeData.regions.find((region) => region.id === "us");
  expect(usRoute).toBeTruthy();
  expect(groups.get("Gemini US Only").proxies).toEqual([
    runtimeData.accountProtection.rejectGroup ?? runtimeData.groups.reject,
    usRoute.group,
  ]);
  const manual = groups.get("🚀 手動選擇");
  expect(manual.type).toBe("select");
  expect(manual.use).toContain("provider1");
  expect(groups.has("🇺🇸 US Stable")).toBe(true);
  expect(groups.has("🇯🇵 JP Stable")).toBe(false);
  expect(groups.get("🤖 ChatGPT").proxies).toEqual(["⛔ 拒絕"]);
  expect(groups.get("🎯 全球直連").proxies).toEqual(["⛔ 拒絕"]);
  expect(config.rules).toContain("RULE-SET,Privacy_Guard_Classical,⛔ 拒絕");
  expect(config["rule-providers"].Privacy_Guard_Classical.type).toBe("inline");
  expect(config["rule-providers"].Privacy_Guard_Classical.payload).toContain("DST-PORT,3478");
  expect(config["rule-providers"].Privacy_Guard_Classical.payload).toContain("DST-PORT,5349");
  expect(config["rule-providers"].Privacy_Guard_Classical.payload).toContain("DOMAIN-KEYWORD,stun");
  expect(config.dns["use-system-hosts"]).toBe(false);
  expect(config.dns.nameserver.every((server) => server.startsWith("https://"))).toBe(true);

  await page.locator("#base-profile").selectOption("ai-strict");
  await page.locator("#language").selectOption("zh-Hant");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await expect(page.locator("#language")).toHaveValue("zh-Hant");
  const strictYaml = await convert("socks5h://strict.example.test:1080#Strict-E2E");
  expect(strictYaml).toMatch(/^# 由 Profile Builder 產生/u);
  const strictConfig = YAML.parse(strictYaml);
  expect(strictConfig.rules.at(-1)).toMatch(/(?:REJECT|⛔ 拒絕)$/u);
  expect(strictYaml).not.toBe(mixedYaml);

  await page.locator("#base-profile").selectOption("standard");
  await page.locator("#language").selectOption("zh-Hans");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await expect(page.locator("#language")).toHaveValue("zh-Hans");
  const standardYaml = await convert("socks5h://standard.example.test:1080#Standard-E2E");
  expect(standardYaml).toMatch(/^# 由 Profile Builder 生成/u);
  expect(standardYaml).not.toBe(strictYaml);
  await page.locator("#language").selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await expect(page.locator("#language")).toHaveValue("en");

  const httpsNode = importedProvider.payload[1];
  expect(httpsNode.type).toBe("http");
  expect(httpsNode.tls).toBe(true);
  expect(httpsNode.server).toBe("https.example.test");

  const vlessNode = importedProvider.payload[2];
  expect(vlessNode.type).toBe("vless");
  expect(vlessNode.flow).toBe("xtls-rprx-vision");
  expect(vlessNode["reality-opts"]["public-key"]).toBe("synthetic-key");

  const encoded = Buffer.from("socks5h://base64.example.test:1080#Base64-E2E").toString("base64");
  const base64Yaml = await convert(encoded);
  expect(YAML.parse(base64Yaml)["proxy-providers"].provider1.payload[0].name).toBe("Base64-E2E");

  const clashYaml = await convert(`proxies:\n  - name: Clash-E2E\n    type: socks5\n    server: clash.example.test\n    port: 1080\n`);
  expect(YAML.parse(clashYaml)["proxy-providers"].provider1.payload[0].name).toBe("Clash-E2E");

  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.locator("#clear-button").click();
  await expect(input).toHaveValue("");
  await expect(output).toHaveValue("");
  await expect(page.locator("#output-panel")).toBeHidden();
  await page.getByRole("link", { name: "INI template builder" }).click();
  await expect(page).toHaveURL(/\/builder\/template$/u);
  await page.getByRole("link", { name: "Online YAML converter" }).click();
  await expect(page).toHaveURL(/\/converter$/u);

  await input.fill("http://subscription.example.test/list?token=synthetic");
  await format.selectOption("subscription");
  await page.locator("#convert-button").click();
  const invalidSubscriptionMessage = await page.evaluate(async () => (
    await (await fetch("/locales/en.json")).json()
  ).converterErrorInvalidSubscriptionUrl);
  await expect(status).toContainText(invalidSubscriptionMessage);
  await expect(status).not.toContainText("subscription.example.test");
  await expect(page.locator("#output-panel")).toBeHidden();

  await input.fill([
    "socks5h://e2e-user:e2e-pass@socks.example.test:1080#US-E2E-Node",
    "https://https.example.test:443#HTTPS-E2E",
    "https://unapproved-one.example.net/sub?token=synthetic-one",
    "https://unapproved-two.example.net/sub?token=synthetic-two",
  ].join("\n"));
  await format.selectOption("auto");
  await page.locator("#convert-button").click();
  await expect(status).toContainText("This subscription host is not enabled by the service operator.");
  await expect(status).not.toContainText("unapproved-one.example.net");
  await expect(status).not.toContainText("unapproved-two.example.net");
  await expect(status).not.toContainText("synthetic");
  await expect(page.locator("#output-panel")).toBeHidden();
  expect(pageErrors).toHaveLength(0);
});
