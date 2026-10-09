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
import { readAriesPath, writeAriesPath } from "../platform/storage";
import { pill } from "./kit/badges";
import { button } from "./kit/button";
import { h } from "./kit/dom";
import { layer } from "./kit/theme";
import { type Pos, attachAutoClamp, clampRect, currentPos, ensureOnScreen, makeDraggable, placeClamped, withTopLocked } from "./hudPlacement";
import { initVersionBadge, startStatusLoop } from "./hudStatus";

export type PanelRender = (root: HTMLElement) => void;
export interface HUDOptions {
  onRegister?: (register: (id: string, title: string, render: PanelRender) => void) => void;
}

const HUD_POS_PATH = "hud.pos";
const HUD_COLLAPSED_PATH = "hud.collapsed";
const HUD_HIDDEN_PATH = "hud.hidden";
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
  const ours = (el: Element | null) => !!el?.closest?.(".qws-win, .qws2");
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

  // ---------- HUD box ----------
  const statusMini = pill("…", "warn");
  statusMini.classList.add("mini");
  const btnMin = button("–", { size: "sm", title: "Minimize/Expand" });
  const btnHide = button("✕", { size: "sm", title: "Hide" });
  const header = h("div", "row drag");
  header.append(h("div", "title", "Arie's Mod"), h("div", "qmm-spacer"), statusMini, btnMin, btnHide);

  const statusFull = pill("status", "warn");
  const versionPill = pill("…", "warn");
  const statusRow = h("div", "row");
  statusRow.append(statusFull, versionPill);

  const launch = h("div", "qws-launch");
  const body = h("div", "body");
  body.appendChild(launch);

  const box = h("div", "qws2");
  box.append(header, statusRow, body);
  (document.documentElement || document.body).appendChild(box);

  const setHUDHidden = (hidden: boolean) => {
    box.classList.toggle("hidden", hidden);
    writeAriesPath(HUD_HIDDEN_PATH, hidden);
  };
  const toggleHUDHidden = () => setHUDHidden(!box.classList.contains("hidden"));

  const saveHUDPos = () => {
    writeAriesPath(HUD_POS_PATH, { r: parseFloat(box.style.right) || 16, b: parseFloat(box.style.bottom) || 16 });
  };

  // ---------- Restore ----------
  const isOn = (v: unknown) => v === true || v === "1" || v === 1;
  const pos = readAriesPath<{ r?: number; b?: number }>(HUD_POS_PATH);
  if (pos && typeof pos.r === "number" && typeof pos.b === "number") {
    box.style.right = `${pos.r}px`;
    box.style.bottom = `${pos.b}px`;
  }
  if (isOn(readAriesPath(HUD_COLLAPSED_PATH))) {
    box.classList.add("min");
    btnMin.textContent = "+";
  }
  if (isOn(readAriesPath(HUD_HIDDEN_PATH))) box.classList.add("hidden");
  requestAnimationFrame(() => clampRect(box));
  window.addEventListener("resize", () => clampRect(box));

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
    btnHide.title = `Hide (${keys.join(" / ")})`;
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

  // ---------- HUD controls ----------
  makeDraggable(header, box, { onEnd: saveHUDPos });
  btnMin.onclick = () => {
    withTopLocked(box, () => {
      box.classList.toggle("min");
      btnMin.textContent = box.classList.contains("min") ? "+" : "–";
      writeAriesPath(HUD_COLLAPSED_PATH, box.classList.contains("min"));
    });
  };
  btnHide.onclick = () => setHUDHidden(true);

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
      setLaunchState(id, true);
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
      setLaunchState(id, false);
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
    setLaunchState(id, true);
  }

  window.addEventListener("resize", () => windows.forEach((w) => ensureOnScreen(w.el)));

  // Holding the drag hotkey (or Insert) lets any HUD box be dragged from anywhere.
  (function enableModifierDrag() {
    let drag: { el: HTMLElement; x: number; y: number; pos: Pos } | null = null;

    window.addEventListener("mousedown", (e) => {
      if (!isModifierActive(e) || e.button !== 0) return;
      const root = (e.target as HTMLElement | null)?.closest?.(".qws-win, .qws2") as HTMLElement | null;
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
      else if (el === box) saveHUDPos();
    };
    window.addEventListener("mouseup", stopDrag, true);
    window.addEventListener("keyup", (e) => {
      if (!dragHotkey || matchHotkey(e, dragHotkey) || !dragActive) stopDrag();
    }, true);
  })();

  installInputKeyTrap();

  // ---------- Launcher ----------
  const registry: { id: string; title: string; render: PanelRender }[] = [];
  const launchButtons = new Map<string, HTMLButtonElement>();

  function setLaunchState(id: string, open: boolean) {
    const btn = launchButtons.get(id);
    if (!btn) return;
    btn.textContent = open ? "Close" : "Open";
    btn.dataset.open = open ? "1" : "0";
    btn.classList.toggle("active", open);
  }

  function register(id: string, title: string, render: PanelRender) {
    registry.push({ id, title, render });
    const openBtn = button("Open", { size: "sm" });
    openBtn.dataset.open = "0";
    launchButtons.set(id, openBtn);
    openBtn.onclick = () => {
      const w = windows.get(id);
      if (w && w.el.style.display !== "none") {
        w.el.style.display = "none";
        setLaunchState(id, false);
      } else {
        showWindow(id, title, render);
      }
    };
    const item = h("div", "launch-item");
    item.append(h("div", "name", title), openBtn);
    launch.appendChild(item);
  }

  try {
    opts?.onRegister?.(register);
  } catch (error) {
    console.error("[HUD] panel registration failed:", error);
  }

  // Opens a registered window from anywhere, e.g. the instant feed widget.
  window.addEventListener("qws:open-panel", (ev: Event) => {
    const id = String((ev as CustomEvent).detail?.id || "");
    const entry = registry.find((r) => r.id === id);
    if (entry) showWindow(id, entry.title, entry.render);
  });

  initVersionBadge(versionPill);
  void ensureStore().catch(() => {});
  startStatusLoop(box, statusFull, statusMini);
}
