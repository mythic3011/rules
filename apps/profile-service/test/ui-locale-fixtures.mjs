import { readFile } from "node:fs/promises";

import { setLanguage } from "../public/i18n.mjs";

export async function localeJsonFetcher(url) {
  const body = await readFile(url, "utf8");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function loadEnglishLocale() {
  return setLanguage("en", undefined, { fetcher: localeJsonFetcher, persist: false });
}
