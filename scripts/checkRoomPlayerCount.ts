// The room's player count comes from the room state, as the game counts it.
//
// Build 1973 dropped `numPlayersAtom`. The mod still read it by label, and a
// missing label answers undefined without an error: the collect-state
// heartbeat clamped that to 1 (full rooms showed as 1/6 in the Community Hub)
// and every friend bonus fell back to a single player. The game now counts
// the non-null userSlots (`filteredUserSlotsAtom`), which the mod can read
// off `stateAtom` itself.

import { readFileSync } from "node:fs";
import { check, checkEqual, run } from "./_check";
import { Store } from "../src/game/store/api";
import { Atoms, player } from "../src/game/store/atoms";
import { buildPlayerStatePayload } from "../src/platform/ariesApi/playerStatePayload";

// No game store in node: every label reads as missing, at once, the way
// `numPlayersAtom` does in build 1973.
(Store as any).select = async (_label: string, fallback?: unknown) => fallback;
(Store as any).hasAtom = async () => false;

const slot = (userId: string) => ({ userId, data: { coinsCount: 100, garden: null, inventory: { items: [] } } });
const listed = (id: string) => ({ id, name: `Player ${id}` });

/** A room with five players and one empty place. */
const fiveRoom = {
  data: {
    roomId: "room-1",
    players: ["acc1", "acc2", "acc3", "acc4", "acc5"].map(listed),
  },
  child: {
    data: {
      userSlots: [slot("acc1"), slot("acc2"), null, slot("acc3"), slot("acc4"), slot("acc5")],
    },
  },
};

let roomState: unknown = fiveRoom;
const stateListeners: Array<(next: unknown, prev?: unknown) => void> = [];
(Atoms.root.state as any).get = async () => roomState;
(Atoms.root.state as any).onChange = async (cb: (next: unknown, prev?: unknown) => void) => {
  stateListeners.push(cb);
  return () => {};
};
(Atoms.root.state as any).onChangeNow = async (cb: (next: unknown, prev?: unknown) => void) => {
  stateListeners.push(cb);
  cb(roomState);
  return () => {};
};
(player as any).get = async () => ({ id: "acc1" });

const TIMEOUT = "timed out";

/** Gives up after `ms`: the old view waits for an atom that never comes. */
function withTimeout<T>(promise: Promise<T>, ms = 1500): Promise<T | typeof TIMEOUT> {
  return Promise.race([promise, new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), ms))]);
}

function emitState(next: unknown): void {
  const prev = roomState;
  roomState = next;
  stateListeners.forEach((cb) => cb(next, prev));
}

run(async () => {
  roomState = fiveRoom;
  checkEqual(
    "five occupied userSlots and an empty one count five players",
    await withTimeout(Atoms.server.numPlayers.get()),
    5,
  );

  const payload = await withTimeout(buildPlayerStatePayload());
  checkEqual(
    "the collect-state payload sends five players, not one",
    payload === TIMEOUT ? TIMEOUT : payload?.room.playersCount ?? null,
    5,
  );

  roomState = { data: { players: [] }, child: { data: { userSlots: { "0": slot("acc1"), "1": null, "2": slot("acc2") } } } };
  checkEqual("userSlots kept as an indexed object are counted too", await withTimeout(Atoms.server.numPlayers.get()), 2);

  roomState = { data: { players: ["acc1", "acc2", "acc3"].map(listed) } };
  checkEqual("without userSlots the player list gives the count", await withTimeout(Atoms.server.numPlayers.get()), 3);

  roomState = {};
  checkEqual("an empty room state gives no count", await withTimeout(Atoms.server.numPlayers.get()), null);

  roomState = fiveRoom;
  const heard: unknown[] = [];
  await withTimeout(Atoms.server.numPlayers.onChange((next) => heard.push(next)));
  emitState({ ...fiveRoom });
  emitState({ ...fiveRoom, data: { ...fiveRoom.data, roomId: "room-1" } });
  emitState({ data: { players: [] }, child: { data: { userSlots: [slot("acc1"), null, slot("acc2"), slot("acc3")] } } });
  emitState({ data: { players: [] }, child: { data: { userSlots: [slot("acc1"), slot("acc2"), slot("acc3"), null] } } });
  checkEqual("listeners hear the count only when it changes", heard, [5, 3]);

  const atomsSource = readFileSync("src/game/store/atoms.ts", "utf8");
  check("the atoms no longer ask for numPlayersAtom", !atomsSource.includes("numPlayersAtom"));
});
