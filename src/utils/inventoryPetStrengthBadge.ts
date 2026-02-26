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
const NON_MAX_SCALE = 0.86;
const MAX_LEVEL_SCALE = 0.92;
const LEVEL_TEXT_RE = /^(?:STR\s*)?(\d{1,4})(?:\s*\/\s*(\d{1,4}))?(?:\s*MAX)?$/i;
const QUANTITY_TEXT_RE = /^[x\u00D7]\s*\d[\d,\.]*$/i;
const ITEM_VIEW_ID_RE =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const SLOT_LABEL_RE = /\bslot-\d+\b/i;
const SLOT_LABEL_NAME_RE = /(?:^|\b)(.+?)\s+slot-\d+\b/i;
const SLOT_INDEX_RE = /slot-(\d+)/i;
const INVENTORY_LABEL_RE = /(InventoryItemVisual|InventoryItemView|InventoryCardVisual|InventorySelectedItemLayer)/i;
const PET_LABEL_RE = /pet/i;
const PET_SLOTS_CONTAINER_RE = /PetSlots/i;

type Bounds = { x: number; y: number; width: number; height: number };
type VisualContext = {
  slotName: string | null;
  slotIndex: number | null;
  hasSlot: boolean;
  hasPet: boolean;
  hasInventory: boolean;
  inPetSlots: boolean;
};

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
const scaleCache = new Map<any, { x: number; y: number }>();
let tickerAttached = false;
const trackedNodes = new Map<any, { id: string; gen: number }>();
let syncGeneration = 0;
let petCacheTimer: number | null = null;
let petById = new Map<string, { strength: number; maxStrength: number }>();
let petIdSet = new Set<string>();
let petLabelSet = new Set<string>();
let inventoryItemsSnapshot: any[] = [];

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



function applyLevelScale(node: any, isMax: boolean): void {
  if (!node?.scale) return;
  if (!scaleCache.has(node)) {
    scaleCache.set(node, { x: Number(node.scale.x ?? 1), y: Number(node.scale.y ?? 1) });
  }
  const base = scaleCache.get(node) ?? { x: 1, y: 1 };
  const mult = isMax ? MAX_LEVEL_SCALE : NON_MAX_SCALE;
  if (node.scale?.set) {
    node.scale.set(base.x * mult, base.y * mult);
  } else {
    node.scale.x = base.x * mult;
    node.scale.y = base.y * mult;
  }
}

function restoreScale(node: any): void {
  const base = scaleCache.get(node);
  if (!base || !node?.scale) return;
  if (node.scale?.set) node.scale.set(base.x, base.y);
  else {
    node.scale.x = base.x;
    node.scale.y = base.y;
  }
  scaleCache.delete(node);
}

function cleanupNode(node: any): void {
  const overlay = overlayMap.get(node);
  restoreScale(node);
  if (overlay) {
    try { overlay.destroy?.(); } catch {}
    overlayMap.delete(node);
  }
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

function normalizePetLabel(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, " ").toLowerCase();
}

function addPetLabel(set: Set<string>, value: unknown): void {
  const norm = normalizePetLabel(value);
  if (norm) set.add(norm);
}

function buildPetLike(source: any, labels: Set<string>): { petSpecies: string; xp: number; targetScale: number } | null {
  if (!source || typeof source !== "object") return null;
  const petSpecies =
    source?.petSpecies ??
    source?.data?.petSpecies ??
    source?.species ??
    source?.name ??
    "";
  if (!petSpecies) return null;
  addPetLabel(labels, source?.name ?? source?.petName ?? source?.slot?.name);
  addPetLabel(labels, petSpecies);
  return {
    petSpecies: String(petSpecies),
    xp: Number(source?.xp ?? source?.data?.xp ?? 0),
    targetScale: Number(source?.targetScale ?? source?.data?.targetScale ?? 1),
  };
}

function getVisualContext(visual: any): VisualContext {
  let slotName: string | null = null;
  let slotIndex: number | null = null;
  let hasSlot = false;
  let hasPet = false;
  let hasInventory = false;
  let inPetSlots = false;
  let cur: any = visual;

  for (let i = 0; i < 12 && cur; i += 1) {
    const label = String(cur.label ?? cur.name ?? "").trim();
    if (label) {
      if (!slotName) {
        const m = SLOT_LABEL_NAME_RE.exec(label);
        if (m?.[1]) slotName = m[1].trim();
      }
      if (slotIndex == null) {
        const m = SLOT_INDEX_RE.exec(label);
        if (m?.[1]) {
          const idx = Number(m[1]);
          if (Number.isFinite(idx) && idx >= 0) slotIndex = idx;
        }
      }
      if (!hasSlot && SLOT_LABEL_RE.test(label)) hasSlot = true;
      if (!hasPet && PET_LABEL_RE.test(label)) hasPet = true;
      if (!hasInventory && INVENTORY_LABEL_RE.test(label)) hasInventory = true;
      if (!inPetSlots && PET_SLOTS_CONTAINER_RE.test(label)) inPetSlots = true;
    }
    cur = cur.parent;
  }

  return { slotName, slotIndex, hasSlot, hasPet, hasInventory, inPetSlots };
}

function isAllowedContext(ctx: VisualContext): boolean {
  if (ctx.hasInventory || ctx.hasPet) return true;
  if (ctx.hasSlot) return false;
  return true;
}

function isNonPetInventorySlot(slotIndex: number | null): boolean {
  if (slotIndex == null) return false;
  const item = inventoryItemsSnapshot?.[slotIndex];
  if (!item || typeof item !== "object") return false;
  const type = String((item as any).itemType ?? (item as any).data?.itemType ?? "");
  if (!type) return false;
  return type !== "Pet";
}

function isTargetVisualLabel(label: string): boolean {
  if (!label) return false;
  if (label === "InventoryItemVisual") return true;
  if (label.includes("Hutch") && (label.includes("ItemVisual") || label.includes("ItemView"))) {
    return true;
  }
  if (label.includes("PetHutch") && label.includes("Item")) return true;
  if (label.includes("Pet") && /(Slot|Card|View|Visual)/i.test(label)) return true;
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


function isQuantityTextValue(raw: string): boolean {
  return QUANTITY_TEXT_RE.test(raw);
}

function collectQuantityTextBounds(root: any): Bounds[] {
  const out: Bounds[] = [];
  const stack: any[] = [root];
  const seen = new Set<any>();
  while (stack.length) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);

    const text = (node as any).text;
    if (typeof text === "string" || typeof text === "number") {
      const raw = String(text ?? "").trim();
      if (raw && isQuantityTextValue(raw)) {
        const b = safeBounds(node);
        if (b) out.push(b);
      }
    }

    const kids = getChildren(node);
    if (Array.isArray(kids)) {
      for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
    }
  }
  return out;
}

function intersects(a: Bounds, b: Bounds): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

function pickLevelTextNode(texts: any[], itemBounds: Bounds): any | null {
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

function getItemIdFromVisual(visual: any, allowed?: Set<string>): string | null {
  let cur: any = visual;
  for (let i = 0; i < 10 && cur; i += 1) {
    const label = String(cur.label ?? cur.name ?? "").trim();
    if (label) {
      const m = ITEM_VIEW_ID_RE.exec(label);
      if (m?.[1]) {
        const id = m[1];
        if (!allowed || allowed.has(id)) return id;
      }
    }
    const directId = (cur as any)?.itemId;
    if (typeof directId === "string" && directId.trim()) {
      const id = directId.trim();
      if (!allowed || allowed.has(id)) return id;
    }
    cur = cur.parent;
  }
  return null;
}

function getStrengthDisplayForId(id: string): { current: number; max: number; isMax: boolean } | null {
  const info = petById.get(id);
  if (!info) return null;
  const current = Math.round(info.strength);
  const max = Math.round(info.maxStrength);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return null;
  return { current, max, isMax: current >= max };
}

function matchesDisplayedStrength(node: any, info: { current: number; max: number }): boolean {
  const raw = String(node?.text ?? "").trim();
  const parsed = parseLevelText(raw);
  if (!parsed) return false;
  const cur = parsed.current;
  const max = parsed.max;
  const within = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;
  if (within(cur, info.current)) return true;
  if (Number.isFinite(max as number) && within(max as number, info.max)) return true;
  return false;
}

function applyLevelText(node: any, next: string, allowOverlay = true): boolean {
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

  if (!allowOverlay) return false;
  // Fallback: some text nodes are not mutable in place. Use overlay as a last resort.
  const overlay = ensureOverlayFor(node, next);
  return !!overlay;
}

function applyLevelDisplay(node: any, info: { current: number; max: number; isMax: boolean }): boolean {
  const text = info.isMax ? `${info.current} MAX` : `${info.current}/${info.max}`;
  const ok = applyLevelText(node, text, true);
  applyLevelScale(node, info.isMax);
  const overlay = overlayMap.get(node);
  if (overlay) applyLevelScale(overlay, info.isMax);
  return ok;
}

function syncOnce(app: any): void {
  if (!app?.stage) return;
  syncGeneration += 1;
  const gen = syncGeneration;
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
  const quantityBounds = open ? [] : collectQuantityTextBounds(app.stage);

  let found = 0;
  let updated = 0;
  let missing = 0;
  const seen = new Set<any>();

  for (const visual of visuals) {
    const ctx = getVisualContext(visual);
    if (!isAllowedContext(ctx)) {
      missing += 1;
      continue;
    }
    if (!open && !ctx.inPetSlots && isNonPetInventorySlot(ctx.slotIndex)) {
      missing += 1;
      continue;
    }
    if (ctx.slotName && petLabelSet.size > 0) {
      const norm = normalizePetLabel(ctx.slotName);
      if (!norm || !petLabelSet.has(norm)) {
        missing += 1;
        continue;
      }
    }

    const itemId = getItemIdFromVisual(visual, petIdSet);
    if (!itemId) {
      missing += 1;
      continue;
    }
    const display = getStrengthDisplayForId(itemId);
    if (!display) {
      missing += 1;
      continue;
    }

    const visualBounds = safeBounds(visual);
    if (!visualBounds) {
      missing += 1;
      continue;
    }
    if (quantityBounds.length) {
      let hitQty = false;
      for (const qb of quantityBounds) {
        if (intersects(qb, visualBounds)) {
          hitQty = true;
          break;
        }
      }
      if (hitQty) {
        missing += 1;
        continue;
      }
    }

    const texts = collectTextNodes(visual);
    if (!texts.length) {
      missing += 1;
      continue;
    }
    let hasQty = false;
    for (const t of texts) {
      const raw = String((t as any).text ?? "").trim();
      if (raw && isQuantityTextValue(raw)) {
        hasQty = true;
        break;
      }
    }
    if (hasQty) {
      missing += 1;
      continue;
    }

    const node = pickLevelTextNode(texts, visualBounds);
    if (!node) {
      missing += 1;
      continue;
    }
    if (!matchesDisplayedStrength(node, display)) {
      missing += 1;
      continue;
    }

    found += 1;
    if (applyLevelDisplay(node, display)) updated += 1;
    seen.add(node);
    trackedNodes.set(node, { id: itemId, gen });
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
  for (const node of Array.from(scaleCache.keys())) {
    if (seen.has(node)) continue;
    restoreScale(node);
  }
  // Prune tracked nodes that vanished or no longer match
  for (const [node, entry] of Array.from(trackedNodes.entries())) {
    if (entry.gen !== gen || !seen.has(node) || node?.destroyed || !node?.parent) {
      cleanupNode(node);
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
    for (const [node, entry] of trackedNodes.entries()) {
      if (!node || node.destroyed || !node.parent) {
        toRemove.push(node);
        continue;
      }
      if (entry.gen !== syncGeneration) continue;
      const display = getStrengthDisplayForId(entry.id);
      if (!display || !matchesDisplayedStrength(node, display)) {
        toRemove.push(node);
        continue;
      }
      applyLevelDisplay(node, display);
    }
    for (const node of toRemove) {
      cleanupNode(node);
      trackedNodes.delete(node);
    }
  });
}

async function refreshPetCache(): Promise<void> {
  try {
    const [rawInv, rawHutch, rawActivePrim, rawActiveInfo] = await Promise.all([
      Atoms.inventory.myInventory.get(),
      myPetHutchPetItems.get().catch(() => []),
      Atoms.pets.myPrimitivePetSlots.get().catch(() => null),
      Atoms.pets.myPetInfos.get().catch(() => null),
    ]);
    const items = Array.isArray((rawInv as any)?.items)
      ? (rawInv as any).items
      : Array.isArray(rawInv)
      ? rawInv
      : [];
    inventoryItemsSnapshot = Array.isArray(items) ? items : [];
    const hutchItems = Array.isArray(rawHutch) ? rawHutch : [];
    const activeList = Array.isArray(rawActivePrim)
      ? rawActivePrim
      : Array.isArray(rawActiveInfo)
      ? rawActiveInfo
      : [];
    const next = new Map<string, { strength: number; maxStrength: number }>();
    const nextLabels = new Set<string>();
    // Inventory items: strictly itemType === "Pet"
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const type = typeof (item as any).itemType === "string" ? (item as any).itemType : "";
      if (type !== "Pet") continue;
      const id =
        String((item as any).id ?? (item as any).pet?.id ?? (item as any).slot?.id ?? "").trim();
      if (!id) continue;
      const petLike = buildPetLike(item, nextLabels);
      if (!petLike) continue;
      const maxStrength = getPetMaxStrength(petLike);
      if (!Number.isFinite(maxStrength) || maxStrength <= 0) continue;
      const strength = getPetStrength(petLike);
      next.set(id, { strength, maxStrength });
    }
    // Hutch items: accept pet/slot wrappers
    for (const item of hutchItems) {
      if (!item || typeof item !== "object") continue;
      const source = (item as any).pet ?? (item as any).slot ?? item;
      if (!source) continue;
      const id = String(source?.id ?? "").trim();
      if (!id) continue;
      const petLike = buildPetLike(source, nextLabels);
      if (!petLike) continue;
      const maxStrength = getPetMaxStrength(petLike);
      if (!Number.isFinite(maxStrength) || maxStrength <= 0) continue;
      const strength = getPetStrength(petLike);
      next.set(id, { strength, maxStrength });
    }
    // Active pets (equipped)
    for (const entry of activeList) {
      const slot = (entry as any)?.slot ?? entry;
      if (!slot || typeof slot !== "object") continue;
      const id = String(slot?.id ?? "").trim();
      if (!id) continue;
      const petLike = buildPetLike(slot, nextLabels);
      if (!petLike) continue;
      const maxStrength = getPetMaxStrength(petLike);
      if (!Number.isFinite(maxStrength) || maxStrength <= 0) continue;
      const strength = getPetStrength(petLike);
      next.set(id, { strength, maxStrength });
    }
    petById = next;
    petIdSet = new Set(next.keys());
    petLabelSet = nextLabels;
    debugLog("pet cache", { pets: petById.size, labels: petLabelSet.size });
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
      petLabels: petLabelSet.size,
    };
  });
} catch {}
