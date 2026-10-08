// The room's current friend bonus, which the Sell Crops lock compares with the
// player's minimum. Followed once for the whole mod, from the first reader on.

import { Atoms } from "../../game/store/atoms";
import { readAndFollow } from "../../game/store/hub";
import { Emitter } from "../../lib/emitter";
import { friendBonusPercentFromMultiplier, friendBonusPercentFromPlayers } from "./restrictions";

let fromMultiplier: number | null = null;
let fromPlayers: number | null = null;
let following = false;
const changes = new Emitter<number | null>();

/** Starts following both atoms; safe to call more than once. */
export function followFriendBonus(): void {
  if (following) return;
  following = true;
  void readAndFollow(Atoms.server.friendBonusMultiplier, (next) => {
    fromMultiplier = friendBonusPercentFromMultiplier(next);
    changes.emit(currentFriendBonus());
  });
  void readAndFollow(Atoms.server.numPlayers, (next) => {
    fromPlayers = friendBonusPercentFromPlayers(next);
    changes.emit(currentFriendBonus());
  });
}

/** The bonus in percent, from the multiplier atom or else the player count; null until either answers. */
export function currentFriendBonus(): number | null {
  followFriendBonus();
  return fromMultiplier ?? fromPlayers;
}

export function onFriendBonusChange(listener: (percent: number | null) => void): () => void {
  followFriendBonus();
  return changes.on(listener);
}
