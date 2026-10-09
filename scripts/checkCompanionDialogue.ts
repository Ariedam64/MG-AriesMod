import { checkEqual, done } from "./_check";
import {
  CONTEXTUAL_CHANCE,
  DEFAULT_CONTEXTUAL_COOLDOWN_MS,
  initialDialogueState,
  nextBubbleTimestamp,
  pickDialogueLine,
  type ContextualLine,
  type DialogueState,
} from "../src/features/companion/dialogue";
import {
  DEFAULT_CUSTOM_LINES,
  GENERIC_WEATHER_TEMPLATES,
  LEGACY_DEFAULT_LINES,
  weatherDisplayName,
  harvestMessage,
  hungryPetMessage,
  ripeCropCount,
  sellMessage,
  weatherMessage,
} from "../src/features/companion/dialogueLines";
import { MAX_LINE_LENGTH, coerceSettings } from "../src/features/companion/settingsShape";

const EM_DASH = "\u2014";
const fixedRandom = (v: number) => () => v;
const CUSTOM = ["A", "B", "C"];

function pick(
  contextual: ContextualLine[],
  customLines: string[],
  state: DialogueState,
  nowMs: number,
  random: () => number = fixedRandom(0)
) {
  return pickDialogueLine({
    contextual,
    customLines,
    state,
    nowMs,
    random,
    cooldownMs: DEFAULT_CONTEXTUAL_COOLDOWN_MS,
  });
}

console.log("--- contextual lines come first ---");
{
  const harvest: ContextualLine = { key: "harvest", message: "3 crops are ready." };
  const r = pick([harvest], CUSTOM, initialDialogueState(), 1000);
  checkEqual("a contextual alert comes before the custom lines", r.message, harvest.message);
  checkEqual("the alert goes on cooldown once used", r.state.mutedUntil.harvest, 1000 + DEFAULT_CONTEXTUAL_COOLDOWN_MS);
}
{
  // The order of the candidates sets the priority.
  const first: ContextualLine = { key: "harvest", message: "harvest" };
  const second: ContextualLine = { key: "pets", message: "pets" };
  const r = pick([first, second], CUSTOM, initialDialogueState(), 0);
  checkEqual("the first candidate wins", r.message, "harvest");
  checkEqual("the second is not put on cooldown for nothing", r.state.mutedUntil.pets, undefined);
}

console.log("\n--- alerts are part of the draw ---");
{
  const harvest: ContextualLine = { key: "harvest", message: "harvest" };
  // A high draw lands on a custom line even with an alert available: otherwise
  // the alerts all come out in a row at the start, and never again after.
  const high = pick([harvest], CUSTOM, initialDialogueState(), 0, fixedRandom(0.9));
  checkEqual("a high draw gives a custom line", CUSTOM.includes(String(high.message)), true);
  checkEqual("and the alert is not put on cooldown for nothing", high.state.mutedUntil.harvest, undefined);
  const lowDraw = pick([harvest], CUSTOM, initialDialogueState(), 0, fixedRandom(CONTEXTUAL_CHANCE - 0.01));
  checkEqual("below the probability, it is the alert", lowDraw.message, "harvest");
  // With no custom lines, there is nothing else to say but the alert.
  const onlyAlert = pick([harvest], [], initialDialogueState(), 0, fixedRandom(0.9));
  checkEqual("with no custom lines, the alert comes out anyway", onlyAlert.message, "harvest");

  // Over many draws, alerts come out roughly one time in four.
  let state = initialDialogueState();
  let alerts = 0;
  let seed = 7;
  const lcg = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 2000; i++) {
    const r = pickDialogueLine({ contextual: [harvest], customLines: CUSTOM, state, nowMs: i, random: lcg, cooldownMs: 0 });
    state = r.state;
    if (r.message === "harvest") alerts++;
  }
  checkEqual("about 25% alerts over 2000 draws", alerts > 400 && alerts < 600, true);
}

console.log("\n--- cooldown ---");
{
  const harvest: ContextualLine = { key: "harvest", message: "harvest" };
  const pets: ContextualLine = { key: "pets", message: "pets" };
  const first = pick([harvest, pets], CUSTOM, initialDialogueState(), 0);
  // Right after, the same alert must stay quiet and make way for the next one.
  const second = pick([harvest, pets], CUSTOM, first.state, 1000);
  checkEqual("an alert does not repeat right away", second.message, "pets");
  // Once the delay has passed, it may come back.
  const third = pick([harvest], CUSTOM, second.state, DEFAULT_CONTEXTUAL_COOLDOWN_MS + 1);
  checkEqual("it comes back after the cooldown", third.message, "harvest");
}
{
  // All on cooldown: we fall back on the custom lines.
  const harvest: ContextualLine = { key: "harvest", message: "harvest" };
  const first = pick([harvest], CUSTOM, initialDialogueState(), 0);
  const second = pick([harvest], CUSTOM, first.state, 500);
  checkEqual("falls back on a custom line when everything is on cooldown", CUSTOM.includes(String(second.message)), true);
}

console.log("\n--- custom lines ---");
{
  const r = pick([], CUSTOM, initialDialogueState(), 0, fixedRandom(0));
  checkEqual("draws from the list", r.message, "A");
  // The same draw must not bring out the same line twice in a row.
  const again = pick([], CUSTOM, r.state, 0, fixedRandom(0));
  checkEqual("avoids repeating the previous one", again.message, "B");
}
{
  const single = pick([], ["Only"], initialDialogueState(), 0);
  checkEqual("a one-line list is still usable", single.message, "Only");
  const twice = pick([], ["Only"], single.state, 0);
  checkEqual("and repeats without looping forever", twice.message, "Only");
}
{
  const empty = pick([], [], initialDialogueState(), 0);
  checkEqual("empty list -> null (the game keeps its own line)", empty.message, null);
  const blanks = pick([], ["   ", ""], initialDialogueState(), 0);
  checkEqual("blank lines do not count as lines", blanks.message, null);
}
{
  // random() returning 1 must not run off the end of the array.
  const r = pick([], CUSTOM, initialDialogueState(), 0, fixedRandom(1));
  checkEqual("random() = 1 stays in bounds", CUSTOM.includes(String(r.message)), true);
}

console.log("\n--- state immutability ---");
{
  const base = initialDialogueState();
  const r = pick([{ key: "harvest", message: "harvest" }], CUSTOM, base, 0);
  checkEqual("the input state is not mutated", Object.keys(base.mutedUntil).length, 0);
  checkEqual("the returned state carries the cooldown", Object.keys(r.state.mutedUntil).length, 1);
}

console.log("\n--- harvest ready: preserved crops do not count ---");
{
  const now = 10_000;
  const garden = {
    "0": { objectType: "plant", slots: [{ endTime: 5 }, { endTime: 5, preserved: true }] },
    "1": { objectType: "plant", slots: [{ endTime: 5, preserved: true }, { endTime: now + 1 }] },
    "2": { objectType: "plant", slots: [{ endTime: 5, preserved: false }] },
  };
  checkEqual("a preserved crop is not reported as ready to harvest", ripeCropCount(garden, now), 2);
  const onlyPreserved = { "0": { objectType: "plant", slots: [{ endTime: 5, preserved: true }] } };
  checkEqual("an all-preserved garden gives nothing to say", ripeCropCount(onlyPreserved, now), 0);
  checkEqual("an unreadable garden counts zero", ripeCropCount(null, now), 0);
}

console.log("\n--- default lines ---");
{
  checkEqual("the default list has enough variety", DEFAULT_CUSTOM_LINES.length >= 30, true);
  checkEqual("no duplicate line", new Set(DEFAULT_CUSTOM_LINES).size, DEFAULT_CUSTOM_LINES.length);
  checkEqual(
    "none is longer than a bubble",
    DEFAULT_CUSTOM_LINES.every((line) => line.length <= MAX_LINE_LENGTH),
    true
  );
  checkEqual("no em dash", DEFAULT_CUSTOM_LINES.some((line) => line.includes(EM_DASH)), false);

  // Existing players have the 4 old lines on disk: without a migration, the
  // new list would never reach them.
  const legacy = coerceSettings({ lines: [...LEGACY_DEFAULT_LINES] });
  checkEqual("the old default lines move to the new list", legacy.lines.length, DEFAULT_CUSTOM_LINES.length);
  const custom = coerceSettings({ lines: ["Mine", "Right behind you, boss."] });
  checkEqual("a custom list is not overwritten", custom.lines.join("|"), "Mine|Right behind you, boss.");
  const empty = coerceSettings({ lines: [] });
  checkEqual("a list emptied on purpose stays empty", empty.lines.length, 0);
}

console.log("\n--- varied contextual lines ---");
{
  const sweep = (make: (random: () => number) => string) =>
    new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((v) => make(fixedRandom(v))));
  checkEqual("harvest has several phrasings", sweep((r) => harvestMessage(3, r)).size >= 3, true);
  checkEqual("hunger has several phrasings", sweep((r) => hungryPetMessage(2, r)).size >= 3, true);
  checkEqual("selling has several phrasings", sweep((r) => sellMessage(1500, r)).size >= 3, true);
  checkEqual("weather has several phrasings", sweep((r) => weatherMessage("Rain", "Rain", r)).size >= 3, true);
  checkEqual("the number does appear", harvestMessage(7, fixedRandom(0.5)).includes("7"), true);
  checkEqual("the singular is respected", /\b1 crops\b/.test(harvestMessage(1, fixedRandom(0))), false);
  checkEqual("coins are formatted", sellMessage(12345, fixedRandom(0)).includes("12,345"), true);
  checkEqual("random() = 1 stays in bounds", typeof harvestMessage(2, fixedRandom(1)), "string");
}

console.log("\n--- lines specific to each weather ---");
{
  const all = (id: string, name: string) =>
    [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.99].map((v) => weatherMessage(id, name, fixedRandom(v)));
  // The ids `weatherAtom` carries (bundle 1299: Rain, Frost, Thunderstorm, Dawn, AmberMoon).
  for (const [id, name] of [
    ["Rain", "Rain"],
    ["Frost", "Snow"],
    ["Thunderstorm", "Thunderstorm"],
    ["Dawn", "Dawn"],
    ["AmberMoon", "Amber Moon"],
  ]) {
    const lines = all(id, name);
    checkEqual(`${id} has its own lines`, lines.every((line) => !GENERIC_WEATHER_TEMPLATES.some((t) => t(name) === line)), true);
    checkEqual(`${id} has several`, new Set(lines).size >= 4, true);
    checkEqual(`${id} never shows the raw id`, id === name || lines.every((line) => !line.includes(id)), true);
  }
  // A weather the game adds after this version: generic fallback, with its display name.
  const unknown = all("SolarFlare", "Solar Flare");
  checkEqual("an unknown weather falls back on the generic lines", unknown.every((line) => line.includes("Solar Flare")), true);
  checkEqual("no weather line has an em dash", [...unknown, ...all("Rain", "Rain")].some((l) => l.includes(EM_DASH)), false);
}
{
  checkEqual("display name: live catalog", weatherDisplayName("Frost", { Frost: { name: "Snow" } }), "Snow");
  checkEqual("display name: old displayName field", weatherDisplayName("Frost", { Frost: { displayName: "Snow" } }), "Snow");
  checkEqual("display name: split id as a fallback", weatherDisplayName("AmberMoon", {}), "Amber Moon");
  checkEqual("display name: unreadable catalog", weatherDisplayName("Rain", null), "Rain");
}

console.log("\n--- a Talk bubble shows after a mod bubble ---");
{
  // The game's rule (bundle 1299, deliverNpcChatBubble): a bubble only shows if
  // its timestamp is past the last one shown. The mod stamps its bubbles with
  // Date.now(), the game with its clock synced to the server.
  const deliver = (timestamps: number[]) => {
    let last = 0;
    return timestamps.map((ts) => {
      if (ts > last) {
        last = ts;
        return true;
      }
      return false;
    });
  };
  const server = 1_000_000;
  const modAhead = server + 2_000; // the PC clock is 2 s ahead
  const talk = server + 500; // the player's Talk half a second later

  checkEqual("without the correction, the Talk is ignored", deliver([modAhead, talk]).join(), "true,false");

  let last: number | null = null;
  const stamped = [modAhead, talk].map((ts) => {
    const next = nextBubbleTimestamp(last, ts);
    last = next;
    return next;
  });
  checkEqual("with the correction, both bubbles show", deliver(stamped).join(), "true,true");
  checkEqual("a bubble that is already newer keeps its time", nextBubbleTimestamp(100, 500), 500);
  checkEqual("the very first one keeps its time", nextBubbleTimestamp(null, 42), 42);
  checkEqual("an unreadable timestamp is left as is", nextBubbleTimestamp(100, NaN as unknown as number), NaN);
}

done();
