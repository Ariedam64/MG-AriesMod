// What the editor reads from the running game: who the player is, which user
// slot (garden) is theirs, the map, and a player's real garden as the server
// last sent it.

import { Atoms, stateUserSlots, type GardenState } from "../../game/store/atoms";
import { makeAtom } from "../../game/store/hub";
import { findPlayerSlot, sanitizeGarden, type PlayerSlotMatch } from "./gardenModel";
import type { GardenMapData } from "./tileMap";

/** Index of the local player's garden in the room. Not in the `Atoms` catalog yet. */
const myUserSlotIdx = makeAtom<number>("myUserSlotIdxAtom");

export async function getPlayerId(): Promise<string | null> {
  try {
    const id = await Atoms.player.playerId.get();
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/** The local player's user slot index, 0 when the game has not told us yet. */
export async function readUserSlotIdx(): Promise<number> {
  try {
    const raw = await myUserSlotIdx.get();
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  } catch {}
  return 0;
}

export async function readMapData(): Promise<GardenMapData | null> {
  return ((await Atoms.root.map.get().catch(() => null)) as GardenMapData | null) ?? null;
}

/** A player's user slot in the room state, as the server last sent it. */
export async function readPlayerSlot(playerId: string): Promise<PlayerSlotMatch | null> {
  const slots = await stateUserSlots.get().catch(() => null);
  return findPlayerSlot(slots, playerId);
}

/** A player's real garden, straight from the room state, whatever the editor shows. */
export async function readRealGardenForPlayer(playerId: string): Promise<GardenState | null> {
  if (!playerId) return null;
  try {
    const match = await readPlayerSlot(playerId);
    return match?.slot ? sanitizeGarden(match.slot.data?.garden || {}) : null;
  } catch {
    return null;
  }
}
