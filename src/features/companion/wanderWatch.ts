// Gives his wandering a purpose: going to look at a ripe crop, a Gold, an egg.
//
// Everything that decides lives in `wander.ts`, pure and checked outside the
// browser. Here we only keep the garden current, supply catalog names, and
// play the pose on arrival.
//
// The movement loop is reached through `CompanionService.setWanderHooks`: it
// calls `pickInterest` the moment it draws a new wander target, and
// `onInterestReached` once he is there. The facade never imports this module.

import { cropName, eggName, mutationName } from "../../data/names";
import { CompanionService } from ".";
import { readMySlotIdx } from "./anchors";
import { companionBusy } from "./availability";
import { rolledMutations } from "./catalogs";
import { gardenFeed } from "./feeds";
import type { WanderArea, WanderHooks, XY } from "./movement";
import { loadCompanionSettings } from "./state";
import { pickWanderInterest, shouldComment, type WanderInterest } from "./wander";
import { defineWatcher } from "./watch";

/** The player's slot changes with the room: it is read again every so often. */
const SLOT_REFRESH_MS = 30_000;
/**
 * Past this, the interest he picked is no longer where he is heading: the walk
 * was interrupted, and a late arrival must not play anything.
 */
const PENDING_TTL_MS = 60_000;

export const wanderWatch = defineWatcher("wander", (scope) => {
  let slotIdx: number | null = null;
  let pending: { interest: WanderInterest; at: number } | null = null;
  let lastCommentAt = 0;

  /** Called by the loop on every new wander target. Synchronous. */
  function pickInterest(area: WanderArea): XY | null {
    pending = null;
    if (!scope.active || companionBusy()) return null;
    const slot = slotIdx;
    const garden = gardenFeed.latest();
    if (slot === null || !garden) return null;

    const interest = pickWanderInterest({
      tileObjects: garden,
      tileXY: (dirtTileIdx) => CompanionService.gardenTileXY(slot, dirtTileIdx),
      now: Date.now(),
      area,
      random: Math.random,
      rareMutations: new Set(rolledMutations()),
      cropName,
      mutationName,
      eggName,
    });
    if (!interest) return null;
    pending = { interest, at: Date.now() };
    return interest.tile;
  }

  /** He just stopped next to what he came to see. */
  function onInterestReached(tile: XY): void {
    const current = pending;
    pending = null;
    if (!current || !scope.active) return;
    const { interest, at } = current;
    const now = Date.now();
    if (now - at > PENDING_TTL_MS) return;
    if (interest.tile.x !== tile.x || interest.tile.y !== tile.y) return;
    if (companionBusy()) return;

    // The garden may have changed on the way: a crop picked meanwhile is not
    // worth marvelling at bare soil.
    const still = (gardenFeed.latest() as Record<string, unknown> | null | undefined)?.[String(interest.dirtTileIdx)];
    if (!still || typeof still !== "object") return;

    let reactions = false;
    try {
      reactions = loadCompanionSettings().reactions;
    } catch {}

    const speak =
      reactions &&
      shouldComment({
        now,
        lastCommentAt,
        distanceToPlayer: CompanionService.distanceToPlayer(),
        busy: false,
        random: Math.random,
      });

    void (async () => {
      if (speak) {
        lastCommentAt = now;
        await CompanionService.say(interest.line);
      }
      // Right after the bubble: the pose replaces the speech (see `emote.ts`).
      await CompanionService.emote(interest.emote);
    })().catch(() => {});
  }

  const refreshSlot = () => {
    void readMySlotIdx()
      .then((slot) => {
        slotIdx = slot;
      })
      .catch(() => {});
  };

  const hooks: WanderHooks = { pickInterest, onInterestReached };
  CompanionService.setWanderHooks(hooks);
  scope.add(() => {
    pending = null;
    CompanionService.setWanderHooks(null);
  });
  scope.add(gardenFeed.hold());
  refreshSlot();
  scope.every(SLOT_REFRESH_MS, refreshSlot);
});
