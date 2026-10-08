// The pill at the top of the screen while editing: "Editor mode", Clear
// garden, and the switch that hides the two side panels.

import { button, type KitButton } from "../../../ui/kit/button";
import { color } from "../../../ui/kit/theme";
import { EDITOR_LAYER } from "./panelChrome";

let root: HTMLDivElement | null = null;
let hudButton: KitButton | null = null;

export type ToolbarActions = {
  onClear(): void;
  onToggleHud(): void;
};

export function showToolbar(actions: ToolbarActions, hudVisible: boolean): void {
  if (!(root && document.contains(root))) {
    const el = document.createElement("div");
    el.id = "qws-editor-overlay";
    Object.assign(el.style, {
      position: "fixed",
      top: "7%",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: EDITOR_LAYER,
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 8px",
      borderRadius: "999px",
      border: `1px solid ${color.borderStrong}`,
      background: "var(--qmm-gradient-panel)",
      color: color.text,
      font: "600 13px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      letterSpacing: "0.3px",
      boxShadow: "var(--qmm-shadow-window)",
    });

    const label = document.createElement("span");
    label.textContent = "Editor mode";
    label.style.padding = "2px 6px";

    const clear = button("Clear garden", { size: "sm", onClick: actions.onClear });
    hudButton = button("", { size: "sm", onClick: actions.onToggleHud });
    for (const btn of [clear, hudButton]) btn.style.borderRadius = "999px";

    el.append(label, clear, hudButton);
    (document.body || document.documentElement).appendChild(el);
    root = el;
  }
  setHudButtonLabel(hudVisible);
}

export function setHudButtonLabel(hudVisible: boolean): void {
  const label = hudButton?.querySelector(".label");
  if (label) label.textContent = hudVisible ? "Hide HUD" : "Show HUD";
}

export function hideToolbar(): void {
  root?.remove();
  root = null;
  hudButton = null;
}
