// Networking helpers (ported from userscript GM_xmlhttpRequest flow)
import { joinPath, relPath } from '../utils/path';
import type { ManifestBundle } from '../types';

declare const GM_xmlhttpRequest:
  | ((
      options: {
        method: 'GET';
        url: string;
        responseType: 'text' | 'blob' | 'json';
        timeout?: number;
        onload: (resp: { status: number; responseText: string; response: any }) => void;
        onerror: () => void;
        ontimeout: () => void;
      },
    ) => void)
  | undefined;

// GM_xmlhttpRequest is the one call in this codebase that genuinely crosses
// into the extension's isolated content-script bridge (everything else runs
// directly in page context via @inject-into page). That bridge can be slow
// to attach at document-start; without an explicit `timeout`, GM never calls
// `ontimeout`, so a slow/never-attached bridge hangs the call forever with
// no error and no console output. Both the GM-level timeout and an
// independent page-context deadline below exist so this can never hang
// silently, regardless of which layer is slow.
const GM_TIMEOUT_MS = 5_000;

interface NetDebugEntry {
  url: string;
  path: 'gm' | 'fetch-fallback' | 'gm-timeout-fallback';
  startedAt: number;
  finishedAt: number | null;
  ok: boolean | null;
  error: string | null;
}

const netDebugLog: NetDebugEntry[] = [];
{
  const root: any = (globalThis as any).unsafeWindow || (globalThis as any);
  root.__MG_NET_DEBUG__ = netDebugLog;
}

function recordNetDebug(entry: NetDebugEntry) {
  netDebugLog.push(entry);
  if (netDebugLog.length > 200) netDebugLog.shift();
}

function fetchFallback(url: string, type: 'text' | 'blob' | 'json') {
  return fetch(url)
    .then(async res => {
      if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
      if (type === 'blob') return { status: res.status, response: await res.blob(), responseText: '' };
      const text = await res.text();
      return {
        status: res.status,
        response: type === 'json' ? JSON.parse(text) : text,
        responseText: text,
      };
    })
    .catch(err => {
      throw new Error(`Network (${url}): ${err instanceof Error ? err.message : String(err)}`);
    });
}

function gmRequest(url: string, type: 'text' | 'blob' | 'json'): Promise<any> {
  return new Promise<any>((resolve, reject) =>
    GM_xmlhttpRequest!({
      method: 'GET',
      url,
      responseType: type,
      timeout: GM_TIMEOUT_MS,
      onload: r =>
        r.status >= 200 && r.status < 300
          ? resolve(r)
          : reject(new Error(`HTTP ${r.status} (${url})`)),
      onerror: () => reject(new Error(`Network (${url})`)),
      ontimeout: () => reject(new Error(`Timeout (${url})`)),
    })
  );
}

export async function gm(url: string, type: 'text' | 'blob' | 'json' = 'text') {
  const root: any = (globalThis as any).unsafeWindow || (globalThis as any);

  if (typeof GM_xmlhttpRequest !== 'function') {
    const entry: NetDebugEntry = { url, path: 'fetch-fallback', startedAt: Date.now(), finishedAt: null, ok: null, error: null };
    recordNetDebug(entry);
    try {
      const result = await fetchFallback(url, type);
      entry.finishedAt = Date.now();
      entry.ok = true;
      return result;
    } catch (error) {
      entry.finishedAt = Date.now();
      entry.ok = false;
      entry.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  const entry: NetDebugEntry = { url, path: 'gm', startedAt: Date.now(), finishedAt: null, ok: null, error: null };
  recordNetDebug(entry);

  // GM's own `timeout` still depends on the bridge being alive to enforce
  // it — if the bridge never attaches at all, add a hard ceiling on top.
  let hardTimeoutId: any = null;
  const hardTimeout = new Promise<never>((_, reject) => {
    hardTimeoutId = root.setTimeout(() => reject(new Error(`Hard timeout (${url})`)), GM_TIMEOUT_MS + 2_000);
  });

  try {
    const result = await Promise.race([gmRequest(url, type), hardTimeout]);
    root.clearTimeout(hardTimeoutId);
    entry.finishedAt = Date.now();
    entry.ok = true;
    return result;
  } catch (error) {
    root.clearTimeout(hardTimeoutId);
    entry.finishedAt = Date.now();
    entry.ok = false;
    entry.error = error instanceof Error ? error.message : String(error);

    // GM path failed or hung — fall back to a real fetch so this never ends
    // up permanently pending and blocking the whole sprite catalog boot.
    const fallbackEntry: NetDebugEntry = { url, path: 'gm-timeout-fallback', startedAt: Date.now(), finishedAt: null, ok: null, error: null };
    recordNetDebug(fallbackEntry);
    try {
      const result = await fetchFallback(url, type);
      fallbackEntry.finishedAt = Date.now();
      fallbackEntry.ok = true;
      return result;
    } catch (fallbackError) {
      fallbackEntry.finishedAt = Date.now();
      fallbackEntry.ok = false;
      fallbackEntry.error = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw fallbackError;
    }
  }
}

export const getJSON = async <T = any>(url: string): Promise<T> =>
  JSON.parse((await gm(url, 'text')).responseText);

export const getBlob = async (url: string) => (await gm(url, 'blob')).response;

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode fail'));
    };
    img.src = url;
  });
}

/** Returns true when the image path from `meta.image` references a KTX2 compressed texture. */
export function isKtx2Path(path: string): boolean {
  return typeof path === 'string' && path.toLowerCase().endsWith('.ktx2');
}

/**
 * Match a renderer-managed texture against a KTX2 image filename.
 * Checks label, cacheId, resource URL and textureCacheIds (v7 + v8 compat).
 */
function matchesManagedTexture(bt: any, imgName: string): boolean {
  if (!bt) return false;
  const needle = imgName.toLowerCase();
  if (typeof bt.label === 'string' && bt.label.toLowerCase().includes(needle)) return true;
  if (typeof bt.cacheId === 'string' && bt.cacheId.toLowerCase().includes(needle)) return true;
  const resUrl = bt.resource?.url || bt.resource?.src || bt.source?.url || bt.source?.src || '';
  if (typeof resUrl === 'string' && resUrl.toLowerCase().includes(needle)) return true;
  if (Array.isArray(bt.textureCacheIds)) {
    for (const id of bt.textureCacheIds) {
      if (typeof id === 'string' && id.toLowerCase().includes(needle)) return true;
    }
  }
  return false;
}

/**
 * Collect all managed base textures / texture sources from the renderer.
 * Works for both PIXI v7 (textureGC.managedTextures / texture.managedTextures)
 * and v8 (textureGC.managedTextures).
 */
function getManagedTextures(renderer: any): any[] {
  const candidates = [
    renderer?.textureGC?.managedTextures,
    renderer?.texture?.managedTextures,
    renderer?.texture?._managedTextures,
    renderer?.textureSystem?.managedTextures,
  ];
  for (const list of candidates) {
    if (Array.isArray(list) && list.length) return list;
  }
  return [];
}

/**
 * Find the game's already-loaded KTX2 base texture by searching the renderer's
 * managed texture list.  The game loads all atlas sheets at startup — we reuse
 * those rather than loading KTX2 ourselves (which would require PIXI.Assets
 * access that the bundled game doesn't expose).
 *
 * Falls back to PIXI.Assets.load if the global PIXI is available, and to
 * Texture.from cache lookup for PIXI v7.
 */
export async function loadKtx2AsTexture(
  imgName: string,
  renderer: any,
  ctors: any,
  timeoutMs = 3_000,
): Promise<unknown> {
  const root: any = (globalThis as any).unsafeWindow || (globalThis as any);

  // Strategy 1: Global PIXI.Assets (available when game exposes PIXI).
  const PIXI = root.PIXI;
  if (PIXI?.Assets?.load) {
    try {
      return await PIXI.Assets.load({ src: imgName, loadParser: 'loadTextures' });
    } catch { /* fall through */ }
  }

  // Strategy 2: Search the renderer's managed textures for one matching the KTX2
  // filename (the game already loaded it).  Poll until it appears or timeout.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const managed = getManagedTextures(renderer);
    for (const bt of managed) {
      if (matchesManagedTexture(bt, imgName)) {
        // Wrap in a Texture if it looks like a bare BaseTexture/TextureSource.
        if (ctors?.Texture && typeof bt.frame === 'undefined' && typeof bt.width === 'number') {
          try { return new ctors.Texture(bt); } catch { /* return raw */ }
        }
        return bt;
      }
    }
    await new Promise(r => root.setTimeout(r, 250));
  }

  // Strategy 3: PIXI v7 Texture.from cache lookup (string key → TextureCache).
  if (ctors?.Texture?.from) {
    for (const alias of [imgName, imgName.replace(/^.*\//, '')]) {
      try {
        const cached = ctors.Texture.from(alias);
        if (cached && cached !== ctors.Texture.EMPTY) return cached;
      } catch { /* ignore */ }
    }
  }

  throw new Error(`KTX2 base texture not found in renderer for "${imgName}"`);
}

export function extractAtlasJsons(manifest: ManifestBundle) {
  const jsons = new Set<string>();
  for (const bundle of manifest.bundles || []) {
    for (const asset of bundle.assets || []) {
      for (const src of asset.src || []) {
        if (typeof src !== 'string') continue;
        if (!src.endsWith('.json')) continue;
        if (src === 'manifest.json') continue;
        if (src.startsWith('audio/')) continue;
        jsons.add(src);
      }
    }
  }
  return jsons;
}

export async function loadAtlasJsons(base: string, manifest: ManifestBundle) {
  const jsons = extractAtlasJsons(manifest);
  const seen = new Set<string>();
  const data: Record<string, any> = {};

  const loadOne = async (path: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    const json = await getJSON<any>(joinPath(base, path));
    data[path] = json;
    if (json?.meta?.related_multi_packs) {
      for (const rel of json.meta.related_multi_packs) {
        await loadOne(relPath(path, rel));
      }
    }
  };

  for (const p of jsons) {
    await loadOne(p);
  }

  return data;
}
