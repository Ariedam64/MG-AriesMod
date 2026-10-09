// The pill at the top of the screen while editing: "Editor mode", Clear
// garden, and the button that hides the two side panels.

import { button, type KitButton } from "../../../ui/kit/button";
import { h } from "../../../ui/kit/dom";
import { EDITOR_LAYER } from "./panelChrome";
import { ensureEditorStyles } from "./styles";

let root: HTMLDivElement | null = null;
let hudButton: KitButton | null = null;

export type ToolbarActions = {
  onClear(): void;
  onToggleHud(): void;
};

export function showToolbar(actions: ToolbarActions, hudVisible: boolean): void {
  if (!(root && document.contains(root))) {
    ensureEditorStyles();
    const el = h("div", "qws-ed-toolbar");
    el.id = "qws-editor-overlay";
    el.style.zIndex = EDITOR_LAYER;

    const label = h("span", "qws-ed-toolbar__label");
    label.append(h("span", "qws-ed-toolbar__dot"), "Editor mode");

    const clear = button("Clear garden", { size: "sm", onClick: actions.onClear });
    hudButton = button("", { size: "sm", onClick: actions.onToggleHud });

    el.append(label, clear, hudButton);
    (document.body || document.documentElement).appendChild(el);
    root = el;
  }
  setHudButtonLabel(hudVisible);
}

export function setHudButtonLabel(hudVisible: boolean): void {
  const label = hudButton?.querySelector(".label");
  if (label) label.textContent = hudVisible ? "Hide panels" : "Show panels";
}

export function hideToolbar(): void {
  root?.remove();
  root = null;
  hudButton = null;
}
