// A "tick" atom used as an artificial dependency of the companion's injection.
//
// Jotai only recomputes a derived atom when one of its dependencies changes.
// Our patch on `quinoaDataAtom` only depends on the room state, updated about
// every 420 ms (measured). But the avatar layer interpolates a step over only
// 130 ms and SNAPS as soon as two positions in a row are more than one tile
// apart: at a 420 ms rate the companion teleported.
//
// Listing this tick in the patch's `extraDeps` makes `quinoaDataAtom`'s read
// depend on it, so bumping it forces the whole NPC chain to recompute at once,
// at the rate we choose.
//
// The game does not expose Jotai, but a v2 primitive atom is only an object
// `{ init, read, write }`. It is built with closures (never `this`):
// `fakeAtoms` reassigns `read` as an arrow function and calls the original
// with no receiver, so a `read` relying on `this` would break. It is then
// registered in `jotaiAtomCache`, which `getAtomByLabel` walks.

import { pageWindow } from "../../platform/pageContext";
import { jSet } from "../../game/store/jotai";

export const COMPANION_TICK_LABEL = "ariesCompanionTickAtom";

/** Registration key in the game's atom cache. */
const CACHE_KEY = `aries/companion/${COMPANION_TICK_LABEL}`;

type AtomCache = { cache: Map<unknown, unknown>; get(key: unknown, value: unknown): unknown };

let tickAtom: any = null;
let counter = 0;

function createTickAtom(): any {
  const atom: any = {};
  atom.init = 0;
  // Closes over `atom`, not `this`: see the header.
  atom.read = (get: (a: unknown) => unknown) => get(atom);
  atom.write = (get: (a: unknown) => unknown, set: (a: unknown, v: unknown) => void, update: unknown) =>
    set(atom, typeof update === "function" ? (update as (p: unknown) => unknown)(get(atom)) : update);
  atom.debugLabel = COMPANION_TICK_LABEL;
  atom.toString = () => COMPANION_TICK_LABEL;
  return atom;
}

/**
 * Creates and registers the atom once. `null` while the game's atom cache is
 * not there yet.
 */
export function ensureTickAtom(): any | null {
  if (tickAtom) return tickAtom;
  const cache = (pageWindow as any).jotaiAtomCache as AtomCache | undefined;
  if (!cache || typeof cache.get !== "function") return null;
  // `get(key, value)` registers when absent: idempotent across HUD reloads.
  tickAtom = cache.get(CACHE_KEY, createTickAtom());
  return tickAtom;
}

/** True when the tick is usable, so the forced recompute is available. */
export function isTickAvailable(): boolean {
  return ensureTickAtom() !== null;
}

/**
 * Forces the NPC chain to recompute now.
 *
 * Does nothing (and throws nothing) when the tick could not be registered:
 * the loop then falls back on the game's own rate, slower but never jerky
 * thanks to the render guard in `motion.ts`.
 */
export async function bumpTick(): Promise<void> {
  const atom = ensureTickAtom();
  if (!atom) return;
  counter++;
  try {
    await jSet(atom, counter);
  } catch {}
}
