import { expect, test } from "./fixtures.mjs";
import { CAPABILITY_TTL_MS } from "../public/capability-session.mjs";

async function createLocalProfile(page) {
  await page.goto("/builder/template");
  await expect(page.locator("#base-profile")).toBeEnabled();
  await page.locator("#language").selectOption("en");
  await page.locator("#quick-review").click();
  await expect(page.locator("#save")).toBeEnabled();
  await page.locator("#save").click();
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#profile-context")).toContainText("Saved profile");
  await expect(page.locator(".editor-status-bar")).toBeHidden();
  await expect(page.locator("#success-draft-notice")).toBeHidden();
  // Never return or assert capability strings: failure output stays nonsecret.
  expect(await page.evaluate(() => Boolean(document.getElementById("manage-url").value))).toBe(true);
}

test("expires displayed success links and same-tab capability records without a request", async ({ page }) => {
  await page.clock.install();
  await createLocalProfile(page);
  await page.clock.fastForward(CAPABILITY_TTL_MS + 1);
  await expect(page.locator("#success-unavailable")).toBeVisible();
  expect(await page.evaluate(() => ({
    readCleared: document.getElementById("subscription-url").value === "",
    manageCleared: document.getElementById("manage-url").value === "",
    recordsCleared: Object.keys(sessionStorage).every((key) => !key.startsWith("profile-manage:") && !key.startsWith("profile-created")),
  }))).toEqual({ readCleared: true, manageCleared: true, recordsCleared: true });
});

test("creation identifies newer invalid edits as a separate retained draft", async ({ page, request }) => {
  const translations = await (await request.get("/locales/zh-Hant.json")).json();
  let releaseCreate;
  let notifyStarted;
  const pendingCreate = new Promise((resolve) => { releaseCreate = resolve; });
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  await page.route("**/api/v1/profiles", async (route) => {
    notifyStarted();
    await pendingCreate;
    await route.continue();
  });
  try {
    await page.goto("/builder/template");
    await expect(page.locator("#base-profile")).toBeEnabled();
    await page.locator("#language").selectOption("en");
    await page.locator("#quick-review").click();
    await expect(page.locator("#save")).toBeEnabled();
    await page.locator("#save").click();
    await started;
    await page.locator("#nav-regions").click();
    await page.locator("#region-mode-only").check();
    await expect(page.locator("#region-validation")).toBeVisible();
  } finally {
    releaseCreate();
  }
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#profile-context")).toContainText("Saved profile");
  await expect(page.locator("#success-draft-notice")).toBeVisible();
  await expect(page.locator("#success-draft-invalid")).toBeVisible();
  await expect(page.locator("#error-summary")).toBeHidden();
  await expect(page.locator(".editor-status-bar")).toBeHidden();
  await page.locator("#language").selectOption("zh-Hant");
  await expect(page.locator("#success-draft-notice")).toContainText(translations.successDraftRetained);
  await expect(page.locator("#success-draft-invalid")).toHaveText(translations.successDraftInvalid);
  await page.locator("#success-review-draft").click();
  await expect(page.locator("#error-summary")).toBeVisible();
  await expect(page.locator("#save")).toBeDisabled();
  await page.locator("#error-list a").click();
  await expect(page.locator("#region-mode-only")).toBeChecked();
  await expect(page.locator('#region-list input:checked')).toHaveCount(0);
  await expect(page.locator("#region-list")).toBeFocused();
});

test("result expiry preserves a renewed management session, then session expiry preserves its draft", async ({ page }) => {
  await page.clock.install();
  await createLocalProfile(page);
  await page.clock.fastForward(CAPABILITY_TTL_MS - 60_000);
  await page.locator("#result-manage-open").click();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "clean");
  expect(await page.evaluate(() => location.hash === "")).toBe(true);
  await page.locator("#nav-regions").click();
  await page.locator("#region-us").check();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "dirty");
  await page.clock.fastForward(120_000);
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "dirty");
  await expect(page.locator("#region-us")).toBeChecked();
  await page.clock.fastForward(CAPABILITY_TTL_MS);
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "load-failed");
  await expect(page.locator("#region-us")).toBeChecked();
  expect(await page.evaluate(() => ({
    blocked: document.getElementById("profile-options").inert,
    draftRetained: Object.keys(sessionStorage).filter((key) => key.startsWith("profile-editor-draft:v1:manage:"))
      .some((key) => JSON.parse(sessionStorage.getItem(key)).draft.selectedRegions.includes("us")),
    capsCleared: Object.keys(sessionStorage).every((key) => !key.startsWith("profile-manage:")),
  }))).toEqual({ blocked: true, draftRetained: true, capsCleared: true });
});

test("server validation has translated inline recovery and can be retried without discarding the draft", async ({ page, request }) => {
  const response = await request.get("/locales/zh-Hant.json");
  const traditional = await response.json();
  await page.route("**/api/v1/resolve", (route) => route.fulfill({ status: 400,
    contentType: "application/json", body: JSON.stringify({ error: "unsupported_service_group_route" }) }));
  await page.goto("/builder/review");
  await expect(page.locator("#error-summary")).toBeVisible();
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#preview")).toBeEnabled();
  await page.locator("#error-list a").click();
  await expect(page.locator("#service-group-list")).toBeFocused();
  await expect(page.locator("#service-group-list")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#service-group-list")).toHaveAttribute("aria-describedby", "field-error-service-group-list");
  await expect(page.locator("#service-group-search")).not.toHaveAttribute("aria-invalid", "true");
  await page.locator("#language").selectOption("zh-Hant");
  await expect(page.locator("#field-error-service-group-list")).toHaveText(traditional.validationGroupsServer);
  await page.locator("#section-continue").click();
  await page.unroute("**/api/v1/resolve");
  await page.locator("#preview").click();
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
  await expect(page.locator("#error-summary")).toBeHidden();
  await expect(page.locator("#save")).toBeEnabled();
});

test("legacy management options remain visibly inherited until explicitly changed", async ({ page }) => {
  await page.goto("/builder/template");
  await expect(page.locator("#base-profile")).toBeEnabled();
  expect(await page.evaluate(async () => {
    const response = await fetch("/api/v1/profiles", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: { baseProfile: "ai-balanced", language: "en" } }) });
    if (!response.ok) return false;
    const result = await response.json();
    location.assign(`/manage/policies?id=${encodeURIComponent(result.id)}#${result.manageToken}`);
    return true;
  })).toBe(true);
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "clean");
  expect(await page.evaluate(() => ({
    directInherited: document.getElementById("allow-direct").indeterminate,
    failClosedInherited: document.getElementById("fail-closed").indeterminate,
    captured: location.hash === "",
  }))).toEqual({ directInherited: true, failClosedInherited: true, captured: true });
  await expect(page.locator("#direct-inherited-help")).toBeVisible();
  await expect(page.locator("#fail-closed-inherited-help")).toBeVisible();
  await page.locator("#allow-direct").check();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "dirty");
  expect(await page.locator("#allow-direct").evaluate((node) => node.indeterminate)).toBe(false);
  await page.locator("#undo").click();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "clean");
  expect(await page.locator("#allow-direct").evaluate((node) => node.indeterminate)).toBe(true);
});
