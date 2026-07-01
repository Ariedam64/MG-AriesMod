// src/ui/hud.ts
import { NativeWS, sockets, workerFound } from "../core/state";
import { ensureStore, isStoreCaptured, getCapturedInfo } from "../store/jotai";
import { PetsService, installPetTeamHotkeysOnce, setTeamsForHotkeys } from "../services/pets";
import { ShopsService, installShopKeybindsOnce } from "../services/shops";
import { installSellKeybindsOnce } from "../services/sell";
import { installPetHutchKeybindsOnce } from "../services/petHutchKeybind";
import { installJournalKeybindsOnce } from "../services/journalKeybind";
import { installDecorShedKeybindsOnce } from "../services/decorShedKeybind";
import { installSeedSiloKeybindsOnce } from "../services/seedSiloKeybind";
import { installFeedingTroughKeybindsOnce } from "../services/feedingTroughKeybind";
import { PetAlertService } from "../services/pet-alerts";
import {
  getKeybind,
  getKeybindLabel,
  installGameKeybindsOnce,
  onKeybindChange,
  type Hotkey,
  type KeybindId,
} from "../services/keybinds";
import { renderOverlay } from "./menus/notificationOverlay";
import { startInstantFeedWidget } from "../utils/instantFeedWidget";
import { getSpriteWarmupState, onSpriteWarmupProgress } from "./spriteIconCache";
import { setupBuyAll, startReorderObserver } from "../utils/shopUtility";
import { startCropValuesObserverFromGardenAtom } from "../utils/cropValues";
import { startCropValueOverlayInPixi } from "../utils/cropValuePixi";
import { startInjectSellAllPets } from "../utils/sellAllPets";
import { startSellCropsLockWatcher } from "../utils/sellCropsLock";
import { startEggHatchLockIndicator } from "../utils/eggHatchLockIndicator";
import { startDecorPickupLockIndicator } from "../utils/decorPickupLockIndicator";
import { fetchRemoteVersion, getLocalVersion } from "../utils/version";
import { isDiscordSurface } from "../utils/api";
import { startSelectedInventoryQuantityLogger } from "../utils/inventorySelectionLogger";
import { startInventorySortingObserver } from "../utils/inventorySorting";
import { startModalObserver } from "../utils/checkModal";
import { startActivityLogFilter } from "../utils/activityLogFilter";
import { readAriesPath, writeAriesPath } from "../utils/localStorage";
import { startActivityLogHistoryWatcher } from "../services/activityLogHistory";

// ========================
// Types d’intégration
// ========================
export type PanelRender = (root: HTMLElement) => void;
export interface HUDOptions {
  onRegister?: (register: (id: string, title: string, render: PanelRender) => void) => void;
}

// ========================
// HUD principal
// ========================
export function mountHUD(opts?: HUDOptions) {
  const HUD_POS_PATH = "hud.pos";
  const HUD_COLLAPSED_PATH = "hud.collapsed";
  const HUD_HIDDEN_PATH = "hud.hidden";
  const HUD_WIN_PATH = (id: string) => `hud.windows.${id}`;
  const MARGIN = 8;
  const Z_BASE = 2_000_000; // keep HUD/windows above editor overlays

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountHUD(opts), { once: true });
    return;
  }

  // ---------- Styles (HUD + fenêtres) ----------
  const css = `
  :root{
    --qws-bg:        #0f1318;
    --qws-panel:     #111823cc;
    --qws-border:    #ffffff22;
    --qws-border-2:  #ffffff14;
    --qws-accent:    #7aa2ff;
    --qws-text:      #e7eef7;
    --qws-text-dim:  #b9c3cf;
    --qws-blur:      8px;
    --qws-shadow:    0 10px 36px rgba(0,0,0,.45);
  }

  /* ---------- HUD floating box ---------- */
  .qws2{
    position:fixed; right:16px; bottom:16px; z-index:${Z_BASE};
    position:fixed; right:16px; bottom:16px; z-index:1000010;
    font:12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color:var(--qws-text);
    background:var(--qws-panel);
    border:1px solid var(--qws-border);
    border-radius:12px;
    padding:10px 12px;
    box-shadow:var(--qws-shadow);
    backdrop-filter:blur(var(--qws-blur));
    min-width:160px;
    display:flex; flex-direction:column; gap:8px;
  }
  .qws2.hidden{ display:none }
  .qws2 .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
  .qws2 .col{ display:flex; flex-direction:column; gap:4px }
  .qws2 .title{ font-weight:700; letter-spacing:.2px }
  .qws2 .sp{ flex:1 }

  .qws2 .pill{
    display:inline-flex; align-items:center; gap:6px;
    padding:4px 8px; border-radius:999px;
    border:1px solid #ffffff26;
    background:rgba(255,255,255,.06);
    color:var(--qws-text);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
  }
  .qws2 .ok{   background:rgba(36, 161, 72, .20);  border-color:#48d17066 }
  .qws2 .warn{ background:rgba(241, 194, 27, .18); border-color:#ffd65c66 }
  .qws2 .bad{  background:rgba(218, 30, 40, .20);  border-color:#ff7c8666 }

  .qws2 .btn{
    cursor:pointer; border-radius:10px; border:1px solid var(--qws-border);
    padding:6px 10px;
    background:linear-gradient(180deg, #ffffff12, #ffffff06);
    color:#fff;
    transition:transform .1s ease, background .18s ease, border-color .18s ease;
  }
  .qws2 .btn:hover{ background:linear-gradient(180deg, #ffffff18, #ffffff0a); border-color:#ffffff44 }
  .qws2 .btn:active{ transform:translateY(1px) }
  .qws2 .drag{ cursor:move; opacity:.9 }

  .qws2 .mini{ display:none }
  .qws2.min .mini{ display:inline-flex }
  .qws2.min .body{ display:none }

  /* Launcher always shown */
  .qws-launch{ margin-top:4px; border-top:1px solid var(--qws-border); padding-top:6px; display:block }
  .qws-launch .launch-item{ display:flex; align-items:center; gap:8px; margin:4px 0 }
  .qws-launch .launch-item .name{ flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
  .qws-launch .launch-item .btn.active{
    background:linear-gradient(180deg, rgba(122,162,255,.28), rgba(122,162,255,.12));
    border-color:#9db7ff66;
  }

  /* ---------- Windows ---------- */
  .qws-win{
    position:fixed; z-index:${Z_BASE + 1}; min-width:260px; max-width:900px; max-height:90vh; overflow:auto;
    background:var(--qws-panel); color:var(--qws-text);
    border:1px solid var(--qws-border); border-radius:12px;
    box-shadow:var(--qws-shadow); backdrop-filter:blur(var(--qws-blur));
  }
  .qws-win .w-head{
    display:flex; align-items:center; gap:8px; padding:10px 12px;
    border-bottom:1px solid var(--qws-border); cursor:move;
    background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
    border-top-left-radius:12px; border-top-right-radius:12px;
  }
  .qws-win .w-title{ font-weight:700 }
  .qws-win .sp{ flex:1 }
  .qws-win .w-btn{
    cursor:pointer; border-radius:10px; border:1px solid var(--qws-border);
    padding:4px 8px; background:linear-gradient(180deg, #ffffff12, #ffffff06); color:#fff;
  }
  .qws-win .w-btn:hover{ background:linear-gradient(180deg, #ffffff18, #ffffff0a); border-color:#ffffff44 }
  .qws-win .w-body{ padding:12px }

  /* Inputs inside windows */
  .qws-win input[type="text"], .qws-win input[type="number"]{
    width:120px; padding:8px 10px; border-radius:10px;
    border:1px solid var(--qws-border); background:rgba(0,0,0,.42); color:#fff;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
  }
  .qws-win .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:6px 0 }
  `;

  const st = document.createElement("style");
  st.textContent = css;
  (document.documentElement || document.body).appendChild(st);

  // ---------- HUD root ----------
  const box = document.createElement("div");
  box.className = "qws2";
  box.innerHTML = `
    <div class="row drag">
      <div class="title">Arie's Mod</div>
      <div class="sp"></div>
      <span id="qws2-status-mini" class="pill warn mini">…</span>
      <button id="qws2-min" class="btn" title="Minimize/Expand">–</button>
      <button id="qws2-hide" class="btn" title="Hide">✕</button>
    </div>

    <!-- Status & store side-by-side (no mode label) -->
    <div class="row" style="margin:2px 0 2px 0;">
      <span id="qws2-status" class="pill warn">status</span>
      <span id="qws2-version" class="pill warn">…</span>
    </div>

    <div class="body">
      <div id="qws-launch" class="qws-launch"></div>
    </div>
  `;
  (document.documentElement || document.body).appendChild(box);

  const setHUDHidden = (hidden: boolean) => {
    box.classList.toggle("hidden", hidden);
    try { writeAriesPath(HUD_HIDDEN_PATH, hidden); } catch {}
    return hidden;
  };

  const toggleHUDHidden = () => setHUDHidden(!box.classList.contains("hidden"));

  let insertDown = false;
  let insertUsedAsModifier = false;

  const KEY_TOGGLE: KeybindId = "gui.toggle";
  const KEY_DRAG: KeybindId = "gui.drag";

  const downCodes = new Set<string>();
  let toggleHotkey: Hotkey | null = getKeybind(KEY_TOGGLE);
  let dragHotkey: Hotkey | null = getKeybind(KEY_DRAG);
  let dragActive = false;

  const codeEquals = (expected: string, actual: string): boolean => {
    if (expected === actual) return true;
    if ((expected === "AltLeft" || expected === "AltRight") && (actual === "AltLeft" || actual === "AltRight")) return true;
    if ((expected === "ControlLeft" || expected === "ControlRight") && (actual === "ControlLeft" || actual === "ControlRight")) return true;
    if ((expected === "ShiftLeft" || expected === "ShiftRight") && (actual === "ShiftLeft" || actual === "ShiftRight")) return true;
    if ((expected === "MetaLeft" || expected === "MetaRight") && (actual === "MetaLeft" || actual === "MetaRight")) return true;
    return false;
  };

  const isCodePressed = (code: string): boolean => {
    for (const pressed of downCodes) {
      if (codeEquals(code, pressed)) return true;
    }
    return false;
  };

  const matchesHotkey = (e: KeyboardEvent, hk: Hotkey | null): boolean => {
    if (!hk) return false;
    if (!!hk.ctrl !== e.ctrlKey) return false;
    if (!!hk.shift !== e.shiftKey) return false;
    if (!!hk.alt !== e.altKey) return false;
    if (!!hk.meta !== e.metaKey) return false;
    return codeEquals(hk.code, e.code);
  };

  const updateDragState = () => {
    if (!dragHotkey) {
      dragActive = false;
      return;
    }
    const altDown = isCodePressed("AltLeft");
    const ctrlDown = isCodePressed("ControlLeft");
    const shiftDown = isCodePressed("ShiftLeft");
    const metaDown = isCodePressed("MetaLeft");
    if (!!dragHotkey.alt !== altDown) { dragActive = false; return; }
    if (!!dragHotkey.ctrl !== ctrlDown) { dragActive = false; return; }
    if (!!dragHotkey.shift !== shiftDown) { dragActive = false; return; }
    if (!!dragHotkey.meta !== metaDown) { dragActive = false; return; }
    dragActive = isCodePressed(dragHotkey.code);
  };

  updateDragState();

  const isInsertKey = (e: KeyboardEvent) => e.code === "Insert" || e.key === "Insert";
  const isModifierActive = (e: MouseEvent | KeyboardEvent) => {
    if (dragHotkey && dragActive) return true;
    const alt = "altKey" in e && e.altKey;
    const ctrl = "ctrlKey" in e && e.ctrlKey;
    const meta = "metaKey" in e && e.metaKey;
    const shift = "shiftKey" in e && e.shiftKey;
    const insertModifier = insertDown && !alt && !ctrl && !meta;
    if (insertModifier && !shift) insertUsedAsModifier = true;
    return insertModifier && !shift;
  };

  const onInsertKey = (e: KeyboardEvent) => {
    if (!isInsertKey(e)) return;

    if (e.type === "keydown") {
      if (!insertDown) insertUsedAsModifier = false;
      insertDown = true;
      return;
    }

    const target = e.target as HTMLElement | null;
    const editing =
      !!target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));

    const usedAsModifier = insertUsedAsModifier;
    insertDown = false;
    insertUsedAsModifier = false;

    if (!usedAsModifier && !editing) {
      e.preventDefault();
      toggleHUDHidden();
    }
  };

  window.addEventListener("keydown", onInsertKey, true);
  window.addEventListener("keyup", onInsertKey, true);
  window.addEventListener("blur", () => {
    insertDown = false;
    insertUsedAsModifier = false;
    downCodes.clear();
    updateDragState();
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      insertDown = false;
      insertUsedAsModifier = false;
      downCodes.clear();
      updateDragState();
    }
  });

  // ---------- Persist/Clamp helpers ----------
  function clampRect(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let r = parseFloat(getComputedStyle(el).right) || (vw - rect.right);
    let b = parseFloat(getComputedStyle(el).bottom) || (vh - rect.bottom);
    const maxRight  = Math.max(MARGIN, vw - rect.width  - MARGIN);
    const maxBottom = Math.max(MARGIN, vh - rect.height - MARGIN);
    r = Math.min(Math.max(r, MARGIN), maxRight);
    b = Math.min(Math.max(b, MARGIN), maxBottom);
    el.style.right  = r + "px";
    el.style.bottom = b + "px";
  }
  function ensureOnScreen(el: HTMLElement) {
    clampRect(el);
    const rect = el.getBoundingClientRect();
    const head = el.querySelector('.w-head') as HTMLElement | null;
    const hrect = head?.getBoundingClientRect() || rect;
    const vw = window.innerWidth, vh = window.innerHeight;
    const M = MARGIN;

    let r = parseFloat(getComputedStyle(el).right);
    if (Number.isNaN(r)) r = vw - rect.right;
    let b = parseFloat(getComputedStyle(el).bottom);
    if (Number.isNaN(b)) b = vh - rect.bottom;

    const maxRight  = Math.max(M, vw - rect.width  - M);
    const maxBottom = Math.max(M, vh - rect.height - M);

    if (hrect.top < M) {
      const delta = (M - hrect.top);
      b = Math.max(M, Math.min(maxBottom, b - delta));
    }
    if (rect.left < M) {
      const deltaL = (M - rect.left);
      r = Math.max(M, Math.min(maxRight, r - deltaL));
    }

    el.style.right = r + 'px';
    el.style.bottom = b + 'px';
  }

    function attachAutoClamp(win: HTMLElement) {
    const anyWin = win as HTMLElement & { __qwsClampObserver?: ResizeObserver };
    if (anyWin.__qwsClampObserver || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => ensureOnScreen(win));
    });
    ro.observe(win);
    anyWin.__qwsClampObserver = ro;
  }
  function resetWinPosDefault(el: HTMLElement) {
    el.style.right = '16px';
    el.style.bottom = '16px';
    ensureOnScreen(el);
  }
  function withTopLocked(el: HTMLElement, mutate: () => void) {
    const before = el.getBoundingClientRect();
    const vh = window.innerHeight;
    let b = parseFloat(getComputedStyle(el).bottom);
    if (Number.isNaN(b)) b = vh - before.bottom;

    mutate();

    requestAnimationFrame(() => {
      const after = el.getBoundingClientRect();
      const deltaTop = after.top - before.top;
      let newBottom = b + deltaTop;
      const maxBottom = Math.max(MARGIN, vh - after.height - MARGIN);
      newBottom = Math.min(Math.max(MARGIN, newBottom), maxBottom);
      el.style.bottom = newBottom + "px";
      ensureOnScreen(el);
    });
  }
  function saveHUDPos() {
    try {
      const r = parseFloat(box.style.right) || 16;
      const b = parseFloat(box.style.bottom) || 16;
      writeAriesPath(HUD_POS_PATH, { r, b });
    } catch {}
  }

  // ---------- Restore HUD ----------
  try {
    const pos = readAriesPath<{ r?: number; b?: number }>(HUD_POS_PATH);
    if (pos && typeof pos.r==='number' && typeof pos.b==='number') {
      box.style.right = pos.r + "px";
      box.style.bottom = pos.b + "px";
    }
    const collapsed = readAriesPath<boolean | string | number>(HUD_COLLAPSED_PATH);
    if (collapsed === true || collapsed === "1" || collapsed === 1) {
      box.classList.add("min");
      const btnMin0 = box.querySelector("#qws2-min") as HTMLButtonElement | null;
      if (btnMin0) btnMin0.textContent = "+";
    }
    const hidden = readAriesPath<boolean | string | number>(HUD_HIDDEN_PATH);
    if (hidden === true || hidden === "1" || hidden === 1) box.classList.add("hidden");
    requestAnimationFrame(() => clampRect(box));
    window.addEventListener("resize", () => clampRect(box));
  } catch {}

  // ---------- HUD elements ----------
  const header = box.querySelector(".drag") as HTMLElement | null;
  const btnMin = box.querySelector("#qws2-min") as HTMLButtonElement | null;
  const btnHide= box.querySelector("#qws2-hide") as HTMLButtonElement | null;
  const sMini  = box.querySelector("#qws2-status-mini") as HTMLElement | null;
  const sFull  = box.querySelector("#qws2-status") as HTMLElement | null;
  const sVersion = box.querySelector("#qws2-version") as HTMLElement | null;
  const launch = box.querySelector("#qws-launch") as HTMLDivElement | null;

  if (!header || !btnMin || !btnHide || !sMini || !sFull || !sVersion || !launch) {
    console.warn("[QuinoaWS] HUD elements missing, abort init");
    return;
  }
  const launchEl: HTMLDivElement = launch;

  const updateHideButtonTitle = () => {
    const pieces: string[] = [];
    if (toggleHotkey) {
      const label = getKeybindLabel(KEY_TOGGLE);
      if (label && label !== "—") pieces.push(label);
    }
    pieces.push("Insert");
    btnHide.title = pieces.length ? `Hide (${pieces.join(" / ")})` : "Hide";
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

  // ---------- Drag HUD ----------
  (function makeDraggable(){
    let sx=0, sy=0, or=0, ob=0, down=false;
    header.addEventListener('mousedown', e => {
      down = true; sx = e.clientX; sy = e.clientY;
      const rect = box.getBoundingClientRect();
      or = parseFloat(getComputedStyle(box).right) || (window.innerWidth - rect.right);
      ob = parseFloat(getComputedStyle(box).bottom) || (window.innerHeight - rect.bottom);
      document.body.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', e => {
      if (!down) return;
      const dx = e.clientX - sx; const dy = e.clientY - sy;
      let r = or - dx; let b = ob - dy;
      const rect = box.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const maxRight  = Math.max(MARGIN, vw - rect.width  - MARGIN);
      const maxBottom = Math.max(MARGIN, vh - rect.height - MARGIN);
      r = Math.min(Math.max(r, MARGIN), maxRight);
      b = Math.min(Math.max(b, MARGIN), maxBottom);
      box.style.right = r + 'px';
      box.style.bottom = b + 'px';
    });
    window.addEventListener('mouseup', () => {
      if (!down) return; down = false; document.body.style.userSelect = '';
      saveHUDPos();
    });
  })();

  // ---------- Controls HUD ----------
  btnMin.onclick = () => {
    withTopLocked(box, () => {
      box.classList.toggle('min');
      btnMin.textContent = box.classList.contains('min') ? '+' : '–';
      try { writeAriesPath(HUD_COLLAPSED_PATH, box.classList.contains('min')); } catch {}
    });
  };
  btnHide.onclick = () => {
    setHUDHidden(true);
  };
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      downCodes.add(e.code);
      updateDragState();

      const t = e.target as HTMLElement | null;
      const editing =
        !!t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
      if (editing) return;

      if (e.repeat) return;

      if (matchesHotkey(e, toggleHotkey)) {
        if (insertDown && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          insertUsedAsModifier = true;
        }
        e.preventDefault();
        toggleHUDHidden();
      }
    },
    true
  );

  window.addEventListener(
    'keyup',
    (e: KeyboardEvent) => {
      downCodes.delete(e.code);
      updateDragState();
    },
    true
  );

  // ========================
  //  Fenêtres modulaires
  // ========================

  type Win = { id: string; el: HTMLElement; head: HTMLElement; body: HTMLElement; };
  const windows = new Map<string, Win>();
  let cascade = 0;

  function openWindow(id: string, title: string, render: PanelRender) {
    if (windows.has(id)) {
      const w = windows.get(id)!;
      w.el.style.display = '';
      bumpZ(w.el);
      setLaunchState(id, true); // button → Close
      return;
    }

    const win = document.createElement('div');
    win.className = 'qws-win';
    win.innerHTML = `
      <div class="w-head">
        <div class="w-title"></div>
        <div class="sp"></div>
        <button class="w-btn" data-act="min" title="Minimize/Expand">–</button>
        <button class="w-btn" data-act="close" title="Close">✕</button>
      </div>
      <div class="w-body"></div>
    `;
    (document.documentElement || document.body).appendChild(win);

    const head = win.querySelector('.w-head') as HTMLElement;
    const titleEl = win.querySelector('.w-title') as HTMLElement;
    const btnMin  = win.querySelector('[data-act="min"]')  as HTMLButtonElement;
    const btnClose= win.querySelector('[data-act="close"]')as HTMLButtonElement;
    const body = win.querySelector('.w-body') as HTMLElement;

    titleEl.textContent = title;

    const offset = (cascade++ % 5) * 24;
    win.style.right  = (16 + offset) + 'px';
    win.style.bottom = (16 + offset) + 'px';
    clampRect(win);
    bumpZ(win);

    (function dragWin(){
      let sx=0, sy=0, or=0, ob=0, down=false;
      head.addEventListener('mousedown', e => {
        const t = e.target as HTMLElement;
        if (t.closest('.w-btn')) return;
        down = true; sx = e.clientX; sy = e.clientY;
        const rect = win.getBoundingClientRect();
        or = parseFloat(getComputedStyle(win).right) || (window.innerWidth - rect.right);
        ob = parseFloat(getComputedStyle(win).bottom) || (window.innerHeight - rect.bottom);
        document.body.style.userSelect = 'none';
        bumpZ(win);
      });
      window.addEventListener('mousemove', e => {
        if (!down) return;
        const dx = e.clientX - sx; const dy = e.clientY - sy;
        let r = or - dx; let b = ob - dy;
        const rect = win.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        const maxRight  = Math.max(MARGIN, vw - rect.width  - MARGIN);
        const maxBottom = Math.max(MARGIN, vh - rect.height - MARGIN);
        r = Math.min(Math.max(r, MARGIN), maxRight);
        b = Math.min(Math.max(b, MARGIN), maxBottom);
        win.style.right = r + 'px';
        win.style.bottom = b + 'px';
      });
      window.addEventListener('mouseup', () => {
        down = false; document.body.style.userSelect = '';
        saveWinPos(id, win);
      });
    })();

    btnMin.onclick = () => {
      withTopLocked(win, () => {
        const hidden = body.style.display === 'none';
        body.style.display = hidden ? '' : 'none';
        btnMin.textContent = hidden ? '–' : '+';
      });
    };
    btnClose.onclick = () => {
      win.style.display = 'none';
      setLaunchState(id, false);
    };

    patchInputsKeyTrap(win);

    try { render(body); } catch (e) { body.textContent = String(e); }

    attachAutoClamp(win);
    requestAnimationFrame(() => ensureOnScreen(win));
    saveWinPos(id, win);
    windows.set(id, { id, el: win, head, body });
    setLaunchState(id, true); // newly opened → Close
  }

  function isShown(el: HTMLElement) { return el.style.display !== 'none'; }

  function toggleWindow(id: string, title: string, render: PanelRender) {
    const existing = windows.get(id);
    if (!existing) {
      openWindow(id, title, (root) => {
        const el = root.closest('.qws-win') as HTMLElement;
        if (el) restoreWinPos(id, el);
        render(root);
      });
      return true;
    } else {
      if (isShown(existing.el)) {
        existing.el.style.display = 'none';
        setLaunchState(id, false);
        return false;
      } else {
        existing.el.style.display = '';
        bumpZ(existing.el);
        ensureOnScreen(existing.el);
        setLaunchState(id, true);
        return true;
      }
    }
  }

  function bumpZ(el: HTMLElement) {
    let maxZ = Z_BASE + 1;
    windows.forEach(w => {
      const z = parseInt(getComputedStyle(w.el).zIndex || String(Z_BASE + 1), 10);
      if (z > maxZ) maxZ = z;
    });
    el.style.zIndex = String(maxZ + 1);
  }

  function saveWinPos(id: string, el: HTMLElement) {
    try {
      const r = parseFloat(el.style.right) || 16;
      const b = parseFloat(el.style.bottom) || 16;
      writeAriesPath(HUD_WIN_PATH(id), { r, b });
    } catch {}
  }
  function restoreWinPos(id: string, el: HTMLElement) {
    try {
      const pos = readAriesPath<{ r?: number; b?: number }>(HUD_WIN_PATH(id));
      if (pos && typeof pos.r === "number") el.style.right = pos.r + "px";
      if (pos && typeof pos.b === "number") el.style.bottom = pos.b + "px";
      ensureOnScreen(el);
    } catch {}
  }

  window.addEventListener('resize', () => {
    windows.forEach(w => ensureOnScreen(w.el));
  });

  // --- Alt+Drag global
  function enableAltDragAnywhere() {
    type State = { el: HTMLElement; sx: number; sy: number; or: number; ob: number };
    let st: State | null = null;

    const pickRoot = (node: EventTarget | null): HTMLElement | null => {
      const el = node as HTMLElement | null;
      if (!el) return null;
      return (el.closest?.('.qws-win, .qws2') as HTMLElement | null) || null;
    };

    const onDown = (e: MouseEvent) => {
      if (!isModifierActive(e) || e.button !== 0) return;
      const root = pickRoot(e.target);
      if (!root || root.style.display === 'none') return;

      const rect = root.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      let or = parseFloat(getComputedStyle(root).right);
      let ob = parseFloat(getComputedStyle(root).bottom);
      if (Number.isNaN(or)) or = vw - rect.right;
      if (Number.isNaN(ob)) ob = vh - rect.bottom;

      st = { el: root, sx: e.clientX, sy: e.clientY, or, ob };
      document.body.style.userSelect = 'none';
      bumpZ(root);
      e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e: MouseEvent) => {
      if (!st) return;
      const dx = e.clientX - st.sx;
      const dy = e.clientY - st.sy;
      let r = st.or - dx;
      let b = st.ob - dy;

      const rect = st.el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const maxRight  = Math.max(MARGIN, vw - rect.width  - MARGIN);
      const maxBottom = Math.max(MARGIN, vh - rect.height - MARGIN);
      r = Math.min(Math.max(r, MARGIN), maxRight);
      b = Math.min(Math.max(b, MARGIN), maxBottom);

      st.el.style.right  = `${r}px`;
      st.el.style.bottom = `${b}px`;
    };

    const stopDrag = () => {
      if (!st) return;
      document.body.style.userSelect = '';
      clampRect(st.el);

      const el = st.el;
      let saved = false;
      windows.forEach((w) => { if (w.el === el && !saved) { saveWinPos(w.id, el); saved = true; } });
      if (!saved && el === box) saveHUDPos();

      st = null;
    };

    const onUp    = () => stopDrag();
    const onKeyUp = (e: KeyboardEvent) => {
      if (!dragHotkey) {
        stopDrag();
        return;
      }
      if (matchesHotkey(e, dragHotkey) || !dragActive) {
        stopDrag();
      }
    };

    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('mousemove', onMove,  true);
    window.addEventListener('mouseup',   onUp,    true);
    window.addEventListener('keyup',     onKeyUp, true);
  }

  // empêche le jeu de capter les touches, sans casser la saisie dans nos inputs
  function patchInputsKeyTrap(scope: HTMLElement) {
  const isEditable = (el: Element | null) => {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      const t = (el.type || '').toLowerCase();
      // keep it strict per your requirement: text & number only (+ search is handy)
      return t === 'text' || t === 'number' || t === 'search';
    }
    return (el as any).isContentEditable === true;
  };

  // Event handler: if focus OR target is an editable inside our HUD/windows, stop propagation
  const handler = (ev: KeyboardEvent) => {
    const target = ev.target as HTMLElement | null;
    const active = document.activeElement as HTMLElement | null;

    // Only consider events that originate within the HUD/windows area
    const inScope = (node: Element | null) =>
      !!(node && (scope.contains(node) || (node as HTMLElement).closest?.('.qws-win') || (node as HTMLElement).closest?.('.qws2')));

    // If neither target nor active element is editable in our UI, let the game handle it
    if (!( (inScope(target) && isEditable(target)) || (inScope(active) && isEditable(active)) )) return;

    // We are typing → stop the event from reaching the game bindings.
    // Do NOT preventDefault so typing works normally in the input itself.
    ev.stopPropagation();
    (ev as any).stopImmediatePropagation?.();
  };

  // Capture phase is enough; no need to also bind bubble phase.
  const types: (keyof WindowEventMap)[] = ['keydown','keypress','keyup'];
  types.forEach(t => {
    window.addEventListener(t, handler as any, { capture: true });
    document.addEventListener(t, handler as any, { capture: true });
    scope.addEventListener(t, handler as any, { capture: true });
  });

  // Optionally return an unsubscribe if you need to detach later
  return () => {
    types.forEach(t => {
      window.removeEventListener(t, handler as any, { capture: true } as any);
      document.removeEventListener(t, handler as any, { capture: true } as any);
      scope.removeEventListener(t, handler as any, { capture: true } as any);
    });
  };
}

  // ---------- Launcher ----------
  const registry: { id: string; title: string; render: PanelRender }[] = [];
  const launchButtons = new Map<string, HTMLButtonElement>();

  function setLaunchState(id: string, open: boolean) {
    const btn = launchButtons.get(id);
    if (!btn) return;
    btn.textContent = open ? 'Close' : 'Open';
    btn.dataset.open = open ? '1' : '0';
    if (open) btn.classList.add('active'); else btn.classList.remove('active');
  }

  function register(id: string, title: string, render: PanelRender) {
    registry.push({ id, title, render });
    addLaunchItem(id, title, render);
  }

  function addLaunchItem(id: string, title: string, render: PanelRender) {
    const item = document.createElement('div');
    item.className = 'launch-item';
    item.innerHTML = `<div class="name">${escapeHtml(title)}</div>`;

    const openBtn = document.createElement('button');
    openBtn.className = 'btn';
    openBtn.textContent = 'Open';
    openBtn.dataset.open = '0';
    launchButtons.set(id, openBtn);

    openBtn.onclick = () => {
      const w = windows.get(id);
      if (w && w.el.style.display !== 'none') {
        w.el.style.display = 'none';
        setLaunchState(id, false);
      } else {
        openWindow(id, title, (root) => {
          const el = root.closest('.qws-win') as HTMLElement;
          if (el) restoreWinPos(id, el);
          render(root);
        });
        setLaunchState(id, true);
      }
    };

    item.appendChild(openBtn);
    (launch as HTMLDivElement).appendChild(item);
  }

  // Permet au code appelant d’enregistrer ses fenêtres (la liste est affichée en permanence)
  try { opts?.onRegister?.(register); } catch {}

  // Ouvre une fenêtre enregistrée depuis n'importe où (ex: widget instant feed)
  window.addEventListener("qws:open-panel", (ev: Event) => {
    const id = String((ev as CustomEvent).detail?.id || "");
    if (!id) return;
    const entry = registry.find((r) => r.id === id);
    if (!entry) return;
    const w = windows.get(id);
    if (w) {
      w.el.style.display = "";
      bumpZ(w.el);
      ensureOnScreen(w.el);
      setLaunchState(id, true);
      return;
    }
    openWindow(id, entry.title, (root) => {
      const el = root.closest(".qws-win") as HTMLElement;
      if (el) restoreWinPos(id, el);
      entry.render(root);
    });
  });

  // Protéger le HUD principal
  patchInputsKeyTrap(box);

  // Active Alt+Drag global
  enableAltDragAnywhere();

  // ---------- Version badge ----------
  (function initVersionBadge() {
    const setBadge = (text: string, cls: "ok" | "warn" | "bad") => {
      sVersion.textContent = text;
      tag(sVersion, cls);
    };

    const setDownloadTarget = (url?: string | null) => {
      if (url) {
        sVersion.dataset.download = url;
        sVersion.style.cursor = "pointer";
        sVersion.title = `Download the new version`;
      } else {
        delete sVersion.dataset.download;
        sVersion.style.removeProperty("cursor");
        sVersion.removeAttribute("title");
      }
    };

    setBadge("checking…", "warn");
    setDownloadTarget(null);

    const openDownloadLink = (url: string) => {
      const shouldUseGM = isDiscordSurface();
      const gmObject = (globalThis as typeof globalThis & {
        GM?: { openInTab?: typeof GM_openInTab };
      }).GM;
      const gmOpen =
        typeof GM_openInTab === "function"
          ? GM_openInTab
          : typeof gmObject?.openInTab === "function"
            ? gmObject.openInTab.bind(gmObject)
            : null;

      if (shouldUseGM && gmOpen) {
        try {
          gmOpen(url, { active: true, setParent: true });
          return;
        } catch (error) {
          console.warn("[MagicGarden] GM_openInTab failed, falling back to window.open", error);
        }
      }

      window.open(url, "_blank", "noopener,noreferrer");
    };

    sVersion.addEventListener("click", () => {
      const url = sVersion.dataset.download;
      if (url) {
        openDownloadLink(url);
      }
    });

    (async () => {
      const localVersion = getLocalVersion();

      try {
        const remoteData = await fetchRemoteVersion();
        const remoteVersion = remoteData?.version?.trim();

        if (!remoteVersion) {
          if (localVersion) {
            setBadge(localVersion, "warn");
          } else {
            setBadge("version inconnue", "warn");
          }
          return;
        }

        if (!localVersion) {
          setBadge(remoteVersion, "warn");
          setDownloadTarget(remoteData?.download || null);
          return;
        }

        if (localVersion === remoteVersion) {
          setBadge(localVersion, "ok");
          setDownloadTarget(null);
          return;
        }

        setBadge(`${localVersion} → ${remoteVersion}`, "warn");
        setDownloadTarget(remoteData?.download || null);
      } catch (error) {
        console.error("[MagicGarden] Failed to check version:", error);
        if (localVersion) {
          setBadge(localVersion, "warn");
        } else {
          setBadge("Unknown", "warn");
        }
      }
    })();
  })();

  (async () => { try { await ensureStore(); } catch {} })();

  // ---------- Status loop ----------
  let warmupState = getSpriteWarmupState();

  const updateStatus = () => {
    if (!warmupState.completed) {
      const total = warmupState.total;
      const done = warmupState.done;
      const progressText = total > 0 ? `${done}/${total}` : `${done}`;
      const summary = total > 0 ? `Sprites warming: ${progressText}` : "Sprites warming up";
      sFull!.textContent = `Sprites ${progressText}`;
      sFull!.title = summary;
      tag(sFull!, "warn");
      sFull!.style.display = "";

      sMini!.textContent = progressText;
      sMini!.title = summary;
      tag(sMini!, "warn");
      sMini!.style.display = "";
      return;
    }

    const wsStatus = getWSStatus();
    const storeStatus = getStoreStatus();

    const isStoreMissing = storeStatus.message === 'store none';
    const isWsMissing = wsStatus.level === 'bad';
    const level: StatusLevel =
      isStoreMissing && isWsMissing
        ? 'bad'
        : wsStatus.level === 'ok' && storeStatus.level === 'ok'
          ? 'ok'
          : 'warn';

    const summary = `${wsStatus.message}, ${storeStatus.message}`;
    sFull!.textContent = "status";
    sFull!.title = summary;
    tag(sFull!, level);
    sFull!.style.display = "";

    const miniText = level === 'ok' ? 'OK' : level === 'warn' ? 'WARN' : 'ISSUES';
    sMini!.textContent = miniText;
    sMini!.title = summary;
    tag(sMini!, level);
    if (level === "ok") {
      sMini!.style.display = "none";
    } else {
      sMini!.style.display = "";
    }
  };

  const offWarmup = onSpriteWarmupProgress((state) => {
    warmupState = state;
    updateStatus();
  });

  setInterval(updateStatus, 800);

  function getOpenPageWS(): WebSocket {
    for (let i=0;i<sockets.length;i++){
      if (sockets[i].readyState === NativeWS.OPEN) return sockets[i];
    }
    throw new Error('no page ws');
  }

  type StatusLevel = 'ok' | 'warn' | 'bad';

  interface StatusInfo {
    level: StatusLevel;
    message: string;
  }

  function getWSStatus(): StatusInfo {
    try {
      getOpenPageWS();
      return { level: 'ok', message: 'ws open' };
    } catch {
      const viaWorker = !!(window as any).__QWS_workerFound || workerFound;
      if (viaWorker) {
        return { level: 'ok', message: 'ws via worker' };
      }
      return { level: 'bad', message: 'ws none' };
    }
  }

  function getStoreStatus(): StatusInfo {
    try {
      const captured = isStoreCaptured();
      const info = getCapturedInfo();
      if (captured) {
        return { level: 'ok', message: `store ${info.via || 'ready'}` };
      }
      if ((info as any).via === 'polyfill' || (info as any).polyfill) {
        return { level: 'warn', message: 'store polyfill' };
      }
      return { level: 'bad', message: 'store none' };
    } catch {
      return { level: 'bad', message: 'store error' };
    }
  }

  function tag(el: Element, cls?: "ok" | "warn" | "bad") {
    el.classList.remove("ok","warn","bad");
    if (cls) el.classList.add(cls);
  }

  (box as any).__cleanup__ = (() => {
    const prev = (box as any).__cleanup__;
    return () => {
      offWarmup?.();
      if (typeof prev === "function") prev();
    };
  })();

  function escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]!));
  }
}

export function initWatchers(){
    installShopKeybindsOnce();
    installSellKeybindsOnce();
    installPetHutchKeybindsOnce();
    installGameKeybindsOnce();
    installJournalKeybindsOnce();
    installSeedSiloKeybindsOnce();
    installDecorShedKeybindsOnce();
    installFeedingTroughKeybindsOnce();

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
        try { setTeamsForHotkeys(PetsService.getTeams()); } catch {}
        try {
          await PetsService.onTeamsChangeNow((teams) => {
            try { setTeamsForHotkeys(teams); } catch {}
          });
        } catch {}
        try {
          installPetTeamHotkeysOnce(async (teamId) => {
            try { await PetsService.useTeam(teamId); }
            catch (e) { console.warn("[Pets] hotkey useTeam failed:", e); }
          });
        } catch {}
      try { await PetsService.startAbilityLogsWatcher(); } catch {}
      try { await startActivityLogHistoryWatcher(); } catch {}
      startActivityLogFilter();
      setupBuyAll()
      startReorderObserver();
      startCropValuesObserverFromGardenAtom();
      startCropValueOverlayInPixi();
      startSellCropsLockWatcher();
      startDecorPickupLockIndicator();
      startEggHatchLockIndicator();
      startInjectSellAllPets();
      startInstantFeedWidget();
      startSelectedInventoryQuantityLogger();
      startInventorySortingObserver();
      startModalObserver({ intervalMs: 60_000, log: true });
  })();
}
