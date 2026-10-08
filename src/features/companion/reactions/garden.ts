// What just appeared in the garden: crops that turned rare, eggs that ripened.

import type { RareCrop } from "./events";

type Slot = { species?: unknown; startTime?: unknown; slotId?: unknown; mutations?: unknown };

/**
 * Crops carrying a rare mutation they did not have at the previous reading.
 *
 * A crop is identified by its tile, its slot and its planting date: planting
 * again in the same place is another crop. `prev === null` is the first
 * reading, which only serves as the reference.
 */
export function newRareCrops(prev: unknown, next: unknown, rare: ReadonlySet<string>): RareCrop[] {
  if (!prev || typeof prev !== "object" || !next || typeof next !== "object" || rare.size === 0) return [];

  const seen = new Map<string, Set<string>>();
  const index = (tiles: unknown, visit: (id: string, species: string, muts: string[]) => void) => {
    for (const [tileIdx, obj] of Object.entries(tiles as Record<string, unknown>)) {
      const o = obj as { objectType?: unknown; species?: unknown; slots?: unknown } | null;
      if (!o || o.objectType !== "plant" || !Array.isArray(o.slots)) continue;
      o.slots.forEach((raw, i) => {
        const s = raw as Slot | null;
        if (!s) return;
        const muts = Array.isArray(s.mutations) ? s.mutations.filter((m): m is string => typeof m === "string") : [];
        const species = typeof s.species === "string" ? s.species : typeof o.species === "string" ? o.species : "crop";
        visit(`${tileIdx}|${s.slotId ?? i}|${s.startTime ?? ""}`, species, muts);
      });
    }
  };

  index(prev, (id, _species, muts) => seen.set(id, new Set(muts)));

  const out: RareCrop[] = [];
  index(next, (id, species, muts) => {
    const before = seen.get(id) ?? new Set<string>();
    for (const m of muts) {
      if (rare.has(m) && !before.has(m)) out.push({ mutation: m, species });
    }
  });
  return out;
}

/** Ripe eggs not announced yet. Returns their keys, which the caller remembers. */
export function newlyReadyEggs(tiles: unknown, now: number, announced: ReadonlySet<string>): string[] {
  if (!tiles || typeof tiles !== "object") return [];
  const out: string[] = [];
  for (const [tileIdx, obj] of Object.entries(tiles as Record<string, unknown>)) {
    const o = obj as { objectType?: unknown; maturedAt?: unknown; plantedAt?: unknown } | null;
    if (!o || o.objectType !== "egg") continue;
    const matured = Number(o.maturedAt);
    if (!Number.isFinite(matured) || matured <= 0 || matured > now) continue;
    const key = `${tileIdx}|${o.plantedAt ?? ""}`;
    if (!announced.has(key)) out.push(key);
  }
  return out;
}
