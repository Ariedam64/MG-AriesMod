import { ensureStore } from "../game/store/jotai";
import {
  getKeybind,
  getKeybindLabel,
  onKeybindChange,
  type Hotkey,
  type KeybindId,
} from "../features/keybinds/keybinds";
import { isKeybindCaptureActive } from "../lib/keyboard";
import { codesMatch, matchHotkey } from "../lib/hotkey";
import { checkModVersion } from "../platform/modVersion";
import { readAriesPath, writeAriesPath } from "../platform/storage";
import { button } from "./kit/button";
import { createDock } from "./kit/dock";
import { h } from "./kit/dom";
import { setMenuBadge } from "./kit/menuBadges";
import { layer } from "./kit/theme";
import { type Pos, attachAutoClamp, clampRect, currentPos, ensureOnScreen, makeDraggable, placeClamped, withTopLocked } from "./hudPlacement";
import { startStatusLoop } from "./hudStatus";

export type PanelRender = (root: HTMLElement) => void;
export interface HUDOptions {
  onRegister?: (register: (id: string, title: string, render: PanelRender) => void) => void;
}

const HUD_HIDDEN_PATH = "hud.hidden";
const HUD_FOLDED_PATH = "hud.dockFolded";
const HUD_WIN_PATH = (id: string) => `hud.windows.${id}`;
const isEditing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
};

/**
 * Stops keystrokes typed into the mod's own fields from reaching the game's
 * shortcuts. Typing still works: the event is stopped, not prevented.
 */
function installInputKeyTrap(): void {
  const isTextField = (el: Element | null) => {
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) return ["text", "number", "search"].includes((el.type || "").toLowerCase());
    return el instanceof HTMLElement && el.isContentEditable;
  };
  const ours = (el: Element | null) => !!el?.closest?.(".qws-win");
  const trap = (ev: KeyboardEvent) => {
    const target = ev.target as Element | null;
    const active = document.activeElement;
    if (!((ours(target) && isTextField(target)) || (ours(active) && isTextField(active)))) return;
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  };
  for (const type of ["keydown", "keypress", "keyup"] as const) window.addEventListener(type, trap, true);
}

export function mountHUD(opts?: HUDOptions) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountHUD(opts), { once: true });
    return;
  }

  // ---------- Dock ----------
  const dock = createDock(
    (id) => toggleWindow(id),
    (folded) => writeAriesPath(HUD_FOLDED_PATH, folded),
  );
  (document.documentElement || document.body).appendChild(dock.root);

  const setHUDHidden = (hidden: boolean) => {
    dock.setHidden(hidden);
    writeAriesPath(HUD_HIDDEN_PATH, hidden);
  };
  const toggleHUDHidden = () => setHUDHidden(!dock.isHidden());

  const isOn = (v: unknown) => v === true || v === "1" || v === 1;
  dock.setHidden(isOn(readAriesPath(HUD_HIDDEN_PATH)));
  dock.setFolded(isOn(readAriesPath(HUD_FOLDED_PATH)));

  // ---------- Keys: Insert, the toggle hotkey and the drag hotkey ----------
  // Insert tapped on its own toggles the HUD; held, it is a drag modifier.
  let insertDown = false;
  let insertUsedAsModifier = false;

  const KEY_TOGGLE: KeybindId = "gui.toggle";
  const KEY_DRAG: KeybindId = "gui.drag";
  const downCodes = new Set<string>();
  let toggleHotkey: Hotkey | null = getKeybind(KEY_TOGGLE);
  let dragHotkey: Hotkey | null = getKeybind(KEY_DRAG);
  let dragActive = false;

  const isCodePressed = (code: string) => [...downCodes].some((pressed) => codesMatch(code, pressed));

  const updateDragState = () => {
    const hk = dragHotkey;
    dragActive = !!hk
      && !!hk.alt === isCodePressed("AltLeft")
      && !!hk.ctrl === isCodePressed("ControlLeft")
      && !!hk.shift === isCodePressed("ShiftLeft")
      && !!hk.meta === isCodePressed("MetaLeft")
      && isCodePressed(hk.code);
  };
  updateDragState();

  const isModifierActive = (e: MouseEvent) => {
    if (dragHotkey && dragActive) return true;
    const insertModifier = insertDown && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    if (insertModifier) insertUsedAsModifier = true;
    return insertModifier;
  };

  const onInsertKey = (e: KeyboardEvent) => {
    if (e.code !== "Insert" && e.key !== "Insert") return;
    if (e.type === "keydown") {
      if (!insertDown) insertUsedAsModifier = false;
      insertDown = true;
      return;
    }
    const usedAsModifier = insertUsedAsModifier;
    insertDown = false;
    insertUsedAsModifier = false;
    if (!usedAsModifier && !isEditing(e.target)) {
      e.preventDefault();
      toggleHUDHidden();
    }
  };
  window.addEventListener("keydown", onInsertKey, true);
  window.addEventListener("keyup", onInsertKey, true);

  const resetKeys = () => {
    insertDown = false;
    insertUsedAsModifier = false;
    downCodes.clear();
    updateDragState();
  };
  window.addEventListener("blur", resetKeys, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") resetKeys();
  });

  window.addEventListener("keydown", (e) => {
    downCodes.add(e.code);
    updateDragState();
    if (isEditing(e.target) || e.repeat) return;
    // While a shortcut is being recorded, the key belongs to the rebinding UI.
    if (isKeybindCaptureActive()) return;
    if (matchHotkey(e, toggleHotkey)) {
      if (insertDown && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) insertUsedAsModifier = true;
      e.preventDefault();
      toggleHUDHidden();
    }
  }, true);
  window.addEventListener("keyup", (e) => {
    downCodes.delete(e.code);
    updateDragState();
  }, true);

  const updateHideButtonTitle = () => {
    const keys: string[] = [];
    if (toggleHotkey) keys.push(getKeybindLabel(KEY_TOGGLE));
    keys.push("Insert");
    dock.setFoldHint(`Fold the menus (${keys.join(" / ")} hides them)`);
  };
  updateHideButtonTitle();
  onKeybindChange(KEY_TOGGLE, (hk) => {
    toggleHotkey = hk;
    updateHideButtonTitle();
  });
  onKeybindChange(KEY_DRAG, (hk) => {
    dragHotkey = hk;
    updateDragState();
  });

  // ---------- Windows ----------
  type Win = { id: string; el: HTMLElement };
  const windows = new Map<string, Win>();
  let cascade = 0;

  function bumpZ(el: HTMLElement) {
    let maxZ: number = layer.window;
    windows.forEach((w) => {
      const z = parseInt(getComputedStyle(w.el).zIndex || String(layer.window), 10);
      if (z > maxZ) maxZ = z;
    });
    el.style.zIndex = String(maxZ + 1);
  }

  function saveWinPos(id: string, el: HTMLElement) {
    writeAriesPath(HUD_WIN_PATH(id), { r: parseFloat(el.style.right) || 16, b: parseFloat(el.style.bottom) || 16 });
  }

  function restoreWinPos(id: string, el: HTMLElement) {
    const saved = readAriesPath<{ r?: number; b?: number }>(HUD_WIN_PATH(id));
    if (typeof saved?.r === "number") el.style.right = `${saved.r}px`;
    if (typeof saved?.b === "number") el.style.bottom = `${saved.b}px`;
    ensureOnScreen(el);
  }

  function showWindow(id: string, title: string, render: PanelRender) {
    const existing = windows.get(id);
    if (existing) {
      existing.el.style.display = "";
      bumpZ(existing.el);
      ensureOnScreen(existing.el);
      dock.setOpen(id, true);
      return;
    }

    const win = h("div", "qws-win");
    const head = h("div", "w-head");
    const winMin = button("–", { size: "xs", title: "Minimize/Expand" });
    const winClose = button("✕", { size: "xs", title: "Close" });
    winMin.classList.add("w-btn");
    winClose.classList.add("w-btn");
    head.append(h("div", "w-title", title), h("div", "qmm-spacer"), winMin, winClose);
    const winBody = h("div", "w-body");
    win.append(head, winBody);
    (document.documentElement || document.body).appendChild(win);

    const offset = (cascade++ % 5) * 24;
    win.style.right = `${16 + offset}px`;
    win.style.bottom = `${16 + offset}px`;
    clampRect(win);
    bumpZ(win);

    makeDraggable(head, win, {
      ignore: (t) => !!t.closest(".w-btn"),
      onStart: () => bumpZ(win),
      onEnd: () => saveWinPos(id, win),
    });

    winMin.onclick = () => {
      withTopLocked(win, () => {
        const hidden = winBody.style.display === "none";
        winBody.style.display = hidden ? "" : "none";
        winMin.textContent = hidden ? "–" : "+";
      });
    };
    winClose.onclick = () => {
      win.style.display = "none";
      dock.setOpen(id, false);
    };

    restoreWinPos(id, win);
    try {
      render(winBody);
    } catch (e) {
      winBody.textContent = String(e);
    }

    attachAutoClamp(win);
    requestAnimationFrame(() => ensureOnScreen(win));
    saveWinPos(id, win);
    windows.set(id, { id, el: win });
    dock.setOpen(id, true);
  }

  window.addEventListener("resize", () => windows.forEach((w) => ensureOnScreen(w.el)));

  // Holding the drag hotkey (or Insert) lets any window be dragged from anywhere.
  (function enableModifierDrag() {
    let drag: { el: HTMLElement; x: number; y: number; pos: Pos } | null = null;

    window.addEventListener("mousedown", (e) => {
      if (!isModifierActive(e) || e.button !== 0) return;
      const root = (e.target as HTMLElement | null)?.closest?.(".qws-win") as HTMLElement | null;
      if (!root || root.style.display === "none") return;
      drag = { el: root, x: e.clientX, y: e.clientY, pos: currentPos(root) };
      document.body.style.userSelect = "none";
      bumpZ(root);
      e.preventDefault();
      e.stopPropagation();
    }, true);

    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      placeClamped(drag.el, drag.pos.r - (e.clientX - drag.x), drag.pos.b - (e.clientY - drag.y));
    }, true);

    const stopDrag = () => {
      if (!drag) return;
      const el = drag.el;
      drag = null;
      document.body.style.userSelect = "";
      clampRect(el);
      const win = [...windows.values()].find((w) => w.el === el);
      if (win) saveWinPos(win.id, el);
    };
    window.addEventListener("mouseup", stopDrag, true);
    window.addEventListener("keyup", (e) => {
      if (!dragHotkey || matchHotkey(e, dragHotkey) || !dragActive) stopDrag();
    }, true);
  })();

  installInputKeyTrap();

  // ---------- Menus ----------
  const registry = new Map<string, { title: string; render: PanelRender }>();

  function toggleWindow(id: string) {
    const entry = registry.get(id);
    if (!entry) return;
    const w = windows.get(id);
    if (w && w.el.style.display !== "none") {
      w.el.style.display = "none";
      dock.setOpen(id, false);
    } else {
      showWindow(id, entry.title, entry.render);
    }
  }

  function register(id: string, title: string, render: PanelRender) {
    registry.set(id, { title, render });
    dock.add({ id, label: title });
  }

  try {
    opts?.onRegister?.(register);
  } catch (error) {
    console.error("[HUD] panel registration failed:", error);
  }

  // Opens a registered window from anywhere, e.g. the instant feed widget.
  window.addEventListener("qws:open-panel", (ev: Event) => {
    const id = String((ev as CustomEvent).detail?.id || "");
    const entry = registry.get(id);
    if (entry) showWindow(id, entry.title, entry.render);
  });

  void ensureStore().catch(() => {});
  startStatusLoop(dock);
  // A build behind the latest release badges Settings, where the download link is.
  void checkModVersion().then((status) => setMenuBadge("settings", status.behind ? 1 : 0));
}
