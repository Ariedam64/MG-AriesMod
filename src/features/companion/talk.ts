// What the companion says: the line picked when the player talks to him, and
// the bubbles the mod writes itself.
//
// The game reads NPC bubbles from a local atom, so none of this goes over the
// network.

import { makeAtom } from "../../game/store/hub";
import type { BubbleTag } from "./chat/bubbleTags";
import { DEFAULT_CONTEXTUAL_COOLDOWN_MS, pickDialogueLine } from "./dialogue";
import { collectContextualLines } from "./dialogueContext";
import { POKE_WINDOW_MS, lineEmote, pokeLine } from "./dialogueLines";
import { timeLines } from "./dialogueTime";
import { playEmote } from "./emote";
import type { EmoteType } from "./emoteTypes";
import { currentRuntime, type Runtime } from "./runtime";
import { AUTHORED_BY_MOD } from "./speech";
import { loadCompanionSettings } from "./state";

/**
 * Minimum gap between two bubbles.
 *
 * The game imposes none: its own NPCs change lines as fast as they are talked
 * to. This guard is ours alone and only absorbs two writes at the same
 * instant; at 1200 ms it used to swallow a batch's announcements, which come
 * every 500 ms. Anything worth reading now gets through.
 */
const CHAT_BUBBLE_MIN_INTERVAL_MS = 250;

const npcChatBubbles = makeAtom<Record<string, unknown>>("npcChatBubblesAtom");

/**
 * Plays a pose right after the line.
 *
 * Outside the write in progress: this runs inside the bubble atom's `write`,
 * and writing another atom in the middle of it is not safe.
 */
function playEmoteSoon(rt: Runtime, emote: EmoteType): void {
  const npcId = rt.npcId;
  setTimeout(() => {
    if (currentRuntime() === rt) void playEmote(npcId, emote).catch(() => {});
  }, 0);
}

/**
 * Called by the bubble hook at the exact moment the game writes the bubble.
 * Synchronous by design: it only picks among lines collected beforehand.
 * `null` lets the game's own line through.
 */
export function resolveSpeech(): string | null {
  const rt = currentRuntime();
  if (!rt) return null;

  const now = Date.now();
  rt.talkTimes = [...rt.talkTimes.filter((t) => now - t <= POKE_WINDOW_MS), now];
  const poke = pokeLine(rt.talkTimes, now, Math.random);
  if (poke) {
    playEmoteSoon(rt, poke.emote);
    return poke.message;
  }

  const settings = loadCompanionSettings();
  // Time of day and calendar lines only join a list that is not empty: a list
  // emptied on purpose means "let the game speak".
  const customLines = settings.lines.length > 0 ? [...settings.lines, ...timeLines(new Date(now))] : [];
  const picked = pickDialogueLine({
    contextual: settings.contextualEnabled ? rt.contextualCache : [],
    customLines,
    state: rt.dialogue,
    nowMs: now,
    random: Math.random,
    cooldownMs: DEFAULT_CONTEXTUAL_COOLDOWN_MS,
  });
  rt.dialogue = picked.state;

  const emote = picked.emote ?? (picked.custom && picked.message ? lineEmote(picked.message) : null);
  if (emote !== null) playEmoteSoon(rt, emote as EmoteType);
  return picked.message;
}

/** Collects the contextual lines ahead of the next Talk. */
export async function refreshContextual(): Promise<void> {
  const rt = currentRuntime();
  if (!rt) return;
  rt.contextualCache = loadCompanionSettings().contextualEnabled ? await collectContextualLines() : [];
}

export type SayOptions = { force?: boolean; tags?: Record<number, BubbleTag> };

/**
 * Makes the companion speak.
 *
 * The burst guard protects from runs of progress messages. `force` is for the
 * line that must be heard: without it, an announcement right after the
 * message that triggered it was dropped, and he stayed silent exactly when he
 * had something to say.
 */
export async function say(message: string, opts: SayOptions = {}): Promise<void> {
  const rt = currentRuntime();
  if (!rt || !message.trim()) return;
  const now = Date.now();
  if (!opts.force && now - rt.lastBubbleAt < CHAT_BUBBLE_MIN_INTERVAL_MS) return;
  rt.lastBubbleAt = now;

  // The game switches to its tagged rendering as soon as `tags` is there,
  // even empty: it is only attached when it carries an icon.
  const tagged = opts.tags && Object.keys(opts.tags).length > 0 ? { tags: opts.tags } : {};

  try {
    await npcChatBubbles.set({
      // Marked as written by the mod: otherwise the bubble hook would replace
      // our own message with a random line.
      [rt.npcId]: { seq: 0, playerId: rt.npcId, message, timestamp: now, ...tagged, [AUTHORED_BY_MOD]: true },
    });
  } catch {}
}
