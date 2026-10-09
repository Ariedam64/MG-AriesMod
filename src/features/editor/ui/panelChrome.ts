// The look shared by the editor's on-screen panels: the two floating side
// panels, the areas inside them, and the small round buttons.

import { button, type KitButton } from "../../../ui/kit/button";
import { h } from "../../../ui/kit/dom";
import { ensureEditorStyles } from "./styles";

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

/**
 * A panel pinned to one side of the screen: a title band over `body`.
 * Appended to the page.
 */
export function floatingPanel(opts: FloatingPanelOptions): { root: HTMLDivElement; body: HTMLDivElement } {
  ensureEditorStyles();
  const root = h("div", `qws-ed-panel is-${opts.side}`);
  root.id = opts.id;
  root.style.zIndex = EDITOR_LAYER;
  if (opts.style) Object.assign(root.style, opts.style);

  const body = h("div", "qws-ed-panel__body");
  root.append(h("div", "qws-ed-panel__head", opts.title), body);
  appendToPage(root);
  return { root, body };
}

/** A sunken area of a side panel. */
export function panelSection(): HTMLDivElement {
  ensureEditorStyles();
  return h("div", "qws-ed-section");
}

/** A small round "+" or "-" button. */
export function roundButton(glyph: string, onClick: () => void, label?: string): KitButton {
  ensureEditorStyles();
  const btn = button(glyph, { size: "xs", onClick, ariaLabel: label, tooltip: label });
  btn.classList.add("qws-ed-round");
  return btn;
}

/** A muted centred message, such as an empty state. */
export function hint(text: string): HTMLDivElement {
  ensureEditorStyles();
  return h("div", "qws-ed-hint", text);
}

/** A small uppercase heading inside a panel. */
export function panelLabel(text: string): HTMLDivElement {
  ensureEditorStyles();
  return h("div", "qws-ed-label", text);
}

/** An icon above a name, centred. */
export function iconWithName(icon: HTMLElement, name: string, fontSize: number): HTMLDivElement {
  ensureEditorStyles();
  const row = h("div", "qws-ed-named");
  const nameEl = h("div", "qws-ed-named__name", name);
  nameEl.style.fontSize = `${fontSize}px`;
  row.append(icon, nameEl);
  return row;
}
