// The dock: the mod's launcher panel, three menu buttons to a row.
//
// One button per registered menu, filled in sepia while its window is open, with a
// name tooltip and an optional count badge (fed by `menuBadges`). The header
// carries a status dot for the mod's connection to the game, the mod's name,
// whatever the HUD adds (the version), and a fold button that hides the grid.
// Dragging the header moves the panel anywhere on screen.

import { ensureKitStyles } from "./styles";
import { h } from "./dom";
import { makeDraggable, placeInViewport, type ScreenPosition } from "./floating";
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
  /** Puts the dock at a saved place, kept on screen, or back on the left edge with null. */
  place(pos: ScreenPosition | null): void;
  /** The fold button's tooltip, e.g. naming the hotkey that hides the dock outright. */
  setFoldHint(text: string): void;
  /** Puts an element in the header, before the fold button. */
  addToHeader(el: HTMLElement): void;
};

/** Gap between a button and its tooltip, in px. */
const TIP_GAP_PX = 10;
/** How close a moved dock may come to the screen edge, in px. */
const EDGE_MARGIN_PX = 8;

type DockOptions = {
  /** The header's name. */
  title?: string;
  onFold?: (folded: boolean) => void;
  /** The player dropped the dock at `pos`. */
  onMove?: (pos: ScreenPosition) => void;
};

/** Chevrons for the fold button: pointing up folds, pointing down unfolds. */
const FOLD_ICON = '<path d="M6 15l6-6 6 6"/>';
const UNFOLD_ICON = '<path d="M6 9l6 6 6-6"/>';

export function createDock(onSelect: (id: string) => void, events: DockOptions = {}): Dock {
  ensureKitStyles();

  const root = h("nav", "qws-dock");
  root.setAttribute("aria-label", "Aries Mod menus");
  const status = h("span", "qws-dock-status");
  status.dataset.tone = "warn";
  const fold = h("button", "qws-dock-fold");
  fold.type = "button";
  const foldIcon = menuIcon("");
  fold.appendChild(foldIcon);

  const head = h("div", "qws-dock-head");
  head.append(status, h("span", "qws-dock-title", events.title ?? "Arie's Mod"), fold);
  const grid = h("div", "qws-dock-grid");
  root.append(head, grid);

  const tip = h("div", "qws-dock-tip");
  const buttons = new Map<string, HTMLButtonElement>();
  const pendingBadges = new Map<string, number>();

  const showTip = (btn: HTMLElement, label: string) => {
    tip.textContent = label;
    if (!tip.isConnected) (document.documentElement || document.body).appendChild(tip);
    const rect = btn.getBoundingClientRect();
    // Above the button, or below it when the panel sits against the top edge.
    const below = rect.top < 48;
    tip.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
    tip.style.top = `${Math.round(below ? rect.bottom + TIP_GAP_PX : rect.top - TIP_GAP_PX)}px`;
    tip.style.transform = below ? "translateX(-50%)" : "translate(-50%, -100%)";
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
    grid.appendChild(btn);
    buttons.set(id, btn);
    if (pendingBadges.has(id)) setBadge(id, pendingBadges.get(id) ?? 0);
  };

  onMenuBadge(setBadge);

  const moveTo = (pos: ScreenPosition) => {
    root.classList.add("placed");
    const rect = root.getBoundingClientRect();
    return placeInViewport(root, pos, { width: rect.width, height: rect.height }, EDGE_MARGIN_PX);
  };
  const place = (pos: ScreenPosition | null) => {
    if (pos) {
      moveTo(pos);
      return;
    }
    root.classList.remove("placed");
    root.style.left = "";
    root.style.top = "";
  };
  // Keeps a moved dock on screen when it grows, shrinks or the window does.
  const reclamp = () => {
    if (!root.classList.contains("placed")) return;
    const rect = root.getBoundingClientRect();
    moveTo({ left: rect.left, top: rect.top });
  };
  makeDraggable(root, {
    handle: head,
    // The fold button and a clickable version pill stay clicks.
    ignore: (target) => !!target.closest("button, .is-link"),
    moveTo: (pos) => {
      hideTip();
      return moveTo(pos);
    },
    onDrop: (pos) => events.onMove?.(pos),
  });
  window.addEventListener("resize", reclamp);

  const setFolded = (folded: boolean) => {
    root.classList.toggle("folded", folded);
    fold.setAttribute("aria-label", folded ? "Show the menus" : "Fold the menus");
    fold.setAttribute("aria-expanded", folded ? "false" : "true");
    foldIcon.innerHTML = folded ? UNFOLD_ICON : FOLD_ICON;
    if (folded) hideTip();
    reclamp();
  };
  setFolded(false);
  fold.addEventListener("click", () => {
    const folded = !root.classList.contains("folded");
    setFolded(folded);
    events.onFold?.(folded);
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
    place,
    setFoldHint(text) {
      fold.setAttribute("title", text);
    },
    addToHeader(el) {
      head.insertBefore(el, fold);
    },
  };
}
