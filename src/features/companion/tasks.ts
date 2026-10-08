// Sending the companion somewhere and keeping him there: tasks (walk to a
// tile and hold), attention (stay by the player), and the pose played once he
// stands still.

import { playEmote } from "./emote";
import type { EmoteType } from "./emoteTypes";
import { findNearbyWalkable, manhattan, type XY } from "./movement";
import { currentRuntime } from "./runtime";
import { sleep } from "../../lib/async";

/**
 * Past this, the walk is given up: a tile may be unreachable.
 *
 * Generous for walking (5 s is some thirty steps, more than enough to cross a
 * plot), but it is dead time when the walk fails, hence the quick give-up on
 * the caller's side.
 */
const WALK_TIMEOUT_MS = 5000;
/**
 * How often arrival is checked.
 *
 * Under the 150 ms of a step: it is pure dead time between him setting foot on
 * the tile and the action going out. At 100 ms it lost up to that per crop.
 */
const ARRIVAL_POLL_MS = 50;
/** At this distance from the player the bubble is already on screen: no need to walk. */
const NEARBY_DISTANCE = 3;

/** How often stillness is checked before the pose. */
const STILL_POLL_MS = 150;
/**
 * Past this, the arrival pose is given up.
 *
 * Wide on purpose: crossing the garden takes a few seconds, and missing the
 * pose by counting too short would be a shame. Only a valve against a
 * companion that never stops.
 */
const STILL_TIMEOUT_MS = 10_000;

/** The pending wait's token: a newer question cancels the older one. */
let stillToken = 0;

/**
 * Sends the companion to a tile and waits for him to get there.
 *
 * `false` when he does not make it in time; the caller decides whether to go
 * on without him. The task stays set: `releaseTask` gives him back his mode
 * once the whole run is over, otherwise he would head back to the player
 * between two crops. A tile taken by a plant may be impassable, so the nearest
 * walkable tile is used instead, which is enough to stand in front of it.
 */
export async function walkTo(target: XY): Promise<boolean> {
  const rt = currentRuntime();
  if (!rt || !rt.map) return false;

  const reachable = rt.map.isWalkable(target.x, target.y) ? target : findNearbyWalkable(target, rt.map.isWalkable, true, 2);
  if (!reachable) return false;

  rt.task = reachable;
  // A task on the tile the anchor already sat on would not count as a change
  // of anchor: without this reset he would keep wandering instead of going.
  rt.movement = { ...rt.movement, activity: "pursue", wanderTarget: null, wanderCooldown: 0 };

  const deadline = Date.now() + WALK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const now = currentRuntime();
    if (!now || now.task !== reachable) return false;
    const here = now.movement.tile;
    if (here && manhattan(here, reachable) === 0) return true;
    await sleep(ARRIVAL_POLL_MS);
  }
  return false;
}

/**
 * Brings the companion next to the player, to talk face to face.
 *
 * A bubble shows above the NPC: started from across the map it would be off
 * screen. He aims for a tile *next to* the player, whose own tile is taken,
 * and does not move when already in view. Like `walkTo`, the task stays set
 * until `releaseTask`.
 */
export async function comeToPlayer(): Promise<boolean> {
  const rt = currentRuntime();
  if (!rt || !rt.map || !rt.player) return false;

  const here = rt.movement.tile;
  if (here && manhattan(here, rt.player) <= NEARBY_DISTANCE) return true;

  const spot = findNearbyWalkable(rt.player, rt.map.isWalkable, true, 3);
  return spot ? walkTo(spot) : false;
}

/** Gives him back his mode after a run of walks. */
export function releaseTask(): void {
  const rt = currentRuntime();
  if (rt) rt.task = null;
}

/** Keeps him by the player, whatever his mode. */
export function holdAttention(): void {
  const rt = currentRuntime();
  if (rt) rt.attention = true;
}

/** Gives him back his mode: following or the garden, as set. */
export function releaseAttention(): void {
  const rt = currentRuntime();
  if (rt) rt.attention = false;
}

/** Tiles to the player, `null` while either position is unknown. */
export function distanceToPlayer(): number | null {
  const rt = currentRuntime();
  const here = rt?.movement.tile;
  if (!rt || !here || !rt.player) return null;
  return manhattan(here, rt.player);
}

/**
 * Plays a pose once he has arrived and stands still.
 *
 * A pose played mid-walk goes unnoticed: it plays while he slides from one
 * tile to the next. Two conditions, both needed: no task running, which covers
 * the walk just ordered (a question asked right before he sets off waits for
 * him to arrive), and the same tile on two readings in a row, since the avatar
 * interpolates and keeps sliding a moment after reaching the last tile.
 *
 * The first reading can therefore never fire, on purpose: that grace period
 * lets an imminent walk order be registered. Gives up silently if he never
 * stops: a player who keeps walking drags him along, and the question still
 * reads in the bubble and the thread.
 */
export async function emoteWhenStill(emote: EmoteType, timeoutMs = STILL_TIMEOUT_MS): Promise<void> {
  const rt = currentRuntime();
  if (!rt) return;

  const token = ++stillToken;
  const deadline = Date.now() + timeoutMs;
  let previous: XY | null = null;

  while (Date.now() < deadline) {
    await sleep(STILL_POLL_MS);
    // A newer wait took over, or he was put away meanwhile.
    if (token !== stillToken || currentRuntime() !== rt) return;

    const here = rt.movement.tile;
    const still = rt.task === null && here !== null && previous !== null && manhattan(here, previous) === 0;
    previous = here;
    if (still) {
      await playEmote(rt.npcId, emote);
      return;
    }
  }
}
