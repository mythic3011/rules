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

async function locale(request, language) {
  const response = await request.get(`/locales/${language}.json`);
  expect(response.status()).toBe(200);
  return response.json();
}

test("separates a stale preview and invalid draft from the saved subscription", async ({ page, request }) => {
  const english = await locale(request, "en");
  const traditional = await locale(request, "zh-Hant");
  await openEditor(page);
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "draft");
  await preview(page);
  await expect(page.locator("#preview-result")).toBeFocused();
  await expect(page.locator("#preview-summary")).toBeVisible();

  await page.locator('#region-list input[value="us"]').check();
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "outdated");
  await preview(page);
  const summary = JSON.parse(await page.locator("#summary").textContent());
  expect(summary.activeRegions.map((region) => region.id)).not.toContain("us");
  await page.locator('#region-list input[value="us"]').uncheck();
  await preview(page);

  await page.locator("#save").click();
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#result")).toBeFocused();
  await expect(page.locator("#result-manage-step")).toBeVisible();
  await expect(page.locator("#manage-url")).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("e2e-created-links", JSON.stringify({
    read: document.getElementById("subscription-url").value,
    manage: document.getElementById("manage-url").value,
  })));

  await page.locator('input[name="region-mode"][value="only"]').check();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "invalid");
  if (await page.locator("#preview").isEnabled()) await page.locator("#preview").click();
  await expect(page.locator("#status")).toContainText(english.onlyRequiresRegion);
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "outdated");
  await expect(page.locator("#saved-result-state")).toContainText(
    english.resultUrlsSavedRevision.replaceAll("{revision}", "1"),
  );
  expect(await page.evaluate(() => {
    const previous = JSON.parse(sessionStorage.getItem("e2e-created-links"));
    return previous.read === document.getElementById("subscription-url").value
      && previous.manage === document.getElementById("manage-url").value;
  })).toBe(true);

  await page.locator("#language").selectOption("zh-Hant");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(page.locator("#status")).toContainText(traditional.onlyRequiresRegion);
  await expect(page.locator("#manage-url")).toBeVisible();
});

test("keeps edits unsaved when an older management save completes", async ({ page, request }) => {
  const english = await locale(request, "en");
  await openEditor(page);
  await page.locator("#save").click();
  await expect(page.locator("#result")).toBeVisible();
  await page.locator("#manage-url").evaluate((input) => {
    const url = new URL(input.value);
    const id = url.searchParams.get("id");
    sessionStorage.setItem(`profile-manage:${id}`, url.hash.slice(1));
    location.assign(`${url.pathname}${url.search}`);
  });
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "clean");
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
    await page.locator("#save").click();
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.locator("#save")).toBeDisabled();
    await page.locator('#region-list input[value="jp"]').check();
    release();
    await expect(page.locator("#status")).toContainText(
      english.savedRevision.replaceAll("{revision}", "2"),
    );
    await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "dirty");

    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "clean");
    await expect(page.locator('#region-list input[value="us"]')).toBeChecked();
    await expect(page.locator('#region-list input[value="jp"]')).not.toBeChecked();
  } finally {
    release();
  }
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

test("supports single-select group keyboards and visible results on a small screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await openEditor(page);
  const customization = page.locator("#service-group-customization");
  await expect(customization).not.toHaveJSProperty("open", true);
  await customization.locator(":scope > summary").click();
  const choices = page.locator('#service-group-list [role="radio"]');
  expect(await choices.count()).toBeGreaterThan(1);
  await choices.first().click();
  await choices.first().press("End");
  await expect(choices.last()).toHaveAttribute("aria-checked", "true");
  await expect(choices.last()).toBeFocused();
  await choices.last().press("Home");
  await expect(choices.first()).toHaveAttribute("aria-checked", "true");
  await expect(choices.first()).toBeFocused();
  await expect(page.locator('#service-group-list [aria-checked="true"]')).toHaveCount(1);
  await expect(page.locator('#service-group-list [tabindex="0"]')).toHaveCount(1);
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "draft");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await customization.locator(":scope > summary").click();
  await preview(page);
  await expect(page.locator("#preview-result")).toBeFocused();
  await expect(page.locator("#preview-result")).toBeInViewport({ ratio: 0.2 });
});
