// spriteIconCache.ts — API-backed sprite icons (mg-api.ariedam.fr)
// Replaces the old PIXI/canvas-based sprite service with direct API image URLs.
// Mutation color filters are applied client-side via Canvas 2D.
// Uses GM_xmlhttpRequest (via mgCommon helpers) to bypass CORS restrictions.

import { getJSON, getBlob, blobToImage } from "../utils/mgCommon";
import { withDiscordPollPause } from "../ariesModAPI/client/events";

const API_BASE = "https://mg-api.ariedam.fr";

// ─── Sprite Index ──────────────────────────────────────────────────────────────

type SpriteIndexEntry = {
  id: string;          // e.g. "sprite/plant/Bamboo"
  name: string;        // e.g. "Bamboo"
  internalCat: string; // e.g. "plant" (extracted from id)
  apiCat: string;      // e.g. "plants" (for URL construction)
};

const indexEntries: SpriteIndexEntry[] = [];
const nameIndex = new Map<string, SpriteIndexEntry[]>();
let indexReady: Promise<void> | null = null;

const normalize = (value: string): string => {
  let str = String(value || "").trim();
  // If it looks like a URL or path, extract just the filename
  if (str.includes("/")) {
    str = str.split("/").pop() || str;
  }
  // Strip file extensions and query params (e.g. "Carrot.png?v=163" → "Carrot")
  str = str.replace(/\.[a-z0-9]+(\?.*)?$/i, "");
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
};

/** Map from internal sprite-id category → API URL path segment */
const INTERNAL_TO_API: Record<string, string> = {
  plant: "plants",
  tallplant: "tallPlants",
  seed: "seeds",
  pet: "pets",
  item: "items",
  decor: "decor",
  mutation: "mutations",
  "mutation-overlay": "mutations",
  ui: "ui",
  weather: "weather",
  objects: "objects",
  tiles: "tiles",
  animations: "animations",
  winter: "winter",
};

/** Map from the categories used in attachSpriteIcon calls → internal cats to search */
const SEARCH_CATS: Record<string, string[]> = {
  plant: ["plant", "tallplant"],
  tallplant: ["tallplant", "plant"],
  crop: ["plant", "tallplant"],
  seed: ["seed"],
  pet: ["pet"],
  item: ["item"],
  decor: ["decor"],
  mutation: ["mutation", "mutation-overlay"],
  "mutation-overlay": ["mutation-overlay", "mutation"],
  ui: ["ui"],
  weather: ["ui", "weather", "mutation"],
};

function fetchIndex(): Promise<void> {
  if (indexReady) return indexReady;
  indexReady = withDiscordPollPause(() =>
    getJSON<{ items: Array<{ id: string; name: string }> }>(
      `${API_BASE}/assets/sprite-data?flat=1`,
    ),
  )
    .then((data) => {
      const items = data.items || [];
      for (const item of items) {
        const parts = item.id.split("/").filter(Boolean);
        const start = parts[0] === "sprite" || parts[0] === "sprites" ? 1 : 0;
        const internalCat = parts[start] || "";
        const apiCat = INTERNAL_TO_API[internalCat] || internalCat;
        const entry: SpriteIndexEntry = { id: item.id, name: item.name, internalCat, apiCat };
        indexEntries.push(entry);
        const norm = normalize(item.name);
        const arr = nameIndex.get(norm) || [];
        arr.push(entry);
        nameIndex.set(norm, arr);
      }
      console.log("[SpriteIconCache] sprite index loaded", { count: indexEntries.length });
    })
    .catch(err => {
      console.error("[SpriteIconCache] failed to fetch sprite index", err);
      // Allow retry on next call
      indexReady = null;
    });
  return indexReady;
}

// Start fetching the sprite index immediately at module load time.
// This ensures it's ready before any menu opens, avoiding race conditions
// where DOM elements get replaced before async sprite loading completes.
fetchIndex();

function spriteUrl(entry: SpriteIndexEntry): string {
  return `${API_BASE}/assets/sprites/${entry.apiCat}/${entry.name}.png`;
}

function findSprite(categories: string[], candidateId: string): SpriteIndexEntry | null {
  const norm = normalize(candidateId);
  const entries = nameIndex.get(norm);
  if (!entries?.length) {
    return findSpriteFuzzy(categories, norm);
  }

  const internalCats = new Set<string>();
  for (const cat of categories) {
    const expanded = SEARCH_CATS[cat] || [cat];
    for (const catName of expanded) internalCats.add(catName);
  }

  for (const entry of entries) {
    if (internalCats.has(entry.internalCat)) return entry;
  }

  // No category match — try fuzzy search instead of returning wrong category
  return findSpriteFuzzy(categories, norm);
}

function findSpriteFuzzy(categories: string[], normTarget: string): SpriteIndexEntry | null {
  if (!normTarget) return null;

  const internalCats = new Set<string>();
  for (const cat of categories) {
    const expanded = SEARCH_CATS[cat] || [cat];
    for (const catName of expanded) internalCats.add(catName);
  }

  for (const [norm, entries] of nameIndex) {
    if (norm.includes(normTarget) || normTarget.includes(norm)) {
      for (const entry of entries) {
        if (internalCats.has(entry.internalCat)) return entry;
      }
    }
  }

  for (const [norm, entries] of nameIndex) {
    if (norm.includes(normTarget) || normTarget.includes(norm)) {
      return entries[0];
    }
  }

  return null;
}

// ─── Mutation Icon Sprites ──────────────────────────────────────────────────────
// Mutations that have an icon sprite overlay (from the API /data/mutations)

type MutationIconDef = {
  url: string;
  /** Anchor from sprite-data — determines how the icon is drawn relative to its placement point */
  anchor: { x: number; y: number };
};

const MUTATION_ICONS: Record<string, MutationIconDef> = {
  // Ground-level icons (anchor.y ≈ 0.5 — drawn at plant base)
  Wet:           { url: `${API_BASE}/assets/sprites/mutations/Wet.png`,           anchor: { x: 0.5, y: 0.487 } },
  Chilled:       { url: `${API_BASE}/assets/sprites/mutations/Chilled.png`,       anchor: { x: 0.502, y: 0.543 } },
  Frozen:        { url: `${API_BASE}/assets/sprites/mutations/Frozen.png`,        anchor: { x: 0.5, y: 0.474 } },
  Thunderstruck: { url: `${API_BASE}/assets/sprites/mutations/Thunderstruck.png`, anchor: { x: 0.495, y: 0.525 } },
  Thundercharged: { url: `${API_BASE}/assets/sprites/mutations/Thundercharged.png`, anchor: { x: 0.495, y: 0.525 } },
  // Floating icons (anchor.y ≈ 0.8 — drawn above the plant)
  Dawnlit:       { url: `${API_BASE}/assets/sprites/mutations/Dawnlit.png`,       anchor: { x: 0.506, y: 0.809 } },
  Ambershine:    { url: `${API_BASE}/assets/sprites/mutations/Amberlit.png`,      anchor: { x: 0.5, y: 0.820 } },
  Dawncharged:   { url: `${API_BASE}/assets/sprites/mutations/Dawncharged.png`,   anchor: { x: 0.519, y: 0.796 } },
  Ambercharged:  { url: `${API_BASE}/assets/sprites/mutations/Ambercharged.png`,  anchor: { x: 0.501, y: 0.795 } },
};

// ─── Mutation Color Filters ────────────────────────────────────────────────────
// Ported from src/sprite/mutations/variantBuilder.ts

type FilterDef = {
  op: string;
  colors: string[];
  a?: number;
  ang?: number;
  masked?: boolean;
};

const MUTATION_FILTERS: Record<string, FilterDef> = {
  Gold: { op: "source-atop", colors: ["rgb(235,200,0)"], a: 0.7 },
  Rainbow: { op: "color", colors: ["#FF1744", "#FF9100", "#FFEA00", "#00E676", "#2979FF", "#D500F9"], ang: 130, masked: true },
  Wet: { op: "source-atop", colors: ["rgb(50,180,200)"], a: 0.25 },
  Chilled: { op: "source-atop", colors: ["rgb(100,160,210)"], a: 0.45 },
  Frozen: { op: "source-atop", colors: ["rgb(100,130,220)"], a: 0.5 },
  Thunderstruck: { op: "source-atop", colors: ["rgb(16, 141, 163)"], a: 0.45 },
  Thundercharged: { op: "source-atop", colors: ["rgb(10, 100, 190)"], a: 0.5 },
  Dawnlit: { op: "source-atop", colors: ["rgb(209,70,231)"], a: 0.5 },
  Ambershine: { op: "source-atop", colors: ["rgb(190,100,40)"], a: 0.5 },
  Dawncharged: { op: "source-atop", colors: ["rgb(140,80,200)"], a: 0.5 },
  Ambercharged: { op: "source-atop", colors: ["rgb(170,60,25)"], a: 0.5 },
};

function normalizeMutations(list: string[]): string[] {
  const names = [...new Set(list.filter(mutName => MUTATION_FILTERS[mutName]))];
  if (!names.length) return [];
  if (names.includes("Gold")) return ["Gold"];
  if (names.includes("Rainbow")) return ["Rainbow"];
  const warm = ["Ambershine", "Dawnlit", "Dawncharged", "Ambercharged"];
  if (names.some(name => warm.includes(name))) {
    return names.filter(name => !["Wet", "Chilled", "Frozen", "Thunderstruck", "Thundercharged"].includes(name));
  }
  return names;
}

const SUPPORTED_BLEND_OPS = (() => {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return new Set<string>();
    const ops = ["color", "hue", "saturation", "luminosity", "overlay", "screen", "lighter", "source-atop"];
    const ok = new Set<string>();
    for (const op of ops) {
      ctx.globalCompositeOperation = op as GlobalCompositeOperation;
      if (ctx.globalCompositeOperation === op) ok.add(op);
    }
    return ok;
  } catch {
    return new Set<string>();
  }
})();

function pickBlendOp(desired: string): GlobalCompositeOperation {
  if (SUPPORTED_BLEND_OPS.has(desired)) return desired as GlobalCompositeOperation;
  if (SUPPORTED_BLEND_OPS.has("overlay")) return "overlay";
  if (SUPPORTED_BLEND_OPS.has("screen")) return "screen";
  if (SUPPORTED_BLEND_OPS.has("lighter")) return "lighter";
  return "source-atop";
}

function fillGrad(ctx: CanvasRenderingContext2D, width: number, height: number, filter: FilterDef): void {
  const cols = filter.colors?.length ? filter.colors : ["#fff"];
  let gradient: CanvasGradient;
  if (filter.ang != null) {
    const rad = (filter.ang - 90) * Math.PI / 180;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2;
    gradient = ctx.createLinearGradient(
      cx - Math.cos(rad) * radius, cy - Math.sin(rad) * radius,
      cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius,
    );
  } else {
    gradient = ctx.createLinearGradient(0, 0, 0, height);
  }
  if (cols.length === 1) {
    gradient.addColorStop(0, cols[0]);
    gradient.addColorStop(1, cols[0]);
  } else {
    cols.forEach((color, idx) => gradient.addColorStop(idx / (cols.length - 1), color));
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

async function applyMutationFilters(img: HTMLImageElement, mutations: string[]): Promise<string> {
  const allMuts = [...new Set(mutations.filter(m => MUTATION_FILTERS[m]))];
  const colorMuts = normalizeMutations(mutations);
  if (!colorMuts.length && !allMuts.length) return img.src;

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) return img.src;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;
  ctx.imageSmoothingEnabled = false;

  // 1) Draw base sprite
  ctx.drawImage(img, 0, 0);

  // 2) Apply color filters
  for (const name of colorMuts) {
    const filter = MUTATION_FILTERS[name];
    if (!filter) continue;

    if (filter.masked) {
      const gradCanvas = document.createElement("canvas");
      gradCanvas.width = width;
      gradCanvas.height = height;
      const gctx = gradCanvas.getContext("2d");
      if (!gctx) continue;
      gctx.imageSmoothingEnabled = false;
      fillGrad(gctx, width, height, filter);
      gctx.globalCompositeOperation = "destination-in";
      gctx.drawImage(img, 0, 0);

      ctx.save();
      ctx.globalCompositeOperation = pickBlendOp(filter.op);
      if (filter.a != null) ctx.globalAlpha = filter.a;
      ctx.drawImage(gradCanvas, 0, 0);
      ctx.restore();
    } else {
      const colorCanvas = document.createElement("canvas");
      colorCanvas.width = width;
      colorCanvas.height = height;
      const cctx = colorCanvas.getContext("2d");
      if (!cctx) continue;
      cctx.imageSmoothingEnabled = false;
      cctx.drawImage(img, 0, 0);
      cctx.globalCompositeOperation = "source-in";
      fillGrad(cctx, width, height, filter);

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      if (filter.a != null) ctx.globalAlpha = filter.a;
      ctx.drawImage(colorCanvas, 0, 0);
      ctx.restore();
    }
  }

  // 3) Overlay mutation icon sprites (all selected mutations, not just color-filtered ones)
  // Plant anchor is typically at bottom-center (~0.5, ~0.85-0.95).
  // We place the icon at the plant's base, offset by the icon's own anchor.
  const plantAnchorX = 0.5;
  const plantAnchorY = 0.85;
  const baseX = width * plantAnchorX;
  const baseY = height * plantAnchorY;

  for (const name of allMuts) {
    const iconDef = MUTATION_ICONS[name];
    if (!iconDef) continue;
    try {
      const iconImg = await loadImage(iconDef.url);
      const iconW = iconImg.naturalWidth || iconImg.width;
      const iconH = iconImg.naturalHeight || iconImg.height;
      if (!iconW || !iconH) continue;
      // Scale icon to ~50% of base sprite width, keep aspect ratio
      const iconScale = (width * 0.5) / iconW;
      const drawW = iconW * iconScale;
      const drawH = iconH * iconScale;
      // Position using the icon's anchor point relative to the plant base
      // anchor defines where the icon's "origin" is within itself
      const drawX = baseX - drawW * iconDef.anchor.x;
      const drawY = baseY - drawH * iconDef.anchor.y;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(iconImg, drawX, drawY, drawW, drawH);
      ctx.restore();
    } catch {
      /* icon load failed — skip silently */
    }
  }

  return canvas.toDataURL("image/png");
}

// ─── Image Loading (via mgCommon GM helpers) ───────────────────────────────────

const imageCache = new Map<string, Promise<HTMLImageElement>>();

/** Load an image via GM blob fetch → blobToImage (same pattern as mgCommon) */
function loadImage(url: string): Promise<HTMLImageElement> {
  let promise = imageCache.get(url);
  if (promise) return promise;
  promise = withDiscordPollPause(() => getBlob(url)).then(blob => blobToImage(blob));
  imageCache.set(url, promise);
  return promise;
}

// ─── Object URL cache for non-mutated sprites ─────────────────────────────────

const objectUrlCache = new Map<string, Promise<string>>();

function getSpriteObjectUrl(apiUrl: string): Promise<string> {
  let promise = objectUrlCache.get(apiUrl);
  if (promise) return promise;
  promise = withDiscordPollPause(() => getBlob(apiUrl)).then(blob => URL.createObjectURL(blob));
  objectUrlCache.set(apiUrl, promise);
  return promise;
}

// ─── Caches ────────────────────────────────────────────────────────────────────

const spriteDataUrlCache = new Map<string, Promise<string | null>>();
const spriteDataUrlResolved = new Map<string, string>();

function cacheKeyFor(category: string, spriteId: string, mutationKey?: string): string {
  return `${category}:${normalize(spriteId)}${mutationKey ?? ""}`;
}

function mutationKeyStr(mutations?: string[]): string {
  const list = [...new Set((mutations ?? []).map(val => String(val ?? "").trim()).filter(Boolean))];
  if (!list.length) return "";
  return "|m=" + list.map(normalize).filter(Boolean).sort().join(",");
}

// ─── Warmup State ──────────────────────────────────────────────────────────────

type SpriteWarmupState = { total: number; done: number; completed: boolean };
let warmupState: SpriteWarmupState = { total: 0, done: 0, completed: false };
const warmupListeners = new Set<(state: SpriteWarmupState) => void>();

function notifyWarmup(state: SpriteWarmupState): void {
  warmupState = state;
  warmupListeners.forEach(listener => {
    try { listener(warmupState); } catch { /* ignore */ }
  });
}

export function getSpriteWarmupState(): SpriteWarmupState {
  return warmupState;
}

export function onSpriteWarmupProgress(
  listener: (state: SpriteWarmupState) => void,
): () => void {
  warmupListeners.add(listener);
  try { listener(warmupState); } catch { /* ignore */ }
  return () => { warmupListeners.delete(listener); };
}

// Legacy exports kept for backward compatibility (sprite/index.ts calls these)
export function primeSpriteData(_category: string, _spriteId: string, _dataUrl: string): void {
  /* no-op — sprites now come from the API */
}

export function primeWarmupKeys(_keys: string[]): void {
  /* no-op — warmup is handled by fetching the sprite index */
}

export function warmupSpriteCache(): void {
  fetchIndex().then(() => {
    const total = indexEntries.length;
    notifyWarmup({ total, done: total, completed: true });
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createSpriteImg(
  src: string,
  size: number,
  spriteKey: string,
  category: string,
  spriteId: string,
): HTMLImageElement {
  const img = document.createElement("img");
  img.src = src;
  img.width = size;
  img.height = size;
  img.alt = "";
  img.decoding = "async";
  (img as any).loading = "lazy";
  img.draggable = false;
  img.style.width = `${size}px`;
  img.style.height = `${size}px`;
  img.style.objectFit = "contain";
  img.style.imageRendering = "auto";
  img.style.display = "block";
  img.dataset.spriteKey = spriteKey;
  img.dataset.spriteCategory = category;
  img.dataset.spriteId = spriteId;
  return img;
}

// ─── Public API ────────────────────────────────────────────────────────────────

type AttachSpriteIconOptions = {
  mutations?: string[];
  onSpriteApplied?: (
    img: HTMLImageElement,
    meta: { category: string; spriteId: string; candidate: string },
  ) => void;
  onNoSpriteFound?: (meta: { categories: string[]; candidates: string[] }) => void;
};

export function attachSpriteIcon(
  target: HTMLElement,
  categories: string[],
  id: string | string[],
  size: number,
  _logTag: string,
  options?: AttachSpriteIconOptions,
): void {
  const candidateIds = Array.isArray(id)
    ? id.map(value => String(value ?? "").trim()).filter(Boolean)
    : [String(id ?? "").trim()].filter(Boolean);
  if (!candidateIds.length) return;

  const mutKey = mutationKeyStr(options?.mutations);
  const hasMutations = !!(options?.mutations?.length);

  fetchIndex().then(() => {
    let selectedEntry: SpriteIndexEntry | null = null;
    let selectedCandidate = "";

    for (const candidate of candidateIds) {
      const entry = findSprite(categories, candidate);
      if (entry) {
        selectedEntry = entry;
        selectedCandidate = candidate;
        break;
      }
    }

    if (!selectedEntry) {
      options?.onNoSpriteFound?.({ categories, candidates: candidateIds });
      return;
    }

    const entry = selectedEntry;
    const url = spriteUrl(entry);
    const spriteKey = `${entry.internalCat}:${entry.name}${mutKey}`;

    const existing = target.querySelector<HTMLImageElement>("img[data-sprite-key]");
    if (existing && existing.dataset.spriteKey === spriteKey) return;

    if (!hasMutations) {
      getSpriteObjectUrl(url).then(objectUrl => {
        const img = createSpriteImg(objectUrl, size, spriteKey, entry.internalCat, entry.name);
        requestAnimationFrame(() => {
          if (!target.isConnected) return;
          target.replaceChildren(img);
          options?.onSpriteApplied?.(img, {
            category: entry.internalCat,
            spriteId: entry.name,
            candidate: selectedCandidate,
          });
        });
      }).catch(() => { /* silent fail */ });
      return;
    }

    const ck = cacheKeyFor(entry.internalCat, entry.name, mutKey);
    const cached = spriteDataUrlResolved.get(ck);
    if (cached) {
      const img = createSpriteImg(cached, size, spriteKey, entry.internalCat, entry.name);
      requestAnimationFrame(() => {
        target.replaceChildren(img);
        options?.onSpriteApplied?.(img, {
          category: entry.internalCat,
          spriteId: entry.name,
          candidate: selectedCandidate,
        });
      });
      return;
    }

    let promise = spriteDataUrlCache.get(ck);
    if (!promise) {
      promise = loadImage(url)
        .then(async imgEl => {
          const dataUrl = await applyMutationFilters(imgEl, options?.mutations ?? []);
          spriteDataUrlResolved.set(ck, dataUrl);
          return dataUrl;
        })
        .catch(() => null);
      spriteDataUrlCache.set(ck, promise);
    }

    promise.then(dataUrl => {
      if (!dataUrl) return;
      const img = createSpriteImg(dataUrl, size, spriteKey, entry.internalCat, entry.name);
      requestAnimationFrame(() => {
        target.replaceChildren(img);
        options?.onSpriteApplied?.(img, {
          category: entry.internalCat,
          spriteId: entry.name,
          candidate: selectedCandidate,
        });
      });
    });
  });
}

export function attachWeatherSpriteIcon(target: HTMLElement, tag: string, size: number): void {
  if (tag === "NoWeatherEffect") return;
  attachSpriteIcon(target, ["ui", "mutation", "weather"], [`Mutation${tag}`, tag], size, "weather");
}

/**
 * Get an object URL for a sprite by name and categories.
 * Waits for the sprite index to load, finds the entry, fetches the PNG via GM.
 * Returns null if the sprite is not found.
 */
export async function getSpriteObjectUrlByName(
  categories: string[],
  name: string,
): Promise<string | null> {
  await fetchIndex();
  const entry = findSprite(categories, name);
  if (!entry) return null;
  try {
    return await getSpriteObjectUrl(spriteUrl(entry));
  } catch {
    return null;
  }
}
