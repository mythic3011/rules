import { expect, test } from "./fixtures.mjs";

test("imports a ProfileSpec with adblock and custom HTTPS providers through server preview", async ({ page }) => {
  await page.goto("/builder/template");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  await page.locator("#language").selectOption("en");
  await page.locator("#base-profile").selectOption("ai-balanced");

  const spec = {
    schemaVersion: 1,
    baseProfile: "ai-balanced",
    language: "en",
    adblock: true,
    customRuleProviders: [
      { url: "https://rules.example/domain.yaml", behavior: "domain", target: "reject" },
      { url: "https://rules.example/classical.yaml", behavior: "classical", target: "proxy" },
    ],
  };
  const resolveResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/v1/resolve" && response.request().method() === "POST"
  ));
  await page.locator("#profile-json-import-file").setInputFiles({
    name: "profile.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(spec)),
  });

  // The input change starts the import request; wait for its server-normalized preview.
  const response = await resolveResponse;
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.spec).toMatchObject(spec);
  expect(payload.ini).toContain(spec.customRuleProviders[0].url);
  expect(payload.ini).toContain(spec.customRuleProviders[1].url);

  await expect(page.locator("#status")).toContainText("ProfileSpec validated and imported.");
  await expect(page.locator("#custom-rule-provider-url-0")).toHaveValue(spec.customRuleProviders[0].url);
  await expect(page.locator("#custom-rule-provider-url-1")).toHaveValue(spec.customRuleProviders[1].url);
  await expect(page.locator("#adblock-setting")).toHaveValue("enabled");

  await page.locator("#nav-review").click();
  await expect(page).toHaveURL(/\/builder\/review$/u);
  await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
  await expect(page.locator("#ini-preview")).toContainText(spec.customRuleProviders[0].url);
  await expect(page.locator("#ini-preview")).toContainText(spec.customRuleProviders[1].url);
  await expect(page.locator("#profile-json-tools")).toBeVisible();
});
