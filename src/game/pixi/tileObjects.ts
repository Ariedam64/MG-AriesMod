// Reads and edits the game's garden tiles through its tile object system: what
// object a tile holds, replacing it locally (the editor's planned garden), and
// mapping pointer events to tiles. Nothing here talks to the server; a change
// only lasts until the game repaints the tile from its own state.
//
// The tile system itself is found by `tileCapture.ts`. The Pixi app and
// renderer are read from the sprite catalog, which resolves them through
// Pixi's own `__PIXI_APP_INIT__` hook.

import { pageWindow } from "../../platform/pageContext";
import { assertReady, ensureCapture, getTileViewAt, tileState as state } from "./tileCapture";
import { flashTileGreen } from "./tileFlash";
import { getPixiApp, getSpriteState } from "../sprites/context";

export type PlantSlotPatch = {
  startTime?: number;
  endTime?: number;
  /** Whole-number Crop Size in [50, 100]. */
  size?: number;
  mutations?: string[]; // replaced as a whole, never merged
};

export type PlantPatch = {
  // top-level
  plantedAt?: number;
  maturedAt?: number;
  species?: string;

  // single slot mode
  slotIdx?: number;
  slotPatch?: PlantSlotPatch;

  // multi slot mode
  slots?:
    | Array<null | undefined | PlantSlotPatch>
    | Record<number | string, PlantSlotPatch>;
};

export type DecorPatch = { rotation?: number };
export type EggPatch = { plantedAt?: number; maturedAt?: number };

export type TileOpts = {
  ensureView?: boolean;   // default true
  forceUpdate?: boolean;  // default true
};


type HookStatus = {
  ok: boolean;
  engine: any | null;
  tos: any | null;
};

type GetTileResult = {
  tx: number;
  ty: number;
  gidx: number;
  tileView: any | null;
  tileObject: any; // GardenTileObject | null | undefined (type runtime variable)
};

type ApplyResult = {
  tx: number;
  ty: number;
  gidx: number;
  ok: true;
  before: any;
  after: any;
};


function deepClone<T>(v: T): T {
  try {
    // @ts-ignore
    if (typeof structuredClone === "function") return structuredClone(v);
  } catch {}
  try { return JSON.parse(JSON.stringify(v)); } catch {}
  return v;
}


/**
 * The frame context the tile system passes to `TileView.update`.
 *
 * Old builds parked a reusable one on the engine; current builds do not hand it
 * out at all, so this is usually null. That costs nothing: `onDataChanged`
 * marks the view dirty and the system's own update pass repaints it on the next
 * frame, which is where the repaint came from anyway.
 */
function getRenderContext(): any | null {
  try {
    return state.engine?.reusableContext ?? null;
  } catch {
    return null;
  }
}

function applyTileObject(tx: number, ty: number, nextObj: any, opts: TileOpts = {}): ApplyResult {
  assertReady();

  const ensureView = opts.ensureView !== false;
  const forceUpdate = opts.forceUpdate !== false;

  const { gidx, tv } = getTileViewAt(tx, ty, ensureView);
  if (gidx == null) throw new Error("TOS/map cols not available");
  if (!tv) throw new Error("TileView not available");

  const before = tv.tileObject;

  tv.onDataChanged(nextObj);

  const ctx = forceUpdate ? getRenderContext() : null;
  if (ctx && typeof tv.update === "function") {
    try { tv.update(ctx); } catch {}
  }

  return { tx, ty, gidx, ok: true, before, after: tv.tileObject };
}

function assertType(obj: any, type: "plant" | "decor" | "egg") {
  if (!obj) throw new Error("No tileObject on this tile");
  if (obj.objectType !== type) throw new Error(`Wrong objectType: expected "${type}", got "${obj.objectType}"`);
}

function patchPlantSlot(slot: any, slotPatch: PlantSlotPatch) {
  const p = slotPatch || {};

  if ("startTime" in p) slot.startTime = Number(p.startTime);
  if ("endTime" in p) slot.endTime = Number(p.endTime);
  if ("size" in p) slot.size = Number(p.size);

  // Replaced as a whole, never merged.
  if ("mutations" in p) {
    if (!Array.isArray(p.mutations)) throw new Error("mutations must be an array of strings");
    if (!p.mutations.every(x => typeof x === "string")) throw new Error("mutations must contain only strings");
    slot.mutations = p.mutations.slice();
  }
}

/**
 * The Pixi app, wherever it lives: the engine used to own it; now it comes from
 * the sprite catalog, which resolves it through Pixi's own `__PIXI_APP_INIT__`
 * hook, with the raw Pixi global as a last resort.
 */
function getApp(): any {
  try {
    return state.engine?.app ?? getPixiApp() ?? (pageWindow as any)?.__PIXI_APP__ ?? null;
  } catch {
    return null;
  }
}

function getRenderer(): any {
  try {
    return state.engine?.app?.renderer
      ?? getSpriteState().renderer
      ?? (pageWindow as any)?.__PIXI_RENDERER__
      ?? getApp()?.renderer
      ?? null;
  } catch {
    return null;
  }
}

function getCanvas(): HTMLCanvasElement | null {
  const app = getApp();
  const renderer = getRenderer();
  // Pixi v8 exposes the canvas at renderer.canvas; .view is the v7 name (sometimes
  // a wrapper with its own .canvas). Check canvas first, same order proven to work
  // in the notification bell and the Sell All Pets button against this same game build.
  return renderer?.canvas || renderer?.view?.canvas || renderer?.view || app?.view || app?.canvas || null;
}

const FARM_TILE_SIZE = 256;

/**
 * The garden tile under a pointer event. Projects through the tile system's
 * worldContainer, so it stays right wherever the garden camera has panned to,
 * instead of assuming canvas pixels are world pixels.
 */
function pointerToFarmTile(ev: PointerEvent): { tx: number; ty: number; gidx: number } | null {
  assertReady();
  const canvas = getCanvas();
  const renderer = getRenderer();
  const worldContainer = (state.tos as any)?.worldContainer;
  const map = (state.tos as any)?.map;
  if (!canvas || !renderer?.screen || !worldContainer?.toLocal || !map) return null;

  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const global = {
    x: (ev.clientX - rect.left) * renderer.screen.width / rect.width,
    y: (ev.clientY - rect.top) * renderer.screen.height / rect.height,
  };
  const world = worldContainer.toLocal(global);
  const tx = Math.floor(world.x / FARM_TILE_SIZE);
  const ty = Math.floor(world.y / FARM_TILE_SIZE);

  const cols = Number(map.cols);
  const rows = Number(map.rows);
  if (!Number.isFinite(cols) || tx < 0 || ty < 0 || tx >= cols) return null;
  if (Number.isFinite(rows) && ty >= rows) return null;

  return { tx, ty, gidx: tx + ty * cols };
}

export const tos = {
  /** Call once from main, as early as possible, so the capture watches before the world builds. */
  init(): HookStatus {
    ensureCapture();
    return { ok: !!state.tos, engine: state.engine, tos: state.tos };
  },

  isReady(): boolean {
    ensureCapture();
    return !!state.tos;
  },

  getStatus(): HookStatus {
    return { ok: !!state.tos, engine: state.engine, tos: state.tos };
  },

  /**
   * Frame context for a manual `TileView.update`, or null when the game does not
   * hand one out. Callers must treat null as "no forced repaint needed".
   */
  getRenderContext,

  /** Get tile object by global index (same index used in WS HarvestCrop slot field). */
  getTileObjectByIndex(gidx: number): { tileObject: any } | null {
    if (!state.tos) return null;
    try {
      const tv = state.tos.tileViews?.get?.(gidx) ?? null;
      return tv ? { tileObject: tv.tileObject } : null;
    } catch {
      return null;
    }
  },

  getTileObject(tx: number, ty: number, opts: TileOpts = {}): GetTileResult {
    assertReady();

    const ensureView = opts.ensureView !== false;
    const { gidx, tv } = getTileViewAt(Number(tx), Number(ty), ensureView);
    if (gidx == null) throw new Error("TOS/map cols not available");

    return {
      tx: Number(tx),
      ty: Number(ty),
      gidx,
      tileView: tv,
      tileObject: tv?.tileObject,
    };
  },

  /** Empties the tile (tileObject = null). */
  setTileEmpty(tx: number, ty: number, opts: TileOpts = {}): ApplyResult {
    return applyTileObject(Number(tx), Number(ty), null, opts);
  },

  setTilePlant(tx: number, ty: number, patch: PlantPatch, opts: TileOpts = {}): ApplyResult {
    const info = this.getTileObject(tx, ty, opts);
    const cur = info.tileObject;
    assertType(cur, "plant");

    const next = deepClone(cur);
    if (!Array.isArray(next.slots)) next.slots = [];

    const p = patch || {};

    if ("plantedAt" in p) next.plantedAt = Number(p.plantedAt);
    if ("maturedAt" in p) next.maturedAt = Number(p.maturedAt);
    if ("species" in p) next.species = String(p.species);

    // single slot
    if ("slotIdx" in p && "slotPatch" in p) {
      const i = Number(p.slotIdx) | 0;
      if (!next.slots[i]) throw new Error(`Plant slot ${i} does not exist`);
      patchPlantSlot(next.slots[i], p.slotPatch as PlantSlotPatch);
      return applyTileObject(Number(tx), Number(ty), next, opts);
    }

    // multi slots
    if ("slots" in p) {
      const s: any = p.slots;

      if (Array.isArray(s)) {
        for (let i = 0; i < s.length; i++) {
          if (s[i] == null) continue;
          if (!next.slots[i]) throw new Error(`Plant slot ${i} does not exist`);
          patchPlantSlot(next.slots[i], s[i]);
        }
      } else if (s && typeof s === "object") {
        for (const k of Object.keys(s)) {
          const i = Number(k) | 0;
          if (!Number.isFinite(i)) continue;
          if (!next.slots[i]) throw new Error(`Plant slot ${i} does not exist`);
          patchPlantSlot(next.slots[i], s[k]);
        }
      } else {
        throw new Error("patch.slots must be an array or object map");
      }

      return applyTileObject(Number(tx), Number(ty), next, opts);
    }

    // only top-level changes
    return applyTileObject(Number(tx), Number(ty), next, opts);
  },

  setTileDecor(tx: number, ty: number, patch: DecorPatch, opts: TileOpts = {}): ApplyResult {
    const info = this.getTileObject(tx, ty, opts);
    const cur = info.tileObject;
    assertType(cur, "decor");

    const next = deepClone(cur);
    const p = patch || {};
    if ("rotation" in p) next.rotation = Number(p.rotation);

    return applyTileObject(Number(tx), Number(ty), next, opts);
  },

  setTileEgg(tx: number, ty: number, patch: EggPatch, opts: TileOpts = {}): ApplyResult {
    const info = this.getTileObject(tx, ty, opts);
    const cur = info.tileObject;
    assertType(cur, "egg");

    const next = deepClone(cur);
    const p = patch || {};
    if ("plantedAt" in p) next.plantedAt = Number(p.plantedAt);
    if ("maturedAt" in p) next.maturedAt = Number(p.maturedAt);

    return applyTileObject(Number(tx), Number(ty), next, opts);
  },

  /** The game's Pixi canvas, or null before it is known. */
  getCanvas,

  /** The garden tile under a pointer event, wherever the camera has panned to. */
  pointerToFarmTile,

  /** A green flash that fades on a tile (the editor's "placed" and "selected" cue). */
  flashTileGreen,
};
