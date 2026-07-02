// Generic PIXI helpers (lightly typed)

export interface PixiCtors {
  Container: any;
  Sprite: any;
  Texture: any;
  Rectangle: any;
  Text: any;
}

export function findAny(root: any, pred: (node: any) => boolean, lim = 25000) {
  const stack = [root];
  const seen = new Set<any>();
  let n = 0;
  while (stack.length && n++ < lim) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    if (pred(node)) return node;
    const children = (node as any).children;
    if (Array.isArray(children)) {
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
  }
  return null;
}

/**
 * Same as findAny, but gives each top-level branch of `root` its own
 * search budget instead of pooling one `lim` across the whole tree. A
 * single huge branch (e.g. a tile-based world layer with tens of thousands
 * of sprites) would otherwise exhaust the shared budget before the walk
 * ever reaches sibling branches like a UI layer, making anything only
 * found there (e.g. Text nodes) unreachable once the world grows large
 * enough — a race against world size, not a real "not found" result.
 */
function findAnyPerBranch(root: any, pred: (node: any) => boolean, limPerBranch = 25000) {
  if (!root) return null;
  if (pred(root)) return root;
  const children = (root as any).children;
  if (!Array.isArray(children)) return null;
  for (const child of children) {
    const hit = findAny(child, pred, limPerBranch);
    if (hit) return hit;
  }
  return null;
}

/**
 * Try to extract PIXI constructors from a container/stage node.
 *
 * Sprites/tiles typically render before any UI text does, so requiring only
 * a Sprite match here would lock in `Text: null` if this runs early (no
 * retry happens once a stage walk "succeeds"). Returning null here instead
 * makes the caller's retry loop keep trying until a text node exists too.
 */
function ctorsFromStage(stage: any): PixiCtors | null {
  if (!stage) return null;
  const anySpr = findAnyPerBranch(stage, (x: any) => x?.texture?.frame && x?.constructor && x?.texture?.constructor && x?.texture?.frame?.constructor);
  if (!anySpr) return null;
  // The game's Rive-based display objects can also expose `.text`/`.style`,
  // so a bare "has text and style" match can capture a RiveSprite constructor
  // — whose positional-args constructor then throws on `{ text, style }`
  // (e.g. `artboard.advance` of undefined). Prefer genuine Pixi v8 text nodes
  // (renderPipeId 'text'); keep the loose match as a fallback for other Pixi
  // versions, but never accept Rive artboard nodes.
  const hasTextAndStyle = (x: any) => (typeof x?.text === 'string' || typeof x?.text === 'number') && x?.style;
  const isRiveLikeNode = (x: any) => !!(x?.artboard || x?.stateMachine || x?.rive);
  const anyTxt =
    findAnyPerBranch(stage, (x: any) => hasTextAndStyle(x) && x?.renderPipeId === 'text')
    ?? findAnyPerBranch(stage, (x: any) => hasTextAndStyle(x) && !isRiveLikeNode(x));
  if (!anyTxt) return null;
  return {
    Container: stage.constructor,
    Sprite: anySpr.constructor,
    Texture: anySpr.texture.constructor,
    Rectangle: anySpr.texture.frame.constructor,
    Text: anyTxt.constructor,
  };
}

export function getCtors(app: any): PixiCtors {
  const root: any = (globalThis as any).unsafeWindow || (globalThis as any);
  const P = root.PIXI;
  if (P?.Texture && P?.Sprite && P?.Container && P?.Rectangle) {
    return { Container: P.Container, Sprite: P.Sprite, Texture: P.Texture, Rectangle: P.Rectangle, Text: P.Text || null };
  }

  // Stage walk — covers Application path and renderer-only path after first render.
  const renderer = app?.renderer ?? app;
  for (const candidate of [app?.stage, renderer?.lastObjectRendered, renderer?.stage]) {
    const hit = ctorsFromStage(candidate);
    if (hit) return hit;
  }

  throw new Error('No Sprite found (ctors) — PIXI not exposed and stage not yet rendered.');
}

export const baseTexOf = (tex: any) => tex?.baseTexture ?? tex?.source?.baseTexture ?? tex?.source ?? tex?._baseTexture ?? null;

export function rememberBaseTex(tex: any, atlasBases: Set<any>): void {
  const base = baseTexOf(tex);
  if (base) atlasBases.add(base);
}
