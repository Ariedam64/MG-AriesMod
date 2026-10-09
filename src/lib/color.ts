// Colour arithmetic on `#rrggbb` strings: parsing, mixing and WCAG contrast.

export type Rgb = [number, number, number];

export const BLACK: Rgb = [0, 0, 0];
export const WHITE: Rgb = [255, 255, 255];

/** `#rgb` or `#rrggbb` as channels, or null for anything else. */
export function parseHex(value: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

export function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** `a` moved a fraction `t` of the way to `b`. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, from 1 to 21. Unreadable colours count as 1. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const x = typeof a === "string" ? parseHex(a) : a;
  const y = typeof b === "string" ? parseHex(b) : b;
  if (!x || !y) return 1;
  const [l1, l2] = [luminance(x), luminance(y)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Whether a colour reads as a dark background. */
export function isDark(rgb: Rgb): boolean {
  return luminance(rgb) < 0.2;
}
