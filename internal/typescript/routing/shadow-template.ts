import { readFile } from "node:fs/promises";

const PLACEHOLDER = /\$\{([^}]*)\}/g;
const REQUIRED_SLOTS = [
  "header",
  "static-top-level",
  "proxy-providers",
  "dns",
  "proxy-groups",
  "rules",
  "rule-providers",
] as const;

export type ShadowTemplateSlot = (typeof REQUIRED_SLOTS)[number];
export type ShadowTemplateContext = Readonly<Record<ShadowTemplateSlot, string>>;

export class ShadowTemplateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ShadowTemplateError";
  }
}

function slotsIn(source: string): string[] {
  return [...source.matchAll(PLACEHOLDER)].map((match) => match[1] ?? "");
}

export function renderShadowTemplate(source: string, context: ShadowTemplateContext): string {
  if (source.includes("${") && !/\$\{[^}]*\}/.test(source)) throw new ShadowTemplateError("unresolved template placeholder residue");
  const slots = slotsIn(source);
  for (const slot of slots) if (!REQUIRED_SLOTS.includes(slot as ShadowTemplateSlot)) throw new ShadowTemplateError(`unknown template placeholder: ${slot}`);
  for (const required of REQUIRED_SLOTS) {
    const occurrences = slots.filter((slot) => slot === required).length;
    if (occurrences === 0) throw new ShadowTemplateError(`missing template placeholder: ${required}`);
    if (occurrences > 1) throw new ShadowTemplateError(`duplicate template placeholder: ${required}`);
  }
  const rendered = source.replace(PLACEHOLDER, (_match, slot: string) => context[slot as ShadowTemplateSlot]);
  if (rendered.includes("${")) throw new ShadowTemplateError("unresolved template placeholder residue");
  return rendered;
}

export async function loadAndRenderShadowTemplate(path: string, context: ShadowTemplateContext): Promise<string> {
  return renderShadowTemplate(await readFile(path, "utf8"), context);
}
