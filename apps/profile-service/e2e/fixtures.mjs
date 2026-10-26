import { createHash } from "node:crypto";
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    // The Playwright config permits loopback only. Simulate separate clients in
    // local Wrangler; Cloudflare supplies this trusted header in production.
    const identity = createHash("sha256")
      .update(`${process.pid}:${testInfo.testId}`)
      .digest("hex");
    await page.setExtraHTTPHeaders({
      "cf-connecting-ip": `2001:db8::${identity.slice(0, 4)}:${identity.slice(4, 8)}`,
    });
    await use(page);
  },
});

export { expect };
