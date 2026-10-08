// The companion's public face: an NPC the mod borrows to follow the player,
// wander, talk and help out.
//
// This facade only assembles. Bringing him out and putting him away is
// `lifecycle.ts`, the step loop `motion.ts`, speaking `talk.ts`, walks and
// attention `tasks.ts`. It is also exposed in the console as
// `window.Companion` (see `main.ts`), so `setLines` and `diagnose` stay.

import type { CompanionMode } from "./anchors";
import { diagnoseCompanion } from "./diagnostics";
import { playEmote } from "./emote";
import type { EmoteType } from "./emoteTypes";
import { listNpcIdentities, type NpcIdentity } from "./injection";
import { startRuntime, stopRuntime } from "./lifecycle";
import { setWanderHooks } from "./motion";
import type { WanderHooks, XY } from "./movement";
import { currentRuntime } from "./runtime";
import { loadCompanionSettings, patchCompanionSettings, sanitizeLines, type CompanionSettings } from "./state";
import { refreshContextual, say } from "./talk";
import {
  comeToPlayer,
  distanceToPlayer,
  emoteWhenStill,
  holdAttention,
  releaseAttention,
  releaseTask,
  walkTo,
} from "./tasks";
import { isTickAvailable } from "./tick";

export const CompanionService = {
  isRunning(): boolean {
    return currentRuntime() !== null;
  },

  /** Plugs in (or, with `null`, unplugs) the purposeful wandering driver. */
  setWanderHooks(hooks: WanderHooks | null): void {
    setWanderHooks(hooks);
  },

  /**
   * Position of a crop's dirt tile in the player's plot.
   *
   * `dirtTileIdx` is the `slot` of the harvest protocol. `null` while the map
   * is not read yet or when the index matches no tile.
   */
  gardenTileXY(userSlotIdx: number, dirtTileIdx: number): XY | null {
    const map = currentRuntime()?.map;
    if (!map) return null;
    const global = map.gardenTileToGlobal(userSlotIdx, dirtTileIdx);
    return global === null ? null : map.toXY(global);
  },

  walkTo,
  comeToPlayer,
  releaseTask,
  holdAttention,
  releaseAttention,

  /** True while he waits on an answer by the player. */
  isHoldingAttention(): boolean {
    return currentRuntime()?.attention === true;
  },

  /** Busy: walking for a task, or waiting on an answer. */
  isBusy(): boolean {
    const rt = currentRuntime();
    return rt !== null && (rt.task !== null || rt.attention);
  },

  distanceToPlayer,

  getNpcId(): string | null {
    return currentRuntime()?.npcId ?? null;
  },

  /**
   * Plays an emote on the NPC while the game catches up.
   *
   * Does nothing while he is not out: there is no view to animate. Purely
   * local decoration, nothing goes over the network, so no confirmation is
   * needed. `holdMs` holds the pose past the default for a moment worth it.
   */
  async emote(emote: EmoteType, holdMs?: number): Promise<void> {
    const rt = currentRuntime();
    if (!rt) return;
    await playEmote(rt.npcId, emote, holdMs);
  },

  emoteWhenStill,

  getSettings(): CompanionSettings {
    return loadCompanionSettings();
  },

  listNpcs(): Promise<NpcIdentity[]> {
    return listNpcIdentities();
  },

  /** The mode really applied: differs from the setting when it fell back. */
  getEffectiveMode(): CompanionMode | null {
    return currentRuntime()?.effectiveMode ?? null;
  },

  /** Brings him back at boot if he was out last session. */
  autoStart(): void {
    try {
      if (!loadCompanionSettings().enabled) return;
      void startRuntime().catch(() => {});
    } catch {}
  },

  start: startRuntime,
  stop: stopRuntime,

  /** Saves a settings change, starting or restarting him when it needs to. */
  async applySettings(patch: Partial<CompanionSettings>): Promise<CompanionSettings> {
    const next = patchCompanionSettings(patch);
    const rt = currentRuntime();
    if (!rt) {
      if (next.enabled) await startRuntime();
      return next;
    }
    if (!next.enabled) {
      await stopRuntime();
      return next;
    }
    if (patch.npcId !== undefined && patch.npcId !== rt.npcId) {
      // A new identity starts from scratch: the old entry must leave the
      // injection before the new one appears.
      await stopRuntime();
      await startRuntime();
      return next;
    }
    // The contextual cache must follow the setting, or switching it off would
    // leave the last alerts usable until the next refresh.
    void refreshContextual().catch(() => {});
    return next;
  },

  /** Replaces the custom lines. Usable from the console. */
  async setLines(lines: string[]): Promise<CompanionSettings> {
    return CompanionService.applySettings({ lines: sanitizeLines(lines) });
  },

  /**
   * Measures what positions the game really sees, to tell a snap caused by
   * the recompute rate from a snap caused by something else. Run it while he
   * walks.
   */
  async diagnose(sampleMs?: number) {
    const npcId = currentRuntime()?.npcId;
    if (!npcId) return { error: "Companion inactive: run window.Companion.start() first." };
    // `tickAvailable: false` means the forced recompute could not be wired:
    // the guard still prevents jumps, but walking is slow.
    return { tickAvailable: isTickAvailable(), ...(await diagnoseCompanion(npcId, sampleMs)) };
  },

  say,
};

export type { NpcIdentity } from "./injection";
export type { CompanionSettings } from "./state";
