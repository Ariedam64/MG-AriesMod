// Design tokens for every mod surface: menus, the dock, windows, popups.
//
// The look is "Garden Paper": cream paper, beige edges, sepia and bark
// brown, so the menus sit with Magic Garden's own art. Every token becomes a
// CSS custom property (`--qmm-<name>`, `--qmm-radius-md`, `--qmm-fs-sm`...)
// that the kit's stylesheet and feature CSS read. `themeVariables()` derives
// them from the objects below, so the two can never drift. Colours and layers
// are also exported for inline styles set from TS.

/** The palette. Text pairs are held to WCAG contrast by `contrastPairs` below. */
const palette = {
  paper: "#f0e2c4",
  paperDeep: "#e8d6b2",
  sand: "#e1cca3",
  sandEdge: "#cfb486",
  sandShade: "#ad9265",
  card: "#f8efdc",
  sepia: "#8f6236",
  sepiaStrong: "#74492a",
  sepiaShade: "#52331c",
  sepiaSoft: "#e2c597",
  sepiaInk: "#6b4423",
  bark: "#3b2f22",
  barkSoft: "#5f4a2f",
  barkDim: "#64523b",
  clay: "#c24a2a",
  amber: "#d18a1a",
  onSepia: "#ffffff",
} as const;

export const color = {
  ...palette,

  accent: palette.sepiaStrong,
  accentSoft: palette.sepiaSoft,
  accentHover: "#d6b682",
  accentBorder: "#b28657",
  accentBorderHover: palette.sepia,

  text: palette.bark,
  textSoft: palette.barkSoft,
  textDim: palette.barkDim,

  border: palette.sandEdge,
  borderHover: "#c2a574",
  borderStrong: palette.sandEdge,

  cardBg: palette.card,
  hoverBg: palette.sand,
  mutedBg: palette.paperDeep,
  fieldBg: palette.card,
  fieldBorder: palette.sandEdge,
  track: palette.sandEdge,
  sunken: palette.paperDeep,
  surface: palette.paper,
  panelBg: palette.paper,
  scrollbar: "#c2a574",
  scrim: "rgba(59,47,34,0.45)",
  /** A small drop shadow under a knob or a chip. */
  shade: "rgba(59,47,34,0.25)",

  /** Status only (connected, active, at its best), never the accent. */
  ok: "#4f9a58",
  okInk: "#2a6233",
  okSoft: "#d7e6c6",

  danger: palette.clay,
  dangerInk: "#8f2f16",
  dangerSoft: "#eccbbd",
  dangerHover: "#e4b8a6",
  dangerBorder: "#d38f7a",
  dangerBorderHover: palette.clay,

  warn: palette.amber,
  warnInk: "#7a4f0a",
  warnSoft: "#ecd6a8",
  warnBorder: "#d4a85e",
  /** The pulse around a hotkey button that is recording. */
  warnGlow: "rgba(209,138,26,0.45)",

  /** Gold and Rainbow as fills, or as text on a dark chip. */
  gold: "#FFC734",
  rainbow: "#c084fc",
  /** Gold and Rainbow as text on paper or a card. */
  goldInk: "#7a5500",
  rainbowInk: "#7a35b0",
} as const;

const gradient = {
  panel: palette.paper,
  tabBar: palette.paper,
  head: palette.sepia,
  /** Text fills for the Gold and Rainbow mutation names. */
  gold: "linear-gradient(120deg, #e0b43c, #b07d1a, #e8c766)",
  rainbow: "linear-gradient(90deg, #e05555, #d9a520, #2aa7d6, #7f55e0, #e05555)",
} as const;

const shadow = {
  raise: `0 8px 0 ${palette.sandShade}, 0 20px 40px rgba(59,47,34,0.28)`,
  raiseSmall: `0 4px 0 ${palette.sandShade}`,
  panel: `0 8px 0 ${palette.sandShade}, 0 20px 40px rgba(59,47,34,0.28)`,
  window: `0 8px 0 ${palette.sandShade}, 0 20px 40px rgba(59,47,34,0.28)`,
  modal: `0 10px 0 ${palette.sandShade}, 0 28px 60px rgba(59,47,34,0.35)`,
} as const;

/** Corner radii in px. */
const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Spacing steps in px. */
const space = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16 } as const;

/** Font sizes in px. */
const fontSize = { xs: 11, sm: 12, md: 13, lg: 14, xl: 15 } as const;

/** Nunito, loaded with the kit stylesheet; the system font stands in until then, or for good. */
const fontFamily = "'Nunito', ui-rounded, system-ui, sans-serif";
const fontMono = "ui-monospace, SFMono-Regular, Consolas, monospace";

/** Stacking order of the mod's fixed layers. Windows sit above the HUD. */
export const layer = { hud: 1_000_010, window: 2_000_001 } as const;

/**
 * Every text colour the kit puts on a background, and the WCAG ratio it must
 * reach: 4.5 for body text, 3 for text of 18 px and up or 14 px bold.
 * `check:contrast` enforces them.
 */
export const contrastPairs: Array<{ fg: string; bg: string; min: number; use: string }> = [
  ...(["paper", "paperDeep", "sand", "card"] as const).flatMap((bg) => [
    { fg: palette.bark, bg: palette[bg], min: 4.5, use: `text on ${bg}` },
    { fg: palette.barkSoft, bg: palette[bg], min: 4.5, use: `soft text on ${bg}` },
    { fg: palette.barkDim, bg: palette[bg], min: 4.5, use: `caption on ${bg}` },
  ]),
  { fg: palette.sepiaInk, bg: palette.sepiaSoft, min: 4.5, use: "selected label" },
  { fg: palette.sepiaInk, bg: palette.paper, min: 4.5, use: "sepia text on paper" },
  { fg: palette.onSepia, bg: palette.sepiaStrong, min: 4.5, use: "primary button text" },
  { fg: palette.onSepia, bg: palette.sepia, min: 3, use: "window title (18 px bold)" },
  { fg: palette.onSepia, bg: palette.clay, min: 4.5, use: "danger button and badge text" },
  { fg: palette.paper, bg: palette.bark, min: 4.5, use: "active tab and tooltip" },
  { fg: color.okInk, bg: color.okSoft, min: 4.5, use: "ok pill" },
  ...(["paper", "card"] as const).flatMap((bg) => [
    { fg: color.goldInk, bg: palette[bg], min: 4.5, use: `gold numbers on ${bg}` },
    { fg: color.rainbowInk, bg: palette[bg], min: 4.5, use: `rainbow numbers on ${bg}` },
  ]),
  { fg: color.warnInk, bg: color.warnSoft, min: 4.5, use: "warning pill" },
  { fg: color.dangerInk, bg: color.dangerSoft, min: 4.5, use: "error pill" },
];

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function group(prefix: string, values: Record<string, string | number>, unit = ""): string[] {
  return Object.entries(values).map(([key, value]) => `--qmm-${prefix}${kebab(key)}:${value}${unit};`);
}

/** The tokens as one `:root` block of custom properties. */
export function themeVariables(): string {
  return [
    ":root{",
    ...group("", color),
    ...group("gradient-", gradient),
    ...group("shadow-", shadow),
    ...group("radius-", radius, "px"),
    ...group("space-", space, "px"),
    ...group("fs-", fontSize, "px"),
    `--qmm-font:${fontFamily};`,
    `--qmm-font-mono:${fontMono};`,
    // Compatibility names read by feature code that predates the tokens.
    // Remove each once nothing outside the kit references it.
    "--qmm-border-2:var(--qmm-border);",
    "--qws-text:var(--qmm-text);",
    "--qws-text-dim:var(--qmm-text-soft);",
    "--qws-border:var(--qmm-border-strong);",
    "--qws-border-2:var(--qmm-border);",
    "--qws-panel:var(--qmm-panel-bg);",
    "--qws-accent:var(--qmm-accent);",
    "--qws-shadow:var(--qmm-shadow-window);",
    "--qws-blur:8px;",
    "}",
  ].join("\n");
}
