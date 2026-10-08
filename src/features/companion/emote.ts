// Makes the companion's NPC play an emote.
//
// The game no longer stores emotes: it works them out from the room chat's
// `kind: "emote"` entries, read by `emoteSourceAtom` (bundle 1299, chunk
// emoteAtoms). The avatar layer then applies the result to ALL its views,
// NPCs included:
//
//   onPlayerEmoteTypesChanged() {
//     let t = get(<emotes worked out from emoteSourceAtom>);
//     for (let [id, view] of this.views) view.setEmoteType(t[id] ?? Idle);
//   }
//
// So `emoteSourceAtom`'s read is patched (through `fakeAtoms`, as
// `injection.ts` does for positions) to add an entry in our NPC's name. The
// companion's tick forces the recompute at the right moment.
//
// Before this detour the mod wrote `playerEmoteTypesAtom`. The game removed
// that atom when it moved to the chat computation, and writing it did nothing,
// without a single error: no companion emote showed at all.
//
// Nothing goes over the network, and our entries do not show in the chat
// thread, which reads the room state directly. Nobody else sees the pose, and
// the sound, played when a real emote arrives, does not fire.
//
// This module is the only one faking `emoteSourceAtom`.

import { sleep } from "../../lib/async";
import { fakeHide, fakeShow, fakeUpdate, type FakeConfig } from "../../game/fakeAtoms";
import { getWorldSystem } from "../../game/pixi/tileCapture";
import { EmoteType, companionEmoteEntry, cutTalking, emoteStartDelay, mergeEmoteSource } from "./emoteTypes";
import { COMPANION_TICK_LABEL, bumpTick, ensureTickAtom } from "./tick";

const EMOTE_SOURCE_LABEL = "emoteSourceAtom";

/**
 * The game's `avatar` system, which holds every player's and NPC's view.
 *
 * Reached through the system registry the tile system capture kept (both sit
 * on the same world scope). `null` when that registry is missing: the pose
 * then waits for Talking to end.
 */
function avatarSystem(): any | null {
  try {
    return getWorldSystem("avatar");
  } catch {
    return null;
  }
}

type EmotePatch = { entries: unknown[] };

const EMOTE_PATCH: FakeConfig<any> = {
  label: EMOTE_SOURCE_LABEL,
  // Without it the recompute would only happen on the next room state change:
  // the pose would start late, and so would the return to rest.
  extraDeps: [COMPANION_TICK_LABEL],
  merge: (real: unknown, fake: EmotePatch) => mergeEmoteSource(real, fake),
};

/**
 * An emote's length, matching what the game sets itself.
 *
 * Its `emote_emoteCooldownSeconds` is 1.5 s. Our entries being dated in the
 * future (see `companionEmoteEntry`), we remove them after that time; nothing
 * else would bring the avatar back to rest.
 */
const EMOTE_DURATION_MS = 1500;

let installed = false;
let releaseTimer: number | null = null;
/** The NPC whose emote is playing, to know what to put back to rest. */
let posing: string | null = null;
/** A pose waiting for Talking to end. The newest replaces the previous. */
let startTimer: number | null = null;
/** Each NPC's last bubble, to know when Talking stops. */
const lastSpokeAt = new Map<string, number>();

/**
 * Notes that an NPC just spoke.
 *
 * Called by `speech.ts` for every bubble of our NPC, the game's as well as the
 * mod's: the game restarts Talking for all of them.
 */
export function markSpoke(playerId: string, at = Date.now()): void {
  if (playerId) lastSpokeAt.set(playerId, at);
}

/** Puts our entries in the emote source, and forces the recompute. */
async function writeEntries(entries: unknown[]): Promise<boolean> {
  const payload: EmotePatch = { entries };
  try {
    if (!installed) {
      // The tick must exist before the first patched read, or `extraDeps`
      // resolves nothing and the dependency is never registered.
      ensureTickAtom();
      await fakeShow(EMOTE_PATCH, payload);
      installed = true;
    } else {
      await fakeUpdate(EMOTE_SOURCE_LABEL, payload);
    }
    await bumpTick();
    return true;
  } catch {
    // Source not found (the game renamed it again): no pose, nothing worse.
    return false;
  }
}

/** Removes our entry: the game only sees its own. */
async function rest(): Promise<void> {
  if (!installed) return;
  await writeEntries([]);
}

function cancelPending(): void {
  if (releaseTimer === null) return;
  window.clearTimeout(releaseTimer);
  releaseTimer = null;
}

function cancelStart(): void {
  if (startTimer === null) return;
  window.clearTimeout(startTimer);
  startTimer = null;
}

/**
 * Plays an emote, and removes it on its own.
 *
 * Talking and a pose overlap badly: the mouth keeps moving under the pose.
 * When the companion's view is within reach, Talking is turned off and the
 * pose goes at once, in place of the speech. Otherwise it waits until he has
 * finished talking (see `emoteStartDelay`), catching up with any new bubble. A
 * new pose asked for meanwhile replaces this one.
 */
export async function playEmote(playerId: string, emote: EmoteType, durationMs = EMOTE_DURATION_MS): Promise<void> {
  if (!playerId || emote === EmoteType.Idle) return;

  cancelStart();
  const avatar = avatarSystem();
  const canCut = !!avatar?.views?.has?.(playerId);
  const delay = emoteStartDelay(lastSpokeAt.get(playerId) ?? null, Date.now(), canCut);
  if (delay > 0) {
    startTimer = window.setTimeout(() => {
      startTimer = null;
      void playEmote(playerId, emote, durationMs);
    }, delay);
    return;
  }

  // Still in a pose: go through rest first. The game only applies an emote
  // that changes, and writing the same value again would restart nothing.
  if (releaseTimer !== null && posing === playerId) {
    cancelPending();
    await rest();
    await sleep(60);
  }

  // An emote interrupting another starts the count over, or the first one's
  // timer would put the second to rest too early.
  cancelPending();
  posing = playerId;

  // The pose replaces the speech: a moving mouth and question marks do not go
  // together. A second pass catches a bubble the game delivered just after us
  // and that turned Talking back on.
  if (canCut) {
    cutTalking(avatar, playerId);
    window.setTimeout(() => {
      if (posing === playerId) cutTalking(avatarSystem(), playerId);
    }, 80);
  }

  if (!(await writeEntries([companionEmoteEntry(playerId, emote, Date.now())]))) {
    posing = null;
    return;
  }

  releaseTimer = window.setTimeout(() => {
    releaseTimer = null;
    posing = null;
    void rest();
  }, durationMs);
}

/**
 * Puts the NPC back to rest at once, and removes the patch.
 *
 * Called when the companion is put away: our entry would otherwise outlive
 * him and freeze the real NPC he borrowed in its last pose.
 */
export async function stopEmote(): Promise<void> {
  cancelStart();
  cancelPending();
  posing = null;
  if (!installed) return;
  try {
    await fakeHide(EMOTE_SOURCE_LABEL);
    await bumpTick();
  } catch {}
  installed = false;
}
