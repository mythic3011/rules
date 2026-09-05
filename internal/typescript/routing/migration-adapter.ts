/**
 * Deliberately read-only bridge for Phase 1.  It maps legacy generator identity
 * strings to future canonical IDs but never imports or changes the Python
 * generator.  The compiler integration belongs to a later migration phase.
 */
export const legacyAiServiceIds = {
  chatgpt: { canonicalId: "chatgpt", legacyGroup: "🤖 ChatGPT" },
  copilot: { canonicalId: "copilot", legacyGroup: "🧑‍💻 Copilot" },
  claude: { canonicalId: "claude", legacyGroup: "🤖 Claude" },
  gemini: { canonicalId: "gemini", legacyGroup: "🤖 Gemini" },
  notebooklm: { canonicalId: "notebooklm", legacyGroup: "🤖 NotebookLM" },
  jules: { canonicalId: "jules", legacyGroup: "🤖 Jules" },
  perplexity: { canonicalId: "perplexity", legacyGroup: "🤖 Perplexity" },
  grok: { canonicalId: "grok", legacyGroup: "🤖 Grok" },
  poe: { canonicalId: "poe", legacyGroup: "🤖 Poe" },
  openrouter: { canonicalId: "openrouter", legacyGroup: "🤖 OpenRouter" },
  cursor: { canonicalId: "cursor", legacyGroup: "🤖 Cursor" },
  huggingface: { canonicalId: "huggingface", legacyGroup: "🤗 Hugging Face" },
  mirasim: { canonicalId: "mirasim", legacyGroup: "🤖 Mirasim" },
  antigravity: { canonicalId: "antigravity", legacyGroup: "🤖 Antigravity" },
  "google-labs": { canonicalId: "google-labs", legacyGroup: "🤖 Google Labs" },
  stitch: { canonicalId: "stitch", legacyGroup: "🤖 Stitch" },
  "android-studio-ai": { canonicalId: "android-studio-ai", legacyGroup: "🤖 Android Studio AI" },
  "gemini-cloud": { canonicalId: "gemini-cloud", legacyGroup: "🤖 Gemini Cloud" },
  "vertex-ai": { canonicalId: "vertex-ai", legacyGroup: "🤖 Vertex AI" },
  opencode: { canonicalId: "opencode", legacyGroup: "🤖 OpenCode" },
  "ai-other": { canonicalId: "ai-other", legacyGroup: "🤖 AI Other" },
  "ai-cn-other": { canonicalId: "ai-cn-other", legacyGroup: "🤖 AI CN Other" },
} as const;

export type LegacyAiServiceId = keyof typeof legacyAiServiceIds;

export function canonicalServiceIdFromLegacy(value: string): string | undefined {
  const entry = legacyAiServiceIds[value as LegacyAiServiceId];
  return entry?.canonicalId;
}

export function canonicalServiceIdFromLegacyGroup(group: string): string | undefined {
  for (const entry of Object.values(legacyAiServiceIds)) {
    if (entry.legacyGroup === group) {
      return entry.canonicalId;
    }
  }
  return undefined;
}

export function allLegacyAiServiceIds(): readonly LegacyAiServiceId[] {
  return Object.keys(legacyAiServiceIds) as LegacyAiServiceId[];
}
