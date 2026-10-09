// The inventory's coin values follow the room's player count.
//
// The friend bonus on crop and plant values came from a player count read
// once, the first time the inventory showed, and kept for the session. As
// players joined or left, the value cards and the total kept the old bonus.

import { checkEqual, run } from "./_check";
import { Atoms } from "../src/game/store/atoms";
import {
  followInventoryValues,
  onPlayersInRoomChange,
  playersInRoomForValues,
} from "../src/features/inventory/value";

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

run(async () => {
  let notified = 0;
  onPlayersInRoomChange(() => notified++);

  await followInventoryValues();
  checkEqual("the count is read when the inventory first shows", playersInRoomForValues(), 2);

  playersChange(4);
  checkEqual("a player joining raises the count", playersInRoomForValues(), 4);
  playersChange(1);
  checkEqual("players leaving lower it", playersInRoomForValues(), 1);
  checkEqual("the inventory hears every change", notified, 3);

  await followInventoryValues();
  checkEqual("showing the inventory again does not follow twice", listeners.length, 1);

});
