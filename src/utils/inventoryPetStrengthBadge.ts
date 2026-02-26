// src/utils/inventoryPetStrengthBadge.ts

import { Atoms, myPetHutchPetItems } from "../store/atoms";
import { getPetMaxStrength, getPetStrength } from "./petCalcul";
import { readSharedGlobal, shareGlobal } from "./page-context";

const GLOBAL_FLAG = "__qws_inv_pet_strength_badge_started";
const DEBUG_FLAG = "__qws_inv_pet_strength_badge_debug";
const POLL_INTERVAL_MS = 400;
const RESOLVE_INTERVAL_MS = 1000;
const ALWAYS_SYNC = true;
const PET_CACHE_INTERVAL_MS = 1200;

const LEVEL_TEXT_RE = /^(?:STR\s*)?(\d{1,4})(?:\s*\/\s*(\d{1,4}))?$/i;
const ITEM_VIEW_ID_RE = /InventoryItemView\s*[([:]*\s*([\w-]{6,})\s*[)\]]?/i;

type Bounds = { x: number; y: number; width: number; height: number };

let started = false;
let inventoryModalOpen = false;
let activeModalId: string | null = null;
let syncTimer: number | null = null;
let resolveTimer: number | null = null;
let lastInventoryOpen: boolean | null = null;
let lastVisualCount = -1;
let lastMissingCount = -1;
let overlayLayer: any | null = null;
const overlayMap = new Map<any, any>();
let tickerAttached = false;
const trackedNodes = new Map<any, string>();
let petCacheTimer: number | null = null;
let petById = new Map<string, { strength: number; maxStrength: number }>();

function isDebugEnabled(): boolean {
  const shared = readSharedGlobal<boolean>(DEBUG_FLAG);
  if (typeof shared === "boolean") return shared;
  return (globalThis as any)[DEBUG_FLAG] === true;
}

function debugLog(...args: any[]): void {
  if (!isDebugEnabled()) return;
  console.log("[InvPetSTR]", ...args);
}

function isInventoryOpen(): boolean {
  return inventoryModalOpen || activeModalId === "inventory";
}

function resolvePixiApp(): any | null {
  const g = globalThis as any;
  const getShared = (key: string) => readSharedGlobal<any>(key) ?? g[key];
  const spriteState = getShared("__MG_SPRITE_STATE__");
  const quinoaEngine = getShared("__QUINOA_ENGINE__") ?? getShared("magiccircle_quinoaEngine");
  return (
    spriteState?.app ||
    getShared("__PIXI_APP__") ||
    getShared("PIXI_APP") ||
    getShared("app") ||
    quinoaEngine?.app ||
    null
  );
}

function getChildren(node: any): any[] | null {
  if (!node) return null;
  const a = node.children;
  if (Array.isArray(a) && a.length) return a;
  const b = (node as any).renderLayerChildren;
  if (Array.isArray(b) && b.length) return b;
  const c = (node as any).renderGroupChildren;
  if (Array.isArray(c) && c.length) return c;
  return null;
}

function safeBounds(node: any): Bounds | null {
  if (!node || typeof node.getBounds !== "function") return null;
  try {
    const b = node.getBounds(true);
    if (!b || !Number.isFinite(b.width) || !Number.isFinite(b.height)) return null;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {
    return null;
  }
}

function ensureOverlayLayer(app: any): any | null {
  if (overlayLayer && overlayLayer.parent) return overlayLayer;
  if (!app?.stage) return null;
  const P = app?.renderer?.PIXI ?? (globalThis as any).PIXI;
  const Container = P?.Container ?? app.stage.constructor;
  if (!Container) return null;
  overlayLayer = new Container();
  overlayLayer.label = "__qws_inv_pet_strength_overlay";
  overlayLayer.eventMode = "none";
  overlayLayer.sortableChildren = true;
  overlayLayer.zIndex = 999999;
  overlayLayer.renderable = true;
  overlayLayer.visible = true;
  try { app.stage.sortableChildren = true; } catch {}
  try { app.stage.addChild(overlayLayer); } catch {}
  return overlayLayer;
}

function cloneStyle(src: any): any {
  if (!src) return undefined;
  if (src.style) return src.style;
  if (src._style) return src._style;
  return undefined;
}

function createOverlayText(sourceNode: any, text: string): any | null {
  const app = resolvePixiApp();
  if (!app?.stage) return null;
  const P = app?.renderer?.PIXI ?? (globalThis as any).PIXI;
  const TextCtor = sourceNode?.constructor ?? P?.Text;
  const FallbackCtor = P?.Text;
  if (!TextCtor && !FallbackCtor) return null;
  let overlay: any;
  try {
    if (TextCtor) overlay = new TextCtor(text, cloneStyle(sourceNode));
  } catch {}
  if (!overlay && FallbackCtor && FallbackCtor !== TextCtor) {
    try {
      overlay = new FallbackCtor(text, cloneStyle(sourceNode));
    } catch {}
  }
  if (!overlay) return null;
  overlay.label = "__qws_inv_pet_strength_text";
  overlay.eventMode = "none";
  overlay.renderable = true;
  overlay.visible = true;
  overlay.zIndex = 999999;
  try { overlay.anchor?.set?.(0, 0); } catch {}
  try {
    if (sourceNode?.scale && overlay.scale?.set) {
      overlay.scale.set(sourceNode.scale.x ?? 1, sourceNode.scale.y ?? 1);
    }
  } catch {}
  return overlay;
}

function ensureOverlayFor(node: any, text: string): any | null {
  const layer = ensureOverlayLayer(resolvePixiApp());
  if (!layer) return null;
  let overlay = overlayMap.get(node);
  if (!overlay || overlay.destroyed) {
    overlay = createOverlayText(node, text);
    if (!overlay) return null;
    layer.addChild(overlay);
    overlayMap.set(node, overlay);
  } else if (String(overlay.text) !== text) {
    overlay.text = text;
    try { overlay.updateText?.(); } catch {}
  }
  return overlay;
}

function collectTextNodes(root: any): any[] {
  const out: any[] = [];
  const stack: any[] = [root];
  const seen = new Set<any>();

  while (stack.length) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);

    const text = (node as any).text;
    if (typeof text === "string" || typeof text === "number") {
      out.push(node);
    }

    const kids = getChildren(node);
    if (Array.isArray(kids)) {
      for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
    }
  }

  return out;
}

function isTargetVisualLabel(label: string): boolean {
  if (!label) return false;
  if (label === "InventoryItemVisual") return true;
  if (label.includes("Hutch") && (label.includes("ItemVisual") || label.includes("ItemView"))) {
    return true;
  }
  if (label.includes("PetHutch") && label.includes("Item")) return true;
  return false;
}

function findInventoryVisuals(stage: any): any[] {
  if (!stage) return [];
  const out: any[] = [];
  const stack: any[] = [stage];
  const seen = new Set<any>();

  while (stack.length) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);

    const label = String((node as any).label ?? (node as any).name ?? "");
    if (isTargetVisualLabel(label)) out.push(node);

    const kids = getChildren(node);
    if (Array.isArray(kids)) {
      for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
    }
  }

  return out;
}

function parseLevelText(text: string): { current: number; max: number | null } | null {
  const m = LEVEL_TEXT_RE.exec(text.trim());
  if (!m) return null;
  const current = Number(m[1]);
  if (!Number.isFinite(current)) return null;
  const max = m[2] != null ? Number(m[2]) : null;
  return {
    current,
    max: Number.isFinite(max as number) ? (max as number) : null,
  };
}

function pickLevelTextNode(visual: any): any | null {
  const itemBounds = safeBounds(visual);
  if (!itemBounds) return null;

  const texts = collectTextNodes(visual);
  let best: { node: any; area: number } | null = null;
  let fallback: { node: any; area: number } | null = null;

  for (const node of texts) {
    const raw = String((node as any).text ?? "");
    if (!parseLevelText(raw)) continue;

    const b = safeBounds(node);
    if (!b) continue;

    const relX = (b.x - itemBounds.x) / itemBounds.width;
    const relY = (b.y - itemBounds.y) / itemBounds.height;
    const area = b.width * b.height;

    if (!fallback || area < fallback.area) fallback = { node, area };

    if (relX < -0.1 || relY < -0.1) continue;
    if (relX > 0.55 || relY > 0.55) continue;
    if (b.width > itemBounds.width * 0.6) continue;

    if (!best || area < best.area) best = { node, area };
  }

  return best?.node ?? fallback?.node ?? null;
}

function getItemIdFromVisual(visual: any): string | null {
  let cur: any = visual;
  for (let i = 0; i < 10 && cur; i += 1) {
    const label = String(cur.label ?? cur.name ?? "").trim();
    if (label) {
      const m = ITEM_VIEW_ID_RE.exec(label);
      if (m?.[1]) return m[1];
    }
    const directId = (cur as any)?.itemId ?? (cur as any)?.id;
    if (typeof directId === "string" && directId.trim()) return directId.trim();
    cur = cur.parent;
  }
  return null;
}

function getStrengthDisplayForId(id: string): string | null {
  const info = petById.get(id);
  if (!info) return null;
  const current = Math.round(info.strength);
  const max = Math.round(info.maxStrength);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return null;
  if (current >= max) return String(current);
  return `${current}/${max}`;
}

function applyLevelText(node: any, next: string): boolean {
  if (!node || !next) return false;
  const raw = String(node?.text ?? "");
  if (raw !== next) {
    try {
      node.text = next;
      try { node.updateText?.(); } catch {}
      try { node.invalidate?.(); } catch {}
    } catch {}
  }
  if (String(node?.text ?? "") === next) return true;

  // Fallback: some text nodes are not mutable in place. Use overlay as a last resort.
  const overlay = ensureOverlayFor(node, next);
  return !!overlay;
}

function syncOnce(app: any): void {
  if (!app?.stage) return;
  const open = isInventoryOpen();
  if (open !== lastInventoryOpen) {
    lastInventoryOpen = open;
    debugLog("inventory open:", open);
  }
  if (!open && !ALWAYS_SYNC) return;

  const visuals = findInventoryVisuals(app.stage);
  if (visuals.length !== lastVisualCount) {
    lastVisualCount = visuals.length;
    debugLog("InventoryItemVisual count:", visuals.length);
  }
  if (!visuals.length) return;

  let found = 0;
  let updated = 0;
  let missing = 0;
  const seen = new Set<any>();

  for (const visual of visuals) {
    const node = pickLevelTextNode(visual);
    if (!node) {
      missing += 1;
      continue;
    }
    const itemId = getItemIdFromVisual(visual);
    if (!itemId) {
      missing += 1;
      continue;
    }
    const display = getStrengthDisplayForId(itemId);
    if (!display) {
      missing += 1;
      continue;
    }
    found += 1;
    if (applyLevelText(node, display)) updated += 1;
    seen.add(node);
    trackedNodes.set(node, itemId);
    const b = safeBounds(node);
    const overlay = overlayMap.get(node);
    if (b && overlay) {
      overlay.position.set(b.x, b.y);
    }
  }

  // Cleanup overlays for missing nodes
  for (const [node, overlay] of Array.from(overlayMap.entries())) {
    if (seen.has(node)) continue;
    try { overlay.destroy?.(); } catch {}
    overlayMap.delete(node);
  }

  // Prune tracked nodes that vanished or no longer match
  for (const node of Array.from(trackedNodes.keys())) {
    if (!seen.has(node) || node?.destroyed || !node?.parent) {
      trackedNodes.delete(node);
    }
  }

  if (missing !== lastMissingCount || updated > 0) {
    lastMissingCount = missing;
    debugLog("sync", { visuals: visuals.length, found, updated, missing });
  }
}

function startSyncLoop(app: any): void {
  if (syncTimer) return;
  debugLog("start sync loop");
  syncTimer = window.setInterval(() => syncOnce(app), POLL_INTERVAL_MS);
}

function startTickerLoop(app: any): void {
  if (tickerAttached) return;
  const ticker = app?.ticker ?? app?.renderer?.ticker;
  if (!ticker || typeof ticker.add !== "function") return;
  debugLog("attach ticker loop");
  tickerAttached = true;
  ticker.add(() => {
    if (!ALWAYS_SYNC && !isInventoryOpen()) return;
    if (!trackedNodes.size) return;

    const toRemove: any[] = [];
    for (const [node, itemId] of trackedNodes.entries()) {
      if (!node || node.destroyed || !node.parent) {
        toRemove.push(node);
        continue;
      }
      const display = getStrengthDisplayForId(itemId);
      if (!display) continue;
      applyLevelText(node, display);
    }
    for (const node of toRemove) trackedNodes.delete(node);
  });
}

async function refreshPetCache(): Promise<void> {
  try {
    const rawInv = await Atoms.inventory.myInventory.get();
    const rawHutch = await myPetHutchPetItems.get().catch(() => []);
    const items = Array.isArray((rawInv as any)?.items)
      ? (rawInv as any).items
      : Array.isArray(rawInv)
      ? rawInv
      : [];
    const hutchItems = Array.isArray(rawHutch) ? rawHutch : [];
    const next = new Map<string, { strength: number; maxStrength: number }>();
    const all = items.concat(hutchItems);
    for (const item of all) {
      if (!item || typeof item !== "object") continue;
      const type = typeof (item as any).itemType === "string" ? (item as any).itemType : "";
      const isPet = type === "Pet" || (item as any).pet || (item as any).slot;
      if (!isPet) continue;
      const id =
        String((item as any).id ?? (item as any).pet?.id ?? (item as any).slot?.id ?? "").trim();
      if (!id) continue;
      const source = (item as any).pet ?? (item as any).slot ?? item;
      const petSpecies =
        source?.petSpecies ??
        source?.data?.petSpecies ??
        source?.species ??
        source?.name ??
        "";
      if (!petSpecies) continue;
      const petLike = {
        petSpecies: String(petSpecies),
        xp: Number(source?.xp ?? source?.data?.xp ?? 0),
        targetScale: Number(source?.targetScale ?? source?.data?.targetScale ?? 1),
      };
      const maxStrength = getPetMaxStrength(petLike);
      if (!Number.isFinite(maxStrength) || maxStrength <= 0) continue;
      const strength = getPetStrength(petLike);
      next.set(id, { strength, maxStrength });
    }
    petById = next;
    debugLog("pet cache", { pets: petById.size });
  } catch {}
}

function startPetCacheLoop(): void {
  if (petCacheTimer) return;
  refreshPetCache().catch(() => {});
  petCacheTimer = window.setInterval(() => {
    refreshPetCache().catch(() => {});
  }, PET_CACHE_INTERVAL_MS);
}

function stopResolveLoop(): void {
  if (resolveTimer) {
    clearInterval(resolveTimer);
    resolveTimer = null;
    debugLog("stop resolve loop");
  }
}

function startResolveLoop(): void {
  if (resolveTimer) return;
  debugLog("start resolve loop");
  resolveTimer = window.setInterval(() => {
    const app = resolvePixiApp();
    if (!app) return;
    stopResolveLoop();
    startSyncLoop(app);
    startTickerLoop(app);
  }, RESOLVE_INTERVAL_MS);
}

function attachModalWatchers(): void {
  const setActiveModal = (value: unknown) => {
    const next = typeof value === "string" ? value : null;
    if (next !== activeModalId) {
      activeModalId = next;
      debugLog("activeModal:", activeModalId);
      if (activeModalId) {
        refreshPetCache().catch(() => {});
        const app = resolvePixiApp();
        if (app) syncOnce(app);
      }
    }
  };

  const setInventoryModal = (value: unknown) => {
    const next = value === true;
    if (next !== inventoryModalOpen) {
      inventoryModalOpen = next;
      debugLog("inventoryModalIsActive:", inventoryModalOpen);
      if (inventoryModalOpen) {
        refreshPetCache().catch(() => {});
        const app = resolvePixiApp();
        if (app) syncOnce(app);
      }
    }
  };

  void (async () => {
    try { setActiveModal(await Atoms.ui.activeModal.get()); } catch {}
    try { await Atoms.ui.activeModal.onChange((next) => setActiveModal(next)); } catch {}
    try { setInventoryModal(await Atoms.ui.inventoryModalIsActive.get()); } catch {}
    try { await Atoms.ui.inventoryModalIsActive.onChange((next) => setInventoryModal(next)); } catch {}
  })();
}

export function startInventoryPetStrengthBadge(): void {
  if (typeof document === "undefined") return;
  const win = globalThis as any;
  const alreadyStarted = readSharedGlobal<boolean>(GLOBAL_FLAG) ?? win[GLOBAL_FLAG];
  if (alreadyStarted) return;
  win[GLOBAL_FLAG] = true;
  try { shareGlobal(GLOBAL_FLAG, true); } catch {}
  if (started) return;
  started = true;

  debugLog("startInventoryPetStrengthBadge");
  attachModalWatchers();
  startPetCacheLoop();

  const app = resolvePixiApp();
  if (app) {
    debugLog("pixi app resolved");
    startSyncLoop(app);
    startTickerLoop(app);
  } else {
    debugLog("pixi app not ready, polling");
    startResolveLoop();
  }
}

try {
  shareGlobal("QWS_startInventoryPetStrengthBadge", startInventoryPetStrengthBadge);
  shareGlobal("QWS_enableInventoryPetStrengthBadgeDebug", (value: unknown = true) => {
    const on = value !== false;
    shareGlobal(DEBUG_FLAG, on);
    return on;
  });
  shareGlobal("QWS_forceInventoryPetStrengthBadgeSync", () => {
    const app = resolvePixiApp();
    if (!app) return { ok: false, reason: "no app" };
    syncOnce(app);
    if (!syncTimer) startSyncLoop(app);
    return { ok: true };
  });
  shareGlobal("QWS_debugInventoryPetStrengthBadge", () => {
    const app = resolvePixiApp();
    const visuals = app?.stage ? findInventoryVisuals(app.stage) : [];
    return {
      started,
      inventoryModalOpen,
      activeModalId,
      syncTimer: !!syncTimer,
      resolveTimer: !!resolveTimer,
      tickerAttached,
      appReady: !!app,
      visuals: visuals.length,
      inventoryOpen: isInventoryOpen(),
      petCache: petById.size,
    };
  });
} catch {}
