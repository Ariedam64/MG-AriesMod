// Game sources several companion modules follow, subscribed to once.
//
// The movement loop and the AFK watch both follow the player's tile, and the
// reaction and wander watches both follow the garden. Each used to open its
// own store subscription; a feed opens one for the first listener and closes
// it when the last one leaves.

import { Emitter, Subscriptions, type Unsubscribe } from "../../lib/emitter";
import { Atoms } from "../../game/store/atoms";
import type { XY } from "./movement";

export interface Feed<T> {
  /** Calls `listener` with the current value if there is one, then on every change. */
  on(listener: (value: T) => void): Unsubscribe;
  /** Keeps the source open for a reader of `latest()` that needs no callback. */
  hold(): Unsubscribe;
  /** The last value seen, `undefined` while nobody listens or nothing arrived yet. */
  latest(): T | undefined;
}

function sharedFeed<T>(subscribe: (push: (value: T) => void) => Promise<Unsubscribe>): Feed<T> {
  const changes = new Emitter<T>();
  let source: Subscriptions | null = null;
  let latest: T | undefined;

  const feed: Feed<T> = {
    on(listener) {
      if (!source) {
        source = new Subscriptions();
        source.add(
          subscribe((value) => {
            latest = value;
            changes.emit(value);
          }).catch(() => undefined),
        );
      }
      const off = changes.on(listener);
      if (latest !== undefined) listener(latest);
      return () => {
        off();
        if (changes.size > 0 || !source) return;
        source.dispose();
        source = null;
        latest = undefined;
      };
    },
    hold: () => feed.on(() => {}),
    latest: () => latest,
  };
  return feed;
}

/** A world position rounded to the tile it stands on, or `null` when it is not one. */
export function roundTile(pos: { x?: unknown; y?: unknown } | null | undefined): XY | null {
  const x = Number(pos?.x);
  const y = Number(pos?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

/** The local player's tile. Positions that are not a tile are skipped. */
export const playerTileFeed: Feed<XY> = sharedFeed((push) =>
  Atoms.player.position.onChangeNow((next) => {
    const tile = roundTile(next);
    if (tile) push(tile);
  }),
);

/** `garden.tileObjects` of the local player, keyed by dirt tile index. Raw: it may be null. */
export const gardenFeed: Feed<unknown> = sharedFeed((push) => Atoms.data.gardenTileObjects.onChangeNow(push));
