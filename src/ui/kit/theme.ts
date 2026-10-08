// Design tokens for every mod surface: menus, HUD, windows, popups.
//
// Every token becomes a CSS custom property (`--qmm-<name>`, `--qmm-radius-md`,
// `--qmm-fs-sm`...) that the kit's stylesheet and feature CSS read.
// `themeVariables()` derives them from the objects below, so the two can never
// drift. Colours and layers are also exported for the rare inline style that
// needs a value; export another group the day TS code needs it.

export const color = {
  accent: "#5eead4",
  accentSoft: "rgba(94,234,212,0.12)",
  accentHover: "rgba(94,234,212,0.22)",
  accentBorder: "rgba(94,234,212,0.3)",
  accentBorderHover: "rgba(94,234,212,0.55)",

  text: "#e7eef7",
  textSoft: "rgba(226,232,240,0.75)",
  textDim: "rgba(226,232,240,0.45)",

  border: "rgba(255,255,255,0.08)",
  borderHover: "rgba(255,255,255,0.16)",
  borderStrong: "rgba(255,255,255,0.14)",

  cardBg: "rgba(255,255,255,0.03)",
  hoverBg: "rgba(255,255,255,0.06)",
  mutedBg: "rgba(0,0,0,0.18)",
  fieldBg: "rgba(0,0,0,0.3)",
  fieldBorder: "rgba(255,255,255,0.12)",
  track: "rgba(255,255,255,0.1)",
  sunken: "#080c12",
  surface: "#101620",
  panelBg: "rgba(17,24,35,0.8)",
  scrollbar: "rgba(94,234,212,0.2)",
  scrim: "rgba(0,0,0,0.55)",

  danger: "#ef4444",
  dangerSoft: "rgba(239,68,68,0.12)",
  dangerHover: "rgba(239,68,68,0.2)",
  dangerBorder: "rgba(239,68,68,0.3)",
  dangerBorderHover: "rgba(239,68,68,0.55)",

  warn: "#fbbf24",
  warnSoft: "rgba(251,191,36,0.12)",
  warnBorder: "rgba(251,191,36,0.55)",

  gold: "#FFC734",
  rainbow: "#c084fc",
} as const;

const gradient = {
  panel: "linear-gradient(160deg, rgba(15,20,30,0.95) 0%, rgba(10,14,20,0.95) 60%, rgba(8,12,18,0.96) 100%)",
  tabBar: "linear-gradient(120deg, rgba(22,28,40,0.9), rgba(12,17,26,0.92))",
  head: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
} as const;

const shadow = {
  panel: "0 18px 44px rgba(0,0,0,0.45)",
  window: "0 10px 36px rgba(0,0,0,0.45)",
  modal: "0 24px 64px rgba(0,0,0,0.55)",
} as const;

/** Corner radii in px. */
const radius = { sm: 6, md: 9, lg: 12, xl: 16, pill: 999 } as const;

/** Spacing steps in px. */
const space = { xs: 4, sm: 6, md: 8, lg: 10, xl: 12 } as const;

/** Font sizes in px. */
const fontSize = { xs: 10, sm: 11, md: 12, lg: 13, xl: 14 } as const;

const fontMono = "ui-monospace, SFMono-Regular, Consolas, monospace";

/** Stacking order of the mod's fixed layers. Windows sit above the HUD. */
export const layer = { hud: 1_000_010, window: 2_000_001 } as const;

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
