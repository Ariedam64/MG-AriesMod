// Sprite icons for the DOM, served by the mod's API (mg-api.ariedam.fr).
//
// Images are fetched through GM requests, which get past CORS, and kept as
// object URLs. Mutation colours are painted on a canvas client-side, in
// mutationTint.ts.

import { getBlob as httpGetBlob, getJSON as httpGetJSON } from "../../../platform/http";
import { MGData } from "../../../data/live";
import {
  API_BASE,
  findSprite,
  normalizeSpriteName as normalize,
  setCatalogReader,
  setSpriteIndex,
  spriteIndexSize,
  type SpriteCatalogKey,
  type SpriteEntry,
} from "./resolver";
import { applyMutationFilters, knownMutations } from "./mutationTint";

const SPRITE_REQUEST = { preferGm: true };

// Name lookup lives in ./resolver; this module owns the fetching, the blob and
// object URL caches, and the DOM side.

let indexReady: Promise<void> | null = null;

// The catalogs are the authoritative source: each entry already carries a
// ready-to-use, versioned `sprite` URL, so icons never depend on the sprite
// index nor on fuzzy name matching. The index is only a fallback for the few
// sprites no catalog exposes (raw ui/tile frames).
setCatalogReader((key: SpriteCatalogKey) => MGData.get(key) as Record<string, unknown> | null);

function fetchIndex(): Promise<void> {
  if (indexReady) return indexReady;
  indexReady = httpGetJSON<{ items: Array<{ id: string; name: string }> }>(
    `${API_BASE}/assets/sprite-data?flat=1`,
    SPRITE_REQUEST,
  )
    .then((data) => {
      setSpriteIndex(data.items || [], API_BASE);
      console.log("[SpriteIconCache] sprite index loaded", { count: spriteIndexSize() });
    })
    .catch(err => {
      console.error("[SpriteIconCache] failed to fetch sprite index", err);
      // Allow retry on next call
      indexReady = null;
    });
  return indexReady;
}

// Fetched at load so the index is ready before any menu opens: otherwise a
// menu can replace its elements before their sprites arrive.
fetchIndex();

const imageCache = new Map<string, Promise<HTMLImageElement>>();

/**
 * Loads an image through the long-lived object URL cache. The URL is never
 * revoked: images copy this `src` into fresh <img> elements later, and a
 * revoked URL there shows as a broken icon.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  let promise = imageCache.get(url);
  if (promise) return promise;
  promise = getSpriteObjectUrl(url).then(objectUrl => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = objectUrl;
  }));
  imageCache.set(url, promise);
  return promise;
}

const objectUrlCache = new Map<string, Promise<string>>();

function getSpriteObjectUrl(apiUrl: string): Promise<string> {
  let promise = objectUrlCache.get(apiUrl);
  if (promise) return promise;
  promise = httpGetBlob(apiUrl, SPRITE_REQUEST).then(blob => URL.createObjectURL(blob));
  objectUrlCache.set(apiUrl, promise);
  return promise;
}

// Mutated sprites, rendered to data URLs once per sprite and mutation set.

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

// Warm-up progress, shown by the HUD until the sprite index is in.

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

export function warmupSpriteCache(): void {
  fetchIndex().then(() => {
    const total = spriteIndexSize();
    notifyWarmup({ total, done: total, completed: true });
  });
}

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

  // Unknown mutation names (new game mutation, non-string payload) carry no visual
  // change, so they must not push the sprite through the canvas pipeline.
  const mutations = knownMutations(options?.mutations);
  const mutKey = mutationKeyStr(mutations);
  const hasMutations = mutations.length > 0;

  fetchIndex().then(() => {
    let selectedEntry: SpriteEntry | null = null;
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
    const spriteKey = `${entry.internalCat}:${entry.name}${mutKey}`;
    const existing = target.querySelector<HTMLImageElement>("img[data-sprite-key]");
    if (existing && existing.dataset.spriteKey === spriteKey) return;

    const place = (src: string, onlyIfConnected: boolean) => {
      const img = createSpriteImg(src, size, spriteKey, entry.internalCat, entry.name);
      requestAnimationFrame(() => {
        if (onlyIfConnected && !target.isConnected) return;
        target.replaceChildren(img);
        options?.onSpriteApplied?.(img, { category: entry.internalCat, spriteId: entry.name, candidate: selectedCandidate });
      });
    };

    if (!hasMutations) {
      getSpriteObjectUrl(entry.url)
        .then((objectUrl) => place(objectUrl, true))
        .catch(() => { /* no icon: the holder keeps its fallback content */ });
      return;
    }

    const ck = cacheKeyFor(entry.internalCat, entry.name, mutKey);
    const cached = spriteDataUrlResolved.get(ck);
    if (cached) {
      place(cached, false);
      return;
    }

    let promise = spriteDataUrlCache.get(ck);
    if (!promise) {
      promise = loadImage(entry.url)
        .then(async (imgEl) => {
          const dataUrl = await applyMutationFilters(imgEl, mutations, loadImage);
          spriteDataUrlResolved.set(ck, dataUrl);
          return dataUrl;
        })
        .catch(() => null);
      spriteDataUrlCache.set(ck, promise);
    }
    promise.then((dataUrl) => {
      if (dataUrl) place(dataUrl, false);
    });
  });
}

export function attachWeatherSpriteIcon(target: HTMLElement, tag: string, size: number): void {
  if (tag === "NoWeatherEffect") return;
  attachSpriteIcon(target, ["ui", "mutation", "weather"], [`Mutation${tag}`, tag], size, "weather");
}

/** An object URL for a sprite by name, once the index is in; null when there is none. */
export async function getSpriteObjectUrlByName(
  categories: string[],
  name: string,
): Promise<string | null> {
  await fetchIndex();
  const entry = findSprite(categories, name);
  if (!entry) return null;
  try {
    return await getSpriteObjectUrl(entry.url);
  } catch {
    return null;
  }
}
