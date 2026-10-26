import { expect, test } from "./fixtures.mjs";

async function openBuilder(page) {
  await page.goto("/builder/template");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await page.locator("#language").selectOption("en");
  await page.locator("#base-profile").selectOption("ai-balanced");
}

async function continueToReview(page, selector) {
  const pending = page.waitForResponse((value) => (
    new URL(value.url()).pathname === "/api/v1/resolve" && value.request().method() === "POST"
  ));
  await page.locator(selector).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
}

test("keeps an invalid raw draft through nonlinear navigation and reload, then returns Review edits to Review", async ({ page }) => {
  await openBuilder(page);
  await page.locator("#nav-policies").click();
  await expect(page).toHaveURL(/\/builder\/policies$/u);
  await page.locator("#allow-direct").uncheck();

  await page.locator("#nav-regions").click();
  await expect(page).toHaveURL(/\/builder\/regions$/u);
  await page.locator("#region-mode-only").check();
  await expect(page.locator("#region-validation")).toBeVisible();
  await expect(page.locator("#region-validation")).toContainText("Only mode requires at least one routable region.");
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "invalid");

  await page.locator("#nav-template").click();
  await expect(page).toHaveURL(/\/builder\/template$/u);
  await page.locator("#nav-regions").click();
  await expect(page.locator("#region-mode-only")).toBeChecked();
  await expect(page.locator('#region-list input:checked')).toHaveCount(0);

  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "invalid");
  await expect(page.locator("#region-mode-only")).toBeChecked();
  await expect(page.locator('#region-list input:checked')).toHaveCount(0);

  await page.locator("#nav-review").click();
  await expect(page).toHaveURL(/\/builder\/review$/u);
  await expect(page.locator("#error-summary")).toBeVisible();
  await expect(page.locator("#save")).toBeDisabled();
  const invalidRegionLink = page.locator('#error-list a[href^="/builder/regions"]');
  await expect(invalidRegionLink).toBeVisible();
  await invalidRegionLink.click();
  await expect(page).toHaveURL(/\/builder\/regions\?return=review$/u);
  await expect(page.locator("#region-list")).toBeFocused();
  await expect(page.locator("#region-validation")).toBeVisible();

  await page.locator('#region-list input[value="us"]').check();
  await expect(page.locator("#editor-state")).not.toHaveAttribute("data-state", "invalid");
  await continueToReview(page, "#section-continue");
  await expect(page).toHaveURL(/\/builder\/review$/u);

  const editRegions = page.locator('#review-summary a[href^="/builder/regions"]');
  await expect(editRegions).toHaveAttribute("href", "/builder/regions?return=review");
  await editRegions.click();
  await expect(page).toHaveURL(/\/builder\/regions\?return=review$/u);
  await page.locator("#prefer-region-picker").selectOption("us");
  await page.locator("#prefer-region-add").click();
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "outdated");
  await continueToReview(page, "#section-continue");
  await expect(page).toHaveURL(/\/builder\/review$/u);
  await expect(page.locator("#review-summary")).toContainText("United States");

  await page.locator("#preview").click();
  await expect(page.locator("#preview-result")).toBeFocused();
  await expect(page.locator("#preview-result")).toBeInViewport({ ratio: 0.2 });
});

