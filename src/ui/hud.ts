import { NativeWS, sockets, workerFound } from "../game/ws/sockets";
import { ensureStore, isStoreCaptured, getCapturedInfo } from "../game/store/jotai";
import { PetsService } from "../features/pets/pets";
import { installPetTeamHotkeys } from "../features/pets/teamHotkeys";
import { installShopKeybindsOnce } from "../features/shops/shops";
import { installCompanionKeybindsOnce } from "../features/companion/keybind";
import { installSellKeybindsOnce } from "../features/sellAllPets/keybind";
import { installModalToggleKeybinds } from "../features/keybinds/modalToggles";
import { installGameKeybindsOnce } from "../features/keybinds/gameRemap";
import { PetAlertService } from "../features/notifier/petAlerts";
import {
  getKeybind,
  getKeybindLabel,
  onKeybindChange,
  type Hotkey,
  type KeybindId,
} from "../features/keybinds/keybinds";
import { isKeybindCaptureActive } from "../lib/keyboard";
import { codesMatch, matchHotkey } from "../lib/hotkey";
import { renderOverlay } from "../features/notifier/overlay";
import { startInstantFeedWidget } from "../features/pets/feedWidget";
import { getSpriteWarmupState, onSpriteWarmupProgress } from "./kit/sprites/iconCache";
import { startCropValuesObserverFromGardenAtom } from "../features/cropPrice/domTooltip";
import { startCropValueOverlayInPixi } from "../features/cropPrice/badge";
import { startLockerIndicatorInPixi } from "../features/locker/indicator";
import { startInjectSellAllPets } from "../features/sellAllPets/domButton";
import { startSellAllPetsPixi } from "../features/sellAllPets/pixiButton";
import { startSellCropsLockWatcher } from "../features/locker/sellCropsLock";
import { startEggHatchLockIndicator } from "../features/locker/eggHatchLockIndicator";
import { startDecorPickupLockIndicator } from "../features/locker/decorPickupLockIndicator";
import { fetchRemoteVersion, getLocalVersion } from "../platform/modVersion";
import { isDiscordSurface } from "../platform/environment";
import { startInventorySortingObserver } from "../features/inventory/sorting";
import { startActivityLogFilterPixi } from "../features/activityLog/filterBar";
import { readAriesPath, writeAriesPath } from "../platform/storage";
import { startActivityLogHistoryWatcher } from "../features/activityLog/historyWatcher";
import { startHatchTracker } from "../features/hatch/tracker";
import { pill, setTone, type StatusTone } from "./kit/badges";
import { button } from "./kit/button";
import { h } from "./kit/dom";
import { layer } from "./kit/theme";

export type PanelRender = (root: HTMLElement) => void;
export interface HUDOptions {
  onRegister?: (register: (id: string, title: string, render: PanelRender) => void) => void;
}

const HUD_POS_PATH = "hud.pos";
const HUD_COLLAPSED_PATH = "hud.collapsed";
const HUD_HIDDEN_PATH = "hud.hidden";
const HUD_WIN_PATH = (id: string) => `hud.windows.${id}`;
/** Closest a box may come to the viewport edge. */
const MARGIN = 8;

type Pos = { r: number; b: number };

/** The box's distance from the right and bottom edges, as laid out now. */
function currentPos(el: HTMLElement): Pos {
  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  let r = parseFloat(cs.right);
  let b = parseFloat(cs.bottom);
  if (Number.isNaN(r)) r = window.innerWidth - rect.right;
  if (Number.isNaN(b)) b = window.innerHeight - rect.bottom;
  return { r, b };
}

/** Places a box by its right/bottom offsets, kept inside the viewport. */
function placeClamped(el: HTMLElement, r: number, b: number): void {
  const rect = el.getBoundingClientRect();
  const maxRight = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN);
  const maxBottom = Math.max(MARGIN, window.innerHeight - rect.height - MARGIN);
  el.style.right = `${Math.min(Math.max(r, MARGIN), maxRight)}px`;
  el.style.bottom = `${Math.min(Math.max(b, MARGIN), maxBottom)}px`;
}

function clampRect(el: HTMLElement): void {
  const { r, b } = currentPos(el);
  placeClamped(el, r, b);
}

/** Like `clampRect`, and also pulls a window's title bar and left edge back on screen. */
function ensureOnScreen(el: HTMLElement): void {
  clampRect(el);
  const rect = el.getBoundingClientRect();
  const head = el.querySelector<HTMLElement>(".w-head")?.getBoundingClientRect() ?? rect;
  let { r, b } = currentPos(el);
  const maxRight = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN);
  const maxBottom = Math.max(MARGIN, window.innerHeight - rect.height - MARGIN);
  if (head.top < MARGIN) b = Math.max(MARGIN, Math.min(maxBottom, b - (MARGIN - head.top)));
  if (rect.left < MARGIN) r = Math.max(MARGIN, Math.min(maxRight, r - (MARGIN - rect.left)));
  el.style.right = `${r}px`;
  el.style.bottom = `${b}px`;
}

/** Keeps a window on screen as its content grows or shrinks. */
function attachAutoClamp(win: HTMLElement): void {
  if (typeof ResizeObserver === "undefined") return;
  let raf = 0;
  new ResizeObserver(() => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => ensureOnScreen(win));
  }).observe(win);
}

/** Runs a size change while keeping the box's top edge where it was. */
function withTopLocked(el: HTMLElement, mutate: () => void): void {
  const before = el.getBoundingClientRect();
  const { b } = currentPos(el);
  mutate();
  requestAnimationFrame(() => {
    const after = el.getBoundingClientRect();
    const maxBottom = Math.max(MARGIN, window.innerHeight - after.height - MARGIN);
    el.style.bottom = `${Math.min(Math.max(MARGIN, b + after.top - before.top), maxBottom)}px`;
    ensureOnScreen(el);
  });
}

/** Drags `target` by `handle`, clamped to the viewport. */
function makeDraggable(
  handle: HTMLElement,
  target: HTMLElement,
  opts: { ignore?: (t: HTMLElement) => boolean; onStart?: () => void; onEnd: () => void },
): void {
  let start: { x: number; y: number; pos: Pos } | null = null;
  handle.addEventListener("mousedown", (e) => {
    if (opts.ignore?.(e.target as HTMLElement)) return;
    start = { x: e.clientX, y: e.clientY, pos: currentPos(target) };
    document.body.style.userSelect = "none";
    opts.onStart?.();
  });
  window.addEventListener("mousemove", (e) => {
    if (!start) return;
    placeClamped(target, start.pos.r - (e.clientX - start.x), start.pos.b - (e.clientY - start.y));
  });
  window.addEventListener("mouseup", () => {
    if (!start) return;
    start = null;
    document.body.style.userSelect = "";
    opts.onEnd();
  });
}

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

/** Opens a link in a new tab; inside Discord the userscript manager has to do it. */
function openDownloadLink(url: string): void {
  const gmObject = (globalThis as typeof globalThis & { GM?: { openInTab?: typeof GM_openInTab } }).GM;
  const gmOpen = typeof GM_openInTab === "function"
    ? GM_openInTab
    : typeof gmObject?.openInTab === "function"
      ? gmObject.openInTab.bind(gmObject)
      : null;
  if (isDiscordSurface() && gmOpen) {
    try {
      gmOpen(url, { active: true, setParent: true });
      return;
    } catch (error) {
      console.warn("[MagicGarden] GM_openInTab failed, falling back to window.open", error);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
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
  startStatusLoop(statusFull, statusMini);
}

function initVersionBadge(badge: HTMLElement): void {
  const show = (text: string, tone: StatusTone, downloadUrl?: string | null) => {
    badge.textContent = text;
    setTone(badge, tone);
    badge.classList.toggle("is-link", !!downloadUrl);
    if (downloadUrl) {
      badge.dataset.download = downloadUrl;
      badge.title = "Download the new version";
    } else {
      delete badge.dataset.download;
      badge.removeAttribute("title");
    }
  };

  show("checking…", "warn");
  badge.addEventListener("click", () => {
    const url = badge.dataset.download;
    if (url) openDownloadLink(url);
  });

  void (async () => {
    const localVersion = getLocalVersion();
    try {
      const remoteData = await fetchRemoteVersion();
      const remoteVersion = remoteData?.version?.trim();
      if (!remoteVersion) show(localVersion || "version inconnue", "warn");
      else if (!localVersion) show(remoteVersion, "warn", remoteData?.download);
      else if (localVersion === remoteVersion) show(localVersion, "ok");
      else show(`${localVersion} → ${remoteVersion}`, "warn", remoteData?.download);
    } catch (error) {
      console.error("[MagicGarden] Failed to check version:", error);
      show(localVersion || "Unknown", "warn");
    }
  })();
}

type StatusInfo = { level: StatusTone; message: string };

function getWSStatus(): StatusInfo {
  if (sockets.some((ws) => ws.readyState === NativeWS.OPEN)) return { level: "ok", message: "ws open" };
  if ((window as any).__QWS_workerFound || workerFound) return { level: "ok", message: "ws via worker" };
  return { level: "bad", message: "ws none" };
}

function getStoreStatus(): StatusInfo {
  try {
    const info = getCapturedInfo() as { via?: string; polyfill?: unknown };
    if (isStoreCaptured()) return { level: "ok", message: `store ${info.via || "ready"}` };
    if (info.via === "polyfill" || info.polyfill) return { level: "warn", message: "store polyfill" };
    return { level: "bad", message: "store none" };
  } catch {
    return { level: "bad", message: "store error" };
  }
}

/** Sprite warm-up progress first, then socket and store health. */
function startStatusLoop(full: HTMLElement, mini: HTMLElement): void {
  let warmup = getSpriteWarmupState();

  const update = () => {
    if (!warmup.completed) {
      const progress = warmup.total > 0 ? `${warmup.done}/${warmup.total}` : `${warmup.done}`;
      const summary = warmup.total > 0 ? `Sprites warming: ${progress}` : "Sprites warming up";
      full.textContent = `Sprites ${progress}`;
      mini.textContent = progress;
      full.title = mini.title = summary;
      setTone(full, "warn");
      setTone(mini, "warn");
      mini.style.display = "";
      return;
    }

    const ws = getWSStatus();
    const store = getStoreStatus();
    const level: StatusTone = store.message === "store none" && ws.level === "bad"
      ? "bad"
      : ws.level === "ok" && store.level === "ok" ? "ok" : "warn";
    full.textContent = "status";
    mini.textContent = level === "ok" ? "OK" : level === "warn" ? "WARN" : "ISSUES";
    full.title = mini.title = `${ws.message}, ${store.message}`;
    setTone(full, level);
    setTone(mini, level);
    mini.style.display = level === "ok" ? "none" : "";
  };

  onSpriteWarmupProgress((state) => {
    warmup = state;
    update();
  });
  setInterval(update, 800);
}

export function initWatchers(){
    installShopKeybindsOnce();
    installSellKeybindsOnce();
    installModalToggleKeybinds();
    installGameKeybindsOnce();
    installCompanionKeybindsOnce();

    const bootToolbar = async () => {
      try { await renderOverlay(); } catch (e) { console.error("[HUD] renderOverlay failed:", e); }
    };
    if (document.head) {
      bootToolbar();
    } else {
      document.addEventListener("DOMContentLoaded", () => bootToolbar(), { once: true });
    }

    (async () => {
        try { await PetAlertService.start(); } catch {}
        try {
          installPetTeamHotkeys((teamId) => {
            PetsService.useTeam(teamId).catch((e) => console.warn("[Pets] hotkey useTeam failed:", e));
          });
        } catch {}
        try { await PetsService.startPetTeamSync(); } catch {}
      try { await PetsService.startAbilityLogsWatcher(); } catch {}
      try { await startActivityLogHistoryWatcher(); } catch {}
      try { await startHatchTracker(); } catch {}
      startActivityLogFilterPixi();
      startCropValuesObserverFromGardenAtom();
      startCropValueOverlayInPixi();
      startSellCropsLockWatcher();
      startDecorPickupLockIndicator();
      startEggHatchLockIndicator();
      startLockerIndicatorInPixi();
      startInjectSellAllPets();
      startSellAllPetsPixi();
      startInstantFeedWidget();
      startInventorySortingObserver();
  })();
}
