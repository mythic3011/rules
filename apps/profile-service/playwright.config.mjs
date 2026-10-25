import { defineConfig } from "@playwright/test";

const DEFAULT_BASE_URL = "http://127.0.0.1:8787";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const SUPPORTED_CHANNELS = new Set([
  "chrome",
  "chrome-beta",
  "chrome-dev",
  "chrome-canary",
  "msedge",
  "msedge-beta",
  "msedge-dev",
  "msedge-canary",
  "chromium",
]);

function getLoopbackBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PROFILE_SERVICE_E2E_BASE_URL must be a valid loopback URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  ) {
    throw new Error("PROFILE_SERVICE_E2E_BASE_URL must target a loopback HTTP(S) origin without credentials or a path");
  }
  return url.origin;
}

const baseURL = getLoopbackBaseUrl(
  process.env.PROFILE_SERVICE_E2E_BASE_URL || DEFAULT_BASE_URL,
);
const configuredChannel = process.env.PLAYWRIGHT_CHANNEL?.trim();
if (configuredChannel && !SUPPORTED_CHANNELS.has(configuredChannel)) {
  throw new Error("PLAYWRIGHT_CHANNEL is not a supported installed browser channel");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.mjs",
  outputDir: ".wrangler/playwright-results",
  preserveOutput: "never",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    browserName: "chromium",
    channel: configuredChannel || undefined,
    headless: true,
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: "off",
    video: "off",
    trace: "off",
  },
});
