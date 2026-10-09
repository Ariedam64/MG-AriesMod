// The player's look for the mod's menus (Settings, Appearance): a theme, an
// optional accent colour of their own, and the menu size. It is applied as a
// stylesheet that overrides the kit's colour variables, so every menu, open or
// not, follows at once.

import { parseHex, toHex } from "../../lib/color";
import { clamp } from "../../lib/math";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { deriveAccent } from "../../ui/kit/accent";
import { ensureKitStyles } from "../../ui/kit/styles";
import { DEFAULT_THEME, colorVariables, themes, type ThemeId } from "../../ui/kit/theme";

export type Appearance = {
  theme: ThemeId;
  /** `#rrggbb`, or null for the theme's own accent. */
  accent: string | null;
  /** 0.8 to 1.3, in steps of 0.05. */
  scale: number;
};

const PATH = "ui.appearance";
const STYLE_ID = "qmm-appearance";
export const SCALE_MIN = 0.8;
export const SCALE_MAX = 1.3;

export const DEFAULT_APPEARANCE: Appearance = { theme: DEFAULT_THEME, accent: null, scale: 1 };

function cleanScale(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.round(clamp(n, SCALE_MIN, SCALE_MAX) * 20) / 20;
}

function cleanAccent(value: unknown): string | null {
  const rgb = typeof value === "string" ? parseHex(value) : null;
  return rgb ? toHex(rgb) : null;
}

/** The saved look, with anything unknown or broken replaced by the default. */
export function readAppearance(): Appearance {
  const raw = readAriesPath<Partial<Record<keyof Appearance, unknown>>>(PATH) ?? {};
  const theme = typeof raw.theme === "string" && raw.theme in themes ? (raw.theme as ThemeId) : DEFAULT_THEME;
  return { theme, accent: cleanAccent(raw.accent), scale: raw.scale === undefined ? 1 : cleanScale(raw.scale) };
}

/** The overriding stylesheet for a look. Doubling `:root` outranks the kit's own block wherever it lands. */
function appearanceCss({ theme, accent, scale }: Appearance): string {
  const swatches = themes[theme].swatches;
  const overrides = { ...swatches, ...(accent ? deriveAccent(accent, swatches) : {}) };
  return `:root:root{${colorVariables(overrides)}--qmm-scale:${scale};}`;
}

export function applyAppearance(look: Appearance = readAppearance()): void {
  if (typeof document === "undefined") return;
  // Inline colours set from TS are variable references, so the kit's own
  // variables must exist before any widget draws, menu or not.
  ensureKitStyles();
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent = appearanceCss(look);
}

export function saveAppearance(look: Appearance): void {
  const clean = { theme: look.theme in themes ? look.theme : DEFAULT_THEME, accent: cleanAccent(look.accent), scale: cleanScale(look.scale) };
  writeAriesPath(PATH, clean);
  applyAppearance(clean);
}
