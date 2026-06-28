import type { SpriteConfig, MutationName } from '../settings';
import { MUT_META } from '../settings';
import type { SpriteState, SpriteTexture, VariantSignature, SpriteItem, SpriteJob } from '../types';

// Heuristics ported from game logic for positioning/scaling mutation icons
const TILE_SIZE_WORLD = 256;
const BASE_ICON_SCALE = 0.5; // equivalent to FLORA_SCALABLE_RENDER_SCALE
const TALL_PLANT_MUTATION_ICON_SCALE_BOOST = 2;
const FLOATING_MUTATION_ICONS = new Set<MutationName>([
  'Dawnlit',
  'Ambershine',
  'Dawncharged',
  'Ambercharged',
]);
const MUT_ICON_Y_EXCEPT: Record<string, number> = {
  Banana: 0.68,
  Beet: 0.65,
  Carrot: 0.6,
  Sunflower: 0.5,
  Starweaver: 0.5,
  FavaBean: 0.25,
  BurrosTail: 0.2,
};
const MUT_ICON_X_EXCEPT: Record<string, number> = {
  Pepper: 0.6,
  Banana: 0.6,
};
const TALL_OVERLAY_OFFSETS: Partial<Record<MutationName, { x: number; y: number }>> = {
  Thunderstruck: { x: 0, y: 250 },
};

// Ordering matches in-game stacking: Gold/Rainbow override everything,
// then base wet/chilled/frozen, then warm/charged hues render on top of them.
const MUTATION_ORDER: MutationName[] = ['Gold', 'Rainbow', 'Wet', 'Chilled', 'Frozen', 'Thunderstruck', 'Thundercharged', 'Ambershine', 'Dawnlit', 'Dawncharged', 'Ambercharged'];
const MUTATION_INDEX = new Map(MUTATION_ORDER.map((m, idx) => [m, idx]));
const sortMutations = (list: MutationName[]): MutationName[] => {
  const uniq = [...new Set(list.filter(Boolean))];
  return uniq.sort((a, b) => (MUTATION_INDEX.get(a) ?? Infinity) - (MUTATION_INDEX.get(b) ?? Infinity));
};

const SUPPORTED_BLEND_OPS = (() => {
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    if (!g) return new Set<string>();
    const ops = ['color', 'hue', 'saturation', 'luminosity', 'overlay', 'screen', 'lighter', 'source-atop'];
    const ok = new Set<string>();
    for (const op of ops) {
      g.globalCompositeOperation = op as GlobalCompositeOperation;
      if (g.globalCompositeOperation === op) ok.add(op);
    }
    return ok;
  } catch {
    return new Set<string>();
  }
})();

const pickBlendOp = (desired: string): GlobalCompositeOperation => {
  if (SUPPORTED_BLEND_OPS.has(desired)) return desired as GlobalCompositeOperation;
  if (SUPPORTED_BLEND_OPS.has('overlay')) return 'overlay';
  if (SUPPORTED_BLEND_OPS.has('screen')) return 'screen';
  if (SUPPORTED_BLEND_OPS.has('lighter')) return 'lighter';
  return 'source-atop';
};

const FILTERS: Record<string, any> = {
  Gold: { op: 'source-atop', colors: ['rgb(235,200,0)'], a: 0.7 },
  Rainbow: { op: 'color', colors: ['#FF1744', '#FF9100', '#FFEA00', '#00E676', '#2979FF', '#D500F9'], ang: 130, angTall: 0, masked: true },
  Wet: { op: 'source-atop', colors: ['rgb(50,180,200)'], a: 0.25 },
  Chilled: { op: 'source-atop', colors: ['rgb(100,160,210)'], a: 0.45 },
  Frozen: { op: 'source-atop', colors: ['rgb(100,130,220)'], a: 0.5 },
  Thunderstruck: { op: 'source-atop', colors: ['rgb(16, 141, 163)'], a: 0.45 },
  Thundercharged: { op: 'source-atop', colors: ['rgb(10, 100, 190)'], a: 0.5 },
  Dawnlit: { op: 'source-atop', colors: ['rgb(209,70,231)'], a: 0.5 },
  Ambershine: { op: 'source-atop', colors: ['rgb(190,100,40)'], a: 0.5 },
  Dawncharged: { op: 'source-atop', colors: ['rgb(140,80,200)'], a: 0.5 },
  Ambercharged: { op: 'source-atop', colors: ['rgb(170,60,25)'], a: 0.5 },
};

const hasMutationFilter = (value: MutationName | '' | null): value is MutationName =>
  Boolean(value && FILTERS[value]);

const isTallKey = (k: string) => /tallplant/i.test(k);

export const computeVariantSignature = (state: SpriteState): VariantSignature => {
  if (!state.mutOn) {
    const f = hasMutationFilter(state.f) ? state.f : null;
    const baseMuts = f ? [f] : [];
    return { mode: 'F', muts: baseMuts, overlayMuts: baseMuts, selectedMuts: baseMuts, sig: `F:${f ?? ''}` };
  }
  const raw = state.mutations.filter((value): value is MutationName => hasMutationFilter(value));
  const selected = sortMutations(raw);
  const muts = normalizeMutListColor(raw);
  const overlayMuts = normalizeMutListOverlay(raw);
  return {
    mode: 'M',
    muts,
    overlayMuts,
    selectedMuts: selected,
    sig: `M:${selected.join(',')}|${muts.join(',')}|${overlayMuts.join(',')}`,
  };
};

// Backward compatibility
export const curVariant = computeVariantSignature;

export function buildVariantFromMutations(list: MutationName[]): VariantSignature {
  const raw = list.filter((value): value is MutationName => hasMutationFilter(value));
  const selected = sortMutations(raw);
  const muts = normalizeMutListColor(raw);
  const overlayMuts = normalizeMutListOverlay(raw);
  return {
    mode: 'M',
    muts,
    overlayMuts,
    selectedMuts: selected,
    sig: `M:${selected.join(',')}|${muts.join(',')}|${overlayMuts.join(',')}`,
  };
}

export function resolveTexByKey(key: string, state: SpriteState): SpriteTexture | null {
  const direct = state.tex.get(key);
  if (direct) return direct;
  const anim = state.items.find(it => it.isAnim && it.key === key);
  if (anim && anim.isAnim && anim.frames?.length) return anim.frames[0];
  const suffixed = state.tex.get(`${key}-0`);
  if (suffixed) return suffixed;
  return null;
}

const normalizeMutListColor = (list: MutationName[]): MutationName[] => {
  const names = list.filter((m, idx, arr) => FILTERS[m] && arr.indexOf(m) === idx);
  if (!names.length) return [];
  if (names.includes('Gold')) return ['Gold'];
  if (names.includes('Rainbow')) return ['Rainbow'];
  const warm = ['Ambershine', 'Dawnlit', 'Dawncharged', 'Ambercharged'] as const;
  const hasWarm = names.some(n => warm.includes(n as any));
  if (hasWarm) {
    // When warm hues are present, suppress wet/chilled/frozen filters (matches game).
    return sortMutations(names.filter(n => !['Wet', 'Chilled', 'Frozen', 'Thunderstruck', 'Thundercharged'].includes(n)));
  }
  return sortMutations(names);
};

const normalizeMutListOverlay = (list: MutationName[]): MutationName[] => {
  const names = list.filter((m, idx, arr) => MUT_META[m]?.overlayTall && arr.indexOf(m) === idx);
  return sortMutations(names);
};

const buildMutationPipeline = (mutNames: MutationName[], isTall: boolean) =>
  mutNames.map(m => ({ name: m, meta: MUT_META[m], overlayTall: MUT_META[m]?.overlayTall, isTall }));

const angleGrad = (ctx: CanvasRenderingContext2D, w: number, h: number, ang: number, fullSpan = false) => {
  const rad = (ang - 90) * Math.PI / 180;
  const cx = w / 2;
  const cy = h / 2;
  if (!fullSpan) {
    const R = Math.min(w, h) / 2;
    return ctx.createLinearGradient(cx - Math.cos(rad) * R, cy - Math.sin(rad) * R, cx + Math.cos(rad) * R, cy + Math.sin(rad) * R);
  }
  // Projected half-extent so the gradient spans the full sprite (used for tall-plant rainbow).
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const R = Math.abs(dx) * w / 2 + Math.abs(dy) * h / 2;
  return ctx.createLinearGradient(cx - dx * R, cy - dy * R, cx + dx * R, cy + dy * R);
};

const fillGrad = (ctx: CanvasRenderingContext2D, w: number, h: number, f: any, fullSpan = false) => {
  const cols = f.colors?.length ? f.colors : ['#fff'];
  const g = f.ang != null ? angleGrad(ctx, w, h, f.ang, fullSpan) : ctx.createLinearGradient(0, 0, 0, h);
  if (cols.length === 1) {
    g.addColorStop(0, cols[0]);
    g.addColorStop(1, cols[0]);
  } else cols.forEach((c: string, i: number) => g.addColorStop(i / (cols.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

function mutationAliases(mut: MutationName): string[] {
  // Some assets use legacy names (Amberlit, Dawnbound, Amberbound)
  switch (mut) {
    case 'Ambershine':
      return ['Ambershine', 'Amberlit'];
    case 'Dawncharged':
      return ['Dawncharged', 'Dawnbound'];
    case 'Ambercharged':
      return ['Ambercharged', 'Amberbound'];
    case 'Thunderstruck':
      return ['Thunderstruck', 'ThunderstruckGround'];
    default:
      return [mut];
  }
}

function applyFilterOnto(ctx: CanvasRenderingContext2D, sourceCanvas: HTMLCanvasElement, name: string, isTall: boolean) {
  const base = FILTERS[name];
  if (!base) return;
  const f = { ...base };
  if (name === 'Rainbow' && isTall && f.angTall != null) f.ang = f.angTall;
  const fullSpan = name === 'Rainbow' && isTall;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  ctx.save();
  // Non-masked overlays should replace RGB while preserving alpha (ColorOverlayFilter semantics).
  // Use source-in so the solid color/gradient is clipped to the sprite alpha, then scaled by f.a.
  const blendOp = f.masked ? pickBlendOp(f.op) : 'source-in';
  ctx.globalCompositeOperation = blendOp;
  if (f.a != null) ctx.globalAlpha = f.a;

  if (f.masked) {
    const m = document.createElement('canvas');
    m.width = w;
    m.height = h;
    const mctx = m.getContext('2d')!;
    mctx.imageSmoothingEnabled = false;
    fillGrad(mctx, w, h, f, fullSpan);
    mctx.globalCompositeOperation = 'destination-in';
    mctx.drawImage(sourceCanvas, 0, 0);
    ctx.drawImage(m, 0, 0);
  } else {
    fillGrad(ctx, w, h, f, fullSpan);
  }
  ctx.restore();
}

function variantKey(it: SpriteItem, V: VariantSignature) {
  return `${V.sig}::${it.key}`;
}

type OverlayHit = { tex: SpriteTexture; key: string };

function tallOverlayFromSheet(mutName: MutationName, state: SpriteState): OverlayHit | null {
  const target = String(mutName || '').toLowerCase();
  for (const k of state.tex.keys()) {
    const m = /sprite\/mutation-overlay\/([A-Za-z0-9]+)TallPlant/i.exec(String(k));
    if (!m || !m[1]) continue;
    const prefix = m[1].toLowerCase();
    if (prefix === target) {
      const t = state.tex.get(k);
      if (t) return { tex: t, key: k };
    }
  }
  return null;
}

function findOverlayTexture(itKey: string, mutName: MutationName, state: SpriteState, preferTall?: boolean): OverlayHit | null {
  if (!mutName) return null;
  const base = baseNameOf(itKey);
  const aliases = mutationAliases(mutName);
  for (const name of aliases) {
    const tries = [
      `sprite/mutation/${name}${base}`,
      `sprite/mutation/${name}-${base}`,
      `sprite/mutation/${name}_${base}`,
      `sprite/mutation/${name}/${base}`,
      `sprite/mutation/${name}`,
    ];
    for (const k of tries) {
      const t = state.tex.get(k);
      if (t) return { tex: t, key: k };
    }
    if (preferTall) {
      const hit =
        (state.tex.get(`sprite/mutation-overlay/${name}TallPlant`) && {
          tex: state.tex.get(`sprite/mutation-overlay/${name}TallPlant`)!,
          key: `sprite/mutation-overlay/${name}TallPlant`,
        }) ||
        (state.tex.get(`sprite/mutation-overlay/${name}`) && {
          tex: state.tex.get(`sprite/mutation-overlay/${name}`)!,
          key: `sprite/mutation-overlay/${name}`,
        }) ||
        tallOverlayFromSheet(mutName, state);
      if (hit) return hit;
    }
  }
  return null;
}

function findIconTexture(itKey: string, mutName: MutationName, isTall: boolean, state: SpriteState) {
  if (!mutName) return null;
  const meta = MUT_META[mutName];
  if (isTall && meta?.tallIconOverride) {
    const t = state.tex.get(meta.tallIconOverride);
    if (t) return t;
  }
  const base = baseNameOf(itKey);
  const aliases = mutationAliases(mutName);
  for (const name of aliases) {
    const tries = [
      `sprite/mutation/${name}Icon`,
      `sprite/mutation/${name}`,
      `sprite/mutation/${name}${base}`,
      `sprite/mutation/${name}-${base}`,
      `sprite/mutation/${name}_${base}`,
      `sprite/mutation/${name}/${base}`,
    ];
    for (const k of tries) {
      const t = state.tex.get(k);
      if (t) return t;
    }
    if (isTall) {
      const t = state.tex.get(`sprite/mutation-overlay/${name}TallPlantIcon`) || state.tex.get(`sprite/mutation-overlay/${name}TallPlant`);
      if (t) return t;
    }
  }
  return null;
}

const baseNameOf = (k: string) => {
  const p = String(k || '').split('/');
  return p[p.length - 1] || '';
};

interface IconLayout {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  offset: { x: number; y: number };
  iconScale: number;
  content: {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    top: number;
  };
}

function computeIconLayout(tex: SpriteTexture, baseName: string, isTall: boolean): IconLayout {
  const width = (tex as any)?.orig?.width ?? (tex as any)?.frame?.width ?? (tex as any)?.width ?? 1;
  const height = (tex as any)?.orig?.height ?? (tex as any)?.frame?.height ?? (tex as any)?.height ?? 1;
  // Match game logic: default anchors fall back to 0 when missing
  const anchorX = (tex as any)?.defaultAnchor?.x ?? 0;
  const anchorY = (tex as any)?.defaultAnchor?.y ?? 0;

  let targetX = MUT_ICON_X_EXCEPT[baseName] ?? anchorX;
  const isVerticalShape = height > width * 1.5;
  // Tall plants rely on scale boost; vertical shapes stick close to the anchor (plant base).
  let targetY = MUT_ICON_Y_EXCEPT[baseName] ?? (isVerticalShape ? anchorY : 0.4);

  const offset = {
    x: (targetX - anchorX) * width,
    y: (targetY - anchorY) * height,
  };
  const minDimension = Math.min(width, height);
  const scaleFactor = Math.min(1.5, minDimension / TILE_SIZE_WORLD);
  let iconScale = BASE_ICON_SCALE * scaleFactor;
  if (isTall) iconScale *= TALL_PLANT_MUTATION_ICON_SCALE_BOOST;

  return {
    width,
    height,
    anchorX,
    anchorY,
    offset,
    iconScale,
    content: {
      x: 0,
      y: 0,
      width,
      height,
      centerX: 0.5,
      centerY: 0.5,
      top: 0,
    },
  };
}

function textureToCanvas(tex: any, state: SpriteState, cfg: SpriteConfig) {
  const hit = state.srcCan.get(tex);
  if (hit) return hit;

  let c: HTMLCanvasElement | null = null;
  const RDR: any = state.renderer;
  try {
    // Avoid DPI-scaled extracts that skew positioning; only use extract when resolution is 1.
    if (RDR?.extract?.canvas && (RDR?.resolution ?? 1) === 1) {
      const s = new (state.ctors as any).Sprite(tex);
      c = RDR.extract.canvas(s);
      s.destroy?.({ children: true, texture: false, baseTexture: false });
    }
  } catch {
    /* ignore */
  }

  if (!c) {
    const fr = tex?.frame || tex?._frame;
    const orig = tex?.orig || tex?._orig;
    const trim = tex?.trim || tex?._trim;
    const rot = tex?.rotate || tex?._rotate || 0;
    const src =
      tex?.baseTexture?.resource?.source ||
      tex?.baseTexture?.resource ||
      tex?.source?.resource?.source ||
      tex?.source?.resource ||
      tex?._source?.resource?.source ||
      null;
    if (!fr || !src) throw new Error('texToCanvas fail');
    c = document.createElement('canvas');
    const fullW = Math.max(1, (orig?.width ?? fr.width) | 0);
    const fullH = Math.max(1, (orig?.height ?? fr.height) | 0);
    const offX = trim?.x ?? 0;
    const offY = trim?.y ?? 0;
    c.width = fullW;
    c.height = fullH;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const rotated = rot === true || rot === 2 || rot === 8;
    if (rotated) {
      ctx.save();
      ctx.translate(offX + fr.height / 2, offY + fr.width / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(src, fr.x, fr.y, fr.width, fr.height, -fr.width / 2, -fr.height / 2, fr.width, fr.height);
      ctx.restore();
    } else {
      ctx.drawImage(src, fr.x, fr.y, fr.width, fr.height, offX, offY, fr.width, fr.height);
    }
  }

  state.srcCan.set(tex, c);
  if (state.srcCan.size > cfg.srcCanvasMax) {
    const k = state.srcCan.keys().next().value;
    if (k !== undefined) state.srcCan.delete(k);
  }
  return c;
}

type BaseDimensions = {
  w: number;
  h: number;
  aX: number;
  aY: number;
  basePos: { x: number; y: number };
};

function buildColorLayerSprites(
  tex: SpriteTexture,
  dims: BaseDimensions,
  pipeline: ReturnType<typeof buildMutationPipeline>,
  state: SpriteState,
  cfg: SpriteConfig,
  disposables: SpriteTexture[],
  TextureCtor: any
) {
  const { w, h, aX, aY, basePos } = dims;
  const layers: any[] = [];
  for (const step of pipeline) {
    const clone = new (state.ctors as any).Sprite(tex as any);
    clone.anchor?.set?.(aX, aY);
    clone.position.set(basePos.x, basePos.y);
    clone.zIndex = 1;

    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = w;
    layerCanvas.height = h;
    const lctx = layerCanvas.getContext('2d')!;
    lctx.imageSmoothingEnabled = false;
    lctx.save();
    lctx.translate(w * aX, h * aY);
    lctx.drawImage(textureToCanvas(tex, state, cfg), -w * aX, -h * aY);
    lctx.restore();
    applyFilterOnto(lctx, layerCanvas, step.name, step.isTall);
    const filteredTex = TextureCtor.from(layerCanvas);
    disposables.push(filteredTex);
    clone.texture = filteredTex;
    layers.push(clone);
  }
  return layers;
}

function buildTallOverlaySprites(
  itKey: string,
  dims: BaseDimensions,
  overlayPipeline: ReturnType<typeof buildMutationPipeline>,
  state: SpriteState,
  cfg: SpriteConfig,
  baseCanvas: HTMLCanvasElement | null,
  TextureCtor: any,
  disposables: SpriteTexture[]
) {
  const { w, aX, basePos } = dims;
  if (!baseCanvas) return [];
  const overlays: any[] = [];
  for (const step of overlayPipeline) {
    const hit =
      (step.overlayTall && state.tex.get(step.overlayTall) && { tex: state.tex.get(step.overlayTall)!, key: step.overlayTall }) ||
      findOverlayTexture(itKey, step.name, state, true);
    if (!hit?.tex) continue;
    const oCan = textureToCanvas(hit.tex as any, state, cfg);
    if (!oCan) continue;
    const ow = oCan.width;
    const overlayAnchor = { x: 0, y: 0 };
    const overlayPos = { x: basePos.x - aX * ow, y: 0 };
    const overlayOffset = TALL_OVERLAY_OFFSETS[step.name];
    if (overlayOffset) {
      overlayPos.x += overlayOffset.x ?? 0;
      overlayPos.y += overlayOffset.y ?? 0;
    }

    const maskedCanvas = document.createElement('canvas');
    maskedCanvas.width = ow;
    maskedCanvas.height = oCan.height;
    const mctx = maskedCanvas.getContext('2d');
    if (!mctx) continue;
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(oCan, 0, 0);
    mctx.globalCompositeOperation = 'destination-in';
    mctx.drawImage(baseCanvas, -overlayPos.x, -overlayPos.y);
    const maskedTex = TextureCtor.from(maskedCanvas);
    disposables.push(maskedTex);

    const ov = new (state.ctors as any).Sprite(maskedTex as any);
    ov.anchor?.set?.(overlayAnchor.x, overlayAnchor.y);
    ov.position.set(overlayPos.x, overlayPos.y);
    ov.scale.set(1);
    ov.alpha = 1;
    ov.zIndex = 3;
    overlays.push(ov);
  }
  return overlays;
}

function buildIconSprites(
  itKey: string,
  dims: BaseDimensions,
  iconPipeline: ReturnType<typeof buildMutationPipeline>,
  state: SpriteState,
  iconLayout: IconLayout
) {
  const { basePos } = dims;
  const icons: any[] = [];
  for (const step of iconPipeline) {
    if (step.name === 'Gold' || step.name === 'Rainbow') continue;
    const itex = findIconTexture(itKey, step.name, step.isTall, state);
    if (!itex) continue;

    const icon = new (state.ctors as any).Sprite(itex as any);
    const iconAnchorX = (itex as any)?.defaultAnchor?.x ?? 0.5;
    const iconAnchorY = (itex as any)?.defaultAnchor?.y ?? 0.5;
    icon.anchor?.set?.(iconAnchorX, iconAnchorY);
    icon.position.set(basePos.x + iconLayout.offset.x, basePos.y + iconLayout.offset.y);
    icon.scale.set(iconLayout.iconScale);
    if (step.isTall) icon.zIndex = -1;
    if (FLOATING_MUTATION_ICONS.has(step.name)) icon.zIndex = 10;
    if (!icon.zIndex) icon.zIndex = 2;
    icons.push(icon);
  }
  return icons;
}

const entryCost = (e: any) => (e?.isAnim ? (e.frames?.length || 0) : e?.tex ? 1 : 0);

function lruTouch(state: SpriteState, k: string, e: any) {
  state.lru.delete(k);
  state.lru.set(k, e);
}

function lruEvict(state: SpriteState, cfg: SpriteConfig) {
  if (!cfg.cacheOn) return;
  while (state.lru.size > cfg.cacheMaxEntries || state.cost > cfg.cacheMaxCost) {
    const k = state.lru.keys().next().value;
    if (k === undefined) break;
    const e = state.lru.get(k);
    state.lru.delete(k);
    state.cost = Math.max(0, state.cost - entryCost(e));
  }
}

export function clearVariantCache(state: SpriteState) {
  state.lru.clear();
  state.cost = 0;
  state.srcCan.clear();
}

export function renderMutatedTexture(tex: SpriteTexture | null, itKey: string, V: VariantSignature, state: SpriteState, cfg: SpriteConfig): SpriteTexture | null {
  try {
    if (!tex || !state.renderer || !state.ctors?.Container || !state.ctors?.Sprite || !state.ctors?.Texture) return null;
    const { Container, Sprite, Texture } = state.ctors;
    const w = tex?.orig?.width ?? (tex as any)?.frame?.width ?? (tex as any)?.width ?? 1;
    const h = tex?.orig?.height ?? (tex as any)?.frame?.height ?? (tex as any)?.height ?? 1;
    const aX = (tex as any)?.defaultAnchor?.x ?? 0.5;
    const aY = (tex as any)?.defaultAnchor?.y ?? 0.5;
    const basePos = { x: w * aX, y: h * aY };
    const baseCanvas = textureToCanvas(tex as any, state, cfg);

    const root = new Container();
    root.sortableChildren = true;
    // Bounds locker: invisible sprite matching base dimensions to lock generated texture bounds.
    try {
      const lock = new Sprite(tex as any);
      lock.anchor?.set?.(aX, aY);
      lock.position.set(basePos.x, basePos.y);
      lock.width = w;
      lock.height = h;
      lock.alpha = 0;
      lock.zIndex = -1e3;
      root.addChild(lock);
    } catch {
      /* ignore */
    }
    const base = new Sprite(tex as any);
    base.anchor?.set?.(aX, aY);
    base.position.set(basePos.x, basePos.y);
    base.zIndex = 0;
    root.addChild(base);

    const isTall = isTallKey(itKey);
    const pipeline = buildMutationPipeline(V.muts, isTall);
    const overlayPipeline = buildMutationPipeline(V.overlayMuts, isTall);
    const iconPipeline = buildMutationPipeline(V.selectedMuts, isTall);
    const disposables: any[] = [];
    const baseName = baseNameOf(itKey);
    const iconLayout = computeIconLayout(tex as any, baseName, isTall);
    const dims: BaseDimensions = { w, h, aX, aY, basePos };

    buildColorLayerSprites(tex as any, dims, pipeline, state, cfg, disposables, Texture).forEach(layer => root.addChild(layer));
    if (isTall) {
      buildTallOverlaySprites(itKey, dims, overlayPipeline, state, cfg, baseCanvas, Texture, disposables).forEach(ov => root.addChild(ov));
    }
    buildIconSprites(itKey, dims, iconPipeline, state, iconLayout).forEach(icon => root.addChild(icon));

    const RDR: any = state.renderer;
    let rt: any = null;
    // Crop to the base sprite footprint so overlays/icons don't expand bounds.
    const RectCtor = state.ctors?.Rectangle;
    const crop = RectCtor ? new RectCtor(0, 0, w, h) : null;
    if (typeof RDR?.generateTexture === 'function')
      rt = RDR.generateTexture(root, { resolution: 1, region: crop ?? undefined });
    else if (RDR?.textureGenerator?.generateTexture)
      rt = RDR.textureGenerator.generateTexture({ target: root, resolution: 1 });
    if (!rt) throw new Error('no render texture');

    const outTex = rt instanceof Texture ? rt : Texture.from(RDR.extract.canvas(rt));
    if (rt && rt !== outTex) rt.destroy?.(true);
    root.destroy({ children: true, texture: false, baseTexture: false });
    disposables.forEach(() => {});
    try {
      (outTex as any).__mg_gen = true;
      (outTex as any).label = `${itKey}|${V.sig}`;
    } catch {
      /* ignore */
    }
    return outTex;
  } catch {
    return null;
  }
}

// Backward compatibility with previous name
export const applyMutationIcons = renderMutatedTexture;

export function enqueueVariantJob(it: SpriteItem, V: VariantSignature, state: SpriteState, cfg: SpriteConfig) {
  if (!cfg.cacheOn) return null;
  if (!V.muts.length) return null;
  const k = variantKey(it, V);
  const hit = state.lru.get(k);
  if (hit) return (lruTouch(state, k, hit), hit);

  if (!cfg.jobOn) return null;
  if (state.jobMap.has(k)) return null;

  state.jobs.push({
    k,
    sig: state.sig,
    itKey: it.key,
    isAnim: !!it.isAnim,
    src: it.isAnim ? (it.frames || []) : [it.first],
    i: 0,
    out: [],
    V,
  } as SpriteJob);
  state.jobMap.add(k);
  return null;
}

export function processVariantJobs(state: SpriteState, cfg: SpriteConfig): boolean {
  if (!cfg.jobOn || !state.open || !state.jobs.length) return false;

  const now = performance.now();
  const burst = now - state.changedAt <= cfg.jobBurstWindowMs;
  const budget = burst ? cfg.jobBurstMs : cfg.jobBudgetMs;
  const t0 = performance.now();
  let done = 0;
  let needsLayout = false;

  while (state.jobs.length) {
    if (performance.now() - t0 >= budget) break;
    if (done >= cfg.jobCapPerTick) break;

    const job: any = state.jobs[0];
    if (job.sig !== state.sig) {
      state.jobs.shift();
      state.jobMap.delete(job.k);
      continue;
    }

    const tex = job.src[job.i];
    if (!tex) {
      state.jobs.shift();
      state.jobMap.delete(job.k);
      continue;
    }

    const ft = renderMutatedTexture(tex as any, job.itKey, job.V, state, cfg);
    if (ft) job.out.push(ft);

    job.i++;
    done++;

    if (job.i >= job.src.length) {
      state.jobs.shift();
      state.jobMap.delete(job.k);

      let entry: any = null;
      if (job.isAnim) {
        if (job.out.length >= 2) entry = { isAnim: true, frames: job.out };
        else job.out.forEach(() => {});
      } else {
        if (job.out[0]) entry = { isAnim: false, tex: job.out[0] };
      }

      if (entry) {
        state.lru.set(job.k, entry);
        state.cost += entryCost(entry);
        lruEvict(state, cfg);
        needsLayout = true;
      }
    }
  }

  return needsLayout;
}

// Backward compatibility aliases
export const getGenerated = enqueueVariantJob;
export const processJobs = processVariantJobs;
