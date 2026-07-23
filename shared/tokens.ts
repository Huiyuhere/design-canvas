/**
 * Token helpers — thin wrappers around canvas.config.ts so engine code has a
 * stable import surface. Configure your palette/fonts/lint in canvas.config.ts,
 * not here.
 */
import config from "../canvas.config";

export const BRAND_TOKENS = config.brandTokens;
export const EXTENDED_PALETTE = config.extendedPalette;
export const BRAND_FONTS = config.fonts;
export const BANNED_VOCABULARY = config.bannedVocabulary;

/** Normalise any css color to a comparable lowercase form. */
export function normalizeColor(c: string): string {
  return c.trim().toLowerCase().replace(/\s+/g, "");
}

const PALETTE_SET = new Set(BRAND_TOKENS.map((t) => normalizeColor(t.hex)));

/** True if the given color is NOT one of the configured brand tokens. */
export function isOffPalette(color: string): boolean {
  return !PALETTE_SET.has(normalizeColor(color));
}

/** Copy lint: flags banned vocabulary from canvas.config.ts in edited text. */
export function lintCopy(text: string): { term: string; reason: string }[] {
  const lower = text.toLowerCase();
  return BANNED_VOCABULARY.filter((b) =>
    b.term === "!" ? text.includes("!") : lower.includes(b.term),
  );
}

