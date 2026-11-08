// How many players are in the room, read off the room state.
//
// Build 1973 dropped `numPlayersAtom`. The game now counts the non-null
// userSlots (`filteredUserSlotsAtom`) and derives its friends from that
// (`numFriendsInRoomAtom = length - 1`), so the mod counts them the same way.

const MAX_PLAYERS = 6;

function userSlotsOf(state: any): unknown[] | null {
  const raw =
    state?.child?.data?.userSlots ??
    state?.fullState?.child?.data?.userSlots ??
    state?.data?.userSlots;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw as Record<string, unknown>);
  return null;
}

/** The number of players in the room, at most 6, or null when the state does not say. */
export function countRoomPlayers(state: any): number | null {
  const slots = userSlotsOf(state);
  let count = slots ? slots.filter((slot) => slot != null).length : 0;

  if (count === 0) {
    const players = state?.fullState?.data?.players ?? state?.data?.players ?? state?.players;
    count = Array.isArray(players) ? players.length : 0;
  }

  return count > 0 ? Math.min(MAX_PLAYERS, count) : null;
}
