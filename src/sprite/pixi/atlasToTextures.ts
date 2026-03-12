import { rememberBaseTex } from '../utils/pixi';
import type { SpriteTexture } from '../types';

export const isAtlas = (j: any) => j && typeof j === 'object' && j.frames && j.meta && typeof j.meta.image === 'string';

export function mkRect(Rectangle: any, x: number, y: number, w: number, h: number) {
  return new Rectangle(x, y, w, h);
}

export function mkSubTex(Texture: any, baseTex: any, frame: any, orig: any, trim: any, rotate: number, anchor?: { x: number; y: number }) {
  let t: SpriteTexture;
  // Resolve the TextureSource: baseTex may be a Texture (v7/v8), a BaseTexture (v7), or a TextureSource (v8).
  const src = baseTex?.source ?? baseTex?.baseTexture ?? baseTex;
  try {
    t = new Texture({ source: src, frame, orig, trim: trim || undefined, rotate: rotate || 0 }) as any;
  } catch {
    try {
      t = new Texture(src, frame, orig, trim || undefined, rotate || 0) as any;
    } catch {
      t = new Texture(baseTex, frame, orig, trim || undefined, rotate || 0) as any;
    }
  }
  try {
    if (t && !t.label) t.label = frame?.width && frame?.height ? `sub:${frame.width}x${frame.height}` : 'subtex';
  } catch {
    /* ignore */
  }
  if (anchor) {
    const target: any = t as any;
    if (target.defaultAnchor?.set) {
      try {
        target.defaultAnchor.set(anchor.x, anchor.y);
      } catch {
        /* fallback below */
      }
    }
    if (target.defaultAnchor && !target.defaultAnchor.set) {
      target.defaultAnchor.x = anchor.x;
      target.defaultAnchor.y = anchor.y;
    }
    if (!target.defaultAnchor) {
      target.defaultAnchor = { x: anchor.x, y: anchor.y };
    }
  }
  try {
    (t as any)?.updateUvs?.();
  } catch {
    /* ignore */
  }
  return t;
}

export function buildAtlasTextures(data: any, baseTex: any, texMap: Map<string, SpriteTexture>, atlasBases: Set<any>, ctors: { Texture: any; Rectangle: any }) {
  const { Texture, Rectangle } = ctors;
  try {
    if (baseTex && !(baseTex as any).label) (baseTex as any).label = data?.meta?.image || 'atlasBase';
  } catch {
    /* ignore */
  }
  rememberBaseTex(baseTex, atlasBases);
  for (const [k, fd] of Object.entries<any>(data.frames)) {
    const fr = fd.frame;
    const rot = fd.rotated ? 2 : 0;
    const w = fd.rotated ? fr.h : fr.w;
    const h = fd.rotated ? fr.w : fr.h;

    const frame = mkRect(Rectangle, fr.x, fr.y, w, h);
    const ss = fd.sourceSize || { w: fr.w, h: fr.h };
    const orig = mkRect(Rectangle, 0, 0, ss.w, ss.h);

    let trim = null as any;
    if (fd.trimmed && fd.spriteSourceSize) {
      const s = fd.spriteSourceSize;
      trim = mkRect(Rectangle, s.x, s.y, s.w, s.h);
    }
    const t = mkSubTex(Texture, baseTex, frame, orig, trim, rot, fd.anchor || null);
    try {
      (t as any).label = k;
    } catch {
      /* ignore */
    }
    rememberBaseTex(t, atlasBases);
    texMap.set(k, t);
  }
}
