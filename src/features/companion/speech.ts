// Replaces the line the game makes the borrowed NPC say.
//
// The game's "Talk" action comes down to
//   set(npcChatBubblesAtom, { [npcId]: { seq, playerId, message, timestamp, tags } })
// with nothing on the network. Wrapping this primitive atom's `write`
// rewrites `message` BEFORE it is stored: the original line never exists, so
// nothing flickers, unlike a rewrite after the fact where the renderer would
// show the game's text for a frame.
//
// Not through `fakeAtoms`: it patches `read()` and calls the original WITHOUT
// a receiver, and Jotai's default `read` and `write` rely on `this`. So the
// wrapping is done by hand here, with a plain function and `.call(this, ...)`.
//
// This module is the only one wrapping `npcChatBubblesAtom.write`: two
// wrappers would trip over each other when taken down.

import { getAtomByLabel } from "../../game/store/jotai";
import { nextBubbleTimestamp } from "./dialogue";
import { markSpoke } from "./emote";

const CHAT_BUBBLES_LABEL = "npcChatBubblesAtom";

/**
 * Marks the bubbles the mod writes itself (`Companion.say`). Without it our
 * own messages would go through the resolver again and be rewritten.
 */
export const AUTHORED_BY_MOD = "ariesAuthored";

type BubbleEntry = { playerId?: string; message?: string; [key: string]: unknown };
type BubblePayload = Record<string, BubbleEntry>;

/** Returns the line to say, or `null` to let the game's through. */
type MessageResolver = (npcId: string, originalMessage: string) => string | null;

type Wrapped = { atom: any; original: (...args: unknown[]) => unknown };

let wrapped: Wrapped | null = null;
let resolver: MessageResolver | null = null;
/** The playerId whose lines are rewritten. */
let targetNpcId: string | null = null;
/** Our NPC's last bubble timestamp, whoever wrote it. */
let lastTimestamp: number | null = null;

/**
 * Rewrites the outgoing payload if, and only if, it concerns our NPC. Other
 * NPCs' bubbles go through untouched.
 */
function rewritePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (!targetNpcId || !resolver) return payload;

  const entries = payload as BubblePayload;
  const entry = entries[targetNpcId];
  if (!entry || typeof entry !== "object") return payload;
  // Every bubble, ours as well as the game's, restarts the Talking animation,
  // which hides poses: `emote.ts` must know when it will stop.
  markSpoke(targetNpcId);

  // The mod's bubbles and the game's are not dated by the same clock: they
  // are put back in order, or the game ignores the "older" one.
  const proposed = Number(entry.timestamp);
  const timestamp = nextBubbleTimestamp(lastTimestamp, proposed);
  if (Number.isFinite(timestamp)) lastTimestamp = timestamp;
  const stamped: BubbleEntry = timestamp === proposed ? entry : { ...entry, timestamp };

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

  const atom = getAtomByLabel(CHAT_BUBBLES_LABEL);
  if (!atom || typeof atom.write !== "function") return false;

  const original = atom.write as (...args: unknown[]) => unknown;
  // A plain function (not an arrow): Jotai's default `write` reads `this`.
  atom.write = function (this: unknown, get: unknown, set: unknown, update: unknown, ...rest: unknown[]) {
    // The game always writes a value; functional updates are left alone, since
    // their result is unknown without applying them.
    const next = typeof update === "function" ? update : rewritePayload(update);
    return original.call(this, get, set, next, ...rest);
  };

  wrapped = { atom, original };
  return true;
}

/** Removes the wrapper and restores the original `write`. Safe to call more than once. */
export function uninstallSpeechRewriter(): void {
  targetNpcId = null;
  lastTimestamp = null;
  resolver = null;
  if (!wrapped) return;
  try {
    wrapped.atom.write = wrapped.original;
  } catch {}
  wrapped = null;
}
