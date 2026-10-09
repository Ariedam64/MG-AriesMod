// The dock: a column of menu buttons on the left edge of the screen.
//
// One button per registered menu, filled in sepia while its window is open, with a
// name tooltip and an optional count badge (fed by `menuBadges`). A status dot
// at the top shows the mod's connection to the game, and a fold button at the
// bottom shrinks the dock to those two, for players without a keyboard.

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
  setFolded(folded: boolean): void;
  /** The fold button's tooltip, e.g. naming the hotkey that hides the dock outright. */
  setFoldHint(text: string): void;
};

/** Gap between the dock's edge and its tooltip, in px. */
const TIP_GAP_PX = 10;

/** Chevrons for the fold button: pointing left folds, pointing right unfolds. */
const FOLD_ICON = '<path d="M15 6l-6 6 6 6"/>';
const UNFOLD_ICON = '<path d="M9 6l6 6-6 6"/>';

export function createDock(onSelect: (id: string) => void, onFold?: (folded: boolean) => void): Dock {
  ensureKitStyles();

  const root = h("nav", "qws-dock");
  root.setAttribute("aria-label", "Aries Mod menus");
  const status = h("span", "qws-dock-status");
  status.dataset.tone = "warn";
  root.appendChild(status);

  const fold = h("button", "qws-dock-fold");
  fold.type = "button";
  const foldIcon = menuIcon("");
  fold.appendChild(foldIcon);
  root.appendChild(fold);

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
    root.insertBefore(btn, fold);
    buttons.set(id, btn);
    if (pendingBadges.has(id)) setBadge(id, pendingBadges.get(id) ?? 0);
  };

  onMenuBadge(setBadge);

  const setFolded = (folded: boolean) => {
    root.classList.toggle("folded", folded);
    fold.setAttribute("aria-label", folded ? "Show the menus" : "Fold the menus");
    fold.setAttribute("aria-expanded", folded ? "false" : "true");
    foldIcon.innerHTML = folded ? UNFOLD_ICON : FOLD_ICON;
    if (folded) hideTip();
  };
  setFolded(false);
  fold.addEventListener("click", () => {
    const folded = !root.classList.contains("folded");
    setFolded(folded);
    onFold?.(folded);
  });

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
    setFolded,
    setFoldHint(text) {
      fold.setAttribute("title", text);
    },
  };
}
