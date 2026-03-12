import { DEFAULT_CFG } from './settings';
import { createSpriteContext } from './state';
import { createPixiHooks, waitForPixi } from './pixi/hooks';
import { getCtors } from './utils/pixi';
import { getJSON, getBlob, blobToImage, loadAtlasJsons, isKtx2Path, loadKtx2AsTexture } from './data/assetFetcher';
import { buildAtlasTextures, isAtlas } from './pixi/atlasToTextures';
import { buildItemsFromTextures } from './data/catalogIndexer';
import { joinPath, relPath } from './utils/path';
import { exposeApi, type HudHandles } from './api/expose';
import { curVariant, processJobs } from './mutations/variantBuilder';
import { primeSpriteData, primeWarmupKeys, warmupSpriteCache } from '../ui/spriteIconCache';
import { gameVersion as globalGameVersion, initGameVersion } from '../utils/gameVersion';

const ctx = createSpriteContext();
const hooks = createPixiHooks();

type PrefetchedAtlas = {
  base: string;
  atlasJsons: Record<string, any>;
  blobs: Map<string, Blob>;
};

const parseFrameCategory = (key: string): { category: string; id: string } | null => {
  const parts = String(key || '').split('/').filter(Boolean);
  if (!parts.length) return null;
  const start = parts[0] === 'sprite' || parts[0] === 'sprites' ? 1 : 0;
  const category = parts[start] ?? '';
  const id = parts.slice(start + 1).join('/') || parts[parts.length - 1] || '';
  if (!category || !id) return null;
  return { category, id };
};

const yieldToBrowser = (): Promise<void> => {
  return new Promise(resolve => {
    const win: any = typeof window !== 'undefined' ? window : null;
    if (win?.requestIdleCallback) {
      win.requestIdleCallback(() => resolve(), { timeout: 32 });
    } else if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
};

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function warmupSpritesFromAtlases(
  atlasJsons: Record<string, any>,
  blobs: Map<string, Blob>,
): Promise<void> {
  const FRAME_YIELD_EVERY = 6;
  const MAX_CHUNK_MS = 10;
  let framesSinceYield = 0;
  let chunkStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const resetChunk = () => {
    chunkStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  };
  const yieldIfNeeded = async () => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = now - chunkStart;
    if (framesSinceYield >= FRAME_YIELD_EVERY || elapsed >= MAX_CHUNK_MS) {
      framesSinceYield = 0;
      await yieldToBrowser();
      resetChunk();
    }
  };

  for (const [path, data] of Object.entries<any>(atlasJsons)) {
    if (!isAtlas(data)) continue;
    const frames = data.frames || {};
    if (!frames || !Object.keys(frames).length) continue;
    const imgPath = relPath(path, data.meta.image);
    // KTX2 blobs cannot be decoded to HTMLImageElement — skip canvas warmup for these.
    if (isKtx2Path(imgPath)) continue;
    const blob = blobs.get(imgPath);
    if (!blob) continue;
    let img: HTMLImageElement;
    try {
      img = await blobToImage(blob);
    } catch (error) {
      console.warn('[MG SpriteCatalog] warmup decode failed', { imgPath, error });
      continue;
    }
    for (const [frameKey, frameData] of Object.entries<any>(frames)) {
      const parsed = parseFrameCategory(frameKey);
      if (!parsed) continue;
      try {
        const dataUrl = drawFrameToDataURL(img, frameKey, frameData);
        if (!dataUrl) continue;
        primeSpriteData(parsed.category, parsed.id, dataUrl);
      } catch (error) {
        console.warn('[MG SpriteCatalog] warmup frame failed', { frameKey, error });
      }
      framesSinceYield += 1;
      await yieldIfNeeded();
    }
    framesSinceYield = 0;
    await yieldToBrowser();
    resetChunk();
  }
}

let prefetchPromise: Promise<PrefetchedAtlas | null> | null = null;

function detectGameVersion() {
  // Prefer the global helper initialized in utils/gameVersion
  try {
    initGameVersion();
    if (globalGameVersion) return globalGameVersion;
  } catch {
    /* fall through to legacy detection */
  }

  const root: any = (globalThis as any).unsafeWindow || (globalThis as any);
  const gv = root.gameVersion || root.MG_gameVersion || root.__MG_GAME_VERSION__;
  if (gv) {
    if (typeof gv.getVersion === 'function') return gv.getVersion();
    if (typeof gv.get === 'function') return gv.get();
    if (typeof gv === 'string') return gv;
  }
  const scriptUrls = Array.from(document.scripts || []).map(s => s.src).filter(Boolean);
  const linkUrls = Array.from(document.querySelectorAll('link[href]') || []).map(
    l => (l as HTMLLinkElement).href
  );
  const urls = [...scriptUrls, ...linkUrls];
  for (const u of urls) {
    const m = u.match(/\/version\/([^/]+)\//);
  if (m?.[1]) return m[1];
  }
  throw new Error('Version not found.');
}

async function resolveGameVersionWithRetry(timeoutMs: number = 6000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError: any = null;
  while (Date.now() < deadline) {
    try {
      const v = detectGameVersion();
      if (v) return v;
    } catch (err) {
      lastError = err;
    }
    await delay(120);
  }
  throw lastError ?? new Error('Version not found.');
}

function drawFrameToDataURL(
  img: HTMLImageElement,
  frameKey: string,
  data: any,
): string | null {
  try {
    const fr = data.frame;
    const trimmed = data.trimmed && data.spriteSourceSize;
    const sourceSize = data.sourceSize || { w: fr.w, h: fr.h };
    const canvas = document.createElement('canvas');
    canvas.width = sourceSize.w;
    canvas.height = sourceSize.h;
    const ctx2 = canvas.getContext('2d');
    if (!ctx2) return null;
    ctx2.imageSmoothingEnabled = false;

    if (data.rotated) {
      // Handle 90° rotation for atlas frames
      ctx2.save();
      ctx2.translate(sourceSize.w / 2, sourceSize.h / 2);
      ctx2.rotate(-Math.PI / 2);
      ctx2.drawImage(
        img,
        fr.x,
        fr.y,
        fr.h,
        fr.w,
        -fr.h / 2,
        -fr.w / 2,
        fr.h,
        fr.w,
      );
      ctx2.restore();
    } else {
      const dx = trimmed ? data.spriteSourceSize.x : 0;
      const dy = trimmed ? data.spriteSourceSize.y : 0;
      ctx2.drawImage(img, fr.x, fr.y, fr.w, fr.h, dx, dy, fr.w, fr.h);
    }

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function prefetchAtlas(base: string): Promise<PrefetchedAtlas | null> {
  try {
    const manifest = await getJSON<any>(joinPath(base, 'manifest.json'));
    const atlasJsons = await loadAtlasJsons(base, manifest);
    const blobs = new Map<string, Blob>();
    // Fetch atlas images early (network is the heavy part; decoding happens later in loadTextures).
    // KTX2 images are skipped here — they need PIXI's GPU pipeline and are loaded in loadTextures.
    for (const [path, data] of Object.entries<any>(atlasJsons)) {
      if (!isAtlas(data)) continue;
      const imgPath = relPath(path, data.meta.image);
      if (isKtx2Path(imgPath)) continue;
      try {
        const blob = await getBlob(joinPath(base, imgPath));
        blobs.set(imgPath, blob);
      } catch {
        /* ignore individual fetch errors */
      }
    }
    // Prime warmup with the raw texture keys from atlas frames.
    const warmupKeys: string[] = [];
    Object.entries<any>(atlasJsons).forEach(([, data]) => {
      if (!isAtlas(data)) return;
      Object.keys(data.frames || {}).forEach(frameKey => warmupKeys.push(frameKey));
    });
  if (warmupKeys.length) {
    try {
      primeWarmupKeys(warmupKeys);
    } catch {
      /* ignore */
    }
  }
  try {
    warmupSpriteCache();
  } catch {
    /* ignore */
  }
  // Start warming sprites immediately using the prefetched atlas data.
  if (warmupKeys.length) {
    warmupSpritesFromAtlases(atlasJsons, blobs).catch(() => {});
  }
  return { base, atlasJsons, blobs };
} catch {
  return null;
}
}

async function loadTextures(base: string, prefetched?: PrefetchedAtlas | null) {
  const usePrefetched = prefetched && prefetched.base === base ? prefetched : null;
  const atlasJsons =
    usePrefetched?.atlasJsons ?? (await loadAtlasJsons(base, await getJSON<any>(joinPath(base, 'manifest.json'))));
  const ctors = ctx.state.ctors;
  if (!ctors?.Texture || !ctors?.Rectangle) throw new Error('PIXI constructors missing');

  for (const [path, data] of Object.entries<any>(atlasJsons)) {
    if (!isAtlas(data)) continue;
    const imgPath = relPath(path, data.meta.image);

    let baseTex: any;
    if (isKtx2Path(imgPath)) {
      // KTX2 compressed texture — find the game's already-loaded base texture from the renderer.
      const loaded: any = await loadKtx2AsTexture(imgPath, ctx.state.renderer, ctors);
      baseTex = loaded;
    } else {
      // Standard image (webp/png) — existing blob → Image → Texture.from path.
      const blob =
        usePrefetched?.blobs.get(imgPath) ??
        (await getBlob(joinPath(base, imgPath)));
      const img = await blobToImage(blob);
      baseTex = ctors.Texture.from(img);
    }

    buildAtlasTextures(data, baseTex, ctx.state.tex, ctx.state.atlasBases, {
      Texture: ctors.Texture,
      Rectangle: ctors.Rectangle,
    });
  }

  const { items, cats } = buildItemsFromTextures(ctx.state.tex, ctx.cfg);
  ctx.state.items = items;
  ctx.state.filtered = items.slice();
  ctx.state.cats = cats;
  ctx.state.loaded = true;
}

function ensureDocumentReady() {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise<void>(resolve => {
    const onReady = () => {
      document.removeEventListener('DOMContentLoaded', onReady);
      resolve();
    };
    document.addEventListener('DOMContentLoaded', onReady);
  });
}

type PixiBundle = { app: any; renderer: any; version: any };

async function resolvePixiFast(): Promise<PixiBundle> {
  const root: any = (globalThis as any).unsafeWindow || (globalThis as any);
  const check = (): PixiBundle | null => {
    const app = root.__PIXI_APP__ || root.PIXI_APP || root.app || null;
    const renderer =
      root.__PIXI_RENDERER__ ||
      root.PIXI_RENDERER__ ||
      root.renderer ||
      (app as any)?.renderer ||
      null;
    if (app && renderer) {
      return { app, renderer, version: root.__PIXI_VERSION__ || null };
    }
    return null;
  };
  const hit = check();
  if (hit) return hit;

  const maxMs = 5_000;
  const start = performance.now();
  while (performance.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 50));
    const retry = check();
    if (retry) return retry;
  }

  const waited = await waitForPixi(hooks);
  return { app: waited.app, renderer: waited.renderer, version: waited.version };
}

async function start() {
  if (ctx.state.started) return;
  ctx.state.started = true;

  // Detect version/base early to prefetch in parallel.
  let version: string;
  const retryDeadline = typeof performance !== 'undefined' ? performance.now() + 8000 : Date.now() + 8000;
  for (;;) {
    try {
      version = await resolveGameVersionWithRetry();
      console.info('[MG SpriteCatalog] game version resolved', version);
      break;
    } catch (err) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now >= retryDeadline) {
        console.error('[MG SpriteCatalog] failed to resolve game version', err);
        throw err;
      }
      console.warn('[MG SpriteCatalog] retrying game version detection...');
      await delay(200);
    }
  }
  const base = `${ctx.cfg.origin.replace(/\/$/, '')}/version/${version}/assets/`;
  if (!prefetchPromise) {
    prefetchPromise = prefetchAtlas(base);
  }

  const { app, renderer: _renderer, version: pixiVersion } = await resolvePixiFast();
  await ensureDocumentReady();

  ctx.state.ctors = getCtors(app);
  const renderer = _renderer || (app as any)?.renderer || (app as any)?.render || null;
  ctx.state.app = app;
  ctx.state.renderer = renderer;
  ctx.state.version = pixiVersion || version || version === '' ? (pixiVersion ?? version) : detectGameVersion();
  ctx.state.base = base;
  ctx.state.sig = curVariant(ctx.state).sig;

  const prefetched = await (prefetchPromise ?? Promise.resolve(null));
  await loadTextures(ctx.state.base, prefetched);

  // Headless mode by default; HUD removed. Keep API usable and jobs processing.
  const hud: HudHandles = {
    open() {
      ctx.state.open = true;
    },
    close() {
      ctx.state.open = false;
    },
    toggle() {
      ctx.state.open ? this.close() : this.open();
    },
    layout() {
      /* no-op */
    },
    root: undefined as any,
  };
  // Keep jobs processing even without HUD visibility.
  ctx.state.open = true;
  app.ticker?.add?.(() => {
    processJobs(ctx.state, ctx.cfg);
  });

  exposeApi(ctx.state, hud);

  // Build headless service for mod menu / console use.
  const g: any = globalThis as any;
  const uw: any = (g as any).unsafeWindow || g;
  const spriteApi = await import('./api/spriteApi');

  const ensureOverlayHost = () => {
    const id = 'mg-sprite-overlay';
    let host = document.getElementById(id);
    if (!host) {
      host = document.createElement('div');
      host.id = id;
      host.style.cssText =
        'position:fixed;top:8px;left:8px;z-index:2147480000;display:flex;flex-wrap:wrap;gap:8px;pointer-events:auto;background:transparent;align-items:flex-start;';
      document.body.appendChild(host);
    }
    return host;
  };

  const getSpriteDim = (tex: any, key: 'width' | 'height'): number | null => {
    const sources = [
      tex?.orig,
      tex?._orig,
      tex?.frame,
      tex?._frame,
      tex,
    ];
    for (const src of sources) {
      const value = src?.[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return null;
  };

  const padCanvasToSpriteBounds = (source: HTMLCanvasElement, tex: any): HTMLCanvasElement => {
    const rawW = source.width || 1;
    const rawH = source.height || 1;
    const baseW = Math.max(rawW, Math.round(getSpriteDim(tex, 'width') ?? rawW) || rawW);
    const baseH = Math.max(rawH, Math.round(getSpriteDim(tex, 'height') ?? rawH) || rawH);

    const trim = tex?.trim ?? tex?._trim ?? null;
    let offsetX = trim && typeof trim.x === 'number' ? Math.round(trim.x) : Math.round((baseW - rawW) / 2);
    let offsetY = trim && typeof trim.y === 'number' ? Math.round(trim.y) : Math.round((baseH - rawH) / 2);
    offsetX = Math.max(0, Math.min(baseW - rawW, offsetX));
    offsetY = Math.max(0, Math.min(baseH - rawH, offsetY));

    if (baseW === rawW && baseH === rawH && offsetX === 0 && offsetY === 0) {
      return source;
    }

    const canvas = document.createElement('canvas');
    canvas.width = baseW;
    canvas.height = baseH;
    const ctx2 = canvas.getContext('2d');
    if (!ctx2) return source;
    ctx2.imageSmoothingEnabled = false;
    ctx2.clearRect(0, 0, baseW, baseH);
    ctx2.drawImage(source, offsetX, offsetY);
    return canvas;
  };

  const renderTextureToCanvas = (tex: any) => {
    try {
      const spr = new ctx.state.ctors.Sprite(tex);
      const extracted = ctx.state.renderer.extract.canvas(spr, { resolution: 1 });
      spr.destroy?.({ children: true, texture: false, baseTexture: false });
      return padCanvasToSpriteBounds(extracted, tex);
    } catch {
      return null;
    }
  };

  const service = {
    ready: Promise.resolve(), // overwritten below
    state: ctx.state,
    cfg: ctx.cfg,
    list(category: any = 'any') {
      return spriteApi.listItemsByCategory(ctx.state, category);
    },
    getBaseSprite(params: any) {
      return spriteApi.getBaseSprite(params, ctx.state);
    },
    getSpriteWithMutations(params: any) {
      return spriteApi.getSpriteWithMutations(params, ctx.state, ctx.cfg);
    },
    buildVariant(mutations: any[]) {
      return spriteApi.buildVariant(mutations as any);
    },
    renderToCanvas(arg: any) {
      const tex = arg?.isTexture || arg?.frame ? arg : service.getSpriteWithMutations(arg);
      if (!tex) return null;
      return renderTextureToCanvas(tex);
    },
    async renderToDataURL(arg: any, type: string = 'image/png', quality?: number) {
      const c = service.renderToCanvas(arg);
      if (!c) return null;
      return c.toDataURL(type, quality);
    },
    // Render and append to a fixed overlay; each sprite gets its own wrapper.
    renderOnCanvas(
      arg: any,
      opts: { maxWidth?: number; maxHeight?: number; allowScaleUp?: boolean } = {}
    ) {
      const c = service.renderToCanvas(arg);
      if (!c) return null;
      c.style.background = 'transparent';
      c.style.display = 'block';
      // Use mutated dimensions, optionally scale down toward base dims, then optional max box.
      let mutW = c.width || c.clientWidth;
      let mutH = c.height || c.clientHeight;
      let baseW = mutW;
      let baseH = mutH;
      if (arg && !arg.isTexture && !arg.frame) {
        const baseTex = service.getBaseSprite(arg);
        if (baseTex) {
          baseW =
            baseTex?.orig?.width ??
            (baseTex as any)?._orig?.width ??
            baseTex?.frame?.width ??
            (baseTex as any)?._frame?.width ??
            (baseTex as any)?.width ??
            baseW;
          baseH =
            baseTex?.orig?.height ??
            (baseTex as any)?._orig?.height ??
            baseTex?.frame?.height ??
            (baseTex as any)?._frame?.height ??
            (baseTex as any)?.height ??
            baseH;
        }
      }
      // Scale down to base footprint if mutated is larger.
      const scaleToBase = Math.min(baseW / mutW, baseH / mutH, 1);
      let logicalW = mutW * scaleToBase;
      let logicalH = mutH * scaleToBase;
      // Then apply optional max box scaling.
      const { maxWidth, maxHeight, allowScaleUp } = opts;
      if (maxWidth || maxHeight) {
        const scaleW = maxWidth ? maxWidth / logicalW : 1;
        const scaleH = maxHeight ? maxHeight / logicalH : 1;
        let scale = Math.min(scaleW || 1, scaleH || 1);
        if (!allowScaleUp) scale = Math.min(scale, 1);
        logicalW = Math.floor(logicalW * scale);
        logicalH = Math.floor(logicalH * scale);
      }
      if (logicalW) c.style.width = `${logicalW}px`;
      if (logicalH) c.style.height = `${logicalH}px`;
      const wrap = document.createElement('div');
      wrap.style.cssText =
        'display:inline-flex;align-items:flex-start;justify-content:flex-start;padding:0;margin:0;background:transparent;border:none;flex:0 0 auto;';
      wrap.appendChild(c);
      ensureOverlayHost().appendChild(wrap);
      return { wrap, canvas: c };
    },
    clearOverlay() {
      const host = document.getElementById('mg-sprite-overlay');
      if (host) host.remove();
    },
    renderAnimToCanvases(params: any) {
      const item = ctx.state.items.find(it => it.key === `sprite/${params.category}/${params.id}` || it.key === params.id);
      if (!item) return [];
      if (item.isAnim && item.frames?.length) {
        const texes = params?.mutations?.length ? [service.getSpriteWithMutations(params)] : item.frames;
        return texes.map(t => renderTextureToCanvas(t)).filter(Boolean) as HTMLCanvasElement[];
      }
      const t = service.getSpriteWithMutations(params);
      return t ? [renderTextureToCanvas(t) as HTMLCanvasElement] : [];
    },
  };

  service.ready = Promise.resolve();

  uw.__MG_SPRITE_STATE__ = ctx.state;
  uw.__MG_SPRITE_CFG__ = ctx.cfg;
  uw.__MG_SPRITE_API__ = spriteApi;
  uw.__MG_SPRITE_SERVICE__ = service;
  // Convenience bindings for console/other modules
  uw.getSpriteWithMutations = service.getSpriteWithMutations;
  uw.getBaseSprite = service.getBaseSprite;
  uw.buildSpriteVariant = service.buildVariant;
  uw.listSpritesByCategory = service.list;
  uw.renderSpriteToCanvas = service.renderToCanvas;
  uw.renderSpriteToDataURL = service.renderToDataURL;
  uw.MG_SPRITE_HELPERS = service;

  console.log('[MG SpriteCatalog] ready', {
    version: ctx.state.version,
    pixi: version,
    textures: ctx.state.tex.size,
    items: ctx.state.items.length,
    cats: ctx.state.cats.size,
  });
}

// Kick off automatically similar to userscript
const __mg_ready = start();
__mg_ready.catch(err => console.error('[MG SpriteCatalog] failed', err));
