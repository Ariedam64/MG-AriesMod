// The "Hatched" grid of an egg card counts that egg's hatches only (BR-5).
//
// FireHorse hatches from both the Amber Egg and the Horse Egg. The grid on each
// egg card read the global per-species table (`stats.pets.hatchedByType`), so
// three Fire Horses from the Horse Egg also showed up on the Amber Egg card,
// and its Total line went up by three. The pity counters were per egg all
// along and must stay that way.
//
// This runs the real hatch tracker on a fake store: the activity log gets two
// FireHorse hatches from the Horse Egg and one from the Amber Egg, then both
// egg cards are rendered and their FireHorse rows read back.

import "./_installFakeDom";
import { checkEqual, run } from "./_check";
import { createFakeStore, installFakeGame, primitive } from "./_fakeJotai";
import type { EggPity } from "../src/features/hatch/pity";

const store = createFakeStore();
const myData = primitive<any>({ activityLogs: [] }, "myDataAtom");
installFakeGame(store, {
  "/atoms/myAtoms.ts/myDataAtom": myData,
});

function hatchEntry(petId: string, species: string, eggId: string, timestamp: number) {
  return {
    timestamp,
    action: "hatchEgg",
    parameters: { eggId, pet: { id: petId, petSpecies: species, mutations: [] } },
  };
}

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
  const { sleep } = await import("../src/lib/async");
  const { startHatchTracker, HatchTracker } = await import("../src/features/hatch/tracker");
  const { createEggCard } = await import("../src/features/hatch/eggCard");
  const { countsFor, totalOf } = await import("../src/features/hatch/counts");
  const { StatsService } = await import("../src/features/stats/stats");

  // The 1753 spawn weights. No targets: the grid is what is under test.
  const amberEgg: EggPity = {
    eggId: "AmberEgg",
    name: "Amber Egg",
    rarity: "Legendary",
    fauna: [
      { species: "Rooster", share: 0.6 },
      { species: "RedFox", share: 0.33 },
      { species: "FireHorse", share: 0.05 },
      { species: "Phoenix", share: 0.02 },
    ],
    targets: [],
  };
  const horseEgg: EggPity = {
    eggId: "HorseEgg",
    name: "Horse Egg",
    rarity: "Rare",
    fauna: [
      { species: "Pony", share: 0.65 },
      { species: "Horse", share: 0.3 },
      { species: "FireHorse", share: 0.05 },
    ],
    targets: [],
  };

  // First run: the empty log is absorbed as history, then hatches count.
  const stop = await startHatchTracker();
  const before = totalOf(countsFor(StatsService.getSnapshot(), "FireHorse"));

  store.set(myData, {
    activityLogs: [
      hatchEntry("pet-horse-1", "FireHorse", "HorseEgg", 1_000),
      hatchEntry("pet-horse-2", "FireHorse", "HorseEgg", 2_000),
      hatchEntry("pet-amber-1", "FireHorse", "AmberEgg", 3_000),
    ],
  });
  await sleep(20);

  console.log("--- what stays global ---");
  checkEqual("the Stats table still counts every FireHorse hatched",
    totalOf(countsFor(StatsService.getSnapshot(), "FireHorse")) - before, 3);
  checkEqual("the Horse Egg saw two pulls", HatchTracker.getCounters("HorseEgg").pulls, 2);
  checkEqual("the Amber Egg saw one pull", HatchTracker.getCounters("AmberEgg").pulls, 1);

  const render = (egg: EggPity) => createEggCard({
    egg,
    stats: StatsService.getSnapshot(),
    showOffsets: false,
    collapsed: false,
    onToggle: () => {},
  });

  console.log("\n--- the Amber Egg card ---");
  const amber = render(amberEgg);
  checkEqual("its FireHorse row counts only the one from the Amber Egg",
    speciesRow(amber, "FireHorse"), ["1", "0", "0", "1"]);
  checkEqual("its Total line does not take in the Horse Egg's Fire Horses",
    totalRow(amber), ["1", "0", "0", "1"]);

  console.log("\n--- the Horse Egg card ---");
  const horse = render(horseEgg);
  checkEqual("its FireHorse row counts only the two from the Horse Egg",
    speciesRow(horse, "FireHorse"), ["2", "0", "0", "2"]);
  checkEqual("its Total line does not take in the Amber Egg's Fire Horse",
    totalRow(horse), ["2", "0", "0", "2"]);

  stop();
});
