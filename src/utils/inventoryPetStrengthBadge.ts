// src/utils/inventoryPetStrengthBadge.ts

import { Atoms, myPetHutchPetItems } from "../store/atoms";
import { getPetMaxStrength, getPetStrength } from "./petCalcul";
import { readSharedGlobal, shareGlobal } from "./page-context";

// ── Constants ─────────────────────────────────────────────────────────────
const GLOBAL_FLAG = "__qws_inv_pet_strength_badge_started";
const DEBUG_FLAG = "__qws_inv_pet_strength_badge_debug";
const SYNC_INTERVAL_MS = 500;
const RESOLVE_INTERVAL_MS = 1000;

const LEVEL_TEXT_RE = /^(?:STR\s*)?(\d{1,4})(?:\s*\/\s*(\d{1,4}))?(?:\s*MAX)?$/i;
const QUANTITY_TEXT_RE = /^[x\u00D7]\s*\d[\d,\.]*$/i;
const ITEM_VIEW_ID_RE =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const SLOT_LABEL_RE = /\bslot-\d+\b/i;
const SLOT_LABEL_NAME_RE = /(?:^|\b)(.+?)\s+slot-\d+\b/i;
const SLOT_INDEX_RE = /slot-(\d+)/i;
const INVENTORY_LABEL_RE =
  /(InventoryItemVisual|InventoryItemView|InventoryCardVisual|InventorySelectedItemLayer)/i;
const PET_LABEL_RE = /pet/i;
const PET_SLOTS_CONTAINER_RE = /PetSlots/i;

// ── Types ─────────────────────────────────────────────────────────────────
type VisualInfo = {
  slotName: string | null;
  slotIndex: number | null;
  hasSlot: boolean;
  hasPet: boolean;
  hasInventory: boolean;
  inPetSlots: boolean;
  itemId: string | null;
};

// ── Module state ──────────────────────────────────────────────────────────
let started = false;
let inventoryModalOpen = false;
let activeModalId: string | null = null;
let syncTimer: number | null = null;
let resolveTimer: number | null = null;

let petById = new Map<string, { strength: number; maxStrength: number }>();
let petIdSet = new Set<string>();
let petLabelSet = new Set<string>();
let inventoryItemsSnapshot: any[] = [];

// node → desired text. The ticker re-applies this every frame to fight game resets.
let nodeTextMap = new Map<any, string>();
let tickerAttached = false;
let pixiApp: any = null;
// Dirty flag — traverse stage only when needed. Ticker re-applies text without traversal.
let syncDirty = true;

// Signatures per atom source — skip refresh when data hasn't actually changed
let sigInventory = "";
let sigHutch = "";
let sigPrimSlots = "";

// ── Debug ─────────────────────────────────────────────────────────────────
function isDebugEnabled(): boolean {
  return (
    readSharedGlobal<boolean>(DEBUG_FLAG) === true ||
    (globalThis as any)[DEBUG_FLAG] === true
  );
}

function debugLog(...args: unknown[]): void {
  if (!isDebugEnabled()) return;
  console.log("[InvPetSTR]", ...args);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function isInventoryOpen(): boolean {
  return inventoryModalOpen || activeModalId === "inventory";
}

function resolvePixiApp(): any | null {
  const g = globalThis as any;
  const getShared = (key: string) => readSharedGlobal<any>(key) ?? g[key];
  const spriteState = getShared("__MG_SPRITE_STATE__");
  const quinoaEngine =
    getShared("__QUINOA_ENGINE__") ?? getShared("magiccircle_quinoaEngine");
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


// ── Stage traversal ───────────────────────────────────────────────────────
function isTargetVisualLabel(label: string): boolean {
  if (!label) return false;
  if (label === "InventoryItemVisual") return true;
  if (
    label.includes("Hutch") &&
    (label.includes("ItemVisual") || label.includes("ItemView"))
  )
    return true;
  if (label.includes("PetHutch") && label.includes("Item")) return true;
  if (label.includes("Pet") && (
    label.includes("Slot") || label.includes("Card") ||
    label.includes("View") || label.includes("Visual")
  )) return true;
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
    if (kids) {
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
  }

  return out;
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
    if (typeof text === "string" || typeof text === "number") out.push(node);

    const kids = getChildren(node);
    if (kids) {
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
  }

  return out;
}

// ── Visual info (context + itemId in a single parent-chain walk) ──────────
function getVisualInfo(visual: any): VisualInfo {
  let slotName: string | null = null;
  let slotIndex: number | null = null;
  let hasSlot = false;
  let hasPet = false;
  let hasInventory = false;
  let inPetSlots = false;
  let itemId: string | null = null;
  let cur: any = visual;

  for (let i = 0; i < 12 && cur; i++) {
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
      if (itemId === null && i < 10) {
        const m = ITEM_VIEW_ID_RE.exec(label);
        if (m?.[1] && petIdSet.has(m[1])) itemId = m[1];
      }
    }
    if (itemId === null && i < 10) {
      const directId = (cur as any)?.itemId;
      if (typeof directId === "string" && directId.trim() && petIdSet.has(directId.trim()))
        itemId = directId.trim();
    }
    cur = cur.parent;
  }

  return { slotName, slotIndex, hasSlot, hasPet, hasInventory, inPetSlots, itemId };
}

function isAllowedContext(info: VisualInfo): boolean {
  if (info.hasInventory || info.hasPet) return true;
  if (info.hasSlot) return false;
  return true;
}

function isNonPetInventorySlot(slotIndex: number | null): boolean {
  if (slotIndex == null) return false;
  const item = inventoryItemsSnapshot?.[slotIndex];
  if (!item || typeof item !== "object") return false;
  const type = String((item as any).itemType ?? (item as any).data?.itemType ?? "");
  return type !== "" && type !== "Pet";
}

// ── Pet label helpers ─────────────────────────────────────────────────────
function normalizePetLabel(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, " ").toLowerCase();
}

function addPetLabel(set: Set<string>, value: unknown): void {
  const norm = normalizePetLabel(value);
  if (norm) set.add(norm);
}

function buildPetLike(
  source: any,
  labels: Set<string>
): { petSpecies: string; xp: number; targetScale: number } | null {
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

// ── Strength resolution ───────────────────────────────────────────────────
function getStrengthDisplay(
  id: string
): { current: number; max: number; isMax: boolean } | null {
  const info = petById.get(id);
  if (!info) return null;
  const current = Math.round(info.strength);
  const max = Math.round(info.maxStrength);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return null;
  return { current, max, isMax: current >= max };
}

// ── Text node picking ─────────────────────────────────────────────────────
function parseLevelText(text: string): { current: number; max: number | null } | null {
  const m = LEVEL_TEXT_RE.exec(text.trim());
  if (!m) return null;
  const current = Number(m[1]);
  if (!Number.isFinite(current)) return null;
  const max = m[2] != null ? Number(m[2]) : null;
  return { current, max: Number.isFinite(max as number) ? (max as number) : null };
}

function pickLevelTextNode(texts: any[]): any | null {
  for (const node of texts) {
    if (parseLevelText(String((node as any).text ?? ""))) return node;
  }
  return null;
}

// ── Apply display ─────────────────────────────────────────────────────────
function applyLevelDisplay(
  node: any,
  info: { current: number; max: number; isMax: boolean }
): void {
  const text = info.isMax ? `${info.current} MAX` : `${info.current}/${info.max}`;
  if (String(node?.text ?? "") === text) return;
  try {
    node.text = text;
    try { node.updateText?.(); } catch {}
    try { node.invalidate?.(); } catch {}
  } catch {}
}

// ── Main sync ─────────────────────────────────────────────────────────────
function syncOnce(app: any): void {
  if (!app?.stage || petById.size === 0) return;

  if (!syncDirty && nodeTextMap.size > 0) return;
  syncDirty = false;

  const open = isInventoryOpen();
  const visuals = findInventoryVisuals(app.stage);
  if (!visuals.length) return;

  let skipContext = 0, skipNonPet = 0, skipLabel = 0, skipNoId = 0,
      skipNoDisplay = 0, skipNoTexts = 0,
      skipQty = 0, skipNoNode = 0, applied = 0;
  const nextNodeTextMap = new Map<any, string>();

  for (const visual of visuals) {
    const info = getVisualInfo(visual);
    if (!isAllowedContext(info)) { skipContext++; continue; }
    if (!open && !info.inPetSlots && isNonPetInventorySlot(info.slotIndex)) { skipNonPet++; continue; }

    if (info.slotName && petLabelSet.size > 0) {
      const norm = normalizePetLabel(info.slotName);
      if (!norm || !petLabelSet.has(norm)) { skipLabel++; continue; }
    }

    const itemId = info.itemId;
    if (!itemId) { skipNoId++; continue; }

    const display = getStrengthDisplay(itemId);
    if (!display) { skipNoDisplay++; continue; }

    const texts = collectTextNodes(visual);
    if (!texts.length) { skipNoTexts++; continue; }

    const hasQty = texts.some((t) =>
      QUANTITY_TEXT_RE.test(String((t as any).text ?? "").trim())
    );
    if (hasQty) { skipQty++; continue; }

    const node = pickLevelTextNode(texts);
    if (!node) { skipNoNode++; continue; }

    const wantedText = display.isMax
      ? `${display.current} MAX`
      : `${display.current}/${display.max}`;
    nextNodeTextMap.set(node, wantedText);
    applyLevelDisplay(node, display);
    applied++;
  }

  // Replace nodeTextMap — ticker will re-apply these every frame
  nodeTextMap = nextNodeTextMap;

  debugLog("sync", { visuals: visuals.length, applied, tracked: nodeTextMap.size,
    skipContext, skipNonPet, skipLabel, skipNoId, skipNoDisplay,
    skipNoTexts, skipQty, skipNoNode });
}

// ── Pet cache (reactive) ──────────────────────────────────────────────────
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
    inventoryItemsSnapshot = items;

    const hutchItems = Array.isArray(rawHutch) ? rawHutch : [];
    const activeList = Array.isArray(rawActivePrim)
      ? rawActivePrim
      : Array.isArray(rawActiveInfo)
      ? rawActiveInfo
      : [];

    const next = new Map<string, { strength: number; maxStrength: number }>();
    const nextLabels = new Set<string>();

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      if ((item as any).itemType !== "Pet") continue;
      const id = String(
        (item as any).id ?? (item as any).pet?.id ?? (item as any).slot?.id ?? ""
      ).trim();
      if (!id) continue;
      const petLike = buildPetLike(item, nextLabels);
      if (!petLike) continue;
      const maxStrength = getPetMaxStrength(petLike);
      if (!Number.isFinite(maxStrength) || maxStrength <= 0) continue;
      next.set(id, { strength: getPetStrength(petLike), maxStrength });
    }

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
      next.set(id, { strength: getPetStrength(petLike), maxStrength });
    }

    for (const entry of activeList) {
      const slot = (entry as any)?.slot ?? entry;
      if (!slot || typeof slot !== "object") continue;
      const id = String(slot?.id ?? "").trim();
      if (!id) continue;
      const petLike = buildPetLike(slot, nextLabels);
      if (!petLike) continue;
      const maxStrength = getPetMaxStrength(petLike);
      if (!Number.isFinite(maxStrength) || maxStrength <= 0) continue;
      next.set(id, { strength: getPetStrength(petLike), maxStrength });
    }

    petById = next;
    petIdSet = new Set(next.keys());
    petLabelSet = nextLabels;
    debugLog("pet cache updated", { pets: petById.size, labels: petLabelSet.size });
  } catch {}
}

// ── Signature helpers (change detection) ─────────────────────────────────
// Only the fields that affect strength: id, petSpecies, xp, targetScale.

// Use computed strength values as signature — not raw xp/hunger which change every tick.
// A refresh only fires when the actual displayed value would change.

function petLikeSig(id: string, petSpecies: string, xp: number, targetScale: number): string {
  const petLike = { petSpecies, xp, targetScale };
  const strength = Math.round(getPetStrength(petLike));
  const maxStrength = Math.round(getPetMaxStrength(petLike));
  return `${id}|${strength}|${maxStrength}`;
}

function computeSigInventory(raw: unknown): string {
  const items = Array.isArray((raw as any)?.items)
    ? (raw as any).items
    : Array.isArray(raw)
    ? raw
    : [];
  return (items as any[])
    .filter((item) => (item as any)?.itemType === "Pet")
    .map((item) =>
      petLikeSig(
        String((item as any).id ?? (item as any).pet?.id ?? (item as any).slot?.id ?? ""),
        String((item as any).petSpecies ?? (item as any).data?.petSpecies ?? ""),
        Number((item as any).xp ?? (item as any).data?.xp ?? 0),
        Number((item as any).targetScale ?? (item as any).data?.targetScale ?? 1)
      )
    )
    .sort()
    .join(";");
}

function computeSigHutch(raw: unknown): string {
  const items = Array.isArray(raw) ? (raw as any[]) : [];
  return items
    .map((item) => {
      const src = (item as any)?.pet ?? (item as any)?.slot ?? item;
      return petLikeSig(
        String(src?.id ?? ""),
        String(src?.petSpecies ?? ""),
        Number(src?.xp ?? 0),
        Number(src?.targetScale ?? 1)
      );
    })
    .sort()
    .join(";");
}

function computeSigPrimSlots(raw: unknown): string {
  const items = Array.isArray(raw) ? (raw as any[]) : [];
  return items
    .map((entry) => {
      const slot = (entry as any)?.slot ?? entry;
      return petLikeSig(
        String(slot?.id ?? ""),
        String(slot?.petSpecies ?? ""),
        Number(slot?.xp ?? 0),
        Number(slot?.targetScale ?? 1)
      );
    })
    .sort()
    .join(";");
}

let refreshCount = 0;

function triggerPetCacheRefresh(source: string): void {
  syncDirty = true;
  refreshCount++;
  debugLog(`refreshPetCache #${refreshCount} (source: ${source})`);
  refreshPetCache()
    .then(() => {
      const app = pixiApp;
      if (!app) return;
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(() => syncOnce(app), { timeout: 500 });
      } else {
        setTimeout(() => syncOnce(app), 0);
      }
    })
    .catch(() => {});
}

function setupReactivePetCache(): void {
  refreshPetCache().catch(() => {});

  void (async () => {
    try {
      await Atoms.inventory.myInventory.onChange((next) => {
        const sig = computeSigInventory(next);
        if (sig === sigInventory) return;
        sigInventory = sig;
        triggerPetCacheRefresh("inventory");
      });
    } catch {}
    try {
      await myPetHutchPetItems.onChange((next) => {
        const sig = computeSigHutch(next);
        if (sig === sigHutch) return;
        sigHutch = sig;
        triggerPetCacheRefresh("hutch");
      });
    } catch {}
    // myPetInfos is skipped — it includes positions that change every frame.
    // myPrimitivePetSlots covers species/xp/targetScale (all fields we need).
    try {
      await Atoms.pets.myPrimitivePetSlots.onChange((next) => {
        const sig = computeSigPrimSlots(next);
        if (sig === sigPrimSlots) return;
        sigPrimSlots = sig;
        triggerPetCacheRefresh("primSlots");
      });
    } catch {}
  })();
}

// ── Ticker loop (re-apply per frame to prevent game resets) ───────────────
function ensureTickerLoop(app: any): void {
  if (tickerAttached) return;
  const ticker = app?.ticker ?? app?.renderer?.ticker;
  if (!ticker || typeof ticker.add !== "function") return;
  tickerAttached = true;
  ticker.add(() => {
    for (const [node, text] of nodeTextMap) {
      if (!node || node.destroyed || !node.parent) { nodeTextMap.delete(node); continue; }
      if (node.text === text) continue;
      try { node.text = text; node.updateText?.(); } catch { nodeTextMap.delete(node); }
    }
  });
  debugLog("ticker attached");
}

// ── Sync loop ─────────────────────────────────────────────────────────────
function startSyncLoop(app: any): void {
  if (syncTimer) return;
  pixiApp = app;
  debugLog("start sync loop");
  ensureTickerLoop(app);
  window.addEventListener("wheel", () => { syncDirty = true; }, { passive: true });
  syncTimer = window.setInterval(() => syncOnce(app), SYNC_INTERVAL_MS);
}

// ── Resolve loop ──────────────────────────────────────────────────────────
function stopResolveLoop(): void {
  if (!resolveTimer) return;
  clearInterval(resolveTimer);
  resolveTimer = null;
}

function startResolveLoop(): void {
  if (resolveTimer) return;
  debugLog("start resolve loop (waiting for Pixi app)");
  resolveTimer = window.setInterval(() => {
    const app = resolvePixiApp();
    if (!app) return;
    stopResolveLoop();
    startSyncLoop(app);
  }, RESOLVE_INTERVAL_MS);
}

// ── Modal watchers ────────────────────────────────────────────────────────
function attachModalWatchers(): void {
  const setActiveModal = (value: unknown) => {
    const next = typeof value === "string" ? value : null;
    if (next === activeModalId) return;
    activeModalId = next;
    debugLog("activeModal:", activeModalId);
    if (next === "petHutch" || next === "inventory") {
      triggerPetCacheRefresh("activeModal");
    } else if (next === null) {
      nodeTextMap = new Map();
      triggerPetCacheRefresh("activeModal:close");
    }
  };

  const setInventoryModal = (value: unknown) => {
    const next = value === true;
    if (next === inventoryModalOpen) return;
    inventoryModalOpen = next;
    debugLog("inventoryModalIsActive:", inventoryModalOpen);
    if (inventoryModalOpen) triggerPetCacheRefresh("inventoryModal");
  };

  void (async () => {
    try { setActiveModal(await Atoms.ui.activeModal.get()); } catch {}
    try { await Atoms.ui.activeModal.onChange((next) => setActiveModal(next)); } catch {}
    try { setInventoryModal(await Atoms.ui.inventoryModalIsActive.get()); } catch {}
    try {
      await Atoms.ui.inventoryModalIsActive.onChange((next) => setInventoryModal(next));
    } catch {}
  })();
}

// ── Sprite catalog ready hook ─────────────────────────────────────────────
function attachSpriteReadyHook(): void {
  const tryAttach = (): boolean => {
    const service = readSharedGlobal<any>("__MG_SPRITE_SERVICE__");
    if (!service?.ready?.then) return false;
    service.ready
      .then(() => triggerPetCacheRefresh("spriteCatalog"))
      .catch(() => {});
    return true;
  };

  if (tryAttach()) return;

  const poll = window.setInterval(() => {
    if (tryAttach()) clearInterval(poll);
  }, 500);
}

// ── Entry point ───────────────────────────────────────────────────────────
export function startInventoryPetStrengthBadge(): void {
  if (typeof document === "undefined") return;
  const win = globalThis as any;
  if (readSharedGlobal<boolean>(GLOBAL_FLAG) ?? win[GLOBAL_FLAG]) return;
  win[GLOBAL_FLAG] = true;
  try { shareGlobal(GLOBAL_FLAG, true); } catch {}
  if (started) return;
  started = true;

  debugLog("startInventoryPetStrengthBadge");
  attachModalWatchers();
  attachSpriteReadyHook();
  setupReactivePetCache();

  const app = resolvePixiApp();
  if (app) {
    debugLog("pixi app resolved immediately");
    startSyncLoop(app);
  } else {
    debugLog("pixi app not ready, polling");
    startResolveLoop();
  }
}

// ── Dev / debug helpers ───────────────────────────────────────────────────
try {
  shareGlobal("QWS_startInventoryPetStrengthBadge", startInventoryPetStrengthBadge);
  shareGlobal(
    "QWS_enableInventoryPetStrengthBadgeDebug",
    (value: unknown = true) => {
      const on = value !== false;
      shareGlobal(DEBUG_FLAG, on);
      return on;
    }
  );
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
      appReady: !!app,
      visuals: visuals.length,
      inventoryOpen: isInventoryOpen(),
      petCache: petById.size,
      petLabels: petLabelSet.size,
    };
  });
} catch {}
