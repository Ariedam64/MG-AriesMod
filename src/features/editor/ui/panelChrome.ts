// The look shared by the editor's on-screen panels: the two floating side
// panels, the boxes inside them, and the small round buttons.

import { button, type KitButton } from "../../../ui/kit/button";
import { ensureKitStyles } from "../../../ui/kit/styles";
import { color } from "../../../ui/kit/theme";

/** Just under the HUD (`layer.hud`), so the mod's windows stay on top of the editor. */
export const EDITOR_LAYER = "1000001";

const appendToPage = (el: HTMLElement) => (document.body || document.documentElement).appendChild(el);

export type FloatingPanelOptions = {
  id: string;
  side: "left" | "right";
  title: string;
  /** Extra styles on the root, for the panel's own size. */
  style?: Partial<CSSStyleDeclaration>;
};

/** A panel pinned to one side of the screen, with a title over its content. Appended to the page. */
export function floatingPanel(opts: FloatingPanelOptions): { root: HTMLDivElement; header: HTMLDivElement } {
  ensureKitStyles();
  const root = document.createElement("div");
  root.id = opts.id;
  Object.assign(root.style, {
    position: "fixed",
    top: "12%",
    [opts.side]: "12px",
    zIndex: EDITOR_LAYER,
    width: "300px",
    maxHeight: "86vh",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: "10px",
    padding: "10px",
    borderRadius: "12px",
    border: `1px solid ${color.accentBorder}`,
    background: "var(--qmm-gradient-panel)",
    color: color.text,
    boxShadow: "var(--qmm-shadow-window)",
    pointerEvents: "auto",
    ...opts.style,
  });

  const header = document.createElement("div");
  header.textContent = opts.title;
  Object.assign(header.style, {
    borderBottom: `1px solid ${color.accentSoft}`,
    paddingBottom: "8px",
    color: color.accent,
    fontWeight: "700",
    fontSize: "13px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    textAlign: "center",
  });

  root.appendChild(header);
  appendToPage(root);
  return { root, header };
}

/** A bordered inner area of a side panel. */
export function panelSection(): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, {
    border: `1px solid ${color.accentSoft}`,
    borderRadius: "10px",
    background: color.mutedBg,
    minHeight: "0",
  });
  return el;
}

/** A small round "+" or "-" button. */
export function roundButton(glyph: string, onClick: () => void, tone: "default" | "danger" = "default"): KitButton {
  const btn = button(glyph, { size: "xs", variant: tone === "danger" ? "danger" : "default", onClick });
  Object.assign(btn.style, { width: "28px", height: "28px", padding: "0", borderRadius: "50%", fontSize: "14px" });
  return btn;
}

/** A muted one-line message, such as an empty state. */
export function hint(text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.opacity = "0.7";
  el.style.textAlign = "center";
  return el;
}

/** An icon above a name, centred. */
export function iconWithName(icon: HTMLElement, name: string, fontSize: number): HTMLDivElement {
  const row = document.createElement("div");
  Object.assign(row.style, { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" });
  const nameEl = document.createElement("div");
  nameEl.textContent = name;
  Object.assign(nameEl.style, {
    fontWeight: "700",
    fontSize: `${fontSize}px`,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "center",
    maxWidth: "100%",
  });
  row.append(icon, nameEl);
  return row;
}
