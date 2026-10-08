import { joinPath, relPath } from '../utils/path';
import type { ManifestBundle, ManifestSrc } from '../types';
import { getBlob as httpGetBlob, getJSON as httpGetJSON } from '../../../platform/http';
import { pageWindow } from '../../../platform/pageContext';

// Assets go through GM_xmlhttpRequest first, which crosses into the
// extension's content-script bridge. That bridge can be slow to attach at
// document-start, so the GM call is bounded and falls back to fetch: the
// sprite catalog boot must never hang on it.
const ASSET_REQUEST = { preferGm: true, timeoutMs: 5_000 };

export const getJSON = <T = any>(url: string): Promise<T> => httpGetJSON<T>(url, ASSET_REQUEST);

export const getBlob = (url: string): Promise<Blob> => httpGetBlob(url, ASSET_REQUEST);

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
 * managed texture list.  The game loads all atlas sheets at startup, and we reuse
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
  const root: any = pageWindow;

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

/** Path of a manifest `src` entry, whichever of the two forms it uses. */
function srcPath(entry: ManifestSrc): string | null {
  if (typeof entry === 'string') return entry;
  return typeof entry?.src === 'string' && entry.src ? entry.src : null;
}

function srcResolution(entry: ManifestSrc): number {
  if (typeof entry === 'string') return 1;
  const value = Number(entry?.resolution);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function isAtlasJsonPath(path: string): boolean {
  return path.endsWith('.json') && path !== 'manifest.json' && !path.startsWith('audio/');
}

/**
 * Atlas JSON paths listed by the manifest, one per asset.
 *
 * An asset's `src` list holds the same atlas packed at several resolutions:
 * 1x and 2x carry identical frame keys, only the rectangles differ, so exactly
 * one is taken. The highest resolution wins: its rectangles are true pixels
 * (`meta.scale: 1`), which is what a replacement image should be fitted to.
 * Taking both would index every frame twice with conflicting rectangles.
 */
function extractAtlasJsons(manifest: ManifestBundle) {
  const jsons = new Set<string>();
  for (const bundle of manifest.bundles || []) {
    for (const asset of bundle.assets || []) {
      let best: { path: string; resolution: number } | null = null;
      for (const entry of asset.src || []) {
        const path = srcPath(entry);
        if (!path || !isAtlasJsonPath(path)) continue;
        const resolution = srcResolution(entry);
        if (!best || resolution > best.resolution) best = { path, resolution };
      }
      if (best) jsons.add(best.path);
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
