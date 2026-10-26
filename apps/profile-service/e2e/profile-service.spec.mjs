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

test("previews, creates, edits, and reloads a persistent profile without rotating its subscription URL", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", () => pageErrors.push("pageerror"));
  const loadedLocales = new Set();
  page.on("response", (response) => {
    const match = new URL(response.url()).pathname.match(/^\/locales\/(en|zh-Hant|zh-Hans)\.json$/u);
    if (match && response.status() === 200) loadedLocales.add(match[1]);
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await page.locator("#language").selectOption("en");
  await expect(page.locator("#language")).toHaveValue("en");
  await expect(page.locator("#base-profile option").first()).toBeAttached();
  await expect(page.locator("#region-list input").first()).toBeVisible();

  await page.locator("#base-profile").selectOption("ai-balanced");
  const profileCatalog = await page.evaluate(async () => (await fetch("/api/v1/catalog")).json());
  const geminiPolicy = serviceGroupPolicy(profileCatalog, "ini", "ai-balanced", "gemini");
  expect(geminiPolicy).toBeTruthy();
  expect(geminiPolicy.allowedRoutes).toContain("us");
  const alternateGeminiRoute = geminiPolicy.allowedRoutes.find((route) => (
    route !== "us" && profileCatalog.regions.some((region) => region.id === route)
  ));
  expect(alternateGeminiRoute).toBeTruthy();

  await createAndAssignServiceGroup(page, {
    initialName: "Gemini draft",
    name: "Gemini Routing E2E",
    serviceId: "gemini",
    routes: ["us"],
  });
  await openDetails(page, ".group-route-palette");
  await page.locator(`#route-available-${alternateGeminiRoute}`).dragTo(page.locator("#service-group-routes"));
  await page.locator(`#group-route-${alternateGeminiRoute}-moveUp`).click();
  await page.locator(`#group-route-${alternateGeminiRoute}-remove`).click();
  await openDetails(page, ".group-settings");
  await page.locator("#delete-service-group").click();
  await expect(page.locator("#service-group-editor .hint").filter({ hasText: /Gemini/u })).toBeVisible();

  for (const region of ["us", "jp", "sg"]) {
    await page.locator("#prefer-region-picker").selectOption(region);
    await page.getByRole("button", { name: "Add region" }).click();
  }

  await page.locator(".profile-advanced > summary").click();
  const allowDirect = page.locator("#allow-direct");
  await allowDirect.check();
  const directAllowed = await previewIni(page);
  expectIniServiceRulesTarget(
    directAllowed.ini,
    "gemini",
    runtimeData.accountProtection.rejectGroup ?? runtimeData.groups.reject,
  );
  await expect(page.locator("#preview-result")).toBeVisible();
  const directAllowedIni = directAllowed.ini;
  const directGroup = directAllowedIni.split(/\r?\n/u).find((line) => line.startsWith("custom_proxy_group=🎯 全球直連"));
  expect(directGroup).toContain("[]DIRECT");
  await allowDirect.uncheck();
  await page.locator("#fail-closed").check();
  const directBlockedIni = (await previewIni(page)).ini;
  const blockedDirectGroup = directBlockedIni.split(/\r?\n/u).find((line) => line.startsWith("custom_proxy_group=🎯 全球直連"));
  expect(blockedDirectGroup).toContain("[]⛔ 拒絕");
  expect(directBlockedIni).not.toContain("[]🎯 全球直連");
  const catchAllGroup = directBlockedIni.split(/\r?\n/u).find((line) => line.startsWith("custom_proxy_group=🐟 漏網之魚"));
  expect(catchAllGroup).toContain("[]⛔ 拒絕");

  const savedGeminiGroupId = await createAndAssignServiceGroup(page, {
    initialName: "Gemini reassignment",
    name: "Gemini US Only",
    serviceId: "gemini",
    routes: ["us"],
  });
  const assignedGeminiPreview = await previewIni(page);
  const assignedGeminiGroup = assignedGeminiPreview.ini
    .split(/\r?\n/u)
    .find((line) => line.startsWith("custom_proxy_group=Gemini US Only`"));
  expect(assignedGeminiGroup).toContain(runtimeData.regions.find((region) => region.id === "us").group);

  const resolvedLanguages = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/v1/resolve") return;
    resolvedLanguages.push(request.postDataJSON()?.spec?.language);
  });
  for (const [language, previewLabel] of [["zh-Hant", "預覽"], ["zh-Hans", "预览"], ["en", "Preview"]]) {
    await page.locator("#language").selectOption(language);
    await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
    await expect(page.locator("#language")).toHaveValue(language);
    await expect(page.locator("#preview")).toHaveText(previewLabel);
    const preview = await previewIni(page);
    await expect(page.locator("#preview-result")).toBeVisible();
    await expect(page.locator("#ini-preview")).toContainText("[custom]");
    const summary = preview.summary;
    expect(summary.preferredRegions.map((region) => region.id)).toEqual(["us", "jp", "sg"]);
  }
  expect(resolvedLanguages).toEqual(["zh-Hant", "zh-Hans", "en"]);
  expect([...loadedLocales].sort()).toEqual(["en", "zh-Hans", "zh-Hant"]);
  await expect(page.locator("#language")).toHaveValue("en");

  await page.locator("#base-profile").selectOption("standard");
  await page.locator("#language").selectOption("zh-Hans");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await expect(page.locator("#language")).toHaveValue("zh-Hans");
  await previewIni(page);
  await expect(page.locator("#preview-result")).toBeVisible();
  expect(JSON.parse(await page.locator("#summary").textContent()).baseProfile).toBe("standard");
  await expect(page.locator("#ini-preview")).toContainText(/(?:;|#) 由 Profile Builder 生成/u);
  await page.locator("#base-profile").selectOption("ai-balanced");
  await page.locator("#language").selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await expect(page.locator("#language")).toHaveValue("en");

  await page.locator("#language").selectOption("zh-Hant");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await expect(page.locator("#language")).toHaveValue("zh-Hant");
  await page.locator("#save").click();
  await expect(page.locator("#result")).toBeVisible();
  const subscriptionShape = await page.locator("#subscription-url").evaluate((input) => {
    const url = new URL(input.value);
    return {
      sameOrigin: url.origin === location.origin,
      expectedPath: /^\/p\/[A-Za-z0-9_-]{40,64}$/u.test(url.pathname),
    };
  });
  expect(subscriptionShape).toEqual({ sameOrigin: true, expectedPath: true });

  const initialSubscription = await page.locator("#subscription-url").evaluate(async (input) => {
    const subscriptionUrl = new URL(input.value);
    sessionStorage.setItem("e2e-profile-subscription", subscriptionUrl.href);
    const extensionlessPath = subscriptionUrl.pathname.replace(/\.ini$/u, "");
    const response = await fetch(`${subscriptionUrl.origin}${extensionlessPath}`, {
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
  expect(initialSubscription).toEqual({
    status: 200,
    redirected: true,
    redirectedToIni: true,
    revision: "1",
    hasIni: true,
  });

  await page.locator("#manage-url").evaluate((input) => {
    const url = new URL(input.value);
    const id = url.searchParams.get("id");
    sessionStorage.setItem(`profile-manage:${id}`, url.hash.slice(1));
    localStorage.setItem("profile-service-language", "en");
    url.hash = "";
    location.assign(`${url.pathname}${url.search}`);
  });
  await expect(page).toHaveURL(/\/manage\?id=[0-9a-f-]{36}$/iu);
  await expect(page.locator("#saved-state-note")).toContainText("1");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(page.locator("#language")).toHaveValue("zh-Hant");
  await page.locator("#language").selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await expect(page.locator("#language")).toHaveValue("en");

  await page.locator('#region-list input[value="jp"]').check();
  await page.locator("#save").click();
  await expect(page.locator("#status")).toContainText("Saved revision 2.");

  await page.reload();
  await expect(page.locator("#saved-state-note")).toContainText("2");
  await expect(page.locator('#region-list input[value="jp"]')).toBeChecked();
  await selectServiceGroup(page, savedGeminiGroupId);
  await openDetails(page, ".group-settings");
  await expect(page.locator("#service-group-name")).toHaveValue("Gemini US Only");
  await expect(page.locator("#group-service-gemini-remove")).toBeVisible();
  expect(await page.locator("#service-group-routes > [data-route]").evaluateAll((rows) =>
    rows.map((row) => row.dataset.route)
  )).toEqual(["us"]);
  await expect(page.locator("#service-group-start-reject")).toBeChecked();
  const savedSubscription = await page.evaluate(async () => {
    const subscriptionUrl = sessionStorage.getItem("e2e-profile-subscription");
    const url = new URL(subscriptionUrl);
    const extensionlessPath = url.pathname.replace(/\.ini$/u, "");
    const response = await fetch(`${url.origin}${extensionlessPath}`, {
      cache: "no-store",
      redirect: "follow",
    });
    const finalPath = new URL(response.url).pathname;
    const result = {
      status: response.status,
      redirected: response.redirected,
      redirectedToIni: /\.ini$/u.test(finalPath),
      revision: response.headers.get("x-profile-revision"),
      hasIni: (await response.text()).includes("[custom]"),
    };
    sessionStorage.removeItem("e2e-profile-subscription");
    return result;
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
  await expect(page).toHaveURL(/\/$/u);
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
