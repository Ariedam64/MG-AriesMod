// The inventory's coin values follow the room's player count.
//
// The friend bonus on crop and plant values came from a player count read
// once, the first time the inventory showed, and kept for the session. As
// players joined or left, the value cards and the total kept the old bonus.

import { Atoms } from "../src/game/store/atoms";
import {
  followInventoryValues,
  onPlayersInRoomChange,
  playersInRoomForValues,
} from "../src/features/inventory/value";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(want)})`}`);
};

let players = 2;
const listeners: Array<(value: number) => void> = [];
(Atoms.server.numPlayers as any).get = async () => players;
(Atoms.server.numPlayers as any).onChange = async (cb: (value: number) => void) => {
  listeners.push(cb);
  return () => {};
};
(Atoms.inventory.myInventory as any).onChange = async () => () => {};
const playersChange = (next: number) => {
  players = next;
  listeners.forEach((cb) => cb(next));
};

(async () => {
  let notified = 0;
  onPlayersInRoomChange(() => notified++);

  await followInventoryValues();
  check("the count is read when the inventory first shows", playersInRoomForValues(), 2);

  playersChange(4);
  check("a player joining raises the count", playersInRoomForValues(), 4);
  playersChange(1);
  check("players leaving lower it", playersInRoomForValues(), 1);
  check("the inventory hears every change", notified, 3);

  await followInventoryValues();
  check("showing the inventory again does not follow twice", listeners.length, 1);

  if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall inventory friend bonus checks passed");
})();
