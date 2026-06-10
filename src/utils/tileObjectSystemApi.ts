// quinoaTileApi.ts
// Quinoa Tile API (no HUD, no console, no global exposure)
// Usage:
//   // main.ts (le plus tôt possible)
//   import { tos } from "./quinoaTileApi";
//   tos.init();
//
//   // ailleurs
//   import { tos } from "./quinoaTileApi";
//   tos.setTileEmpty(15, 15);

export type PlantSlotPatch = {
  startTime?: number;
  endTime?: number;
  targetScale?: number;
  mutations?: string[]; // remplacement total uniquement
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

type AnyFn = (...args: any[]) => any;

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

const state = {
  engine: null as any,
  tos: null as any,
  origBind: Function.prototype.bind as AnyFn,
  bindPatched: false,
  highlight: {
    gfx: null as any,
    tile: null as { tx: number; ty: number } | null,
    parent: null as any,
  },
  hoverDebug: {
    enabled: false,
    cleanup: null as null | (() => void),
  },
};

function looksLikeEngine(o: any): boolean {
  return !!(o && typeof o === "object"
    && typeof o.start === "function"
    && typeof o.destroy === "function"
    && o.app && o.app.stage && o.app.renderer
    && o.systems && typeof o.systems.values === "function");
}

function findTileObjectSystem(engine: any): any | null {
  try {
    for (const e of engine.systems.values()) {
      const s = e?.system;
      if (s?.name === "tileObject") return s;
    }
  } catch {}
  return null;
}

function tryCaptureFromKnownGlobals(): void {
  const w = window as any;
  if (!state.engine && w.__QUINOA_ENGINE__) state.engine = w.__QUINOA_ENGINE__;
  if (!state.tos && w.__TILE_OBJECT_SYSTEM__) state.tos = w.__TILE_OBJECT_SYSTEM__;
  if (state.engine && !state.tos) state.tos = findTileObjectSystem(state.engine);
  publishCapturedGlobals();
}

// Share the captured engine/TOS with other mods (Arie's Mod / Community Hub):
// only one bind-patch capture needs to win, the others read these globals.
function publishCapturedGlobals(): void {
  try {
    const w = window as any;
    if (state.engine && !w.__QUINOA_ENGINE__) w.__QUINOA_ENGINE__ = state.engine;
    if (state.tos && !w.__TILE_OBJECT_SYSTEM__) w.__TILE_OBJECT_SYSTEM__ = state.tos;
  } catch {}
}

function armCapture(): void {
  if (state.engine && state.tos) return;
  if (state.bindPatched) return;

  state.bindPatched = true;

  Function.prototype.bind = function (this: any, thisArg: any, ...args: any[]) {
    const bound = state.origBind.call(this, thisArg, ...args);

    try {
      if (!state.engine && looksLikeEngine(thisArg)) {
        state.engine = thisArg;
        state.tos = findTileObjectSystem(thisArg);
        publishCapturedGlobals();

        // Restore bind ASAP (one-shot)
        Function.prototype.bind = state.origBind;
        state.bindPatched = false;
      }
    } catch {}

    return bound;
  };
}

function deepClone<T>(v: T): T {
  try {
    // @ts-ignore
    if (typeof structuredClone === "function") return structuredClone(v);
  } catch {}
  try { return JSON.parse(JSON.stringify(v)); } catch {}
  return v;
}

function globalIndexFromXY(tx: number, ty: number): number | null {
  const cols = state.tos?.map?.cols;
  if (!Number.isFinite(cols) || cols <= 0) return null;
  return ((ty * cols) + tx) | 0;
}

function getTileViewAt(tx: number, ty: number, ensureView: boolean) {
  const gidx = globalIndexFromXY(tx, ty);
  if (!state.tos || gidx == null) return { gidx: null as number | null, tv: null as any };

  let tv = state.tos.tileViews?.get?.(gidx) ?? null;

  // Create view if needed
  if (!tv && ensureView && typeof state.tos.getOrCreateTileView === "function") {
    try { tv = state.tos.getOrCreateTileView(gidx); } catch {}
  }

  return { gidx, tv };
}

function assertReady(): void {
  if (!state.engine || !state.tos) {
    throw new Error("Quinoa engine/TOS not captured. Call tos.init() early (main entry) and ensure it runs before engine initializes.");
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

  if (forceUpdate && state.engine?.reusableContext) {
    try { tv.update(state.engine.reusableContext); } catch {}
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
  if ("targetScale" in p) slot.targetScale = Number(p.targetScale);

  // remplacement total uniquement
  if ("mutations" in p) {
    if (!Array.isArray(p.mutations)) throw new Error("mutations must be an array of strings");
    if (!p.mutations.every(x => typeof x === "string")) throw new Error("mutations must contain only strings");
    slot.mutations = p.mutations.slice();
  }
}

type PointerTileInfo = {
  tx: number;
  ty: number;
  gidx: number | null;
  world: { x: number; y: number };
  inside: boolean;
  canvas: HTMLCanvasElement | null;
  ev: PointerEvent;
};

type PointerTileListener = (info: PointerTileInfo) => void;

type PointerToTileOpts = {
  tileSize?: number;
  clamp?: boolean;
};

type HighlightOpts = {
  color?: number;
  alpha?: number;
  thickness?: number;
  padding?: number;
  tileSize?: number;
};

function getCanvas(): HTMLCanvasElement | null {
  return (state.engine as any)?.app?.view
    || (state.engine as any)?.app?.renderer?.view
    || null;
}

function defaultTileSize(): number {
  const t = state.tos as any;
  const m = t?.map || {};
  const candidates = [m.tileSize, m.tileW, m.tileWidth, t?.tileSize, t?.tileW, 64];
  for (const c of candidates) {
    if (Number.isFinite(c) && c > 0) return Number(c);
  }
  return 64;
}

function pointerToTile(ev: PointerEvent, opts: PointerToTileOpts = {}): PointerTileInfo | null {
  assertReady();
  const canvas = getCanvas();
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  const x = (ev.clientX - rect.left) * scaleX;
  const y = (ev.clientY - rect.top) * scaleY;

  const tileSize = opts.tileSize ?? defaultTileSize();
  if (!Number.isFinite(tileSize) || tileSize <= 0) return null;

  const tx = Math.floor(x / tileSize);
  const ty = Math.floor(y / tileSize);
  const cols = (state.tos as any)?.map?.cols;
  const rows = (state.tos as any)?.map?.rows;
  const inside =
    Number.isFinite(tx) && Number.isFinite(ty)
    && (!opts.clamp
      ? true
      : (!Number.isFinite(cols) || (tx >= 0 && tx < cols))
      && (!Number.isFinite(rows) || (ty >= 0 && ty < rows)));

  return {
    tx,
    ty,
    gidx: inside ? globalIndexFromXY(tx, ty) : null,
    world: { x, y },
    inside,
    canvas,
    ev,
  };
}

function onPointerTile(listener: PointerTileListener, opts: PointerToTileOpts = {}): () => void {
  assertReady();
  const canvas = getCanvas();
  if (!canvas) throw new Error("Canvas not available on engine");

  const onMove = (ev: PointerEvent) => {
    const info = pointerToTile(ev, opts);
    if (info) listener(info);
  };
  const onLeave = (ev: PointerEvent) => {
    const info = pointerToTile(ev, opts);
    if (info) listener({ ...info, inside: false });
  };

  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  return () => {
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerleave", onLeave);
  };
}

function clearHighlight() {
  try { state.highlight.gfx?.parent?.removeChild?.(state.highlight.gfx); } catch {}
  state.highlight.gfx?.destroy?.();
  state.highlight.gfx = null;
  state.highlight.tile = null;
  state.highlight.parent = null;
}

function highlightTile(tx: number, ty: number, color = 0x00ff00, opts: HighlightOpts = {}) {
  const info = tos.getTileObject(tx, ty, { ensureView: true });
  const tv = info.tileView as any;
  if (!tv) throw new Error("TileView not available");

  const parent = tv.root || tv.container || tv;
  if (!parent?.addChild) throw new Error("TileView is not a display container");

  const PIXI = (state.engine as any)?.app?.renderer?.PIXI ?? (window as any).PIXI;
  const Graphics = PIXI?.Graphics;
  if (!Graphics) throw new Error("PIXI.Graphics not available");

  const gfx = state.highlight.gfx ?? new Graphics();
  const alpha = opts.alpha ?? 0.8;
  const thickness = opts.thickness ?? 2;
  const padding = opts.padding ?? 0;
  const tileSize = opts.tileSize ?? defaultTileSize();

  gfx.clear();
  gfx.lineStyle(thickness, color, alpha);
  const w = (parent as any)?.width ?? tileSize;
  const h = (parent as any)?.height ?? tileSize;
  gfx.drawRect(-padding, -padding, w + padding * 2, h + padding * 2);
  gfx.zIndex = 9999;

  if (gfx.parent !== parent) {
    try { gfx.parent?.removeChild?.(gfx); } catch {}
    parent.addChild(gfx);
  }

  state.highlight.gfx = gfx;
  state.highlight.tile = { tx, ty };
  state.highlight.parent = parent;
  return { tx, ty, gidx: info.gidx, color, alpha, thickness };
}

function setDebugHoverHighlight(enabled: boolean, opts: HighlightOpts & PointerToTileOpts = {}) {
  if (!enabled) {
    state.hoverDebug.cleanup?.();
    state.hoverDebug.cleanup = null;
    state.hoverDebug.enabled = false;
    clearHighlight();
    return false;
  }

  assertReady();
  if (state.hoverDebug.enabled) return true;

  const cleanup = onPointerTile((info) => {
    if (!info.inside || info.tx == null || info.ty == null) {
      clearHighlight();
      return;
    }
    try { highlightTile(info.tx, info.ty, opts.color ?? 0x00ff00, opts); } catch {}
  }, opts);

  state.hoverDebug.cleanup = cleanup;
  state.hoverDebug.enabled = true;
  return true;
}

export const tos = {
  /** À appeler une fois dans le main, le plus tôt possible */
  init(): HookStatus {
    tryCaptureFromKnownGlobals();
    armCapture();
    tryCaptureFromKnownGlobals();
    return { ok: !!(state.engine && state.tos), engine: state.engine, tos: state.tos };
  },

  isReady(): boolean {
    if (!state.engine || !state.tos) tryCaptureFromKnownGlobals();
    return !!(state.engine && state.tos);
  },

  getStatus(): HookStatus {
    return { ok: !!(state.engine && state.tos), engine: state.engine, tos: state.tos };
  },

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

  /** Met la tile à vide (tileObject = null) */
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

  /** Convertit un événement pointeur en coordonnées de tile (tx, ty) */
  pointerToTile,

  /** Écoute les mouvements pointeur sur le canvas et appelle le callback avec les infos de tile */
  onPointerTile,

  /** Dessine un contour autour d'une tile donnée */
  highlightTile,

  /** Supprime le contour actif */
  clearHighlight,

  /** Active/désactive un mode debug qui highlight la tile sous le pointeur en temps réel */
  setDebugHoverHighlight,
};
