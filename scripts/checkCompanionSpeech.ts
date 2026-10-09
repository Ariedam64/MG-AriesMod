// The companion's lines replace the borrowed NPC's own, as the game builds them.
//
// Since game build 1441 the NPC lines live in an unlabelled forwarding atom:
// its read is `get(get(scope).npcLines)` and the game's `sayNpcLine` writes the
// whole map `{ ...lines, [npcId]: { ...line, saidAtMs } }` through it. The only
// way in is the labelled read atom `npcLineEmoteTypesAtom`, whose read begins
// with `get(npcLines)`. This suite rebuilds that shape and checks that the
// rewriter finds the atom, replaces the line for our NPC only, and leaves the
// mod's own lines and other NPCs alone.
import { check, checkEqual, done } from "./_check";
import { findNpcLinesAtom } from "../src/game/npcSpeech";
import { AUTHORED_BY_MOD, installSpeechRewriter, uninstallSpeechRewriter } from "../src/features/companion/speech";

type Lines = Record<string, Record<string, unknown>>;

// A primitive atom holding the lines of the current scope, and the forwarding
// atom the game reads and writes through (`ti(e => e.npcLines)` in the bundle).
const values = new Map<unknown, unknown>();
const scopeLinesAtom = { init: {} as Lines };
values.set(scopeLinesAtom, {});
const npcLinesAtom: any = {
  read: (get: (a: unknown) => unknown) => get(scopeLinesAtom),
  write: (_get: unknown, set: (a: unknown, v: unknown) => void, next: unknown) => set(scopeLinesAtom, next),
};
const durationAtom = { init: 6000 };

// What the store does with `set(atom, value)`: call the atom's write.
const storeGet = (a: unknown): unknown => (a === npcLinesAtom ? values.get(scopeLinesAtom) : values.get(a));
const storeSetPrimitive = (a: unknown, v: unknown) => values.set(a, v);
const gameSet = (next: Lines) => npcLinesAtom.write(storeGet, storeSetPrimitive, next);
const lines = () => values.get(scopeLinesAtom) as Lines;

const lineEmotesRead = {
  read: (get: (a: unknown) => unknown) => ({ lines: get(npcLinesAtom), displayDurationMs: get(durationAtom) }),
};
const g = globalThis as any;
g.jotaiAtomCache = {
  cache: new Map<string, unknown>([
    ["/client/src/games/Quinoa/components/QuinoaCanvas/systems/avatars/avatarSpeechAtoms.ts/talkingAvatarIdsAtom", {}],
    ["/client/src/games/Quinoa/components/QuinoaCanvas/systems/avatars/avatarSpeechAtoms.ts/npcLineEmoteTypesAtom", lineEmotesRead],
  ]),
};
if (g.window && g.window !== g) g.window.jotaiAtomCache = g.jotaiAtomCache;

checkEqual("the lines atom is found through the line emotes read", findNpcLinesAtom() === npcLinesAtom, true);

const OUR_NPC = "npc-gardener";
const OTHER_NPC = "npc-baker";
let resolved = 0;
const installed = installSpeechRewriter(OUR_NPC, () => {
  resolved++;
  return resolved === 1 ? "Our line" : `Our line ${resolved}`;
});
check("the rewriter installs on the unlabelled lines atom", installed);

// The game's sayNpcLine for our NPC, with another NPC already talking.
gameSet({ [OTHER_NPC]: { message: "Fresh bread!", saidAtMs: 1000 } });
gameSet({ ...lines(), [OUR_NPC]: { message: "Game line", saidAtMs: 2000, persistent: true } });
checkEqual("our NPC says our line", lines()[OUR_NPC]?.message, "Our line");
checkEqual("the rest of the game's line is kept", lines()[OUR_NPC]?.persistent, true);
checkEqual("another NPC keeps its own line", lines()[OTHER_NPC]?.message, "Fresh bread!");

// Every write carries the whole map: another NPC speaking copies our line
// along unchanged, which is not a new line from our NPC.
gameSet({ ...lines(), [OTHER_NPC]: { message: "Still warm!", saidAtMs: 2100 } });
checkEqual("our line survives another NPC speaking", lines()[OUR_NPC]?.message, "Our line");
checkEqual("no new line is picked for a carried-over entry", resolved, 1);

// A line the mod wrote itself goes through as it is.
gameSet({ ...lines(), [OUR_NPC]: { message: "Harvest done", saidAtMs: 2500, [AUTHORED_BY_MOD]: true } });
checkEqual("a mod line is not rewritten", lines()[OUR_NPC]?.message, "Harvest done");

// The game ignores a line older than the one shown: ours must never go back in time.
gameSet({ ...lines(), [OUR_NPC]: { message: "Game line", saidAtMs: 2400 } });
const after = Number(lines()[OUR_NPC]?.saidAtMs);
check("a later line is never dated before the previous one", after > 2500, `saidAtMs ${after}`);

// Writes about other NPCs only are left exactly as they were.
const otherOnly = { [OTHER_NPC]: { message: "Bye", saidAtMs: 3000 } };
gameSet(otherOnly);
checkEqual("a write without our NPC is untouched", lines(), otherOnly);

uninstallSpeechRewriter();
gameSet({ [OUR_NPC]: { message: "Game line", saidAtMs: 4000 } });
checkEqual("after uninstall the game speaks for itself", lines()[OUR_NPC]?.message, "Game line");

done();
