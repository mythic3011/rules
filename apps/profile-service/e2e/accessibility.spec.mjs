import { mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "./fixtures.mjs";

const EVIDENCE_DIR = process.env.PROFILE_SERVICE_E2E_EVIDENCE_DIR || ".wrangler/accessibility-evidence";
const SECTION_KEYS = {
  template: "sectionTemplate",
  regions: "sectionRegions",
  services: "sectionServices",
  policies: "sectionPolicies",
  review: "sectionReview",
};

async function loadLocale(page, language) {
  await page.locator("#language").selectOption(language);
  await expect(page.locator("html")).toHaveAttribute("lang", language);
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");
  return page.evaluate(async (code) => (await (await fetch(`/locales/${code}.json`)).json()), language);
}

async function expectRouteSemantics(page, section, labels) {
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("#page-title")).not.toHaveText("");
  await expect(page.locator("#page-title")).toBeFocused();
  const active = page.locator("#section-navigation a[aria-current='page']");
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute("id", `nav-${section}`);
  await expect(active).toHaveText(labels[SECTION_KEYS[section]]);
}

async function goToSection(page, section, labels) {
  await page.locator(`#nav-${section}`).click();
  await expect(page).toHaveURL(new RegExp(`/builder/${section}$`, "u"));
  await expectRouteSemantics(page, section, labels);
}

async function colorContrastSamples(page, selectors) {
  return page.evaluate((selectorMap) => {
    const parse = (value) => {
      const match = value.match(/rgba?\(([^)]+)\)/u);
      if (!match) return null;
      const values = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
      return [values[0], values[1], values[2], values[3] ?? 1];
    };
    const composite = (front, back) => {
      const alpha = front[3];
      return [
        front[0] * alpha + back[0] * (1 - alpha),
        front[1] * alpha + back[1] * (1 - alpha),
        front[2] * alpha + back[2] * (1 - alpha),
        1,
      ];
    };
    const luminance = (color) => {
      const channels = color.slice(0, 3).map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const result = {};
    for (const [name, selector] of Object.entries(selectorMap)) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const text = parse(getComputedStyle(element).color);
      if (!text) continue;
      const ancestors = [];
      for (let node = element; node; node = node.parentElement) ancestors.push(node);
      let background = [255, 255, 255, 1];
      for (const node of ancestors.reverse()) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if (color && color[3] > 0) background = composite(color, background);
      }
      const foreground = composite(text, background);
      const first = luminance(foreground);
      const second = luminance(background);
      const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      const style = getComputedStyle(element);
      const large = Number.parseFloat(style.fontSize) >= 24
        || Number.parseFloat(style.fontSize) >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700;
      result[name] = {
        ratio: Number(ratio.toFixed(2)),
        threshold: large ? 3 : 4.5,
        color: style.color,
        background: `rgb(${background.slice(0, 3).map(Math.round).join(", ")})`,
      };
    }
    return result;
  }, selectors);
}

async function focusIndicatorContrast(page, selector) {
  return page.evaluate((target) => {
    const parse = (value) => {
      const match = value.match(/rgba?\(([^)]+)\)/u);
      if (!match) return null;
      const values = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
      return [values[0], values[1], values[2], values[3] ?? 1];
    };
    const composite = (front, back) => front.map((value, index) => index === 3
      ? 1
      : value * front[3] + back[index] * (1 - front[3]));
    const luminance = (color) => color.slice(0, 3).map((value) => value / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const element = document.querySelector(target);
    const style = getComputedStyle(element);
    let background = [255, 255, 255, 1];
    const ancestors = [];
    for (let node = element; node; node = node.parentElement) ancestors.push(node);
    for (const node of ancestors.reverse()) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color && color[3] > 0) background = composite(color, background);
    }
    const outline = parse(style.outlineColor);
    const outlineComposite = composite(outline, background);
    const first = luminance(outlineComposite);
    const second = luminance(background);
    return {
      ratio: Number(((Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)).toFixed(2)),
      color: style.outlineColor,
      background: `rgb(${background.slice(0, 3).map(Math.round).join(", ")})`,
    };
  }, selector);
}

async function expectNoOverflowAndNestedScroll(page) {
  const layout = await page.evaluate(() => {
    const nestedScrollers = [...document.querySelectorAll("body *")]
      .filter((element) => !["SELECT", "TEXTAREA"].includes(element.tagName))
      .filter((element) => {
        const style = getComputedStyle(element);
        return ["auto", "scroll"].includes(style.overflowY)
          && element.scrollHeight > element.clientHeight + 1;
      })
      .map((element) => ({
        selector: element.id ? `#${element.id}` : element.className?.toString() || element.tagName,
        overflowY: getComputedStyle(element).overflowY,
      }));
    return {
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      nestedScrollers,
    };
  });
  expect(layout.scrollWidth, `horizontal overflow at ${layout.width}px`).toBeLessThanOrEqual(layout.width);
  expect(layout.nestedScrollers).toEqual([]);
  return layout;
}

async function setKeyboardFocusAndCheck(page) {
  await page.locator("#nav-template").focus();
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    return {
      id: element.id,
      visible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
    };
  });
  expect(focus.id).toBe("nav-regions");
  expect(focus.visible).toBe(true);
  expect(focus.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(3);
  return focus;
}

test("routed pages keep one clear task, translated accessible names, and keyboard recovery", async ({ page }, testInfo) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const screenshots = [];
  const observations = { screenshots, routes: [], contrast: {}, localizedNameIssues: [], limits: [] };
  await page.setViewportSize({ width: 1363, height: 936 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/builder/template");
  await expect(page.locator("html")).toHaveAttribute("data-i18n-ready", "true");

  for (const language of ["en", "zh-Hant", "zh-Hans"]) {
    const labels = await loadLocale(page, language);
    if (await page.locator("#nav-template").getAttribute("aria-current") !== "page") {
      await goToSection(page, "template", labels);
    }
    await expectRouteSemantics(page, "template", labels);
    const optionsName = await page.locator("#profile-options").getAttribute("aria-label");
    if (optionsName !== labels.profileOptions) {
      observations.localizedNameIssues.push({ language, expected: labels.profileOptions, actual: optionsName });
    }
    if (language === "en") {
      const file = `${EVIDENCE_DIR}/desktop-template.png`;
      await page.screenshot({ path: file, fullPage: true });
      screenshots.push(file);
    }

    await goToSection(page, "regions", labels);
    const regionNames = await page.locator("#region-list input").evaluateAll((inputs) => inputs.map((input) => ({
      value: input.value,
      name: input.labels?.[0]?.textContent?.trim() || input.getAttribute("aria-label"),
    })));
    expect(regionNames.length).toBeGreaterThan(0);
    expect(regionNames.every((item) => item.name)).toBe(true);
    expect(regionNames.some((item) => item.value === "us")).toBe(true);

    await goToSection(page, "services", labels);
    await expect(page.locator("#service-group-list a").first()).toBeVisible();
    await expect(page.locator("#service-group-list")).not.toHaveAttribute("role", "radiogroup");
    await expect(page.locator(".service-group-detail")).toHaveCount(0);
    await page.locator("#service-group-select-chatgpt").click();
    await expect(page).toHaveURL(/\/builder\/services\/chatgpt$/u);
    await expectRouteSemantics(page, "services", labels);
    await expect(page.locator("#service-group-list")).toHaveCount(0);
    await expect(page.locator("#service-group-routes")).toHaveAttribute("aria-label", labels.groupRouteOrder);
    await expect(page.locator("#group-route-us-moveDown")).toHaveAttribute(
      "aria-label", `${labels.moveDown}: US · ${labels.regionNames.us}`,
    );

    if (language === "en") {
      await page.locator("#group-route-us-moveDown").focus();
      const before = await page.locator("#service-group-routes > [data-route]").evaluateAll((rows) => rows.map((row) => row.dataset.route));
      const originalIndex = before.indexOf("us");
      expect(originalIndex).toBeGreaterThanOrEqual(0);
      await page.keyboard.press("Enter");
      await expect.poll(() => page.locator("#service-group-routes > [data-route]").evaluateAll((rows) => rows.map((row) => row.dataset.route)))
        .not.toEqual(before);
      const after = await page.locator("#service-group-routes > [data-route]").evaluateAll((rows) => rows.map((row) => row.dataset.route));
      expect(after.indexOf("us")).toBe(originalIndex + 1);
      await expect(page.locator("#group-route-us-moveDown")).toBeFocused();
      observations.keyboardReorder = { before, after, retainedFocusId: "group-route-us-moveDown" };
      const file = `${EVIDENCE_DIR}/desktop-group.png`;
      await page.screenshot({ path: file, fullPage: true });
      screenshots.push(file);
    }

    await goToSection(page, "policies", labels);
    await expect(page.getByText(labels.failClosed, { exact: true })).toBeVisible();
    await goToSection(page, "review", labels);
    await expect(page.locator("#review-summary .review-section")).toHaveCount(4);
    await expect(page.locator("#preview")).toBeVisible();
    if (language === "en") {
      await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "current");
      const file = `${EVIDENCE_DIR}/desktop-review.png`;
      await page.screenshot({ path: file, fullPage: true });
      screenshots.push(file);
    }
    observations.routes.push({ language, tested: ["template", "regions", "services", "group", "policies", "review"] });
  }

  const english = await loadLocale(page, "en");
  await goToSection(page, "regions", english);
  await page.locator('input[name="region-mode"][value="only"]').check();
  observations.errorRecovery = { destination: "#region-list", createDisabled: true, locales: [] };
  for (const language of ["en", "zh-Hant", "zh-Hans"]) {
    const labels = language === "en" ? english : await loadLocale(page, language);
    await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "invalid");
    await expect(page.locator("#editor-state")).toHaveText(labels.editorInvalid);
    await expect(page.locator("#error-summary")).toBeVisible();
    await expect(page.locator("#error-summary")).toHaveAttribute("role", "alert");
    await expect(page.locator("#error-list a").first()).toHaveText(labels.onlyRequiresRegion);
    await expect(page.locator("#region-validation")).toHaveText(labels.onlyRequiresRegion);
    await expect(page.locator('#region-mode-only[aria-invalid="true"]')).toBeVisible();
    expect((await page.locator("#region-mode-only").getAttribute("aria-describedby")).split(/\s+/u))
      .toContain("region-validation");
    await expect(page.locator("#preview")).toBeDisabled();
    await page.locator("#nav-review").click();
    await expectRouteSemantics(page, "review", labels);
    await expect(page.locator("#save")).toBeVisible();
    await expect(page.locator("#save")).toBeDisabled();
    await page.locator("#error-list a").first().click();
    await expect(page).toHaveURL(/\/builder\/regions\?return=review$/u);
    await expect(page.locator("#region-list")).toBeFocused();
    observations.errorRecovery.locales.push(language);
  }

  await page.locator('input[name="region-mode"][value="exclude"]').check();
  await expect(page.locator("#editor-state")).not.toHaveAttribute("data-state", "invalid");
  await page.locator("#cancel-changes").click();
  await expect(page.locator("#confirm-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#confirm-dialog")).not.toBeVisible();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "dirty");
  observations.modalCancel = "Escape closed the cancellation confirmation and preserved the unsaved draft.";
  await page.locator("#cancel-changes").click();
  await page.locator("#confirm-submit").click();
  await expect(page.locator("#editor-state")).toHaveAttribute("data-state", "draft");

  await goToSection(page, "template", english);
  const lightFocus = await setKeyboardFocusAndCheck(page);
  observations.focus = { light: lightFocus };
  observations.contrast.light = await colorContrastSamples(page, {
    heading: "#page-title",
    bodyCopy: ".page-heading .lede",
    inactiveNavigation: "#nav-regions",
    activeNavigation: "#nav-template",
    primaryAction: "#section-continue",
    editorStatus: "#editor-state",
  });
  for (const [name, sample] of Object.entries(observations.contrast.light)) {
    expect(sample.ratio, `light mode ${name} contrast`).toBeGreaterThanOrEqual(sample.threshold);
  }
  const lightFocusContrast = await focusIndicatorContrast(page, "#nav-regions");
  observations.focus.light.outlineContrast = lightFocusContrast;
  expect(lightFocusContrast.ratio, "light mode focus indicator contrast").toBeGreaterThanOrEqual(3);

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.locator("#nav-template").focus();
  await page.keyboard.press("Tab");
  const darkFocus = await page.evaluate(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    return { id: element.id, visible: element.matches(":focus-visible"), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(darkFocus.id).toBe("nav-regions");
  expect(darkFocus.visible).toBe(true);
  expect(darkFocus.outlineStyle).not.toBe("none");
  observations.focus.dark = darkFocus;
  observations.contrast.dark = await colorContrastSamples(page, {
    heading: "#page-title",
    bodyCopy: ".page-heading .lede",
    inactiveNavigation: "#nav-regions",
    activeNavigation: "#nav-template",
    primaryAction: "#section-continue",
    editorStatus: "#editor-state",
  });
  for (const [name, sample] of Object.entries(observations.contrast.dark)) {
    expect(sample.ratio, `dark mode ${name} contrast`).toBeGreaterThanOrEqual(sample.threshold);
  }
  const darkFocusContrast = await focusIndicatorContrast(page, "#nav-regions");
  observations.focus.dark.outlineContrast = darkFocusContrast;
  expect(darkFocusContrast.ratio, "dark mode focus indicator contrast").toBeGreaterThanOrEqual(3);

  for (const width of [320, 390, 640]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await goToSection(page, "regions", english);
    if (width === 390) {
      const file = `${EVIDENCE_DIR}/mobile-regions-390.png`;
      await page.screenshot({ path: file, fullPage: true });
      screenshots.push(file);
    }
    observations[`regions-${width}`] = await expectNoOverflowAndNestedScroll(page);
    const targets = await page.locator("#section-navigation a[aria-current='page'], #section-continue").evaluateAll((elements) => elements.map((element) => ({
      name: element.textContent.trim(), height: element.getBoundingClientRect().height,
    })));
    expect(targets.every((target) => target.height >= 44), `touch target height at ${width}px`).toBe(true);

    await page.locator("#nav-services").click();
    await page.locator("#service-group-select-chatgpt").click();
    if (width === 390) {
      const file = `${EVIDENCE_DIR}/mobile-group-390.png`;
      await page.screenshot({ path: file, fullPage: true });
      screenshots.push(file);
    }
    observations[`group-${width}`] = await expectNoOverflowAndNestedScroll(page);
    const reorderButtons = await page.locator(".route-actions button").evaluateAll((buttons) => buttons.map((button) => ({
      label: button.getAttribute("aria-label"), height: button.getBoundingClientRect().height,
    })));
    expect(reorderButtons.length).toBeGreaterThan(0);
    expect(reorderButtons.every((button) => button.label && button.height >= 44), `keyboard reorder controls at ${width}px`).toBe(true);
  }

  let cdpOutcome = "not available";
  try {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    cdpOutcome = await page.evaluate(() => ({
      visualScale: window.visualViewport?.scale ?? null,
      layoutWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    await session.detach();
  } catch (error) {
    cdpOutcome = `CDP scale unavailable: ${error.message}`;
  }
  observations.cdpScale = cdpOutcome;
  if (typeof cdpOutcome === "object") {
    expect(cdpOutcome.scrollWidth).toBeLessThanOrEqual(cdpOutcome.layoutWidth);
  } else {
    observations.limits.push("Actual CDP page-scale control was unavailable in this browser; tested the 640 CSS-pixel layout equivalent instead.");
  }
  observations.limits.push("DOM and computed-style checks are targeted browser checks, not a complete screen-reader or WCAG 2.2 AA certification.");
  observations.limits.push("No subscription was created; success-page capability links were not generated or captured.");
  observations.browser = testInfo.project.use.channel ?? "Playwright Chromium";
  await writeFile(`${EVIDENCE_DIR}/accessibility-results.json`, `${JSON.stringify(observations, null, 2)}\n`);
  expect(observations.localizedNameIssues, "localized accessible names").toEqual([]);
});
