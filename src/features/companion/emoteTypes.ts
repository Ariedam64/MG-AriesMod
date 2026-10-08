// The game's emotes as bare values, and the rules around playing one.
//
// Kept apart from `emote.ts`, which reaches the game store: the rules deciding
// WHICH emote to play must stay checkable outside the browser.

/**
 * The game's emotes, as its enum numbers them.
 *
 * Read in the live bundle, chunk `RoomConnection`:
 * `Idle=-1, Clapping=0, Laughing=1, Angered=2, Crying=3, Questioning=4, Love=5`.
 * The chat bar only offers 0 to 5; `-1` is the resting pose, and also what the
 * avatar layer applies to any view missing from the map.
 */
export const EmoteType = {
  Idle: -1,
  Clapping: 0,
  Laughing: 1,
  Angered: 2,
  Crying: 3,
  Questioning: 4,
  Love: 5,
} as const;

export type EmoteType = (typeof EmoteType)[keyof typeof EmoteType];

/**
 * What `emoteSourceAtom` reads: the room chat's entries, and how long an emote
 * shows.
 *
 * The game no longer stores emotes anywhere (bundle 1299, chunk emoteAtoms). It
 * works them out from the chat's `kind: "emote"` entries: each player's latest
 * shows until `lastTimestampMs` plus the duration. `playerEmoteTypesAtom`,
 * which the mod used to write, went with that change, and writing it did nothing.
 */
type EmoteSource = { entries: unknown[]; displayDurationMs: number; [key: string]: unknown };

/**
 * How far ahead our entries are dated.
 *
 * The game's clock is synced to the server and the mod cannot reach it: an
 * entry dated with our `Date.now()` could be born already expired. Dated in
 * the future it stays shown, and `emote.ts` removes it when the pose ends.
 */
const ENTRY_LEAD_MS = 60_000;

/** The chat entry that makes the companion pose. */
export function companionEmoteEntry(playerId: string, emote: EmoteType, now: number) {
  return { kind: "emote", playerId, emoteType: emote, lastTimestampMs: now + ENTRY_LEAD_MS };
}

/**
 * Adds our entries to the emote source, AFTER the game's: the game keeps each
 * player's latest, starting from the end.
 *
 * Only the emote computation reads this source; the chat thread reads the
 * room state directly, so our entries do not show there.
 */
export function mergeEmoteSource(real: unknown, fake: { entries?: unknown[] } | null | undefined): EmoteSource {
  const base = real && typeof real === "object" ? (real as EmoteSource) : ({} as EmoteSource);
  const entries = Array.isArray(base.entries) ? base.entries : [];
  const ours = Array.isArray(fake?.entries) ? fake!.entries : [];
  return { ...base, entries: ours.length ? [...entries, ...ours] : entries };
}

/**
 * How long an NPC's Talking animation lasts after each bubble.
 *
 * Read in the live bundle (1299): `pulseNpcTalking` turns Talking on with
 * every bubble and off after `xu = 3e3`, starting over if another bubble comes
 * in the meantime.
 */
export const NPC_TALKING_MS = 3000;

/** A breath after Talking ends, so as not to land right on it. */
const TALKING_MARGIN_MS = 150;

/**
 * Turns Talking off on an NPC's avatar. `true` when done.
 *
 * The game's `avatar` system (bundle 1299) keeps its views in `views`, a Map
 * of playerId to view, and `stopNpcTalking(id, view)` cancels the 3 s
 * countdown before turning Talking off: that is the way to go, or the game's
 * timer would turn it back on for nothing. Failing that, the view itself is
 * turned off.
 */
export function cutTalking(avatarSystem: unknown, playerId: string): boolean {
  const system = avatarSystem as {
    views?: { get?: (id: string) => unknown };
    stopNpcTalking?: (id: string, view: unknown) => void;
  } | null;
  if (!system || typeof system.views?.get !== "function") return false;
  const view = system.views.get(playerId) as { setTalking?: (on: boolean) => void } | undefined;
  if (!view) return false;
  try {
    if (typeof system.stopNpcTalking === "function") {
      system.stopNpcTalking(playerId, view);
      return true;
    }
    if (typeof view.setTalking === "function") {
      view.setTalking(false);
      return true;
    }
  } catch {}
  return false;
}

/**
 * The wait before a pose can play.
 *
 * Talking and an emote overlap badly: the mouth keeps moving under the pose,
 * and the game's tutorial turns Talking off whenever it makes an NPC pose.
 * When we can turn it off ourselves (`canCutTalking`, see `cutTalking`), the
 * pose replaces the speech and goes at once. Otherwise it waits until he has
 * finished talking.
 */
export function emoteStartDelay(lastSpokeAt: number | null, now: number, canCutTalking = false): number {
  if (canCutTalking) return 0;
  if (lastSpokeAt === null) return 0;
  return Math.max(0, lastSpokeAt + NPC_TALKING_MS + TALKING_MARGIN_MS - now);
}
