// Values derived from the catalogs must follow the live data that lands after
// import.
//
// The catalogs serve the live API first and the bundled copy as a fallback,
// but at document-start the API has not answered. A module-level constant
// built from a catalog was therefore pinned to the bundled copy for the whole
// session: a mutation multiplier the game changed, or a mutation it added,
// never reached crop prices or the companion's garden reading.
//
// The live entries are also shaped differently from the bundled ones (no
// `tileRef` on mutations, for one), so reading them must not misclassify what
// the bundled copy got right.
//
// Run with: npm run check:cataloglive

import { captureState } from "../src/data/live/state";
import { memoOnCatalogs } from "../src/data";
import { estimateProduceValue } from "../src/data/rules/cropValue";
import { scanGarden } from "../src/features/companion/chat/gardenScan";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
}

const flatPrice = { getBasePrice: () => 100, sizeMultiplier: () => 1 };
const price = (mutations: string[]) => estimateProduceValue("Carrot", 50, mutations, flatPrice);

function scanMutations(mutations: string[]) {
  const garden = {
    0: { objectType: "plant", species: "Carrot", slots: [{ slotId: 0, startTime: 0, endTime: 1, mutations }] },
  };
  const crop = scanGarden(garden, new Set(["Carrot"])).plants[0]?.crops[0];
  return { color: crop?.colorMutations, weather: crop?.weatherMutations };
}

// Before the API answers: the bundled copy.
let derivations = 0;
const mutationKeys = memoOnCatalogs(() => {
  derivations += 1;
  return Object.keys(captureState.data.mutations ?? {});
});
check("a memo derives on first use", mutationKeys(), []);
mutationKeys();
check("and not again while the catalogs are unchanged", derivations, 1);

check("Wet doubles the price from the bundled copy", price(["Wet"]), 200);
check("Gold is a color mutation in the bundled copy", scanMutations(["Gold", "Wet"]), { color: ["Gold"], weather: ["Wet"] });

// The API answers, shaped like the real payload.
(captureState.data as Record<string, unknown>).mutations = {
  Gold: { name: "Gold", baseChance: 0.01, coinMultiplier: 25, group: "Growth" },
  Rainbow: { name: "Rainbow", baseChance: 0.001, coinMultiplier: 50, group: "Growth" },
  Prismatic: { name: "Prismatic", baseChance: 0.0005, coinMultiplier: 80, group: "Growth" },
  Wet: { name: "Wet", baseChance: 0, coinMultiplier: 3, group: "Hydro" },
  Chilled: { name: "Chilled", baseChance: 0, coinMultiplier: 2, group: "Hydro" },
  Dawnlit: { name: "Dawnlit", baseChance: 0, coinMultiplier: 4, group: "Lunar" },
};

check("the memo derives again once live data lands", mutationKeys().includes("Prismatic"), true);
check("a multiplier the game changed reaches the price", price(["Wet"]), 300);
check("a color mutation the game added is read as one", scanMutations(["Prismatic"]).color, ["Prismatic"]);
check("live weather mutations, which have no tileRef, are not color", scanMutations(["Gold", "Wet"]), {
  color: ["Gold"],
  weather: ["Wet"],
});

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall live catalog checks passed");
