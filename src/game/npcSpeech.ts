// The lines the game shows above NPCs.
//
// Since game build 1441 they live in an atom with no debugLabel: a forwarding
// atom whose read is `get(get(scope).npcLines)` and whose write sets that
// field. The game's `sayNpcLine(npcId, line)` writes the whole map through it:
//   set(npcLines, { ...lines, [npcId]: { ...line, saidAtMs, persistent, textScale } })
// Nothing goes over the network.
//
// The atom is reached through the labelled read atom registered under
// `avatarSpeechAtoms.ts/npcLineEmoteTypesAtom`, whose read starts with
// `get(npcLines)`: calling that read with a recording `get` hands it over.

import { findAtomByCacheKeySuffix, jGet, jSet } from "./store/jotai";

const LINE_EMOTES_CACHE_KEY = "/avatarSpeechAtoms.ts/npcLineEmoteTypesAtom";

/** One NPC line as the game stores it. */
export type NpcLine = {
  message?: string;
  tags?: unknown;
  emote?: number;
  saidAtMs?: number;
  persistent?: boolean;
  textScale?: number;
  [key: string]: unknown;
};

export type NpcLines = Record<string, NpcLine>;

/** The atom holding every NPC's current line, or null before the game has registered it. */
export function findNpcLinesAtom(): any | null {
  const lineEmotes = findAtomByCacheKeySuffix(LINE_EMOTES_CACHE_KEY);
  if (!lineEmotes || typeof lineEmotes.read !== "function") return null;

  let first: any = null;
  const recordingGet = (atom: unknown) => {
    if (first === null) first = atom;
    return undefined;
  };
  try {
    lineEmotes.read(recordingGet, {});
  } catch {
    // The read only builds an object from what it gets; a throw means the
    // shape changed, and the null below says so.
  }
  return first && typeof first === "object" && typeof first.write === "function" ? first : null;
}

/**
 * Sets one NPC's line, keeping every other NPC's, the way the game's own
 * `sayNpcLine` does. False when the lines atom is not there yet.
 */
export async function writeNpcLine(npcId: string, line: NpcLine): Promise<boolean> {
  const atom = findNpcLinesAtom();
  if (!atom) return false;
  const current = (await jGet<NpcLines | null>(atom).catch(() => null)) ?? {};
  await jSet(atom, { ...current, [npcId]: line });
  return true;
}
