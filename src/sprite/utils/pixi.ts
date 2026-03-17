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

/** Try to extract PIXI constructors from a container/stage node. */
function ctorsFromStage(stage: any): PixiCtors | null {
  if (!stage) return null;
  const anySpr = findAny(stage, (x: any) => x?.texture?.frame && x?.constructor && x?.texture?.constructor && x?.texture?.frame?.constructor);
  if (!anySpr) return null;
  const anyTxt = findAny(stage, (x: any) => (typeof x?.text === 'string' || typeof x?.text === 'number') && x?.style);
  return {
    Container: stage.constructor,
    Sprite: anySpr.constructor,
    Texture: anySpr.texture.constructor,
    Rectangle: anySpr.texture.frame.constructor,
    Text: anyTxt?.constructor || null,
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
