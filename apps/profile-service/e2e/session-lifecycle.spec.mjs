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
  await expect(page.locator("#service-group-search")).toBeFocused();
  await expect(page.locator("#service-group-search")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#service-group-search")).toHaveAttribute("aria-describedby", "field-error-service-group-search");
  await page.locator("#language").selectOption("zh-Hant");
  await expect(page.locator("#field-error-service-group-search")).toHaveText(traditional.validationGroupsServer);
  await page.locator("#section-continue").click();
  await page.unroute("**/api/v1/resolve");
  await page.locator("#preview").click();
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
  await expect(page.locator("#error-summary")).toBeHidden();
  await expect(page.locator("#save")).toBeEnabled();
});
