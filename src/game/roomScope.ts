// The game's per-room state.
//
// Since build 1441 a lot of local state lives on one room object instead of
// in labelled atoms: `currentRoomAtom` holds it, and its fields are plain
// atoms with no debugLabel (`toasts`, `npcLines`, `ownRemark`, ...). The game
// replaces the object on every room change, so a field is looked up each time
// rather than kept.

import { getAtomByLabel, jGet } from "./store/jotai";

const CURRENT_ROOM_LABEL = "currentRoomAtom";

/** The atom behind one field of the current room, or null before the game has a room. */
export async function currentRoomAtom(field: string): Promise<any | null> {
  const roomAtom = getAtomByLabel(CURRENT_ROOM_LABEL);
  if (!roomAtom) return null;
  const room = await jGet<Record<string, unknown> | null>(roomAtom).catch(() => null);
  const atom = room?.[field];
  return atom && typeof atom === "object" ? atom : null;
}
