// Design tokens for every mod surface: menus, the dock, windows, popups.
//
// The look is "Garden Paper": cream paper, beige edges, sepia and bark
// brown, so the menus sit with Magic Garden's own art. Every token becomes a
// CSS custom property (`--qmm-<name>`, `--qmm-radius-md`, `--qmm-fs-sm`...)
// that the kit's stylesheet and feature CSS read. `themeVariables()` derives
// them from the objects below, so the two can never drift.
//
// A player can pick another theme or accent in Settings, Appearance, which
// overrides the colour variables at runtime. So `color.*`, for inline styles
// set from TS, holds `var(--qmm-...)` references, never the hex values.

/** Every colour a theme sets. Each becomes `--qmm-<kebab-name>`. */
export type Swatches = {
  paper: string;
  paperDeep: string;
  sand: string;
  sandEdge: string;
  sandShade: string;
  card: string;
  /** The accent: title bands and borders, its strong shade under white text, its ink as text. */
  sepia: string;
  sepiaStrong: string;
  sepiaShade: string;
  sepiaSoft: string;
  sepiaInk: string;
  accentHover: string;
  accentBorder: string;
  /** Text, from strongest to most muted. */
  bark: string;
  barkSoft: string;
  barkDim: string;
  onSepia: string;
  borderHover: string;
  scrollbar: string;
  scrim: string;
  /** A small drop shadow under a knob or a chip. */
  shade: string;
  /** The soft shadow under windows and the launcher. */
  shadowInk: string;
  /** Status only (connected, active, at its best), never the accent. */
  ok: string;
  okInk: string;
  okSoft: string;
  clay: string;
  dangerInk: string;
  dangerSoft: string;
  dangerHover: string;
  dangerBorder: string;
  amber: string;
  warnInk: string;
  warnSoft: string;
  warnBorder: string;
  /** The pulse around a hotkey button that is recording. */
  warnGlow: string;
  /** Gold and Rainbow as fills, or as text on a dark chip. */
  gold: string;
  rainbow: string;
  /** Gold and Rainbow as text on paper or a card. */
  goldInk: string;
  rainbowInk: string;
};

/** Status colours shared by the light themes. */
const lightStatus = {
  ok: "#4f9a58",
  okInk: "#2a6233",
  okSoft: "#d7e6c6",
  clay: "#c24a2a",
  dangerInk: "#8f2f16",
  dangerSoft: "#eccbbd",
  dangerHover: "#e4b8a6",
  dangerBorder: "#d38f7a",
  amber: "#d18a1a",
  warnInk: "#7a4f0a",
  warnSoft: "#ecd6a8",
  warnBorder: "#d4a85e",
  warnGlow: "rgba(209,138,26,0.45)",
  gold: "#FFC734",
  rainbow: "#c084fc",
  goldInk: "#7a5500",
  rainbowInk: "#7a35b0",
  onSepia: "#ffffff",
} as const;

/** Cream paper and bark text, the base of the Sepia and Garden themes. */
const cream = {
  paper: "#f0e2c4",
  paperDeep: "#e8d6b2",
  sand: "#e1cca3",
  sandEdge: "#cfb486",
  sandShade: "#ad9265",
  card: "#f8efdc",
  bark: "#3b2f22",
  barkSoft: "#5f4a2f",
  barkDim: "#64523b",
  borderHover: "#c2a574",
  scrollbar: "#c2a574",
  scrim: "rgba(59,47,34,0.45)",
  shade: "rgba(59,47,34,0.25)",
  shadowInk: "rgba(59,47,34,0.28)",
} as const;

export type ThemeId = "sepia" | "garden" | "lavender" | "night";

export const themes: Record<ThemeId, { label: string; swatches: Swatches }> = {
  sepia: {
    label: "Sepia",
    swatches: {
      ...cream,
      ...lightStatus,
      sepia: "#8f6236",
      sepiaStrong: "#74492a",
      sepiaShade: "#52331c",
      sepiaSoft: "#e2c597",
      sepiaInk: "#6b4423",
      accentHover: "#d6b682",
      accentBorder: "#b28657",
    },
  },
  garden: {
    label: "Garden",
    swatches: {
      ...cream,
      ...lightStatus,
      sepia: "#4f8a57",
      sepiaStrong: "#3b6f43",
      sepiaShade: "#2a5030",
      sepiaSoft: "#cfdfb8",
      sepiaInk: "#2f5f37",
      accentHover: "#bed3a3",
      accentBorder: "#83ab7f",
    },
  },
  lavender: {
    label: "Lavender",
    swatches: {
      ...lightStatus,
      paper: "#ece5f2",
      paperDeep: "#e2d8ec",
      sand: "#d9cbe6",
      sandEdge: "#c3b0d6",
      sandShade: "#9c86b5",
      card: "#f6f1fa",
      bark: "#2f2638",
      barkSoft: "#4f4260",
      barkDim: "#574a68",
      borderHover: "#b9a2d1",
      scrollbar: "#b9a2d1",
      scrim: "rgba(47,38,56,0.45)",
      shade: "rgba(47,38,56,0.25)",
      shadowInk: "rgba(47,38,56,0.28)",
      sepia: "#7e5aa8",
      sepiaStrong: "#64428c",
      sepiaShade: "#452c63",
      sepiaSoft: "#dccbee",
      sepiaInk: "#583882",
      accentHover: "#cdb6e6",
      accentBorder: "#a487c8",
    },
  },
  night: {
    label: "Night",
    swatches: {
      paper: "#2b2520",
      paperDeep: "#241f1b",
      sand: "#3a322b",
      sandEdge: "#4d4238",
      sandShade: "#141110",
      card: "#332c26",
      bark: "#f2e7d5",
      barkSoft: "#d8c8af",
      barkDim: "#bba98f",
      borderHover: "#5e5146",
      scrollbar: "#5e5146",
      scrim: "rgba(0,0,0,0.55)",
      shade: "rgba(0,0,0,0.4)",
      shadowInk: "rgba(0,0,0,0.45)",
      sepia: "#a8743f",
      sepiaStrong: "#8a5a2c",
      sepiaShade: "#5a3a1c",
      sepiaSoft: "#4a3826",
      sepiaInk: "#e9bb84",
      accentHover: "#5a4430",
      accentBorder: "#8a6a48",
      onSepia: "#ffffff",
      ok: "#6fbf73",
      okInk: "#a6dfa9",
      okSoft: "#2c4630",
      clay: "#c24a2a",
      dangerInk: "#f4a48e",
      dangerSoft: "#4f2a22",
      dangerHover: "#5e3127",
      dangerBorder: "#8a4634",
      amber: "#d18a1a",
      warnInk: "#f2c879",
      warnSoft: "#4a3a1c",
      warnBorder: "#8a6a2e",
      warnGlow: "rgba(209,138,26,0.45)",
      gold: "#FFC734",
      rainbow: "#c084fc",
      goldInk: "#f2c94c",
      rainbowInk: "#d4a8ff",
    },
  },
};

export const DEFAULT_THEME: ThemeId = "night";

/** Names that point at a swatch, so a theme or an accent moves them along. */
const aliases = {
  accent: "sepiaStrong",
  accentSoft: "sepiaSoft",
  accentBorderHover: "sepia",
  text: "bark",
  textSoft: "barkSoft",
  textDim: "barkDim",
  border: "sandEdge",
  borderStrong: "sandEdge",
  cardBg: "card",
  hoverBg: "sand",
  mutedBg: "paperDeep",
  fieldBg: "card",
  fieldBorder: "sandEdge",
  track: "sandEdge",
  sunken: "paperDeep",
  surface: "paper",
  panelBg: "paper",
  danger: "clay",
  dangerBorderHover: "clay",
  warn: "amber",
} as const satisfies Record<string, keyof Swatches>;

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const ref = (key: string) => `var(--qmm-${kebab(key)})`;

type ColorName = keyof Swatches | keyof typeof aliases;

/** Every colour as a CSS variable reference, for inline styles set from TS. */
export const color = Object.fromEntries(
  [...Object.keys(themes[DEFAULT_THEME].swatches), ...Object.keys(aliases)].map((key) => [key, ref(key)]),
) as Record<ColorName, string>;

const gradient = {
  panel: ref("paper"),
  tabBar: ref("paper"),
  head: ref("sepia"),
  /** Text fills for the Gold and Rainbow mutation names. */
  gold: "linear-gradient(120deg, #e0b43c, #b07d1a, #e8c766)",
  rainbow: "linear-gradient(90deg, #e05555, #d9a520, #2aa7d6, #7f55e0, #e05555)",
} as const;

const shadow = {
  raise: `0 8px 0 ${ref("sandShade")}, 0 20px 40px ${ref("shadowInk")}`,
  raiseSmall: `0 4px 0 ${ref("sandShade")}`,
  panel: `0 8px 0 ${ref("sandShade")}, 0 20px 40px ${ref("shadowInk")}`,
  window: `0 8px 0 ${ref("sandShade")}, 0 20px 40px ${ref("shadowInk")}`,
  modal: `0 10px 0 ${ref("sandShade")}, 0 28px 60px ${ref("shadowInk")}`,
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
 * `check:contrast` enforces them for every theme, `check:accent` for any accent.
 */
export function contrastPairs(c: Swatches): Array<{ fg: string; bg: string; min: number; use: string }> {
  return [
    ...(["paper", "paperDeep", "sand", "card"] as const).flatMap((bg) => [
      { fg: c.bark, bg: c[bg], min: 4.5, use: `text on ${bg}` },
      { fg: c.barkSoft, bg: c[bg], min: 4.5, use: `soft text on ${bg}` },
      { fg: c.barkDim, bg: c[bg], min: 4.5, use: `caption on ${bg}` },
    ]),
    ...(["paper", "card", "sepiaSoft"] as const).map((bg) => ({ fg: c.sepiaInk, bg: c[bg], min: 4.5, use: `accent text on ${bg}` })),
    { fg: c.onSepia, bg: c.sepiaStrong, min: 4.5, use: "primary button text" },
    { fg: c.onSepia, bg: c.sepia, min: 3, use: "window title (18 px bold)" },
    { fg: c.onSepia, bg: c.clay, min: 4.5, use: "danger button and badge text" },
    { fg: c.paper, bg: c.bark, min: 4.5, use: "active tab and tooltip" },
    { fg: c.okInk, bg: c.okSoft, min: 4.5, use: "ok pill" },
    ...(["paper", "card"] as const).flatMap((bg) => [
      { fg: c.goldInk, bg: c[bg], min: 4.5, use: `gold numbers on ${bg}` },
      { fg: c.rainbowInk, bg: c[bg], min: 4.5, use: `rainbow numbers on ${bg}` },
    ]),
    { fg: c.warnInk, bg: c.warnSoft, min: 4.5, use: "warning pill" },
    { fg: c.dangerInk, bg: c.dangerSoft, min: 4.5, use: "error pill" },
  ];
}

function group(prefix: string, values: Record<string, string | number>, unit = ""): string[] {
  return Object.entries(values).map(([key, value]) => `--qmm-${prefix}${kebab(key)}:${value}${unit};`);
}

/** A theme's colours (or some of them) as custom property declarations. */
export function colorVariables(swatches: Partial<Swatches>): string {
  return group("", swatches as Record<string, string>).join("");
}

/** The tokens as one `:root` block of custom properties, in the default theme. */
export function themeVariables(): string {
  return [
    ":root{",
    ...group("", themes[DEFAULT_THEME].swatches),
    ...Object.entries(aliases).map(([name, target]) => `--qmm-${kebab(name)}:${ref(target)};`),
    ...group("gradient-", gradient),
    ...group("shadow-", shadow),
    ...group("radius-", radius, "px"),
    ...group("space-", space, "px"),
    ...group("fs-", fontSize, "px"),
    `--qmm-font:${fontFamily};`,
    `--qmm-font-mono:${fontMono};`,
    // The menu size from Settings, Appearance.
    "--qmm-scale:1;",
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
