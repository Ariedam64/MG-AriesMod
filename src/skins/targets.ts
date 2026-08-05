// Resolves atlas frame keys into the exact rectangle a skin must be written to.

import { getAtlasBundle, whenAtlasBundleReady, type AtlasBundle } from '../sprite/index';
import { isAtlas } from '../sprite/pixi/atlasToTextures';
import { animParse, splitKey } from '../sprite/utils/path';
import type { SkinTarget, SkinnableObject } from './types';

/**
 * The atlas image format is deliberately not checked here.
 *
 * Since game v834 every atlas ships as KTX2, which cannot be decoded or
 * re-encoded in the browser — but the applier never touches the atlas image:
 * it repoints the frame's Texture at a canvas of our own. Compression of the
 * original is therefore irrelevant to whether a frame can be skinned.
 */
let targetCache: Map<string, SkinTarget> | null = null;

function buildTargets(bundle: AtlasBundle): Map<string, SkinTarget> {
  const targets = new Map<string, SkinTarget>();

  for (const data of Object.values<any>(bundle.atlasJsons)) {
    if (!isAtlas(data)) continue;
    for (const [frameKey, frameData] of Object.entries<any>(data.frames || {})) {
      const fr = frameData?.frame;
      if (!fr || typeof fr.x !== 'number' || typeof fr.w !== 'number') continue;

      const rotated = !!frameData.rotated;
      // TexturePacker keeps `frame.w/h` as the *unrotated* sprite size; a
      // rotated frame therefore occupies an h×w region in the atlas image.
      // This mirrors buildAtlasTextures, which swaps the same way.
      const occupiedRect = rotated
        ? { x: fr.x, y: fr.y, w: fr.h, h: fr.w }
        : { x: fr.x, y: fr.y, w: fr.w, h: fr.h };

      const degenerate = !(fr.w > 0 && fr.h > 0);
      targets.set(frameKey, {
        frameKey,
        logicalSize: { w: fr.w, h: fr.h },
        occupiedRect,
        rotated,
        skinnable: !degenerate,
        blockedReason: degenerate ? 'Zero-sized frame' : undefined,
      });
    }
  }

  return targets;
}

/** Loads (once) the frameKey → SkinTarget index. */
export async function loadTargets(): Promise<Map<string, SkinTarget>> {
  if (targetCache) return targetCache;
  const bundle = getAtlasBundle() ?? (await whenAtlasBundleReady());
  targetCache = bundle ? buildTargets(bundle) : new Map();
  return targetCache;
}


const categoryOfKey = (frameKey: string): string => {
  const parts = splitKey(frameKey);
  const start = parts[0] === 'sprite' || parts[0] === 'sprites' ? 1 : 0;
  return parts[start] || 'misc';
};

const labelOfKey = (objectKey: string): string => {
  const parts = splitKey(objectKey);
  return parts[parts.length - 1] || objectKey;
};

/**
 * Groups frames into user-facing objects: `Carrot-1..4` becomes one `Carrot`
 * with four slots. Mirrors how buildItemsFromTextures groups the catalog, so
 * the menu and the sprite catalog agree on what "an object" is.
 */
export function groupTargets(targets: Map<string, SkinTarget>): SkinnableObject[] {
  const byObject = new Map<string, SkinTarget[]>();

  for (const target of targets.values()) {
    const anim = animParse(target.frameKey);
    const objectKey = anim ? anim.baseKey : target.frameKey;
    const bucket = byObject.get(objectKey);
    if (bucket) bucket.push(target);
    else byObject.set(objectKey, [target]);
  }

  const objects: SkinnableObject[] = [];
  for (const [key, slots] of byObject) {
    slots.sort((a, b) => {
      const ia = animParse(a.frameKey)?.idx ?? 0;
      const ib = animParse(b.frameKey)?.idx ?? 0;
      if (ia !== ib) return ia - ib;
      return a.frameKey.localeCompare(b.frameKey);
    });
    objects.push({ key, category: categoryOfKey(key), label: labelOfKey(key), slots });
  }

  objects.sort((a, b) => a.key.localeCompare(b.key));
  return objects;
}
