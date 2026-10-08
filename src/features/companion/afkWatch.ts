// Wires the AFK state machine (`afk.ts`) to the game.
//
// Everything that decides lives in `afk.ts`, which is pure and checked outside
// the browser. Here we only collect the player's signs of life, run the clock,
// and carry out, in order, the effects the machine asks for.
//
// Signs of life:
//  - the player's tile (the anti-AFK ping resends the same tile, so it does
//    not count);
//  - real keyboard, mouse and touch input (`isTrusted`: the anti-AFK's
//    synthetic heartbeat does not count). A player sorting their inventory
//    without moving is still there;
//  - coming back to the tab.
//
// The mod's anti-AFK forces `document.hidden` to false and swallows
// `visibilitychange`: while it runs, the tab always looks visible. Snores then
// go on into the void and the wake-up waits for the player's first input.
// Nothing breaks, it is just less precise.

import { CompanionService } from ".";
import { afkActivity, afkReset, afkTick, initialAfkState, type AfkEffect, type AfkStep } from "./afk";
import { chatHolds, reactionsEnabled } from "./availability";
import { playerTileFeed } from "./feeds";
import type { XY } from "./movement";
import { defineWatcher } from "./watch";

/** Clock period. The thresholds are minutes long, so there is no point going faster. */
const TICK_MS = 5_000;
/** While `active`, one sign of life a second is plenty: `pointermove` sends dozens. */
const ACTIVITY_THROTTLE_MS = 1_000;
/** A line said without walking over is only said when he is close enough to be read. */
const NEAR_DISTANCE = 8;

const INPUT_EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart"] as const;

function isHidden(): boolean {
  try {
    return typeof document !== "undefined" && document.hidden === true;
  } catch {
    return false;
  }
}

export const afkWatch = defineWatcher("afk", (scope) => {
  let state = initialAfkState(Date.now());
  /** The attention held for sleeping is ours: we only ever release that one. */
  let ownHold = false;
  /** Effects in flight. The clock waits for them: our own walks are not an interruption. */
  let pending = 0;
  let chain: Promise<void> = Promise.resolve();
  let lastNotedAt = 0;
  let lastTile: XY | null = null;

  /**
   * Busy with someone other than us.
   *
   * The attention we hold while asleep keeps `isBusy()` true the whole time,
   * so while we hold it only the chat counts, and attention that disappeared
   * means someone else took it over.
   */
  function othersBusy(): boolean {
    if (!CompanionService.isRunning()) return true;
    if (chatHolds()) return true;
    if (ownHold) return !CompanionService.isHoldingAttention();
    return CompanionService.isBusy();
  }

  function releaseOwnHold(): void {
    if (!ownHold) return;
    ownHold = false;
    // If the chat took over meanwhile, the attention is now its own.
    if (chatHolds()) return;
    if (CompanionService.isHoldingAttention()) CompanionService.releaseAttention();
  }

  async function sayLine(effect: Extract<AfkEffect, { kind: "say" }>): Promise<void> {
    if (!CompanionService.isRunning() || othersBusy() || isHidden()) return;
    if (effect.approach) {
      try {
        await CompanionService.comeToPlayer();
        if (!scope.active) return;
        await CompanionService.say(effect.message, { force: true });
      } finally {
        CompanionService.releaseTask();
      }
    } else {
      const distance = CompanionService.distanceToPlayer();
      if (distance === null || distance > NEAR_DISTANCE) return;
      await CompanionService.say(effect.message, { force: true });
    }
    if (effect.emote !== null) void CompanionService.emote(effect.emote).catch(() => {});
  }

  async function perform(effect: AfkEffect): Promise<void> {
    if (effect.kind === "release") {
      releaseOwnHold();
      return;
    }
    if (!scope.active) return;
    if (effect.kind === "hold") {
      if (!CompanionService.isRunning()) return;
      CompanionService.holdAttention();
      ownHold = true;
      return;
    }
    await sayLine(effect);
  }

  function apply(step: AfkStep): void {
    state = step.state;
    for (const effect of step.effects) {
      pending++;
      chain = chain
        .then(() => perform(effect))
        .catch(() => {})
        .finally(() => {
          pending--;
        });
    }
  }

  function tick(): void {
    const now = Date.now();
    // Put away or switched off: start over, the clock resumes when he is back.
    if (!reactionsEnabled() || !CompanionService.isRunning()) {
      apply(afkReset(state, now));
      return;
    }
    if (pending > 0) return;
    apply(afkTick(state, { now, busy: othersBusy(), hidden: isHidden() }, Math.random));
  }

  function noteActivity(): void {
    const now = Date.now();
    if (state.phase === "active" && now - lastNotedAt < ACTIVITY_THROTTLE_MS) return;
    lastNotedAt = now;
    // Put away or switched off: the clock deals with it on its next tick.
    if (!reactionsEnabled() || !CompanionService.isRunning()) return;
    apply(afkActivity(state, { now, busy: othersBusy() }, Math.random));
  }

  const onInput = scope.live((event: Event) => {
    if (event.isTrusted) noteActivity();
  });
  const onVisibility = scope.live(() => {
    if (!isHidden()) noteActivity();
  });

  try {
    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    scope.add(() => {
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
    });
  } catch {}

  scope.add(
    playerTileFeed.on(
      scope.live((tile) => {
        const previous = lastTile;
        lastTile = tile;
        if (previous && (previous.x !== tile.x || previous.y !== tile.y)) noteActivity();
      }),
    ),
  );

  scope.every(TICK_MS, tick);

  // He must not stay planted next to the player once the watch is off.
  scope.add(releaseOwnHold);
});
