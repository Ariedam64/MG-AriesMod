// A player's own accent colour, turned into the theme's accent shades.
//
// One picked colour has to serve as a title band under white text, a button
// under white text, text on paper and on its own soft tint. Each shade starts
// from the pick and is pushed darker (or lighter on a dark theme) until it
// reaches its contrast, so even a pale yellow pick stays readable.

import { BLACK, WHITE, contrastRatio, isDark, mix, parseHex, toHex, type Rgb } from "../../lib/color";
import type { Swatches } from "./theme";

type AccentSwatches = Pick<
  Swatches,
  "sepia" | "sepiaStrong" | "sepiaShade" | "sepiaSoft" | "sepiaInk" | "accentHover" | "accentBorder"
>;

/** Margin over the WCAG ratios, so rounding to hex never lands a shade just under. */
const MARGIN = 0.1;

/** The first step from `from` towards `to` that passes `ok`, or `to` itself. */
function pushUntil(from: Rgb, to: Rgb, ok: (c: Rgb) => boolean): Rgb {
  for (let t = 0; t <= 1; t += 0.02) {
    const c = mix(from, to, t);
    if (ok(c)) return c;
  }
  return to;
}

/** The accent shades for `hex` on a theme, or nothing when `hex` is not a colour. */
export function deriveAccent(hex: string, base: Swatches): Partial<AccentSwatches> {
  const pick = parseHex(hex);
  const paper = parseHex(base.paper);
  if (!pick || !paper) return {};
  const on = parseHex(base.onSepia) ?? WHITE;
  const surfaces = [base.paper, base.paperDeep, base.sand, base.card];

  const head = pushUntil(pick, BLACK, (c) => contrastRatio(on, c) >= 3 + MARGIN);
  const strong = pushUntil(pick, BLACK, (c) => contrastRatio(on, c) >= 4.5 + MARGIN);
  const soft = mix(pick, paper, 0.72);
  const inkTarget = isDark(paper) ? WHITE : BLACK;
  const ink = pushUntil(pick, inkTarget, (c) =>
    [...surfaces, toHex(soft)].every((bg) => contrastRatio(c, bg) >= 4.5 + MARGIN));

  return {
    sepia: toHex(head),
    sepiaStrong: toHex(strong),
    sepiaShade: toHex(mix(strong, BLACK, 0.3)),
    sepiaSoft: toHex(soft),
    sepiaInk: toHex(ink),
    accentHover: toHex(mix(pick, paper, 0.55)),
    accentBorder: toHex(mix(pick, paper, 0.3)),
  };
}
