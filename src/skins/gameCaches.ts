// Bridge to the game's cache of *derived* artwork.
//
// Retargeting a frame's Texture only fixes what the game draws straight from
// that texture. Mutated plants are composited into a RenderTexture per
// `species-mutations` combo and cached, so they need telling separately. The
// game's own RenderTextureCache exposes `rebakeAll()`, which re-runs every live
// entry against the current base textures; it marks those textures `dynamic`,
// so their update notification actually reaches sprites — unlike raw atlas
// frames.
//
// Inventory icons are deliberately NOT handled here. Each one is rendered from
// `Texture.from(<key>)` and then frozen with `generateTexture()`, its temporary
// container destroyed straight after, so it keeps no live link to the atlas.
// There is no central cache to clear either: every inventory widget owns its
// texture, keyed on item identity and never on skin state. Icons therefore pick
// up a skin when they are next generated — a reload does it — and no amount of
// invalidation from here can refresh one already on screen.

import { getPixiApp, getSpriteState } from '../sprite/index';

interface RenderTextureCache {
  rebakeAll: () => number;
  getStats?: () => unknown;
}

const hasRebake = (value: any): value is RenderTextureCache =>
  !!value && typeof value.rebakeAll === 'function';

/**
 * Objects that might own a game cache, nearest first.
 *
 * `getPixiApp()` matters: `state.app` is usually the synthetic stand-in built
 * when the renderer hook fires before the app hook, and it carries none of the
 * Application extensions the game installs.
 */
function holders(): any[] {
  const state = getSpriteState();
  const root: any = (globalThis as any).unsafeWindow || (globalThis as any);
  return [
    getPixiApp(),
    state.app,
    (state.app as any)?.app,
    state.renderer,
    (state.renderer as any)?.app,
    root.__PIXI_APP__,
    root.app,
  ].filter(Boolean);
}

/**
 * Shallow hunt for a named cache property.
 *
 * Bounded hard — this walks live engine objects, not a data structure, and must
 * never become an expensive or recursive crawl.
 */
function search<T>(property: string, matches: (value: any) => value is T): T | null {
  const seen = new Set<unknown>();
  let queue = holders();

  for (let depth = 0; depth < 3 && queue.length; depth += 1) {
    const next: any[] = [];
    for (const node of queue) {
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (seen.size > 400) return null;

      if (matches((node as any)[property])) return (node as any)[property];

      for (const key of ['app', 'engine', 'game', 'renderer', 'stage', '_app', 'quinoa']) {
        const child = (node as any)[key];
        if (child && typeof child === 'object' && !seen.has(child)) next.push(child);
      }
    }
    queue = next;
  }
  return null;
}

export function findRenderTextureCache(): RenderTextureCache | null {
  for (const holder of holders()) {
    if (hasRebake(holder?.renderTextureCache)) return holder.renderTextureCache;
  }
  return search('renderTextureCache', hasRebake);
}

/**
 * Re-composites every cached mutated-plant texture against current skins.
 *
 * Deliberately not called on a timer: a rebake costs one GPU `generateTexture`
 * per live entry, so this belongs on skin transitions (apply / remove / toggle)
 * only.
 */
export function rebakeAll(): number | null {
  try {
    return findRenderTextureCache()?.rebakeAll() ?? null;
  } catch (error) {
    console.warn('[MG Skins] rebakeAll failed', error);
    return null;
  }
}

export function rebakeStats(): unknown {
  try {
    return findRenderTextureCache()?.getStats?.() ?? null;
  } catch {
    return null;
  }
}
