// The rules features hang on what the game sends (game/ws/outgoing.ts), and
// the socket send hook that applies them to QuinoaCommand envelopes.
//
// What this guards:
//   - rules for one type run in registration order and the first drop wins,
//     which is what lets the inventory reserve block before the egg locker
//     shows its toast, and the editor remove a decor before the locker sees it;
//   - observers (stats) only see what every rule let through;
//   - a HarvestCrop the locker could not resolve to a tile is still counted.
//     The count used to live inside the locker's tile resolution, so a harvest
//     sent before the garden atom answered went out uncounted.
//
// Run with: npm run check:outgoing

import { checkEqual, done } from "./_check";
import { interceptOutgoing, observeOutgoing, runOutgoing } from "../src/game/ws/outgoing";
import { processOutgoingFrame } from "../src/game/ws/socketHook";
import { buildQuinoaMessage, resetCommandSequence, seedCommandSequence } from "../src/game/ws/commands";
import { installStatsCounters } from "../src/features/stats/outgoingCounters";
import { StatsService } from "../src/features/stats/stats";
import { installLockerOutgoingRules } from "../src/features/locker/outgoingRules";

// Rules run in order, a replacement is passed on, the first drop ends the chain.
const seen: string[] = [];
interceptOutgoing("Probe", (m) => { seen.push("first:" + m.n); return { replace: { ...m, n: m.n + 1 } }; });
interceptOutgoing("Probe", (m) => { seen.push("second:" + m.n); if (m.n > 5) return "drop"; });
interceptOutgoing("Probe", () => { throw new Error("a broken rule"); });
interceptOutgoing("Probe", (m) => { seen.push("fourth:" + m.n); });
const observed: number[] = [];
observeOutgoing("Probe", (m) => observed.push(m.n));

checkEqual("a replaced message is what gets sent", runOutgoing({ type: "Probe", n: 1 }), { type: "Probe", n: 2 });
checkEqual("rules run in registration order, a throwing one is skipped", seen, ["first:1", "second:2", "fourth:2"]);
checkEqual("observers see the message as sent", observed, [2]);

seen.length = 0;
checkEqual("a drop returns null", runOutgoing({ type: "Probe", n: 9 }), null);
checkEqual("no rule after the drop runs", seen, ["first:9", "second:10"]);
checkEqual("observers never see a dropped message", observed, [2]);

const untouched = { type: "Unwatched", x: 1 };
checkEqual("a type without rules goes out as is", runOutgoing(untouched) === untouched, true);

// The socket send hook: only the game's envelopes go through the rules.
interceptOutgoing("Blocked", () => "drop");
seedCommandSequence(10);
const gameFrame = JSON.stringify({ scopePath: ["Room", "Quinoa"], type: "QuinoaCommand", requestId: "g1", commandSequence: 11, command: { type: "Blocked" } });
checkEqual("a game command a rule drops never reaches the socket", processOutgoingFrame(gameFrame), null);
const own = buildQuinoaMessage({ type: "HarvestCrop", slot: 1, slotsIndex: 0 });
const ownFrame = JSON.stringify({ ...own, command: { ...(own as any).command, type: "Blocked" } });
checkEqual("the mod's own command skips the rules", processOutgoingFrame(ownFrame), ownFrame);
checkEqual("a flat frame is left alone", processOutgoingFrame('{"type":"Ping"}'), '{"type":"Ping"}');
resetCommandSequence();

// Stats count every harvest that leaves, resolved by the locker or not.
installStatsCounters();
installLockerOutgoingRules();
const harvested = () => StatsService.getSnapshot().garden.totalHarvested;
const before = harvested();
runOutgoing({ type: "HarvestCrop", slot: 12, slotsIndex: 0, cropItemId: "c1" });
checkEqual("a harvest nothing resolved to a tile is counted", harvested() - before, 1);
runOutgoing({ type: "HarvestCrop", slot: "12", slotsIndex: 0 });
checkEqual("a malformed harvest is not counted", harvested() - before, 1);
interceptOutgoing("HarvestCrop", () => "drop");
runOutgoing({ type: "HarvestCrop", slot: 12, slotsIndex: 1 });
checkEqual("a blocked harvest is not counted", harvested() - before, 1);

done();
