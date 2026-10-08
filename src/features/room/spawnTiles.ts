// Garden positions: the map's spawn tiles, one per player slot, in tile order.

import { Atoms } from "../../game/store/atoms";

const DEFAULT_MAP_COLS = 81;

const isTileList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((n) => Number.isFinite(n));

let cachedSpawnTiles: number[] | null = null;
let loading: Promise<number[]> | null = null;

async function loadSpawnTiles(): Promise<number[]> {
  try {
    const map = await Atoms.root.map.get();
    if (isTileList(map?.spawnTiles)) return [...map.spawnTiles].sort((a, b) => a - b);
  } catch {}

  // Older builds kept the map inside the room state.
  try {
    const state = await Atoms.root.state.get();
    const seen = new Set<any>();
    const stack = [state];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
      seen.add(cur);
      if (isTileList(cur.spawnTiles)) return [...cur.spawnTiles].sort((a, b) => a - b);
      for (const k of Object.keys(cur)) {
        const v = cur[k];
        if (v && typeof v === "object") stack.push(v);
      }
    }
  } catch {}

  return [];
}

/** The spawn tiles in ascending order, read once per session. */
export async function sortedSpawnTiles(): Promise<number[]> {
  if (cachedSpawnTiles) return cachedSpawnTiles;
  if (!loading) {
    loading = loadSpawnTiles().then((tiles) => {
      cachedSpawnTiles = tiles;
      loading = null;
      return tiles;
    });
  }
  return loading;
}

export async function mapCols(): Promise<number> {
  try {
    const cols = Number((await Atoms.root.map.get())?.cols);
    if (Number.isFinite(cols) && cols > 0) return cols;
  } catch {}
  try {
    const state = await Atoms.root.state.get();
    const cols = Number(state?.map?.cols ?? state?.child?.data?.map?.cols ?? state?.fullState?.map?.cols);
    if (Number.isFinite(cols) && cols > 0) return cols;
  } catch {}
  return DEFAULT_MAP_COLS;
}
