// Reading other players out of the game's room state.
//
// `stateAtom` holds the players list and one `userSlot` per player, and each
// slot carries that player's inventory, garden, journal, stats and activity
// log. Everything here is a pure read of that state.

import type { GardenState } from "../../game/store/atoms";

export type Inventory = { items: any[]; favoritedItemIds?: string[] };

export type Player = {
  id: string;
  name: string;
  isConnected?: boolean;
  discordAvatarUrl?: string;
  /** Spawn tile of the player's garden, by slot order. */
  gardenPosition?: number | null;
};

type SpeciesProduceLog = { variantsLogged?: Array<{ variant: string; createdAt?: number }> };
type SpeciesPetLog = {
  variantsLogged?: Array<{ variant: string; createdAt?: number }>;
  abilitiesLogged?: Array<{ ability: string; createdAt?: number }>;
};

export type Journal = {
  produce?: Record<string, SpeciesProduceLog>;
  pets?: Record<string, SpeciesPetLog>;
};

/** Any array of `{ id, name }` objects under a key mentioning "player". */
function findPlayersDeep(state: any): Player[] {
  if (!state || typeof state !== "object") return [];
  const out: Player[] = [];
  const seen = new Set<any>();
  const stack = [state];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const k of Object.keys(cur)) {
      const v = cur[k];
      if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object")) {
        const looks = v.some((p) => "id" in p && "name" in p);
        if (looks && /player/i.test(k)) out.push(...(v as Player[]));
      }
      if (v && typeof v === "object") stack.push(v);
    }
  }
  const byId = new Map<string, Player>();
  for (const p of out) if (p?.id) byId.set(String(p.id), p);
  return [...byId.values()];
}

export function playersOf(state: any): Player[] {
  const direct = state?.fullState?.data?.players ?? state?.data?.players ?? state?.players;
  return Array.isArray(direct) ? direct : findPlayersDeep(state);
}

/** The `userSlots`, in slot order whether the game sends an array or an index-keyed object. */
function slotsOf(state: any): any[] {
  const raw = state?.child?.data?.userSlots ?? state?.fullState?.child?.data?.userSlots ?? state?.data?.userSlots;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const entries = Object.entries(raw as Record<string, any>);
    entries.sort((a, b) => {
      const ai = Number(a[0]);
      const bi = Number(b[0]);
      if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
      return a[0].localeCompare(b[0]);
    });
    return entries.map(([, v]) => v);
  }
  return [];
}

/**
 * Owner of a `userSlot`. The game renamed `playerId` to `userId`: reading only
 * one of them breaks the player to slot join, and every inventory, garden,
 * journal and stats view comes back empty.
 */
function slotOwnerId(slot: any): string {
  const raw = slot?.userId ?? slot?.playerId ?? slot?.id;
  return raw != null ? String(raw) : "";
}

export function slotOf(state: any, playerId: string): any {
  for (const slot of slotsOf(state)) if (slotOwnerId(slot) === String(playerId)) return slot;
  return null;
}

/** The players in `userSlots` order, then any player without a slot. */
export function playersInSlotOrder(state: any): Player[] {
  const players = playersOf(state);
  const byId = new Map<string, Player>();
  for (const p of players) byId.set(String(p.id), p);

  const out: Player[] = [];
  const seen = new Set<string>();
  for (const slot of slotsOf(state)) {
    const pid = slotOwnerId(slot);
    if (!pid || seen.has(pid)) continue;
    const p = byId.get(pid);
    if (p) {
      out.push(p);
      seen.add(pid);
    }
  }
  for (const p of players) {
    const pid = String(p.id);
    if (!seen.has(pid)) {
      out.push(p);
      seen.add(pid);
    }
  }
  return out;
}

export function inventoryOfSlot(slot: any): Inventory | null {
  const inv = slot?.data?.inventory;
  if (!inv || typeof inv !== "object") return null;
  const items = Array.isArray(inv.items) ? inv.items : [];
  const favoritedItemIds = Array.isArray(inv.favoritedItemIds) ? inv.favoritedItemIds : [];
  return { items, favoritedItemIds };
}

const listOr = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export function journalOfSlot(slot: any): Journal | null {
  const j = slot?.data?.journal ?? slot?.journal;
  if (!j || typeof j !== "object") return null;

  const journal: Journal = {};
  if (j.produce && typeof j.produce === "object") {
    journal.produce = Object.fromEntries(
      Object.entries(j.produce as Record<string, any>).map(([k, v]) => [String(k), { variantsLogged: listOr(v?.variantsLogged) }]),
    );
  }
  if (j.pets && typeof j.pets === "object") {
    journal.pets = Object.fromEntries(
      Object.entries(j.pets as Record<string, any>).map(([k, v]) => [
        String(k),
        { variantsLogged: listOr(v?.variantsLogged), abilitiesLogged: listOr(v?.abilitiesLogged) },
      ]),
    );
  }
  return journal;
}

export function hasJournalData(j: Journal | null | undefined): boolean {
  if (!j) return false;
  const hasProduce = !!j.produce && Object.values(j.produce).some((s) => (s.variantsLogged?.length ?? 0) > 0);
  const hasPets =
    !!j.pets &&
    Object.values(j.pets).some((s) => (s.variantsLogged?.length ?? 0) > 0 || (s.abilitiesLogged?.length ?? 0) > 0);
  return hasProduce || hasPets;
}

export function statsOfSlot(slot: any): Record<string, any> | null {
  const stats = slot?.data?.stats ?? slot?.stats;
  return stats && typeof stats === "object" ? stats : null;
}

export function activityLogsOfSlot(slot: any): any[] | null {
  const logs = slot?.data?.activityLogs ?? slot?.activityLogs;
  return Array.isArray(logs) ? logs : null;
}

export function gardenOfSlot(slot: any): GardenState | null {
  const g = slot?.data?.garden ?? slot?.garden;
  if (!g || typeof g !== "object") return null;
  const to = g.tileObjects;
  const bto = g.boardwalkTileObjects;
  return {
    tileObjects: to && typeof to === "object" ? to : {},
    boardwalkTileObjects: bto && typeof bto === "object" ? bto : {},
  };
}
