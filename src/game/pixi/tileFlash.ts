import { getTileViewAt } from "./tileCapture";

export type FlashTileOpts = {
  color?: number;
  startAlpha?: number;
  durationMs?: number;
};

type FlashEntry = {
  raf: number;
  baseline: WeakMap<any, number>;
  touched: Set<any>;
};

const activeFlashes = new Map<number, FlashEntry>();

const FLASH_DEFAULT_COLOR = 0x4ade80;
const FLASH_DEFAULT_MIX = 1;
const FLASH_DEFAULT_DURATION_MS = 1000;

function hasTint(node: any): boolean {
  return !!(node && typeof node.tint === "number");
}

/** Depth-first walk collecting every tintable node (Sprite/Graphics/Mesh) under `root`. */
function collectTintable(root: any, cap = 900): any[] {
  const out: any[] = [];
  const stack = [root];
  while (stack.length && out.length < cap) {
    const node = stack.pop();
    if (!node) continue;
    if (hasTint(node)) out.push(node);
    const children = node.children;
    if (Array.isArray(children)) for (const child of children) stack.push(child);
  }
  return out;
}

function lerpColor(from: number, to: number, t: number): number {
  const r0 = (from >> 16) & 255, g0 = (from >> 8) & 255, b0 = from & 255;
  const r1 = (to >> 16) & 255, g1 = (to >> 8) & 255, b1 = to & 255;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  return (r << 16) | (g << 8) | b;
}

function stopFlashTile(gidx: number): void {
  const entry = activeFlashes.get(gidx);
  if (!entry) return;
  cancelAnimationFrame(entry.raf);
  for (const node of entry.touched) {
    const base = entry.baseline.get(node);
    if (base == null) continue;
    try { node.tint = base; } catch {}
  }
  activeFlashes.delete(gidx);
}

/**
 * Briefly tints every sprite on a tile (the crop/decor itself, not a shape drawn over it) green,
 * then eases back to each sprite's own original tint over `durationMs` - used by the editor as a
 * "just placed" / "selected" cue. Tinting (rather than an overlay) follows the sprite's actual
 * silhouette for free, and preserves any pre-existing tint (e.g. a Gold mutation) since it eases
 * back to what each sprite already had, not to white. Re-resolves the tile's sprites on every
 * frame - capturing a fresh baseline for any newly-appeared node - so a mid-fade tileView rebuild
 * (the editor repaints the whole planned garden every 1s) doesn't desync or leave a stuck tint.
 */
export function flashTileGreen(tx: number, ty: number, opts: FlashTileOpts = {}): boolean {
  const { gidx } = getTileViewAt(Number(tx), Number(ty), true);
  if (gidx == null) return false;

  stopFlashTile(gidx);

  const color = opts.color ?? FLASH_DEFAULT_COLOR;
  const startMix = opts.startAlpha ?? FLASH_DEFAULT_MIX;
  const durationMs = Math.max(1, opts.durationMs ?? FLASH_DEFAULT_DURATION_MS);

  const resolveParent = () => {
    const { tv } = getTileViewAt(Number(tx), Number(ty), false);
    return tv?.displayObject || tv?.root || tv?.container || tv || null;
  };

  if (!resolveParent()) return false;

  const entry: FlashEntry = { raf: 0, baseline: new WeakMap(), touched: new Set() };
  activeFlashes.set(gidx, entry);

  const start = performance.now();

  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / durationMs);
    const mix = startMix * (1 - progress);

    const parent = resolveParent();
    if (parent) {
      for (const node of collectTintable(parent)) {
        if (!entry.baseline.has(node)) entry.baseline.set(node, node.tint);
        entry.touched.add(node);
        const base = entry.baseline.get(node)!;
        try { node.tint = lerpColor(base, color, mix); } catch {}
      }
    }

    if (progress >= 1) {
      stopFlashTile(gidx);
      return;
    }

    entry.raf = requestAnimationFrame(tick);
  };

  entry.raf = requestAnimationFrame(tick);
  return true;
}
