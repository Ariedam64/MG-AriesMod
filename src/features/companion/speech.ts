// Replaces the line the game makes the borrowed NPC say.
//
// The game's "Talk" action comes down to `sayNpcLine`, which writes every
// NPC's line at once through the lines atom (see game/npcSpeech.ts):
//   set(npcLines, { ...lines, [npcId]: { message, tags, saidAtMs, ... } })
// Wrapping that atom's `write` rewrites our NPC's `message` BEFORE it is
// stored: the original line never exists, so nothing flickers, unlike a
// rewrite after the fact where the renderer would show the game's text for a
// frame.
//
// Not through `fakeAtoms`: it patches `read()` and calls the original WITHOUT
// a receiver, and Jotai's default `read` and `write` rely on `this`. So the
// wrapping is done by hand here, with a plain function and `.call(this, ...)`.
//
// This module is the only one wrapping the lines atom's `write`: two
// wrappers would trip over each other when taken down.

import { findNpcLinesAtom, type NpcLine, type NpcLines } from "../../game/npcSpeech";
import { nextBubbleTimestamp } from "./dialogue";
import { markSpoke } from "./emote";

/**
 * Marks the bubbles the mod writes itself (`Companion.say`). Without it our
 * own messages would go through the resolver again and be rewritten.
 */
export const AUTHORED_BY_MOD = "ariesAuthored";

/** Returns the line to say, or `null` to let the game's through. */
type MessageResolver = (npcId: string, originalMessage: string) => string | null;

type Wrapped = { atom: any; original: (...args: unknown[]) => unknown };

let wrapped: Wrapped | null = null;
let resolver: MessageResolver | null = null;
/** The playerId whose lines are rewritten. */
let targetNpcId: string | null = null;
/** When our NPC last spoke, whoever wrote the line. */
let lastSaidAt: number | null = null;
/**
 * How far the game's clock is ahead of this PC's, learnt from the game's own
 * lines. A line dated on a PC that runs behind would expire as it appears.
 */
let gameClockOffsetMs = 0;

/** Now, on the clock the game dates NPC lines with. */
export function gameLineTime(): number {
  return Date.now() + gameClockOffsetMs;
}

/**
 * Rewrites the outgoing payload if, and only if, it concerns our NPC. Other
 * NPCs' bubbles go through untouched.
 */
function rewritePayload(payload: unknown, current: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (!targetNpcId || !resolver) return payload;

  const entries = payload as NpcLines;
  const entry = entries[targetNpcId];
  if (!entry || typeof entry !== "object") return payload;
  // Every write carries every NPC's line: ours copied along while another
  // NPC speaks is not a new line from ours.
  const previous = current && typeof current === "object" ? (current as NpcLines)[targetNpcId] : undefined;
  if (previous === entry || (previous && previous.message === entry.message && previous.saidAtMs === entry.saidAtMs)) {
    return payload;
  }
  // Every bubble, ours as well as the game's, restarts the Talking animation,
  // which hides poses: `emote.ts` must know when it will stop.
  markSpoke(targetNpcId);

  // The mod's lines and the game's are not dated by the same clock: they are
  // put back in order, or the game ignores the "older" one.
  const proposed = Number(entry.saidAtMs);
  if (entry[AUTHORED_BY_MOD] !== true && Number.isFinite(proposed)) gameClockOffsetMs = proposed - Date.now();
  const saidAtMs = nextBubbleTimestamp(lastSaidAt, proposed);
  if (Number.isFinite(saidAtMs)) lastSaidAt = saidAtMs;
  const stamped: NpcLine = saidAtMs === proposed ? entry : { ...entry, saidAtMs };

  if (entry[AUTHORED_BY_MOD] === true) {
    return stamped === entry ? payload : { ...entries, [targetNpcId]: stamped };
  }

  const original = typeof entry.message === "string" ? entry.message : "";
  let replacement: string | null = null;
  try {
    replacement = resolver(targetNpcId, original);
  } catch {
    replacement = null;
  }
  if (!replacement || replacement === original) {
    return stamped === entry ? payload : { ...entries, [targetNpcId]: stamped };
  }

  return { ...entries, [targetNpcId]: { ...stamped, message: replacement } };
}

/**
 * Installs the wrapper. Idempotent: calling it again only replaces the target
 * and the resolver, without stacking wrappers.
 */
export function installSpeechRewriter(npcId: string, resolve: MessageResolver): boolean {
  targetNpcId = npcId;
  resolver = resolve;
  if (wrapped) return true;

  const atom = findNpcLinesAtom();
  if (!atom || typeof atom.write !== "function") return false;

  const original = atom.write as (...args: unknown[]) => unknown;
  // A plain function (not an arrow): Jotai's default `write` reads `this`.
  atom.write = function (this: unknown, get: unknown, set: unknown, update: unknown, ...rest: unknown[]) {
    // The game always writes a value; functional updates are left alone, since
    // their result is unknown without applying them.
    let current: unknown;
    try {
      current = (get as (a: unknown) => unknown)(atom);
    } catch {
      current = undefined;
    }
    const next = typeof update === "function" ? update : rewritePayload(update, current);
    return original.call(this, get, set, next, ...rest);
  };

  wrapped = { atom, original };
  return true;
}

/** Removes the wrapper and restores the original `write`. Safe to call more than once. */
export function uninstallSpeechRewriter(): void {
  targetNpcId = null;
  lastSaidAt = null;
  resolver = null;
  if (!wrapped) return;
  try {
    wrapped.atom.write = wrapped.original;
  } catch {}
  wrapped = null;
}
