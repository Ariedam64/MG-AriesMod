// Mutation looks painted over a DOM sprite icon on a canvas: the game's
// colour filters (Gold, Rainbow, the weather tints) and the small icons of
// the mutations drawn as one, both from the API's /data/mutations.

import { API_BASE } from "./resolver";

// Mutations drawn as an icon over the sprite (from the API's /data/mutations).

type MutationIconDef = {
  url: string;
  /** Anchor from sprite-data: where the icon sits relative to its placement point. */
  anchor: { x: number; y: number };
};

const MUTATION_ICONS: Record<string, MutationIconDef> = {
  // Ground-level icons (anchor.y about 0.5), drawn at the plant's base.
  Wet:           { url: `${API_BASE}/assets/sprites/mutations/Wet.png`,           anchor: { x: 0.5, y: 0.487 } },
  Chilled:       { url: `${API_BASE}/assets/sprites/mutations/Chilled.png`,       anchor: { x: 0.502, y: 0.543 } },
  Frozen:        { url: `${API_BASE}/assets/sprites/mutations/Frozen.png`,        anchor: { x: 0.5, y: 0.474 } },
  Thunderstruck: { url: `${API_BASE}/assets/sprites/mutations/Thunderstruck.png`, anchor: { x: 0.495, y: 0.525 } },
  Thundercharged: { url: `${API_BASE}/assets/sprites/mutations/Thundercharged.png`, anchor: { x: 0.495, y: 0.525 } },
  // Floating icons (anchor.y about 0.8), drawn above the plant.
  Dawnlit:       { url: `${API_BASE}/assets/sprites/mutations/Dawnlit.png`,       anchor: { x: 0.506, y: 0.809 } },
  Ambershine:    { url: `${API_BASE}/assets/sprites/mutations/Amberlit.png`,      anchor: { x: 0.5, y: 0.820 } },
  Dawncharged:   { url: `${API_BASE}/assets/sprites/mutations/Dawncharged.png`,   anchor: { x: 0.519, y: 0.796 } },
  Ambercharged:  { url: `${API_BASE}/assets/sprites/mutations/Ambercharged.png`,  anchor: { x: 0.501, y: 0.795 } },
};

// Mutation colour filters, matching the game's own tinting.

type FilterDef = {
  op: string;
  colors: string[];
  a?: number;
  ang?: number;
  masked?: boolean;
};

const MUTATION_FILTERS: Record<string, FilterDef> = {
  Gold: { op: "source-atop", colors: ["rgb(235,200,0)"], a: 0.7 },
  Rainbow: { op: "color", colors: ["#FF1744", "#FF9100", "#FFEA00", "#00E676", "#2979FF", "#D500F9"], ang: 130, masked: true },
  Wet: { op: "source-atop", colors: ["rgb(50,180,200)"], a: 0.25 },
  Chilled: { op: "source-atop", colors: ["rgb(100,160,210)"], a: 0.45 },
  Frozen: { op: "source-atop", colors: ["rgb(100,130,220)"], a: 0.5 },
  Thunderstruck: { op: "source-atop", colors: ["rgb(16, 141, 163)"], a: 0.45 },
  Thundercharged: { op: "source-atop", colors: ["rgb(10, 100, 190)"], a: 0.5 },
  Dawnlit: { op: "source-atop", colors: ["rgb(209,70,231)"], a: 0.5 },
  Ambershine: { op: "source-atop", colors: ["rgb(190,100,40)"], a: 0.5 },
  Dawncharged: { op: "source-atop", colors: ["rgb(140,80,200)"], a: 0.5 },
  Ambercharged: { op: "source-atop", colors: ["rgb(170,60,25)"], a: 0.5 },
};

/** Keep only mutation names this module can actually render (color filter or icon). */
export function knownMutations(list?: unknown[]): string[] {
  if (!Array.isArray(list)) return [];
  const names = list
    .map(value => (typeof value === "string" ? value.trim() : ""))
    .filter(name => !!name && (!!MUTATION_FILTERS[name] || !!MUTATION_ICONS[name]));
  return [...new Set(names)];
}

function normalizeMutations(list: string[]): string[] {
  const names = [...new Set(list.filter(mutName => MUTATION_FILTERS[mutName]))];
  if (!names.length) return [];
  if (names.includes("Gold")) return ["Gold"];
  if (names.includes("Rainbow")) return ["Rainbow"];
  const warm = ["Ambershine", "Dawnlit", "Dawncharged", "Ambercharged"];
  if (names.some(name => warm.includes(name))) {
    return names.filter(name => !["Wet", "Chilled", "Frozen", "Thunderstruck", "Thundercharged"].includes(name));
  }
  return names;
}

const SUPPORTED_BLEND_OPS = (() => {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return new Set<string>();
    const ops = ["color", "hue", "saturation", "luminosity", "overlay", "screen", "lighter", "source-atop"];
    const ok = new Set<string>();
    for (const op of ops) {
      ctx.globalCompositeOperation = op as GlobalCompositeOperation;
      if (ctx.globalCompositeOperation === op) ok.add(op);
    }
    return ok;
  } catch {
    return new Set<string>();
  }
})();

function pickBlendOp(desired: string): GlobalCompositeOperation {
  if (SUPPORTED_BLEND_OPS.has(desired)) return desired as GlobalCompositeOperation;
  if (SUPPORTED_BLEND_OPS.has("overlay")) return "overlay";
  if (SUPPORTED_BLEND_OPS.has("screen")) return "screen";
  if (SUPPORTED_BLEND_OPS.has("lighter")) return "lighter";
  return "source-atop";
}

function fillGrad(ctx: CanvasRenderingContext2D, width: number, height: number, filter: FilterDef): void {
  const cols = filter.colors?.length ? filter.colors : ["#fff"];
  let gradient: CanvasGradient;
  if (filter.ang != null) {
    const rad = (filter.ang - 90) * Math.PI / 180;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2;
    gradient = ctx.createLinearGradient(
      cx - Math.cos(rad) * radius, cy - Math.sin(rad) * radius,
      cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius,
    );
  } else {
    gradient = ctx.createLinearGradient(0, 0, 0, height);
  }
  if (cols.length === 1) {
    gradient.addColorStop(0, cols[0]);
    gradient.addColorStop(1, cols[0]);
  } else {
    cols.forEach((color, idx) => gradient.addColorStop(idx / (cols.length - 1), color));
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Paints `mutations` over the sprite: colour filters first, then the icons of
 * the mutations drawn as one. `loadIcon` fetches an icon image.
 */
export async function applyMutationFilters(
  img: HTMLImageElement,
  mutations: string[],
  loadIcon: (url: string) => Promise<HTMLImageElement>,
): Promise<string> {
  const allMuts = [...new Set(mutations.filter(m => MUTATION_FILTERS[m]))];
  const colorMuts = normalizeMutations(mutations);
  if (!colorMuts.length && !allMuts.length) return img.src;

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) return img.src;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;
  ctx.imageSmoothingEnabled = false;

  // 1) Draw base sprite
  ctx.drawImage(img, 0, 0);

  // 2) Apply color filters
  for (const name of colorMuts) {
    const filter = MUTATION_FILTERS[name];
    if (!filter) continue;

    if (filter.masked) {
      const gradCanvas = document.createElement("canvas");
      gradCanvas.width = width;
      gradCanvas.height = height;
      const gctx = gradCanvas.getContext("2d");
      if (!gctx) continue;
      gctx.imageSmoothingEnabled = false;
      fillGrad(gctx, width, height, filter);
      gctx.globalCompositeOperation = "destination-in";
      gctx.drawImage(img, 0, 0);

      ctx.save();
      ctx.globalCompositeOperation = pickBlendOp(filter.op);
      if (filter.a != null) ctx.globalAlpha = filter.a;
      ctx.drawImage(gradCanvas, 0, 0);
      ctx.restore();
    } else {
      const colorCanvas = document.createElement("canvas");
      colorCanvas.width = width;
      colorCanvas.height = height;
      const cctx = colorCanvas.getContext("2d");
      if (!cctx) continue;
      cctx.imageSmoothingEnabled = false;
      cctx.drawImage(img, 0, 0);
      cctx.globalCompositeOperation = "source-in";
      fillGrad(cctx, width, height, filter);

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      if (filter.a != null) ctx.globalAlpha = filter.a;
      ctx.drawImage(colorCanvas, 0, 0);
      ctx.restore();
    }
  }

  // 3) Overlay mutation icon sprites (all selected mutations, not just color-filtered ones)
  // Plant anchor is typically at bottom-center (~0.5, ~0.85-0.95).
  // We place the icon at the plant's base, offset by the icon's own anchor.
  const plantAnchorX = 0.5;
  const plantAnchorY = 0.85;
  const baseX = width * plantAnchorX;
  const baseY = height * plantAnchorY;

  for (const name of allMuts) {
    const iconDef = MUTATION_ICONS[name];
    if (!iconDef) continue;
    try {
      const iconImg = await loadIcon(iconDef.url);
      const iconW = iconImg.naturalWidth || iconImg.width;
      const iconH = iconImg.naturalHeight || iconImg.height;
      if (!iconW || !iconH) continue;
      // Scale icon to ~50% of base sprite width, keep aspect ratio
      const iconScale = (width * 0.5) / iconW;
      const drawW = iconW * iconScale;
      const drawH = iconH * iconScale;
      // Position using the icon's anchor point relative to the plant base
      // anchor defines where the icon's "origin" is within itself
      const drawX = baseX - drawW * iconDef.anchor.x;
      const drawY = baseY - drawH * iconDef.anchor.y;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(iconImg, drawX, drawY, drawW, drawH);
      ctx.restore();
    } catch {
      /* the overlay is decoration: a failed load just leaves it out */
    }
  }

  return canvas.toDataURL("image/png");
}
