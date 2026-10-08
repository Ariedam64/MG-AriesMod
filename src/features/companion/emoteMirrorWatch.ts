// Wires the companion's answer to the player's emotes (`emoteMirror.ts`) to
// the game.
//
// Everything that decides lives in `emoteMirror.ts`, pure and checked outside
// the browser. Here we only follow the room state and the player id, keep the
// reading up to date, and play what was decided.
//
// The watch reads `stateAtom`, not `emoteSourceAtom`: both carry the same list
// of entries (bundle 1400, `emoteSourceAtom` reads `roomPublicationAtom.state`,
// of which `stateAtom` is the view), but without the patch `emote.ts` puts on
// the emote source to make our NPC pose.
//
// The watch keeps running while the companion is put away or its reactions are
// off: the reading stays current, so an emote played before he comes back is
// never taken for a new one. He simply does not answer.

import { Atoms } from "../../game/store/atoms";
import { CompanionService } from ".";
import { companionBusy, reactionsEnabled } from "./availability";
import {
  decideMirror,
  initialMirrorState,
  latestOwnEmote,
  observeOwnEmote,
  type MirrorAction,
  type MirrorRead,
} from "./emoteMirror";
import { defineWatcher } from "./watch";

type RoomData = { roomId?: unknown; chat?: { entries?: unknown } };

/** The room state changes on every patch: only the chat and the room matter here. */
function sameChat(a: unknown, b: unknown): boolean {
  const da = (a as { data?: RoomData } | null)?.data;
  const db = (b as { data?: RoomData } | null)?.data;
  return da?.roomId === db?.roomId && da?.chat?.entries === db?.chat?.entries;
}

export const emoteMirrorWatch = defineWatcher("emote mirror", (scope) => {
  let state = initialMirrorState();
  let pending: number | null = null;
  let localId: string | null = null;
  let roomId: string | null = null;
  let entries: unknown = undefined;

  function cancelPending(): void {
    if (pending === null) return;
    window.clearTimeout(pending);
    pending = null;
  }

  async function perform(action: MirrorAction): Promise<void> {
    // The delay may have been long enough for something else to take him.
    if (!scope.active || !reactionsEnabled() || companionBusy()) return;
    if (action.line) {
      try {
        await CompanionService.say(action.line);
      } catch {}
    }
    // Right after the bubble: the pose replaces the speech (see `emote.ts`).
    if (action.kind === "mirror") await CompanionService.emote(action.emote);
  }

  function schedule(action: MirrorAction): void {
    cancelPending();
    pending = window.setTimeout(() => {
      pending = null;
      void perform(action).catch(() => {});
    }, action.delayMs);
  }

  function currentRead(): MirrorRead {
    if (!localId || !Array.isArray(entries)) return null;
    const npcId = CompanionService.getNpcId();
    return {
      scope: `${roomId ?? ""}|${localId}`,
      latest: latestOwnEmote(entries, localId, npcId ? [npcId] : []),
    };
  }

  function process(): void {
    const seen = observeOwnEmote(state, currentRead());
    state = seen.state;
    if (!seen.fresh) return;
    const decided = decideMirror(state, seen.fresh, {
      now: Date.now(),
      available: reactionsEnabled() && !companionBusy(),
      distance: CompanionService.distanceToPlayer(),
      random: Math.random,
    });
    state = decided.state;
    if (decided.action) schedule(decided.action);
  }

  scope.add(
    Atoms.player.playerId.onChangeNow(
      scope.live((next) => {
        localId = typeof next === "string" && next ? next : null;
        process();
      }),
    ),
  );
  scope.add(
    Atoms.root.state.onChangeNow(
      scope.live((next) => {
        const data = (next as { data?: RoomData } | null)?.data;
        roomId = typeof data?.roomId === "string" ? data.roomId : null;
        entries = data?.chat?.entries;
        process();
      }),
      sameChat,
    ),
  );
  scope.add(cancelPending);
});
