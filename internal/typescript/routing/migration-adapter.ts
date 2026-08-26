/**
 * Deliberately read-only bridge for Phase 1.  It maps legacy generator identity
 * strings to future canonical IDs but never imports or changes the Python
 * generator.  The compiler integration belongs to a later migration phase.
 */
export const legacyAiServiceIds = {
  chatgpt: { canonicalId: "chatgpt", legacyGroup: "🤖 ChatGPT" },
  copilot: { canonicalId: "copilot", legacyGroup: "🤖 Copilot" },
  claude: { canonicalId: "claude", legacyGroup: "🤖 Claude" },
  gemini: { canonicalId: "gemini", legacyGroup: "🤖 Gemini" },
  notebooklm: { canonicalId: "notebooklm", legacyGroup: "🤖 NotebookLM" },
  perplexity: { canonicalId: "perplexity", legacyGroup: "🤖 Perplexity" },
  grok: { canonicalId: "grok", legacyGroup: "🤖 Grok" },
  poe: { canonicalId: "poe", legacyGroup: "🤖 Poe" },
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
