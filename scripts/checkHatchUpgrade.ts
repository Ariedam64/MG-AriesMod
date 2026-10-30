// An install from before 4.0.8 keeps its hatch history on the egg cards (BR-15).
//
// 4.0.8 moved the "Hatched" grid of each egg card from the Stats table
// (`stats.pets.hatchedByType`) to a new per-egg table, `hatch.tracker.hatched`.
// An existing install has no such field, and nothing fills it from the past:
// every pet in the stored history is already in `seenPetIds`, so the replay at
// start-up skips them all. The grid went back to zero on update while the pity
// counters and the "N hatches seen" header, which never moved, kept their
// history.
//
// This seeds storage the way 4.0.7 left it (bootstrapped tracker, seen pets,
// counters, no `hatched`, a Stats table with ten Butterflies and one Capybara),
// starts the real tracker on a fake store, renders the Mythical Egg card, then
// hatches one more Butterfly to make sure it counts once.

import "./_installFakeDom";
import { checkEqual, run } from "./_check";
import { createFakeStore, installFakeGame, primitive } from "./_fakeJotai";
import type { EggPity } from "../src/features/hatch/pity";

function hatchEntry(petId: string, species: string, eggId: string, timestamp: number) {
  return {
    timestamp,
    action: "hatchEgg",
    parameters: { eggId, pet: { id: petId, petSpecies: species, mutations: [] } },
  };
}

// What 4.0.7 saw hatch from the Mythical Egg: ten Butterflies, one Capybara.
const OLD_HATCHES = [
  ...Array.from({ length: 10 }, (_, i) => hatchEntry(`pet-old-butterfly-${i + 1}`, "Butterfly", "MythicalEgg", 1_000 + i * 1_000)),
  hatchEntry("pet-old-capybara-1", "Capybara", "MythicalEgg", 11_000),
];

const store = createFakeStore();
// The game's own list only holds the latest few, all of them already seen.
const myData = primitive<any>({ activityLogs: OLD_HATCHES.slice(-3) }, "myDataAtom");
installFakeGame(store, {
  "/atoms/myAtoms.ts/myDataAtom": myData,
});

/** The grid row for `species`, as [normal, gold, rainbow, total] text. */
function speciesRow(card: HTMLElement, species: string): string[] | null {
  for (const row of Array.from(card.querySelectorAll(".ht-counts__row"))) {
    if (row.querySelector(".ht-species__name")?.textContent !== species) continue;
    return Array.from(row.querySelectorAll(".ht-num")).map((cell) => cell.textContent ?? "");
  }
  return null;
}

/** The grid's Total line, as [normal, gold, rainbow, total] text. */
function totalRow(card: HTMLElement): string[] | null {
  const row = card.querySelector(".is-total");
  return row ? Array.from(row.querySelectorAll(".ht-num")).map((cell) => cell.textContent ?? "") : null;
}

run(async () => {
  const { writeAriesPath } = await import("../src/platform/storage");

  // Storage as 4.0.7 left it. The pulls go back further than the stored
  // history, which is the usual case on an old account.
  writeAriesPath("activityLog.history", OLD_HATCHES);
  writeAriesPath("hatch.tracker", {
    seenPetIds: OLD_HATCHES.map((entry) => entry.parameters.pet.id),
    counters: { MythicalEgg: { species: { Capybara: 15 }, gold: 21, rainbow: 21, pulls: 21 } },
    offsets: {},
    lastHatchAt: 11_000,
    trackingStartedAt: 500,
    bootstrapped: true,
  });
  writeAriesPath("stats", {
    createdAt: 500,
    pets: {
      hatchedByType: {
        butterfly: { normal: 10, gold: 0, rainbow: 0 },
        capybara: { normal: 1, gold: 0, rainbow: 0 },
      },
    },
  });

  const { sleep } = await import("../src/lib/async");
  const { startHatchTracker, HatchTracker } = await import("../src/features/hatch/tracker");
  const { createEggCard } = await import("../src/features/hatch/eggCard");
  const { countsFor, totalOf } = await import("../src/features/hatch/counts");
  const { StatsService } = await import("../src/features/stats/stats");

  // The 1823 spawn weights.
  const mythicalEgg: EggPity = {
    eggId: "MythicalEgg",
    name: "Mythical Egg",
    rarity: "Mythic",
    fauna: [
      { species: "Butterfly", share: 0.75 },
      { species: "Peacock", share: 0.2 },
      { species: "Capybara", share: 0.05 },
    ],
    targets: [],
  };

  const render = () => createEggCard({
    egg: mythicalEgg,
    stats: StatsService.getSnapshot(),
    showOffsets: false,
    collapsed: false,
    onToggle: () => {},
  });

  const stop = await startHatchTracker();
  await sleep(20);

  console.log("--- right after the update ---");
  const card = render();
  checkEqual("the Butterfly row keeps the ten hatched before the update",
    speciesRow(card, "Butterfly"), ["10", "0", "0", "10"]);
  checkEqual("the Capybara row keeps the one hatched before the update",
    speciesRow(card, "Capybara"), ["1", "0", "0", "1"]);
  checkEqual("the Peacock row stays at zero",
    speciesRow(card, "Peacock"), ["0", "0", "0", "0"]);
  checkEqual("the Total line adds them up",
    totalRow(card), ["11", "0", "0", "11"]);
  checkEqual("the pulls seen are left as they were", HatchTracker.getCounters("MythicalEgg").pulls, 21);
  checkEqual("the Stats table is left as it was",
    totalOf(countsFor(StatsService.getSnapshot(), "Butterfly")), 10);

  console.log("\n--- one more Butterfly ---");
  store.set(myData, {
    activityLogs: [...OLD_HATCHES.slice(-2), hatchEntry("pet-new-butterfly-1", "Butterfly", "MythicalEgg", 20_000)],
  });
  await sleep(20);

  const after = render();
  checkEqual("the Butterfly row counts the new one once",
    speciesRow(after, "Butterfly"), ["11", "0", "0", "11"]);
  checkEqual("the Total line counts the new one once",
    totalRow(after), ["12", "0", "0", "12"]);
  checkEqual("the new pull is counted", HatchTracker.getCounters("MythicalEgg").pulls, 22);
  checkEqual("the Stats table counts the new one once",
    totalOf(countsFor(StatsService.getSnapshot(), "Butterfly")), 11);

  stop();
});
