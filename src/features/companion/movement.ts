// The companion's movement engine.
//
// Model: anchor plus area. The companion only "follows the player" in one
// particular case. In general he heads for an ANCHOR, then, once there,
// wanders around it or stays put. The walkable area comes through
// `isWalkable`, already narrowed to the mode (garden tiles, whole map...).
//
// Two axes not to mix up:
//  - the MODE, chosen by the player (follow / garden): it lives in
//    `anchors.ts` and comes down to an anchor and an area here;
//  - the internal ACTIVITY (`pursue` / `wander`), handled below.
//
// Pure: no store, no timer, chance passed in. The only part of movement
// checkable outside the browser (scripts/checkCompanionMovement.ts).
//
// The render constraint behind everything else: the game's avatar layer only
// animates walking when the tile changes by exactly one (Manhattan distance
// 1). Beyond that it snaps. Each tick therefore makes a single orthogonal
// step, or a deliberate jump.

import { pickOne, type Random } from "../../lib/random";
import { findFirstStep, type IsGoal } from "./pathfinding";

export type XY = { x: number; y: number };

/** Internal activity: reach the anchor, or wander around it. */
type MovementActivity = "pursue" | "wander";

/** What the companion aims for, and how to behave once there. Built by `anchors.ts`. */
export type Anchor = {
  tile: XY;
  /** Once the anchor is reached: wander around it, or stop moving. */
  onArrival: "wander" | "hold";
  /**
   * Is the anchor the player? Two consequences: wandering waits for them to
   * stand still, and their tile is never stepped on.
   */
  tracksPlayer: boolean;
  /**
   * The mode's territory, separate from walkability.
   *
   * Once INSIDE his area the companion stays there. While OUTSIDE he moves
   * freely to get back: without that asymmetry, switching to garden mode while
   * he is elsewhere would forbid every tile around him and freeze him.
   */
  zone?: IsWalkable;
  /** The mode's own wander radius. Default: the config's. */
  wanderRadius?: number;
};

export type MovementConfig = {
  /** How far from the anchor the companion stops. */
  followDistance: number;
  /** Ticks of anchor stillness before wandering (anchors that follow the player). */
  idleTicksBeforeWander: number;
  wanderRadius: number;
  /**
   * Ticks of pause between two wander moves: the bottom of the range when
   * `wanderPauseMaxTicks` is set, the exact pause otherwise.
   */
  wanderPauseTicks: number;
  /**
   * The top of the pause, drawn at every stop with the given `random`.
   *
   * A fixed pause shows: after three strolls the next one can be predicted to
   * the second. Missing, or under the bottom, the pause is fixed again.
   */
  wanderPauseMaxTicks?: number;
};

/**
 * The loop's period: one step per tick, so the walking speed.
 *
 * Set just above the game's 130 ms step interpolation. Below it steps
 * overlap; well above, walking turns into hopping. At this rate two steps in
 * the same direction also trigger the game's run cycle.
 */
export const STEP_INTERVAL_MS = 150;

/**
 * Movement settings. Deliberately CONSTANTS and not options: they are tuned to
 * the game's renderer, not preferences, and exposing them would invite
 * breaking the walk without knowing why.
 */
export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  followDistance: 2,
  // 15 s of stillness before wandering, then 8 to 45 s of pause between two
  // strolls, drawn every time.
  idleTicksBeforeWander: Math.round(15_000 / STEP_INTERVAL_MS),
  wanderRadius: 3,
  wanderPauseTicks: Math.round(8_000 / STEP_INTERVAL_MS),
  wanderPauseMaxTicks: Math.round(45_000 / STEP_INTERVAL_MS),
};

/**
 * Settings for a walk on order.
 *
 * `followDistance: 0` is the only difference, and it is essential: when
 * following, stopping two tiles from the anchor is the point, sticking to the
 * player would be annoying. On order the anchor IS the destination, and
 * arriving "within two tiles" would never count as arriving.
 */
export const TASK_MOVEMENT_CONFIG: MovementConfig = {
  ...DEFAULT_MOVEMENT_CONFIG,
  followDistance: 0,
};

/**
 * Settings while he waits on an answer.
 *
 * He just asked a question: two tiles away, the usual following distance,
 * keeps him in sight but not in conversation, and a player on the move sees
 * him trail behind. One tile keeps him close without stepping on the player,
 * which `0` would do here, since the player's tile is not free.
 */
export const ATTENTION_MOVEMENT_CONFIG: MovementConfig = {
  ...DEFAULT_MOVEMENT_CONFIG,
  followDistance: 1,
};

export type MovementState = {
  activity: MovementActivity;
  /** The companion's position. `null` until he has appeared. */
  tile: XY | null;
  /** The anchor's last known position, to notice it moved. */
  lastAnchorTile: XY | null;
  idleTicks: number;
  wanderCooldown: number;
  wanderTarget: XY | null;
  /** Does the current wander target come from an interest? */
  wanderTargetIsInterest: boolean;
};

type MovementDecision = {
  state: MovementState;
  /** The position to inject. `null`: no usable position. */
  tile: XY | null;
  /** True when the move is longer than one tile: the game will snap instead of walking. */
  teleported: boolean;
  /**
   * The interest reached on this tick: the tile where he just stopped.
   *
   * Reported once, on the tick the wandering sees the arrival, so the caller
   * plays its pose without comparing positions itself.
   */
  interestReached?: XY | null;
};

export type IsWalkable = (x: number, y: number) => boolean;

/**
 * Where a wander can lead: what `pickInterest` receives.
 *
 * `isWalkable` is already narrowed to everything the wandering accepts (the
 * mode's area, the radius, neither the centre nor the current tile). A tile it
 * refuses would be refused anyway.
 */
export type WanderArea = {
  center: XY;
  radius: number;
  from: XY;
  isWalkable: IsWalkable;
};

/**
 * Offers a wander destination that means something (a ripe crop, an egg...),
 * or `null` for a random stroll. Called once per new target.
 */
export type PickInterest = (area: WanderArea) => XY | null;

/** What a wandering driver (`wanderWatch.ts`) plugs into the loop: picking a destination, and arriving there. */
export type WanderHooks = {
  pickInterest: PickInterest;
  onInterestReached: (tile: XY) => void;
};

type MovementInput = {
  anchor: Anchor;
  state: MovementState;
  /** Already narrowed to the mode's area by `anchors.ts`. */
  isWalkable: IsWalkable;
  /** Passed in so wandering is deterministic under test. */
  random: Random;
  config: MovementConfig;
  /** Optional: without it, wandering stays fully random. */
  pickInterest?: PickInterest | null;
};

/** The largest radius searched for a spawn tile around the anchor. */
const SPAWN_SEARCH_RADIUS = 8;

export function initialMovementState(): MovementState {
  return {
    activity: "pursue",
    tile: null,
    lastAnchorTile: null,
    idleTicks: 0,
    wanderCooldown: 0,
    wanderTarget: null,
    wanderTargetIsInterest: false,
  };
}

/**
 * A wander pause's length, in ticks.
 *
 * Drawn in `[wanderPauseTicks, wanderPauseMaxTicks]`, both included. Without a
 * usable top the pause stays fixed.
 */
export function drawWanderPause(config: MovementConfig, random: Random): number {
  const min = Math.max(0, Math.round(config.wanderPauseTicks));
  const max = config.wanderPauseMaxTicks;
  if (max === undefined || !Number.isFinite(max) || Math.round(max) <= min) return min;
  const span = Math.round(max) - min + 1;
  return min + Math.min(span - 1, Math.floor(random() * span));
}

export function manhattan(a: XY, b: XY): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function sameTile(a: XY | null, b: XY | null): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y;
}

/**
 * Turns a duration into loop ticks.
 *
 * Delays are set in milliseconds (a duration keeps its meaning when the
 * walking speed changes) while the state machine counts ticks. This is where
 * the two meet.
 */
export function ticksFromMs(durationMs: number, stepIntervalMs: number, minTicks: number): number {
  if (!Number.isFinite(durationMs) || !Number.isFinite(stepIntervalMs) || stepIntervalMs <= 0) {
    return minTicks;
  }
  return Math.max(minTicks, Math.round(durationMs / stepIntervalMs));
}

/**
 * The companion only moves on once the game has really drawn his current
 * position.
 *
 * Without this guard the loop gets ahead of Jotai's recompute and the avatar
 * layer receives a jump of several tiles: it snaps instead of animating the
 * walk (it only interpolates at Manhattan distance 1). Before anything was
 * seen nothing is held back: he has to be able to appear.
 */
export function hasGameCaughtUp(ourTile: XY | null, observedTile: XY | null): boolean {
  if (!ourTile || !observedTile) return true;
  return observedTile.x === ourTile.x && observedTile.y === ourTile.y;
}

/**
 * The walkable tile nearest a centre, in growing rings. Used to appear and to
 * catch up.
 *
 * `excludeCenter` is for a player anchor: two avatars on one tile overlap.
 * For a still anchor (a building's activation tile), on the contrary, he
 * should be able to stand on it.
 */
export function findNearbyWalkable(
  center: XY,
  isWalkable: IsWalkable,
  excludeCenter: boolean,
  maxRadius = SPAWN_SEARCH_RADIUS,
): XY | null {
  if (!excludeCenter && isWalkable(center.x, center.y)) return { ...center };

  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        // The ring only: the edge of the current square.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = center.x + dx;
        const y = center.y + dy;
        if (isWalkable(x, y)) return { x, y };
      }
    }
  }
  return null;
}

/** A wander tile drawn at random within the radius around the anchor. */
function pickWanderTarget(center: XY, radius: number, isWalkable: IsWalkable, random: Random): XY | null {
  const candidates: XY[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = center.x + dx;
      const y = center.y + dy;
      if (isWalkable(x, y)) candidates.push({ x, y });
    }
  }
  return candidates.length === 0 ? null : pickOne(candidates, random);
}

const wanderRadiusOf = (anchor: Anchor, config: MovementConfig): number => anchor.wanderRadius ?? config.wanderRadius;

/**
 * Moves the companion one tick forward.
 *
 * The order matters: first the anchor tracking (which decides the activity),
 * then catching up, and only then the move. Catching up must beat wandering,
 * or the companion could wander about far from his anchor.
 */
export function stepMovement(input: MovementInput): MovementDecision {
  const { anchor, isWalkable, random, config } = input;
  const pickInterest = input.pickInterest ?? null;
  const state: MovementState = { ...input.state };
  const excludeCenter = anchor.tracksPlayer;
  const blocked = anchor.tracksPlayer ? anchor.tile : null;

  const zone = anchor.zone;
  const zoneWalkable: IsWalkable = (x, y) => isWalkable(x, y) && (!zone || zone(x, y));
  // Inside his area he stays there; outside he moves freely to get back.
  const insideZone = !zone || !state.tile || zone(state.tile.x, state.tile.y);
  const stepWalkable = insideZone ? zoneWalkable : isWalkable;

  // 1. Did the anchor move, and how long has it been still?
  const anchorMoved = !sameTile(state.lastAnchorTile, anchor.tile);
  state.lastAnchorTile = { ...anchor.tile };
  if (anchorMoved) {
    state.idleTicks = 0;
    if (state.activity === "wander") {
      state.activity = "pursue";
      state.wanderTarget = null;
      state.wanderTargetIsInterest = false;
      state.wanderCooldown = 0;
    }
  } else {
    state.idleTicks++;
  }

  // 2. Appearing. The only time the companion "pops up": he has no position
  // to walk from yet. The rest of the time he moves step by step.
  if (!state.tile) {
    const spawn =
      findNearbyWalkable(anchor.tile, zoneWalkable, excludeCenter) ?? findNearbyWalkable(anchor.tile, isWalkable, excludeCenter);
    state.tile = spawn;
    return { state, tile: spawn, teleported: spawn !== null };
  }

  // 3. Switching to wandering, once the anchor is reached.
  const arrived = manhattan(state.tile, anchor.tile) <= config.followDistance;
  if (state.activity === "pursue" && arrived && anchor.onArrival === "wander") {
    // An anchor following the player waits for them to be still; a still
    // anchor (the garden) has nobody to wait for and may wander at once.
    const mayWander = !anchor.tracksPlayer || state.idleTicks >= config.idleTicksBeforeWander;
    if (mayWander) {
      state.activity = "wander";
      state.wanderTarget = null;
      state.wanderTargetIsInterest = false;
      state.wanderCooldown = 0;
    }
  }

  // 4. One step along the shortest path.
  //
  // Arrival is a predicate, not a tile: when following, any tile within
  // `followDistance` of the player counts, theirs excluded. Aiming at their
  // exact tile would never get there.
  const passable: IsWalkable = (x, y) => stepWalkable(x, y) && !(blocked !== null && x === blocked.x && y === blocked.y);

  let isGoal: IsGoal | null = null;
  let interestReached: XY | null = null;
  if (state.activity === "pursue") {
    if (!arrived) {
      isGoal = (x, y) => manhattan({ x, y }, anchor.tile) <= config.followDistance;
    }
  } else {
    const wander = resolveWanderTarget(state, anchor, config, zoneWalkable, random, pickInterest);
    interestReached = wander.interestReached;
    const target = wander.target;
    if (target) isGoal = (x, y) => x === target.x && y === target.y;
  }

  if (!isGoal) return { state, tile: state.tile, teleported: false, interestReached };

  const next = findFirstStep(state.tile, isGoal, passable);
  if (!next) {
    // No path: staying put is the right answer. While wandering the target is
    // out of reach, so it is dropped to draw another.
    if (state.activity === "wander") {
      state.wanderTarget = null;
      state.wanderTargetIsInterest = false;
    }
    return { state, tile: state.tile, teleported: false };
  }

  state.tile = next;
  return { state, tile: next, teleported: false };
}

/** While wandering: pause between two moves, and draw a new target once the last is reached. */
function resolveWanderTarget(
  state: MovementState,
  anchor: Anchor,
  config: MovementConfig,
  isWalkable: IsWalkable,
  random: Random,
  pickInterest: PickInterest | null,
): { target: XY | null; interestReached: XY | null } {
  if (state.wanderCooldown > 0) {
    state.wanderCooldown--;
    return { target: null, interestReached: null };
  }
  if (state.wanderTarget && sameTile(state.wanderTarget, state.tile)) {
    const reached = state.wanderTargetIsInterest ? { ...state.wanderTarget } : null;
    state.wanderTarget = null;
    state.wanderTargetIsInterest = false;
    state.wanderCooldown = drawWanderPause(config, random);
    return { target: null, interestReached: reached };
  }
  if (!state.wanderTarget) {
    const radius = wanderRadiusOf(anchor, config);
    const interest =
      pickInterest && state.tile ? pickInterestSafely(pickInterest, anchor.tile, radius, state.tile, isWalkable) : null;
    state.wanderTargetIsInterest = interest !== null;
    state.wanderTarget = interest ?? pickWanderTarget(anchor.tile, radius, isWalkable, random);
    if (!state.wanderTarget) {
      state.wanderCooldown = drawWanderPause(config, random);
      return { target: null, interestReached: null };
    }
  }
  return { target: state.wanderTarget, interestReached: null };
}

/**
 * Asks for an interest, and only keeps the answer if the wandering would have
 * accepted it itself.
 *
 * The same rules as `pickWanderTarget`: within the radius, inside the area,
 * neither the centre nor the tile he already stands on. A provider that gets
 * it wrong, or throws, falls back on a random stroll instead of dragging the
 * companion out of his territory.
 */
function pickInterestSafely(
  pickInterest: PickInterest,
  center: XY,
  radius: number,
  from: XY,
  isWalkable: IsWalkable,
): XY | null {
  const accepts: IsWalkable = (x, y) =>
    Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) <= radius &&
    !(x === center.x && y === center.y) &&
    !(x === from.x && y === from.y) &&
    isWalkable(x, y);
  let picked: XY | null = null;
  try {
    picked = pickInterest({ center: { ...center }, radius, from: { ...from }, isWalkable: accepts });
  } catch {
    return null;
  }
  if (!picked || !Number.isInteger(picked.x) || !Number.isInteger(picked.y)) return null;
  return accepts(picked.x, picked.y) ? { x: picked.x, y: picked.y } : null;
}
