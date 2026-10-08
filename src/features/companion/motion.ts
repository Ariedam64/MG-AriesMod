// One movement step: decides the next tile and injects it.
//
// The deciding is `movement.ts` (pure) and `anchors.ts` (the mode as an
// anchor); this is the step that feeds them the runtime and applies the result.

import { resolveAnchor } from "./anchors";
import { setCompanionTile } from "./injection";
import {
  ATTENTION_MOVEMENT_CONFIG,
  DEFAULT_MOVEMENT_CONFIG,
  TASK_MOVEMENT_CONFIG,
  hasGameCaughtUp,
  stepMovement,
  type Anchor,
  type IsWalkable,
  type WanderHooks,
} from "./movement";
import { currentRuntime } from "./runtime";
import { loadCompanionSettings } from "./state";

/**
 * Past this wait for the render, he moves on anyway. The companion off screen
 * is no longer drawn: without this valve he would freeze and never come back
 * to the player.
 */
const RENDER_WAIT_TIMEOUT_MS = 1500;

/**
 * The wandering driver plugged in by `wanderWatch.ts`. Kept outside the
 * runtime: the watch starts at boot, before the companion is necessarily out.
 */
let wanderHooks: WanderHooks | null = null;

export function setWanderHooks(hooks: WanderHooks | null): void {
  wanderHooks = hooks;
}

export async function stepCompanion(): Promise<void> {
  const rt = currentRuntime();
  if (!rt || !rt.map || !rt.player) return;

  // Jump guard: only move once the game has drawn the current position. The
  // forced tick makes that a matter of milliseconds; the wait only shows when
  // forcing is unavailable.
  if (!hasGameCaughtUp(rt.movement.tile, rt.observedTile)) {
    const now = Date.now();
    if (rt.waitingSinceMs === null) rt.waitingSinceMs = now;
    if (now - rt.waitingSinceMs < RENDER_WAIT_TIMEOUT_MS) return;
  }
  rt.waitingSinceMs = null;

  // A task beats the mode: while it lasts he neither follows nor wanders, he
  // goes where he is sent. The anchor is not even resolved, it would only be
  // overwritten.
  let anchor: Anchor;
  let isWalkable: IsWalkable;
  if (rt.task) {
    anchor = { tile: rt.task, onArrival: "hold", tracksPlayer: false };
    isWalkable = rt.map.isWalkable;
  } else {
    // Resolved on every step: the player moves, and a change of mode or room
    // must apply without a restart.
    const resolved = await resolveAnchor({
      mode: rt.attention ? "follow" : loadCompanionSettings().mode,
      map: rt.map,
      player: rt.player,
    });
    if (resolved.effectiveMode !== rt.effectiveMode) {
      // A new zone voids the current wander target, which may lie outside it.
      rt.effectiveMode = resolved.effectiveMode;
      rt.movement.wanderTarget = null;
    }
    anchor = resolved.anchor;
    isWalkable = resolved.isWalkable;
  }

  const decision = stepMovement({
    anchor,
    state: rt.movement,
    isWalkable,
    random: Math.random,
    config: rt.task ? TASK_MOVEMENT_CONFIG : rt.attention ? ATTENTION_MOVEMENT_CONFIG : DEFAULT_MOVEMENT_CONFIG,
    // No purposeful wandering during a task or while waiting on an answer.
    pickInterest: rt.task || rt.attention ? null : (wanderHooks?.pickInterest ?? null),
  });
  rt.movement = decision.state;
  if (decision.interestReached && wanderHooks) {
    try {
      wanderHooks.onInterestReached(decision.interestReached);
    } catch {}
  }

  if (!decision.tile) return;
  await setCompanionTile(rt.npcId, rt.map.toIndex(decision.tile.x, decision.tile.y));
}
