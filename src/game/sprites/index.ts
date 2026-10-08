import { pageWindow } from '../../platform/pageContext';
import { spriteContext, setPixiHooks } from './context';
import { createPixiHooks } from './pixi/hooks';
import { resolvePixiFast, waitForCtors } from './pixi/resolvePixi';
import { watchRendererHealth } from './pixi/rendererHealth';
import { sleep } from './utils/async';
import { getJSON, getBlob, blobToImage, loadAtlasJsons, isKtx2Path, loadKtx2AsTexture } from './data/assetFetcher';
import { buildAtlasTextures, isAtlas } from './pixi/atlasToTextures';
import { buildItemsFromTextures } from './data/catalogIndexer';
import { joinPath, relPath } from './utils/path';
import { exposeApi, type HudHandles } from './api/expose';
import { exposeSpriteService } from './api/consoleService';
import { curVariant, processJobs } from './mutations/variantBuilder';
import { detectGameVersion } from '../gameVersion';

/**
 * The sprite catalog: every texture of the game's atlases, keyed by frame
 * name, built on the game's own Pixi renderer. Importing this module installs
 * the Pixi init hooks and starts the catalog; it must load at document-start,
 * before the game creates its renderer.
 */

const ctx = spriteContext;
const hooks = createPixiHooks();
setPixiHooks(hooks);

type PrefetchedAtlas = {
  base: string;
  atlasJsons: Record<string, any>;
  blobs: Map<string, Blob>;
};

export type AtlasBundle = PrefetchedAtlas;

let prefetchPromise: Promise<PrefetchedAtlas | null> | null = null;

/**
 * The atlas JSONs (and whatever image blobs the prefetch collected), kept
 * alive after boot instead of being dropped once `loadTextures` has built its
 * textures.
 *
 * The skin system reads the frame rectangles out of these JSONs to know the
 * exact size each replacement image must be fitted to. Downloading and parsing
 * them again on every skin change would be pure waste.
 */
let atlasBundle: PrefetchedAtlas | null = null;
let atlasBundleResolve: ((bundle: PrefetchedAtlas | null) => void) | null = null;
const atlasBundleReady = new Promise<PrefetchedAtlas | null>(resolve => {
  atlasBundleResolve = resolve;
});

/** Resolves once the atlas JSONs and original blobs are available (null if the load failed). */
export function whenAtlasBundleReady(): Promise<PrefetchedAtlas | null> {
  return atlasBundleReady;
}

/** Synchronous access to the atlas bundle; null until `whenAtlasBundleReady` resolves. */
export function getAtlasBundle(): PrefetchedAtlas | null {
  return atlasBundle;
}

/** Polls for the game version; the page may not have loaded the game's scripts yet. */
async function waitForGameVersion(timeoutMs = 12_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const version = detectGameVersion();
    if (version) return version;
    if (Date.now() >= deadline) throw new Error('Game version not found.');
    await sleep(120);
  }
}

/**
 * Downloads the manifest, the atlas JSONs and the image blobs early, while
 * the game is still starting: the network is the heavy part. KTX2 atlases are
 * skipped, they need Pixi's GPU pipeline and load in `loadTextures`.
 */
async function prefetchAtlas(base: string): Promise<PrefetchedAtlas | null> {
  try {
    const manifest = await getJSON<any>(joinPath(base, 'manifest.json'));
    const atlasJsons = await loadAtlasJsons(base, manifest);
    const blobs = new Map<string, Blob>();
    for (const [path, data] of Object.entries<any>(atlasJsons)) {
      if (!isAtlas(data)) continue;
      const imgPath = relPath(path, data.meta.image);
      if (isKtx2Path(imgPath)) continue;
      try {
        blobs.set(imgPath, await getBlob(joinPath(base, imgPath)));
      } catch {
        // One missing image is not fatal: loadTextures fetches it again.
      }
    }
    return { base, atlasJsons, blobs };
  } catch {
    return null;
  }
}

// Atlases the mod has no use for (weather effects). The game may not have
// them resident in the renderer at boot, so instead of polling and failing on
// every load they are skipped outright. The resolution suffix is optional: the
// game renamed `weather.json` to `weather-1x.json` / `weather-2x.json` when it
// started packing every atlas at two resolutions.
const SKIPPED_ATLAS_PATTERNS = [/(^|\/)weather(-\d+x)?\.json$/i];

async function loadTextures(base: string, prefetched?: PrefetchedAtlas | null) {
  const usePrefetched = prefetched && prefetched.base === base ? prefetched : null;
  const atlasJsons =
    usePrefetched?.atlasJsons ?? (await loadAtlasJsons(base, await getJSON<any>(joinPath(base, 'manifest.json'))));

  // Publish the bundle even when the prefetch failed and the JSONs were loaded
  // again here: the skin system must not depend on which path won. Blobs stay
  // whatever the prefetch collected; the compositor fetches any it misses.
  atlasBundle = usePrefetched ?? { base, atlasJsons, blobs: new Map<string, Blob>() };
  atlasBundleResolve?.(atlasBundle);
  atlasBundleResolve = null;

  const ctors = ctx.state.ctors;
  if (!ctors?.Texture || !ctors?.Rectangle) throw new Error('PIXI constructors missing');

  for (const [path, data] of Object.entries<any>(atlasJsons)) {
    if (!isAtlas(data)) continue;
    if (SKIPPED_ATLAS_PATTERNS.some(re => re.test(path))) continue;
    const imgPath = relPath(path, data.meta.image);

    try {
      let baseTex: any;
      if (isKtx2Path(imgPath)) {
        // KTX2 compressed texture: reuse the base texture the game already loaded.
        baseTex = await loadKtx2AsTexture(imgPath, ctx.state.renderer, ctors);
      } else {
        const blob = usePrefetched?.blobs.get(imgPath) ?? (await getBlob(joinPath(base, imgPath)));
        baseTex = ctors.Texture.from(await blobToImage(blob));
      }

      buildAtlasTextures(data, baseTex, ctx.state.tex, ctx.state.atlasBases, {
        Texture: ctors.Texture,
        Rectangle: ctors.Rectangle,
      });
    } catch (error) {
      // One missing or lazily loaded atlas must not abort the whole catalog
      // boot, which would also keep __MG_SPRITE_STATE__ from ever being exposed.
      console.warn('[MG SpriteCatalog] skipping atlas (texture load failed)', { path, imgPath, error });
    }
  }

  const { items, cats } = buildItemsFromTextures(ctx.state.tex);
  ctx.state.items = items;
  ctx.state.filtered = items.slice();
  ctx.state.cats = cats;
  ctx.state.loaded = true;
}

function ensureDocumentReady() {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise<void>(resolve => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

async function start() {
  if (ctx.state.started) return;
  ctx.state.started = true;

  // The version gives the asset base, so the prefetch can start right away.
  let version: string;
  try {
    version = await waitForGameVersion();
    console.info('[MG SpriteCatalog] game version resolved', version);
  } catch (err) {
    console.error('[MG SpriteCatalog] failed to resolve game version', err);
    throw err;
  }
  const base = `${ctx.cfg.origin.replace(/\/$/, '')}/version/${version}/assets/`;
  if (!prefetchPromise) prefetchPromise = prefetchAtlas(base);

  const { app, renderer: resolvedRenderer, version: pixiVersion } = await resolvePixiFast(hooks);
  await ensureDocumentReady();

  const renderer = resolvedRenderer || app?.renderer || app?.render || null;
  ctx.state.ctors = await waitForCtors(app, renderer);
  ctx.state.app = app;
  ctx.state.renderer = renderer;
  ctx.state.version = pixiVersion ?? version;
  ctx.state.base = base;
  ctx.state.sig = curVariant(ctx.state).sig;
  watchRendererHealth(ctx.state, hooks);

  // Expose the (still filling) state as soon as renderer and ctors are ready,
  // without waiting for loadTextures below: features such as the crop value
  // overlay only need those two and should not wait on slow or failing atlas
  // loads. It is the same object throughout, so later fields (tex, items,
  // loaded, ...) show up through this early reference too.
  (pageWindow as any).__MG_SPRITE_STATE__ = ctx.state;

  await loadTextures(ctx.state.base, await prefetchPromise);

  // No HUD any more: the catalog runs headless, and the variant job queue keeps running.
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
    layout() {},
    root: undefined as any,
  };
  ctx.state.open = true;
  app.ticker?.add?.(() => {
    processJobs(ctx.state, ctx.cfg);
  });

  exposeApi(ctx.state, hud);
  exposeSpriteService(ctx);

  console.log('[MG SpriteCatalog] ready', {
    version: ctx.state.version,
    pixi: version,
    textures: ctx.state.tex.size,
    items: ctx.state.items.length,
    cats: ctx.state.cats.size,
  });
}

// `start()` sets `started` up front against concurrent re-entry and never
// clears it, so a transient failure (version detection or ctors resolution
// timing out) used to leave `__MG_SPRITE_STATE__` unset for the whole session,
// silently killing every Pixi feature (crop price, locker indicator, sell all
// pets, notification bell) behind one console.error. It retries forever
// instead, resetting the guard so the next attempt can run.
async function startWithRetry(): Promise<void> {
  const RETRY_DELAY_MS = 2000;
  for (;;) {
    try {
      await start();
      return;
    } catch (err) {
      console.error('[MG SpriteCatalog] failed, retrying', err);
      ctx.state.started = false;
      await sleep(RETRY_DELAY_MS);
    }
  }
}
void startWithRetry();
