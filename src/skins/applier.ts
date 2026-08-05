// Retargets the game's own Texture objects onto skin canvases, and back.
//
// Pixi Textures are shared: every sprite showing a Birdhouse points at the one
// Texture the atlas parser built for `sprite/decor/Birdhouse`. Mutating that
// object once updates all of them at no per-frame cost — no render loop hook,
// no display-list traversal on every tick.
//
// Only `source`, `frame` and `rotate` change. `orig`, `trim` and
// `defaultAnchor` are left exactly as the game computed them, which is why a
// skinned sprite keeps the original's footprint and anchor in the world.

import { getSpriteState } from '../sprite/index';
import type { SkinTarget } from './types';

const MAX_WALK_NODES = 40_000;

interface OriginalTextureState {
  texture: any;
  source: unknown;
  frame: { x: number; y: number; width: number; height: number } | null;
  rotate: unknown;
  dynamic: unknown;
}

interface AppliedSkin {
  originals: OriginalTextureState[];
  /** Nodes poked on apply; they must be poked again on revert to repaint. */
  nodes: any[];
}

const applied = new Map<string, AppliedSkin>();

/** Textures for one frame, plus the display objects drawing them. */
export interface LabelMatch {
  textures: any[];
  nodes: any[];
}

/**
 * Index of everything drawn from an atlas, keyed two ways.
 *
 * `byLabel` is the obvious route but is not enough on its own: the game builds
 * derived Texture instances per sprite (`new Texture({ source, frame })`),
 * and those inherit no label. Only the spritesheet's canonical texture keeps
 * it, and that one is often referenced by nothing the player can see — which
 * looks exactly like a skin that applies successfully and changes nothing.
 *
 * `byRect` catches those clones: a frame is uniquely identified by its
 * rectangle within the atlas, whatever the instance is called.
 */
export interface StageIndex {
  byLabel: Map<string, LabelMatch>;
  byRect: Map<string, LabelMatch>;
}

const rectKey = (x: number, y: number, w: number, h: number) => `${x}|${y}|${w}|${h}`;

interface SkinsDebugState {
  lastWalkNodes: number;
  lastLabelCount: number;
  lastRectCount: number;
  lastApply: Record<
    string,
    {
      viaLabel: number;
      viaRect: number;
      retargeted: number;
      nodesPoked: number;
      failures: string[];
    }
  >;
}

const debugState: SkinsDebugState = {
  lastWalkNodes: 0,
  lastLabelCount: 0,
  lastRectCount: 0,
  lastApply: {},
};
{
  const root: any = (globalThis as any).unsafeWindow || (globalThis as any);
  root.__MG_SKINS_DEBUG__ = debugState;
}

const frameRectOf = (texture: any) => texture?.frame ?? texture?._frame ?? null;
const sourceOf = (texture: any) =>
  texture?.source ?? texture?._source ?? texture?.baseTexture ?? null;

/**
 * Walks the live display list once, indexing by label both the textures and
 * the display objects drawing them.
 *
 * The nodes matter as much as the textures: Pixi v8 only subscribes a Sprite
 * to its texture's 'update' event when the texture is `dynamic`, which atlas
 * frames never are. Mutating the shared texture is therefore invisible until
 * each sprite is told to re-read it.
 *
 * Every match is kept, not just the first: the mod's own overlays can put a
 * sprite carrying the same frame label on the game's stage, and picking the
 * wrong one would silently skin nothing the player can see.
 */
function collectGameMatches(): StageIndex {
  const state = getSpriteState();
  const roots = [state.app?.stage, state.renderer?.lastObjectRendered, state.renderer?.stage];
  const byLabel = new Map<string, LabelMatch>();
  const byRect = new Map<string, LabelMatch>();
  const seenNodes = new Set<unknown>();
  let visited = 0;

  // The sprite catalog's own textures must never be retargeted: the menu
  // renders the "original" preview from them, and skinning those would make
  // the before/after comparison show the same image twice.
  const catalogTextures = new Set<unknown>(state.tex.values());

  const add = (bucket: Map<string, LabelMatch>, key: string, texture: any, node: any) => {
    let match = bucket.get(key);
    if (!match) {
      match = { textures: [], nodes: [] };
      bucket.set(key, match);
    }
    if (!match.textures.includes(texture)) match.textures.push(texture);
    if (!match.nodes.includes(node)) match.nodes.push(node);
  };

  for (const root of roots) {
    if (!root) continue;
    const stack = [root];
    while (stack.length && visited < MAX_WALK_NODES) {
      const node: any = stack.pop();
      if (!node || seenNodes.has(node)) continue;
      seenNodes.add(node);
      visited += 1;

      const texture = node.texture;
      if (texture && !catalogTextures.has(texture)) {
        const label = texture.label;
        if (typeof label === 'string' && label) add(byLabel, label, texture, node);

        const rect = frameRectOf(texture);
        if (rect) add(byRect, rectKey(rect.x, rect.y, rect.width, rect.height), texture, node);
      }

      const children = node.children;
      if (Array.isArray(children)) {
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
    }
  }

  debugState.lastWalkNodes = visited;
  debugState.lastLabelCount = byLabel.size;
  debugState.lastRectCount = byRect.size;
  return { byLabel, byRect };
}

/**
 * Finds the canonical Texture the game registered for a frame key, without
 * needing anything on screen to be using it.
 *
 * This is what lets an object be skinned before the player has ever seen it —
 * walking the display list can only ever find what is already drawn. It also
 * matters because the game bakes plant sprites into RenderTextures: a bake
 * performed after the canonical texture has been skinned comes out skinned.
 *
 * `Texture.from(<string>)` resolves through Pixi's global Cache, so the class
 * the sprite catalog already captured is enough — no exposed `window.PIXI`
 * required, which the game does not reliably provide.
 */
function lookupCachedTexture(frameKey: string): any {
  const Texture = getSpriteState().ctors?.Texture;
  if (typeof Texture?.from === 'function') {
    try {
      const hit = Texture.from(frameKey);
      // A cache miss yields EMPTY (or a freshly made blank), never a real frame.
      if (hit && hit !== Texture.EMPTY && frameRectOf(hit)) return hit;
    } catch {
      /* not in the cache; fall through */
    }
  }

  const root: any = (globalThis as any).unsafeWindow || (globalThis as any);
  const pixi = root.PIXI;
  for (const holder of [pixi?.Assets, pixi?.Cache]) {
    if (typeof holder?.get !== 'function') continue;
    try {
      const hit = holder.get(frameKey);
      if (hit && frameRectOf(hit)) return hit;
    } catch {
      /* ignore and fall through */
    }
  }
  return null;
}

/**
 * Assigns the texture's source, working around `source` being a getter-only
 * accessor.
 *
 * The bundle is not guaranteed to run in strict mode, where such an assignment
 * would throw — it can simply do nothing instead, which looks exactly like a
 * skin that "applied fine" but changed nothing on screen. Verify and fall back
 * to the backing field.
 */
function assignSource(texture: any, source: unknown): boolean {
  try {
    texture.source = source;
  } catch {
    /* getter-only in strict mode; handled below */
  }
  if (sourceOf(texture) === source) return true;

  for (const field of ['_source', 'baseTexture', '_baseTexture']) {
    try {
      texture[field] = source;
      if (sourceOf(texture) === source) return true;
    } catch {
      /* try the next one */
    }
  }
  return false;
}

function retarget(
  texture: any,
  skinSource: unknown,
  width: number,
  height: number,
): OriginalTextureState | null {
  const rect = frameRectOf(texture);
  if (!rect) return null;

  const original: OriginalTextureState = {
    texture,
    source: sourceOf(texture),
    frame: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    rotate: texture.rotate,
    dynamic: texture.dynamic,
  };

  if (!assignSource(texture, skinSource)) return null;

  // The skin canvas holds the frame on its own, so the window into it is the
  // whole canvas, unrotated.
  rect.x = 0;
  rect.y = 0;
  rect.width = width;
  rect.height = height;
  texture.rotate = 0;

  notifyTextureChanged(texture);
  return original;
}

/**
 * Tells Pixi the texture itself changed.
 *
 * Necessary but not sufficient: `updateUvs()` only recomputes coordinates, and
 * the 'update' event reaches nobody because Pixi v8 subscribes a Sprite to its
 * texture only when that texture is `dynamic` — atlas frames are not. Flipping
 * `dynamic` on makes later mutations propagate on their own; the sprites that
 * already exist still have to be poked individually (see `pokeNode`).
 */
function notifyTextureChanged(texture: any): void {
  try {
    texture.dynamic = true;
  } catch {
    /* ignore */
  }
  try {
    texture.updateUvs?.();
  } catch {
    /* ignore */
  }
  try {
    texture.update?.();
  } catch {
    /* ignore */
  }
  try {
    texture.emit?.('update', texture);
  } catch {
    /* ignore */
  }
}

/**
 * Forces one display object to re-read its texture.
 *
 * Re-assigning through the `texture` setter is the reliable route: it runs the
 * object's own invalidation path and, now that the texture is `dynamic`,
 * subscribes it to future updates. The setter short-circuits when handed the
 * same instance, hence the bounce through EMPTY.
 */
function pokeNode(node: any, Texture: any): boolean {
  const texture = node?.texture;
  if (!texture) return false;

  const empty = Texture?.EMPTY;
  if (empty && empty !== texture) {
    try {
      node.texture = empty;
      node.texture = texture;
      return true;
    } catch {
      /* fall through to the direct invalidation below */
    }
  }

  try {
    if (typeof node.onViewUpdate === 'function') {
      node.onViewUpdate();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Points every game texture labelled `frameKey` at `canvas`.
 * Returns false when nothing could be retargeted, so the caller can surface it
 * rather than let the user believe the skin was applied.
 */
export function applySkinTexture(
  target: SkinTarget,
  canvas: HTMLCanvasElement,
  getIndex: () => StageIndex = collectGameMatches,
): boolean {
  const frameKey = target.frameKey;
  revertSkin(frameKey);

  const state = getSpriteState();
  const Texture = state.ctors?.Texture;
  if (!Texture?.from) return false;

  // Deliberately lazy: the walk costs ~30k nodes, and the caller shares one
  // index across a whole pass. Nothing walks when there is no skin to apply.
  const stage = getIndex();
  const labelMatch = stage.byLabel.get(frameKey);
  const { x, y, w, h } = target.occupiedRect;
  const rectMatch = stage.byRect.get(rectKey(x, y, w, h));

  // The atlas source the frame really belongs to. The sprite catalog builds
  // its textures on the game's own base texture, so this identifies the atlas
  // without guessing — and keeps a coincidental rectangle collision in some
  // unrelated texture from being skinned.
  const atlasSource = sourceOf(state.tex.get(frameKey));

  const textures: any[] = [];
  const nodes: any[] = [];
  const cached = lookupCachedTexture(frameKey);
  if (cached) textures.push(cached);

  const consider = (match: LabelMatch | undefined, checkSource: boolean) => {
    if (!match) return 0;
    let kept = 0;
    for (const texture of match.textures) {
      if (checkSource && atlasSource && sourceOf(texture) !== atlasSource) continue;
      if (!textures.includes(texture)) textures.push(texture);
      kept += 1;
    }
    for (const node of match.nodes) {
      if (checkSource && atlasSource && sourceOf(node?.texture) !== atlasSource) continue;
      if (!nodes.includes(node)) nodes.push(node);
    }
    return kept;
  };

  const viaLabel = consider(labelMatch, false);
  const viaRect = consider(rectMatch, true);

  const failures: string[] = [];
  const record = (retargeted: number, nodesPoked: number) => {
    debugState.lastApply[frameKey] = { viaLabel, viaRect, retargeted, nodesPoked, failures };
  };

  if (!textures.length) {
    failures.push('no texture found');
    record(0, 0);
    return false;
  }

  let skinSource: unknown;
  try {
    skinSource = sourceOf(Texture.from(canvas));
  } catch (error) {
    failures.push(`Texture.from: ${String(error)}`);
    record(0, 0);
    return false;
  }
  if (!skinSource) {
    failures.push('skin source missing');
    record(0, 0);
    return false;
  }

  const originals: OriginalTextureState[] = [];
  for (const texture of textures) {
    try {
      const original = retarget(texture, skinSource, canvas.width, canvas.height);
      if (original) originals.push(original);
      else failures.push('source assignment refused');
    } catch (error) {
      failures.push(String(error));
    }
  }

  // Sprites already on screen do not listen for texture changes, so each one
  // has to be told explicitly. Ones created later pick up the mutated texture
  // by themselves.
  let nodesPoked = 0;
  for (const node of nodes) {
    if (pokeNode(node, Texture)) nodesPoked += 1;
  }

  record(originals.length, nodesPoked);
  if (!originals.length) return false;
  applied.set(frameKey, { originals, nodes });
  return true;
}

export function revertSkin(frameKey: string): void {
  const entry = applied.get(frameKey);
  if (!entry) return;
  applied.delete(frameKey);

  for (const { texture, source, frame, rotate, dynamic } of entry.originals) {
    try {
      assignSource(texture, source);
      const rect = frameRectOf(texture);
      if (rect && frame) {
        rect.x = frame.x;
        rect.y = frame.y;
        rect.width = frame.width;
        rect.height = frame.height;
      }
      texture.rotate = rotate;
      texture.updateUvs?.();
      texture.update?.();
      texture.dynamic = dynamic;
    } catch (error) {
      console.warn('[MG Skins] texture revert failed', { frameKey, error });
    }
  }

  // Same reason as on apply: the sprites are not listening, so restoring the
  // texture alone would leave the skin on screen until something else happened
  // to invalidate them.
  const Texture = getSpriteState().ctors?.Texture;
  for (const node of entry.nodes) pokeNode(node, Texture);
}

export function revertAll(): void {
  for (const frameKey of [...applied.keys()]) revertSkin(frameKey);
}

/**
 * Drops the stored originals without restoring them.
 *
 * Used when the renderer was torn down and rebuilt: those Texture objects are
 * dead, so reverting them would be pointless at best. The fresh renderer comes
 * up with the game's own pristine textures anyway.
 */
export function forgetAppliedState(): void {
  applied.clear();
}

export { collectGameMatches };
