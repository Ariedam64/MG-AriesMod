// Finding the game's tile object system, the part of the world renderer that
// owns one view per garden tile.
//
// The game used to expose a single engine object carrying `app`, `systems`,
// `start()` and `destroy()`, and the mod grabbed it by patching
// `Function.prototype.bind` and watching for that shape. Build 1206 broke that
// apart into a tree of scopes: the world scope owns `app` and `systems` but has
// no `start`/`destroy`, and nothing calls `.bind()` on it, so the old predicate
// could never match again and every editor action threw.
//
// What survived is the system itself. `Scope.addSystem` still does
// `systems.set(system.name, { system, enabled })`, and the tile system is still
// called `tileObject`, so the capture now watches `Map.prototype.set` for that
// one key. The patch is installed at boot, fires when the world builds, and
// takes itself back off straight away.

import { pageWindow, readSharedGlobal, shareGlobal } from "../../platform/pageContext";

type AnyFn = (...args: any[]) => any;

export const tileState = {
  /**
   * The old monolithic engine. Current builds have none, so this stays null
   * unless another mod published one; everything below treats it as optional.
   */
  engine: null as any,
  tos: null as any,
  /**
   * The world scope's system registry, where the tile system was found. Other
   * systems of the same world live there too (`avatar`, for one), so keeping it
   * lets them be reached without a capture of their own.
   */
  worldSystems: null as Map<unknown, unknown> | null,
  /** Set while `Map.prototype.set` carries our capture wrapper. */
  mapSetPatched: false,
  origMapSet: null as AnyFn | null,
  ourMapSet: null as AnyFn | null,
};

/** The name the game gives the tile system, and the key it registers it under. */
const TILE_OBJECT_SYSTEM_NAME = "tileObject";
/** How deep to follow a scope tree when searching an engine handed to us. */
const SCOPE_SEARCH_DEPTH = 6;

function looksLikeTileObjectSystem(o: any): boolean {
  return !!(o && typeof o === "object"
    && o.name === TILE_OBJECT_SYSTEM_NAME
    && o.tileViews && typeof o.tileViews.get === "function"
    && typeof o.getOrCreateTileView === "function");
}

/**
 * A registry entry is `{ system, enabled }` since the scope rework; older builds
 * stored the system itself. Accept both so this survives the next reshuffle.
 */
function tileObjectSystemFrom(value: any): any | null {
  if (looksLikeTileObjectSystem(value)) return value;
  if (looksLikeTileObjectSystem(value?.system)) return value.system;
  return null;
}

/**
 * A world rebuild (travelling to another village) disposes the tile system and
 * builds a new one. The old object still answers every call, it just paints
 * nothing, so the container it draws into is what says whether it is still real.
 */
function isLiveTileObjectSystem(o: any): boolean {
  if (!looksLikeTileObjectSystem(o)) return false;
  try {
    return o.worldContainer?.destroyed !== true;
  } catch {
    return true;
  }
}

function isScopeLike(o: any): boolean {
  return !!(o && typeof o === "object"
    && ((o.systems && typeof o.systems.values === "function")
      || typeof o.addScope === "function"
      || typeof o.addSystem === "function"));
}

/**
 * Searches a scope (or the legacy engine) and the scopes below it.
 *
 * Only ever steps into children that are themselves scopes, so handing this a
 * Pixi container by mistake costs one property read rather than a walk of the
 * whole display tree.
 */
function findTileObjectSystem(scope: any, depth = 0): any | null {
  if (!scope || typeof scope !== "object" || depth > SCOPE_SEARCH_DEPTH) return null;

  try {
    const systems = scope.systems;
    if (systems && typeof systems.values === "function") {
      for (const entry of systems.values()) {
        const found = tileObjectSystemFrom(entry);
        if (found) return found;
      }
    }
  } catch {}

  try {
    const children = scope.children;
    if (children && typeof children[Symbol.iterator] === "function") {
      for (const child of children) {
        if (!isScopeLike(child)) continue;
        const found = findTileObjectSystem(child, depth + 1);
        if (found) return found;
      }
    }
  } catch {}

  // The world scope hangs off the renderer scope, and the player scope points
  // back at the world scope through `renderer`.
  for (const key of ["rendererScope", "renderer", "worldScope", "world"]) {
    try {
      const next = scope[key];
      if (!isScopeLike(next)) continue;
      const found = findTileObjectSystem(next, depth + 1);
      if (found) return found;
    } catch {}
  }

  return null;
}

function tryCaptureFromKnownGlobals(): void {
  if (!tileState.engine) {
    const shared = readSharedGlobal<any>("__QUINOA_ENGINE__");
    if (shared) tileState.engine = shared;
  }
  if (!tileState.tos) {
    // Another mod may have published one from a world that has since gone away.
    const shared = readSharedGlobal<any>("__TILE_OBJECT_SYSTEM__");
    if (isLiveTileObjectSystem(shared)) tileState.tos = shared;
  }
  if (!tileState.tos && tileState.engine) tileState.tos = findTileObjectSystem(tileState.engine);
  publishCapturedGlobals();
}

// Share the captured TOS with other mods (Arie's Mod / Community Hub): only one
// capture needs to win, the others read these globals. Always overwrites, so a
// world rebuild replaces a dead system rather than leaving readers on it.
function publishCapturedGlobals(): void {
  if (tileState.engine) shareGlobal("__QUINOA_ENGINE__", tileState.engine);
  if (tileState.tos) shareGlobal("__TILE_OBJECT_SYSTEM__", tileState.tos);
}

function mapPrototype(): any {
  const MapCtor: any = (pageWindow as any)?.Map ?? Map;
  return MapCtor?.prototype ?? null;
}

/**
 * Watches `Map.prototype.set` for the one key that identifies the tile system.
 *
 * `Scope.addSystem` registers every system as `systems.set(system.name, …)`, so
 * this fires exactly once per world build, on a string compare that costs
 * nothing. It comes straight back off once it has what it needs.
 */
function armCapture(): void {
  if (tileState.tos || tileState.mapSetPatched) return;

  const proto = mapPrototype();
  const original = proto?.set;
  if (typeof original !== "function") return;

  const wrapper = function (this: any, key: any, value: any) {
    const result = original.call(this, key, value);
    if (key === TILE_OBJECT_SYSTEM_NAME) {
      try {
        const system = tileObjectSystemFrom(value);
        if (system) {
          tileState.tos = system;
          // The page's Map is not the sandbox's: check the shape, not the class.
          tileState.worldSystems = this && typeof this.get === "function" ? this : null;
          publishCapturedGlobals();
          disarmCapture();
        }
      } catch {}
    }
    return result;
  };

  tileState.origMapSet = original;
  tileState.ourMapSet = wrapper;
  tileState.mapSetPatched = true;
  proto.set = wrapper;
}

function disarmCapture(): void {
  if (!tileState.mapSetPatched) return;
  tileState.mapSetPatched = false;

  const proto = mapPrototype();
  try {
    // Someone else may have wrapped us in the meantime; leave their patch alone
    // rather than unhooking it along with ours.
    if (proto && tileState.origMapSet && proto.set === tileState.ourMapSet) {
      proto.set = tileState.origMapSet;
    }
  } catch {}

  tileState.origMapSet = null;
  tileState.ourMapSet = null;
}

export function ensureCapture(): void {
  if (tileState.tos && isLiveTileObjectSystem(tileState.tos)) return;
  if (tileState.tos) {
    tileState.tos = null;
    tileState.worldSystems = null;
    try { shareGlobal("__TILE_OBJECT_SYSTEM__", null); } catch {}
  }
  tryCaptureFromKnownGlobals();
  if (!tileState.tos) armCapture();
}

function globalIndexFromXY(tx: number, ty: number): number | null {
  const cols = tileState.tos?.map?.cols;
  if (!Number.isFinite(cols) || cols <= 0) return null;
  return ((ty * cols) + tx) | 0;
}

export function getTileViewAt(tx: number, ty: number, ensureView: boolean) {
  const gidx = globalIndexFromXY(tx, ty);
  if (!tileState.tos || gidx == null) return { gidx: null as number | null, tv: null as any };

  let tv = tileState.tos.tileViews?.get?.(gidx) ?? null;

  // Create view if needed
  if (!tv && ensureView && typeof tileState.tos.getOrCreateTileView === "function") {
    try { tv = tileState.tos.getOrCreateTileView(gidx); } catch {}
  }

  return { gidx, tv };
}

export function assertReady(): void {
  ensureCapture();
  if (!tileState.tos) {
    throw new Error("Quinoa tile system not captured. Call tos.init() early (main entry) so it is watching before the world builds.");
  }
}

/**
 * Another system of the world the tile system belongs to, by the name the game
 * registers it under, or `null`.
 *
 * Only available when this module did the capture itself: a tile system read
 * from another mod's global comes without its registry.
 */
export function getWorldSystem(name: string): any | null {
  ensureCapture();
  const entry: any = tileState.worldSystems?.get(name);
  if (!entry) return null;
  const system = entry.system ?? entry;
  return system && typeof system === "object" && system.destroyed !== true ? system : null;
}
