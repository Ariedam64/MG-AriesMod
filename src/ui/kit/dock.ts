// The dock: a column of menu buttons on the left edge of the screen.
//
// One button per registered menu, green while its window is open, with a
// name tooltip and an optional count badge (fed by `menuBadges`). A status dot
// at the top shows the mod's connection to the game.

import { ensureKitStyles } from "./styles";
import { h } from "./dom";
import { menuIcon } from "./menuIcons";
import { onMenuBadge } from "./menuBadges";

type DockItem = { id: string; label: string };
type DockTone = "ok" | "warn" | "bad";

export type Dock = {
  root: HTMLElement;
  add(item: DockItem): void;
  setOpen(id: string, open: boolean): void;
  setBadge(id: string, count: number): void;
  setStatus(tone: DockTone, text: string): void;
  setHidden(hidden: boolean): void;
  isHidden(): boolean;
};

/** Gap between the dock's edge and its tooltip, in px. */
const TIP_GAP_PX = 10;

export function createDock(onSelect: (id: string) => void): Dock {
  ensureKitStyles();

  const root = h("nav", "qws-dock");
  root.setAttribute("aria-label", "Aries Mod menus");
  const status = h("span", "qws-dock-status");
  status.dataset.tone = "warn";
  root.appendChild(status);

  const tip = h("div", "qws-dock-tip");
  const buttons = new Map<string, HTMLButtonElement>();
  const pendingBadges = new Map<string, number>();

  const showTip = (btn: HTMLElement, label: string) => {
    tip.textContent = label;
    if (!tip.isConnected) (document.documentElement || document.body).appendChild(tip);
    const rect = btn.getBoundingClientRect();
    tip.style.left = `${Math.round(rect.right + TIP_GAP_PX)}px`;
    tip.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    tip.style.transform = "translateY(-50%)";
    tip.classList.add("shown");
  };
  const hideTip = () => tip.classList.remove("shown");

  const setBadge = (id: string, count: number) => {
    const badge = buttons.get(id)?.querySelector(".qws-dock-badge") as HTMLElement | null;
    if (!badge) {
      pendingBadges.set(id, count);
      return;
    }
    const shown = Number.isFinite(count) && count > 0;
    badge.hidden = !shown;
    badge.textContent = shown ? (count > 99 ? "99+" : String(Math.floor(count))) : "";
  };

  const add = ({ id, label }: DockItem) => {
    if (buttons.has(id)) return;
    const btn = h("button", "qws-dock-btn");
    btn.type = "button";
    btn.dataset.id = id;
    btn.setAttribute("aria-label", label);
    const badge = h("span", "qws-dock-badge");
    badge.hidden = true;
    btn.append(menuIcon(id), badge);
    btn.addEventListener("click", () => onSelect(id));
    btn.addEventListener("mouseenter", () => showTip(btn, label));
    btn.addEventListener("focus", () => showTip(btn, label));
    btn.addEventListener("mouseleave", hideTip);
    btn.addEventListener("blur", hideTip);
    root.appendChild(btn);
    buttons.set(id, btn);
    if (pendingBadges.has(id)) setBadge(id, pendingBadges.get(id) ?? 0);
  };

  onMenuBadge(setBadge);

  return {
    root,
    add,
    setOpen(id, open) {
      const btn = buttons.get(id);
      if (!btn) return;
      btn.classList.toggle("open", open);
      btn.setAttribute("aria-pressed", open ? "true" : "false");
    },
    setBadge,
    setStatus(tone, text) {
      status.dataset.tone = tone;
      status.setAttribute("title", text);
      status.setAttribute("aria-label", text);
    },
    setHidden(hidden) {
      root.classList.toggle("hidden", hidden);
      if (hidden) hideTip();
    },
    isHidden() {
      return root.classList.contains("hidden");
    },
  };
}
