// Checks what the companion says on its own, and when.
//
// Everything here is pure (src/features/companion/reactions/): the game
// subscriptions live apart, in reactionWatch.ts, and decide nothing.

import { checkEqual, done } from "./_check";
import {
  FAMILY_COOLDOWN_MS,
  REACTION_GAP_MS,
  REACTION_TTL_MS,
  initialGateState,
  offerReaction,
  takeReaction,
  type Reaction,
} from "../src/features/companion/reactions/gate";
import { crossedMilestone, formatMilestone, statReactions } from "../src/features/companion/reactions/milestones";
import {
  abilityReaction,
  eggsReadyReaction,
  restockedFollowed,
  shopReaction,
  weatherChangeReaction,
} from "../src/features/companion/reactions/events";
import { badLuckReactions } from "../src/features/companion/reactions/badLuck";
import { newRareCrops, newlyReadyEggs } from "../src/features/companion/reactions/garden";
import {
  SESSION_GAP_MS,
  anniversaryReaction,
  clockReaction,
  greetingReaction,
  resumeSession,
  sessionHourReaction,
  sessionHours,
} from "../src/features/companion/reactions/session";
import { dayPart, dayPartLines, holidayOf, timeLines } from "../src/features/companion/dialogueTime";
import { DEFAULT_CUSTOM_LINES, POKE_WINDOW_MS, lineEmote, pokeLine } from "../src/features/companion/dialogueLines";
import {
  EmoteType,
  NPC_TALKING_MS,
  companionEmoteEntry,
  cutTalking,
  emoteStartDelay,
  mergeEmoteSource,
} from "../src/features/companion/emoteTypes";
import type { StatsSnapshot } from "../src/features/stats/stats";

const r0 = () => 0;

function stats(patch: {
  harvested?: number;
  planted?: number;
  soldValue?: number;
  soldCount?: number;
  hatched?: { normal?: number; gold?: number; rainbow?: number };
  abilities?: number;
}): StatsSnapshot {
  return {
    createdAt: 0,
    garden: { totalPlanted: patch.planted ?? 0, totalHarvested: patch.harvested ?? 0, totalDestroyed: 0, watercanUsed: 0, waterTimeSavedMs: 0 },
    shops: {
      seedsBought: 0,
      decorBought: 0,
      eggsBought: 0,
      toolsBought: 0,
      cropsSoldCount: patch.soldCount ?? 0,
      cropsSoldValue: patch.soldValue ?? 0,
      petsSoldCount: 0,
      petsSoldValue: 0,
    },
    pets: { hatchedByType: { Bunny: { normal: 0, gold: 0, rainbow: 0, ...(patch.hatched ?? {}) } } },
    abilities: { CoinFinder: { triggers: patch.abilities ?? 0, totalValue: 0 } },
    weather: {},
  };
}

console.log("--- milestones ---");
checkEqual("99 -> 100 crosses 100", crossedMilestone(99, 100), 100);
checkEqual("100 -> 101 crosses nothing", crossedMilestone(100, 101), null);
checkEqual("a jump over two milestones announces the higher one", crossedMilestone(900, 12_000), 10_000);
checkEqual("a drop crosses nothing", crossedMilestone(1_000, 10), null);
checkEqual("milestones go 100, 1k, 10k, 100k", [100, 1_000, 10_000, 100_000].map((m) => crossedMilestone(m - 1, m)).join(","), "100,1000,10000,100000");
checkEqual("1,000 is written with a separator", formatMilestone(1_000), "1,000");
checkEqual("a million is written in words", formatMilestone(1_000_000), "1 million");
checkEqual("so is a billion", formatMilestone(1e9), "1 billion");
{
  const got = statReactions(stats({ harvested: 999 }), stats({ harvested: 1_000 }), r0);
  checkEqual("1,000th harvest: one reaction", got.length, 1);
  checkEqual("and it mentions the milestone", got[0]?.message.includes("1,000"), true);
  checkEqual("and waits its turn if needed", got[0]?.priority, "high");
  checkEqual("on startup, stats that are already high say nothing", statReactions(stats({ harvested: 5_000 }), stats({ harvested: 5_000 }), r0).length, 0);
  const abilities = statReactions(stats({ abilities: 99 }), stats({ abilities: 100 }), r0);
  checkEqual("pet abilities have their milestones", abilities.some((r) => r.key === "milestone:abilities"), true);
}

console.log("\n--- events taken from the stats ---");
{
  const sale = statReactions(stats({ soldValue: 500 }), stats({ soldValue: 2_000 }), r0);
  checkEqual("a sale gets a reaction", sale.some((r) => r.key === "sale:crops"), true);
  checkEqual("with the amount earned", sale.find((r) => r.key === "sale:crops")?.message.includes("1,500"), true);
  checkEqual("and it only matters in the moment", sale.find((r) => r.key === "sale:crops")?.priority, "low");
  const rainbow = statReactions(stats({ hatched: { rainbow: 0, gold: 0 } }), stats({ hatched: { rainbow: 1, gold: 1 } }), r0);
  checkEqual("a rainbow beats a gold from the same batch", rainbow.filter((r) => r.key.startsWith("hatch:")).map((r) => r.key).join(), "hatch:rainbow");
  checkEqual("with the Love pose", rainbow.find((r) => r.key === "hatch:rainbow")?.emote, EmoteType.Love);
}

console.log("\n--- weather ---");
{
  checkEqual("weather already under way is not news", weatherChangeReaction("Rain", "Rain", "Rain", "x", r0), null);
  const start = weatherChangeReaction(null, "Thunderstorm", "", "Whoa!", r0);
  checkEqual("weather starting uses the line given", start?.message, "Whoa!");
  checkEqual("a thunderstorm is scary", start?.emote, EmoteType.Crying);
  const end = weatherChangeReaction("Frost", null, "Snow", "", r0);
  checkEqual("weather ending uses its display name", end?.message.includes("Snow"), true);
  checkEqual("and never the raw id", end?.message.includes("Frost"), false);
}

console.log("\n--- abilities, eggs, shop, rare crops ---");
{
  checkEqual("an ability names the pet", abilityReaction({ name: "Fluffy", abilityName: "Coin Finder" }, r0).message, "Fluffy just used Coin Finder!");
  checkEqual("with no name, the species", abilityReaction({ species: "Bunny", abilityName: "Coin Finder" }, r0).message, "Your Bunny just used Coin Finder!");
  checkEqual("no egg, nothing to say", eggsReadyReaction(0, r0), null);
  checkEqual("several eggs are counted", eggsReadyReaction(3, r0)?.message.includes("3"), true);

  const garden = { "4": { objectType: "egg", plantedAt: 1, maturedAt: 50 }, "5": { objectType: "egg", plantedAt: 2, maturedAt: 500 } };
  checkEqual("only the ripe egg is ready", newlyReadyEggs(garden, 100, new Set()).join(), "4|1");
  checkEqual("an egg already announced does not come back", newlyReadyEggs(garden, 100, new Set(["4|1"])).length, 0);

  checkEqual("a single item", shopReaction(["Starweaver"], r0)?.message, "Starweaver is in the shop! Go go go!");
  checkEqual("three items and more", shopReaction(["A", "B", "C"], r0)?.message.includes("A, B and more"), true);

  const followed = (id: string) => id === "Seed:Starweaver";
  const before = { seed: { secondsUntilRestock: 10, inventory: [{ species: "Starweaver", initialStock: 1 }] } };
  const restock = { seed: { secondsUntilRestock: 300, inventory: [{ species: "Starweaver", initialStock: 1 }, { species: "Carrot", initialStock: 5 }] } };
  const ticking = { seed: { secondsUntilRestock: 9, inventory: before.seed.inventory } };
  checkEqual("a restock with a followed item reports it", restockedFollowed(before, restock, followed).join(), "Seed:Starweaver");
  checkEqual("no restock, no announcement", restockedFollowed(before, ticking, followed).length, 0);
  checkEqual("the first reading says nothing", restockedFollowed(null, restock, followed).length, 0);
  const soldOut = { seed: { secondsUntilRestock: 300, inventory: [{ species: "Starweaver", initialStock: 0 }] } };
  checkEqual("a followed item with no stock does not count", restockedFollowed(before, soldOut, followed).length, 0);

  const rare = new Set(["Gold", "Rainbow"]);
  const g1 = { "0": { objectType: "plant", species: "Carrot", slots: [{ startTime: 1, mutations: [] }] } };
  const g2 = { "0": { objectType: "plant", species: "Carrot", slots: [{ startTime: 1, mutations: ["Gold", "Wet"] }, { startTime: 9, mutations: ["Rainbow"] }] } };
  const found = newRareCrops(g1, g2, rare);
  checkEqual("a new rare mutation is spotted", found.map((c) => c.mutation).join(), "Gold,Rainbow");
  checkEqual("a weather mutation does not count", found.some((c) => c.mutation === "Wet"), false);
  checkEqual("already there at the previous reading, nothing new", newRareCrops(g2, g2, rare).length, 0);
  checkEqual("first reading: reference only", newRareCrops(null, g2, rare).length, 0);
}

console.log("\n--- session and local time ---");
{
  const now = 1_000_000_000_000;
  const first = resumeSession(undefined, now);
  checkEqual("first launch: a welcome greeting", first.greeting?.first, true);
  const reload = resumeSession({ startedAt: now - 2 * 3_600_000, lastSeenAt: now - 60_000, announcedHours: 2 }, now);
  checkEqual("a reload keeps the session", reload.session.startedAt, now - 2 * 3_600_000);
  checkEqual("and does not greet", reload.greeting, null);
  checkEqual("and remembers the hours announced", reload.session.announcedHours, 2);
  const back = resumeSession({ startedAt: now - 10 * 3_600_000, lastSeenAt: now - SESSION_GAP_MS - 1, announcedHours: 3 }, now);
  checkEqual("after a real absence, a new session", back.session.startedAt, now);
  checkEqual("and a greeting", back.greeting?.first, false);
  checkEqual("the hours start again from zero", back.session.announcedHours, 0);
  checkEqual("a damaged blob counts as a first launch", resumeSession({ startedAt: "x" }, now).greeting?.first, true);

  checkEqual("2 h 30 makes 2 full hours", sessionHours({ startedAt: now - 2.5 * 3_600_000, lastSeenAt: now, announcedHours: 0 }, now), 2);
  checkEqual("under an hour, nothing", sessionHourReaction(0, r0), null);
  checkEqual("two hours", sessionHourReaction(2, r0)?.message.toLowerCase().includes("two hours"), true);
  checkEqual("from 3 h on it suggests a break", sessionHourReaction(4, r0)?.message.includes("4 hours"), true);

  checkEqual("3 am is night", dayPart(3), "night");
  checkEqual("9 am, morning", dayPart(9), "morning");
  checkEqual("11 pm, late", dayPart(23), "late");
  checkEqual("night lines talk about sleeping", dayPartLines(2).some((l) => /asleep|night/i.test(l)), true);
  checkEqual("morning greeting", greetingReaction({ first: false, awayMs: 3_600_000 }, 9, r0).message.includes("morning"), true);
  checkEqual("a long time away: it missed you", greetingReaction({ first: false, awayMs: 5 * 86_400_000 }, 9, r0).message.includes("missed"), true);

  checkEqual("midnight is noticed", clockReaction(23, 0, 0, r0)?.key, "clock:midnight");
  checkEqual("6 am after an all-nighter", clockReaction(5, 6, 4 * 3_600_000, r0)?.key, "clock:sunrise");
  checkEqual("6 am on waking up, nothing to say", clockReaction(5, 6, 600_000, r0), null);
  checkEqual("same hour, nothing", clockReaction(14, 14, 0, r0), null);
}

console.log("\n--- line emotes ---");
{
  checkEqual("a joke gets a laugh", lineEmote("I'm not lazy, I'm supervising."), EmoteType.Laughing);
  checkEqual("a question gets a questioning look", lineEmote("Is it snack time yet?"), EmoteType.Questioning);
  checkEqual("an unknown line has no pose", lineEmote("Custom line from the player"), null);
  const withEmote = DEFAULT_CUSTOM_LINES.filter((l) => lineEmote(l) !== null).length;
  checkEqual("most default lines have a pose", withEmote >= DEFAULT_CUSTOM_LINES.length / 2, true);
  checkEqual("time-of-day lines have one too", lineEmote("Night owl, huh?"), EmoteType.Laughing);
}

console.log("\n--- queue ---");
{
  const high = (key: string, message = key): Reaction => ({ key, message, emote: null, priority: "high" });
  const low = (key: string, message = key): Reaction => ({ key, message, emote: null, priority: "low" });
  const t = 1_000_000;

  let g = offerReaction(initialGateState(), low("sale:crops"), t);
  g = offerReaction(g, high("milestone:harvested"), t);
  let r = takeReaction(g, t, false);
  checkEqual("an important reaction goes first", r.reaction?.key, "milestone:harvested");
  r = takeReaction(r.state, t + 1_000, false);
  checkEqual("two reactions too close together: the second waits", r.reaction, null);
  r = takeReaction(r.state, t + REACTION_GAP_MS + 1, false);
  checkEqual("a low reaction that is too old is lost", r.reaction, null);

  g = offerReaction(initialGateState(), high("milestone:planted"), t);
  r = takeReaction(g, t, true);
  checkEqual("busy: nothing comes out", r.reaction, null);
  r = takeReaction(r.state, t + 60_000, false);
  checkEqual("an important reaction waits until it is free", r.reaction?.key, "milestone:planted");
  g = offerReaction(initialGateState(), high("egg"), t);
  r = takeReaction(g, t + REACTION_TTL_MS.high + 1, false);
  checkEqual("even an important one ends up expiring", r.reaction, null);

  g = offerReaction(initialGateState(), low("ability"), t);
  r = takeReaction(g, t, false);
  g = offerReaction(r.state, low("ability"), t + REACTION_GAP_MS + 1);
  checkEqual("a family that has just spoken stays quiet", g.queue.length, 0);
  g = offerReaction(r.state, low("ability"), t + FAMILY_COOLDOWN_MS.ability + 1);
  checkEqual("and speaks again after its cooldown", g.queue.length, 1);

  g = offerReaction(initialGateState(), high("shop", "old"), t);
  g = offerReaction(g, high("shop", "new"), t + 1);
  checkEqual("a waiting reaction is replaced by the newer one of the same kind", g.queue.map((q) => q.message).join(), "new");
}

console.log("\n--- bad luck when hatching ---");
{
  const name = (id: string) => (id === "MythicalEgg" ? "Mythical Egg" : id);
  const drought = badLuckReactions({ MythicalEgg: { gold: 24, rainbow: 24 } }, { MythicalEgg: { gold: 25, rainbow: 25 } }, name, r0);
  checkEqual("25 with no Gold: it sympathises", drought.map((r) => r.key).join(), "badluck:gold");
  checkEqual("naming the egg", drought[0]?.message.includes("Mythical Egg"), true);
  checkEqual("with Crying", drought[0]?.emote, EmoteType.Crying);
  checkEqual("25 with no Rainbow is normal: nothing", drought.some((r) => r.key === "badluck:rainbow"), false);
  checkEqual(
    "100 with no Rainbow: now yes",
    badLuckReactions({ E: { gold: 0, rainbow: 99 } }, { E: { gold: 0, rainbow: 100 } }, name, r0).map((r) => r.key).join(),
    "badluck:rainbow"
  );
  checkEqual("between two thresholds, nothing", badLuckReactions({ E: { gold: 30, rainbow: 0 } }, { E: { gold: 31, rainbow: 0 } }, name, r0).length, 0);

  const relief = badLuckReactions({ E: { gold: 79, rainbow: 0 } }, { E: { gold: 0, rainbow: 1 } }, name, r0);
  checkEqual("a Gold after 80 tries: FINALLY", relief[0]?.message.includes("FINALLY") && relief[0]?.message.includes("80"), true);
  checkEqual("under the same key as the ordinary reaction", relief[0]?.key, "hatch:gold");
  checkEqual("but weightier", relief[0]?.weight, 1);
  checkEqual("a Gold after 3 tries is no relief", badLuckReactions({ E: { gold: 3, rainbow: 0 } }, { E: { gold: 0, rainbow: 0 } }, name, r0).length, 0);
  checkEqual("an egg never seen before serves as the reference", badLuckReactions({}, { E: { gold: 25, rainbow: 0 } }, name, r0).length, 0);

  // Relief wins over "a Gold!", whatever the order they arrive in.
  const plain: Reaction = { key: "hatch:gold", message: "plain", emote: null, priority: "high" };
  const t = 5_000_000;
  let g = offerReaction(initialGateState(), relief[0], t);
  g = offerReaction(g, plain, t + 1);
  checkEqual("the ordinary reaction does not overwrite the relief", g.queue[0]?.message.includes("FINALLY"), true);
  g = offerReaction(offerReaction(initialGateState(), plain, t), relief[0], t + 1);
  checkEqual("and the relief replaces the ordinary one", g.queue.length === 1 && g.queue[0].message.includes("FINALLY"), true);
}

console.log("\n--- calendar ---");
{
  // Months run from 0 to 11 in the Date constructor, in local time.
  checkEqual("31 October, Halloween", holidayOf(new Date(2026, 9, 31, 15)), "halloween");
  checkEqual("25 December, Christmas", holidayOf(new Date(2026, 11, 25, 9)), "christmas");
  checkEqual("1 January, New Year", holidayOf(new Date(2027, 0, 1, 0)), "newyear");
  checkEqual("an ordinary day, nothing", holidayOf(new Date(2026, 8, 28, 12)), null);

  const saturday = new Date(2026, 9, 3, 15); // Saturday 3 October 2026
  const tuesday = new Date(2026, 8, 29, 15);
  checkEqual("the weekend has its lines", timeLines(saturday).includes("Weekend gardening, the best kind."), true);
  checkEqual("not on a weekday", timeLines(tuesday).includes("Weekend gardening, the best kind."), false);
  checkEqual("Halloween adds its own", timeLines(new Date(2026, 9, 31, 15)).some((l) => l.includes("Halloween")), true);
  checkEqual("holiday lines have a pose", lineEmote("Boo! Did I scare you?"), EmoteType.Laughing);

  checkEqual("a greeting on a holiday", greetingReaction({ first: false, awayMs: 3_600_000 }, 9, r0, "christmas").message, "Merry Christmas!");
  checkEqual("a long absence comes before the holiday", greetingReaction({ first: false, awayMs: 5 * 86_400_000 }, 9, r0, "christmas").message.includes("missed"), true);
  checkEqual("New Year's midnight wishes a happy new year", clockReaction(23, 0, 0, r0, "newyear")?.message.includes("New Year"), true);
}

console.log("\n--- anniversary ---");
{
  const day = 86_400_000;
  const met = 1_700_000_000_000;
  checkEqual("six days, nothing", anniversaryReaction(met, met + 6 * day, 0, r0).reaction, null);
  const week = anniversaryReaction(met, met + 7 * day, 0, r0);
  checkEqual("a week, it celebrates", week.reaction?.message.includes("week"), true);
  checkEqual("and notes it", week.celebratedDays, 7);
  checkEqual("not twice", anniversaryReaction(met, met + 8 * day, 7, r0).reaction, null);
  const month = anniversaryReaction(met, met + 45 * day, 7, r0);
  checkEqual("away until day 45: celebrates the month, not the week as well", month.celebratedDays, 30);
  checkEqual("one year", anniversaryReaction(met, met + 365 * day, 100, r0).reaction?.message.includes("One year"), true);
  checkEqual("two years", anniversaryReaction(met, met + 731 * day, 365, r0).reaction?.message.includes("2 years"), true);

  const now = met + 10 * day;
  const legacy = resumeSession({ startedAt: now - 3_600_000, lastSeenAt: now - 60_000, announcedHours: 1 }, now);
  checkEqual("a session from before anniversaries dates the meeting to today", legacy.session.firstMetAt, now);
  const kept = resumeSession({ startedAt: now - 3_600_000, lastSeenAt: now - SESSION_GAP_MS - 1, announcedHours: 1, firstMetAt: met, celebratedDays: 7 }, now);
  checkEqual("a new session keeps the meeting date", kept.session.firstMetAt, met);
  checkEqual("and the anniversaries already celebrated", kept.session.celebratedDays, 7);
}

console.log("\n--- repeated clicks ---");
{
  const t = 1_000_000;
  const clicks = (n: number, gap = 500) => Array.from({ length: n }, (_, i) => t - (n - 1 - i) * gap);
  checkEqual("4 clicks, nothing special", pokeLine(clicks(4), t, r0), null);
  const five = pokeLine(clicks(5), t, r0);
  checkEqual("5 clicks in 10 s, it notices", five?.message, "Okay okay, I'm listening!");
  checkEqual("amused", five?.emote, EmoteType.Laughing);
  checkEqual("8 clicks, puzzled", pokeLine(clicks(8), t, r0)?.emote, EmoteType.Questioning);
  checkEqual("12 clicks, annoyed", pokeLine(clicks(12), t, r0)?.emote, EmoteType.Angered);
  checkEqual("5 clicks spread over a minute, nothing", pokeLine(clicks(5, 15_000), t, r0), null);
  checkEqual("the window is 10 s", POKE_WINDOW_MS, 10_000);
}

console.log("\n--- a pose does not start under the Talking animation ---");
{
  // Bundle 1299: every NPC bubble turns Talking on for 3 s, and Talking hides
  // the emote (the game's tutorial cuts Talking to play one). A pose started
  // right after a bubble therefore played entirely hidden.
  const spoke = 10_000;
  checkEqual("Talking lasts 3 s, as in the game", NPC_TALKING_MS, 3000);
  checkEqual("right after a bubble, the pose waits for Talking to end", emoteStartDelay(spoke, spoke + 100) >= NPC_TALKING_MS - 100, true);
  checkEqual("halfway through, it waits for the rest", emoteStartDelay(spoke, spoke + 2000) >= 1000, true);
  checkEqual("Talking over, it starts at once", emoteStartDelay(spoke, spoke + NPC_TALKING_MS + 1000), 0);
  checkEqual("if it never spoke, it starts at once", emoteStartDelay(null, spoke), 0);
  // When we can cut Talking ourselves, the pose replaces the speech instead of
  // following it: no moving mouth before the question marks.
  checkEqual("Talking can be cut: the pose starts at once", emoteStartDelay(spoke, spoke + 100, true), 0);
}

console.log("\n--- cutting Talking on the companion's avatar ---");
{
  // Shapes taken from bundle 1299: the `avatar` system holds `views` (a Map
  // playerId -> view) and `stopNpcTalking(id, view)`, which cancels the 3 s
  // countdown and turns Talking off.
  const calls: string[] = [];
  const view = { setTalking: (on: boolean) => calls.push(`view:${on}`) };
  const system = {
    views: new Map([["NPC_Reina", view]]),
    stopNpcTalking: (id: string, v: unknown) => calls.push(`stop:${id}:${v === view}`),
  };
  checkEqual("the companion is found, Talking is cut", cutTalking(system, "NPC_Reina"), true);
  checkEqual("through the game's method, which also cancels its timer", calls.join(), "stop:NPC_Reina:true");

  calls.length = 0;
  const noStop = { views: new Map([["NPC_Reina", view]]) };
  checkEqual("without stopNpcTalking, the view is turned off directly", cutTalking(noStop, "NPC_Reina") && calls.join() === "view:false", true);
  checkEqual("NPC missing from the views: nothing cut", cutTalking(system, "NPC_Other"), false);
  checkEqual("system not found: nothing cut", cutTalking(null, "NPC_Reina"), false);
  checkEqual("a system of another shape: nothing cut", cutTalking({ views: {} }, "NPC_Reina"), false);
}

console.log("\n--- emotes go through the source the game reads ---");
{
  // A copy of the game function (bundle 1299, emoteAtoms chunk) that picks the
  // emotes to show from the chat entries. `playerEmoteTypesAtom`, which the mod
  // used to write, no longer exists: this computation is the only way in.
  const gameEmoteTypes = (entries: any[], now: number, durationMs: number) => {
    const types: Record<string, number> = {};
    const seen = new Set<string>();
    for (let i = entries.length - 1; i >= 0; --i) {
      const c = entries[i];
      if (c?.kind !== "emote" || seen.has(c.playerId)) continue;
      seen.add(c.playerId);
      const end = c.lastTimestampMs + durationMs;
      if (!(c.emoteType === EmoteType.Idle || end <= now)) types[c.playerId] = c.emoteType;
    }
    return types;
  };
  const now = 1_000_000;
  const real = {
    entries: [
      { kind: "message", playerId: "p1", message: "hi" },
      { kind: "emote", playerId: "p2", emoteType: EmoteType.Clapping, lastTimestampMs: now - 200 },
    ],
    displayDurationMs: 1500,
  };

  const posing = mergeEmoteSource(real, { entries: [companionEmoteEntry("NPC_Reina", EmoteType.Laughing, now)] });
  const types = gameEmoteTypes(posing.entries, now, posing.displayDurationMs);
  checkEqual("the game sees the companion's pose", types.NPC_Reina, EmoteType.Laughing);
  checkEqual("without touching a real player's", types.p2, EmoteType.Clapping);
  checkEqual("the game's display duration is kept", posing.displayDurationMs, 1500);
  // Dated in the future: the game's clock is synced to the server, ours is
  // not. We remove the entry ourselves when the pose ends.
  checkEqual("a clock 5 s ahead does not erase it", gameEmoteTypes(posing.entries, now + 5_000, 1500).NPC_Reina, EmoteType.Laughing);

  const resting = mergeEmoteSource(real, { entries: [] });
  checkEqual("at rest, nothing for the companion", gameEmoteTypes(resting.entries, now, 1500).NPC_Reina, undefined);
  checkEqual("and the game's entries pass through intact", resting.entries.length, 2);
  checkEqual("an unreadable source breaks nothing", mergeEmoteSource(null, { entries: [] }).entries.length, 0);
}

console.log("\n--- no line has an em dash ---");
{
  const samples: string[] = [];
  for (const v of [0, 0.5, 0.99]) {
    const rv = () => v;
    samples.push(
      ...statReactions(stats({ harvested: 99, soldValue: 0, hatched: {} }), stats({ harvested: 100, soldValue: 10, hatched: { gold: 1 } }), rv).map((r) => r.message),
      greetingReaction({ first: true, awayMs: 0 }, 3, rv).message,
      sessionHourReaction(7, rv)?.message ?? "",
      ...dayPartLines(3)
    );
  }
  checkEqual("no em dash", samples.some((s) => s.includes("\u2014")), false);
}

done();
