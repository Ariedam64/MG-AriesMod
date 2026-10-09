// Values derived from the catalogs must follow the live data that lands after
// import.
//
// The catalogs serve the live API first and the bundled copy as a fallback,
// but at document-start the API has not answered. A module-level constant
// built from a catalog was therefore pinned to the bundled copy for the whole
// session: a mutation multiplier the game changed, or a mutation it added,
// never reached crop prices.
//
// Run with: npm run check:cataloglive

import { checkEqual, done } from "./_check";
import { captureState } from "../src/data/live/state";
import { memoOnCatalogs } from "../src/data";
import { estimateProduceValue } from "../src/data/rules/cropValue";

const flatPrice = { getBasePrice: () => 100, sizeMultiplier: () => 1 };
const price = (mutations: string[]) => estimateProduceValue("Carrot", 50, mutations, flatPrice);

// Before the API answers: the bundled copy.
let derivations = 0;
const mutationKeys = memoOnCatalogs(() => {
  derivations += 1;
  return Object.keys(captureState.data.mutations ?? {});
});
checkEqual("a memo derives on first use", mutationKeys(), []);
mutationKeys();
checkEqual("and not again while the catalogs are unchanged", derivations, 1);

checkEqual("Wet doubles the price from the bundled copy", price(["Wet"]), 200);

// The API answers, shaped like the real payload.
(captureState.data as Record<string, unknown>).mutations = {
  Gold: { name: "Gold", baseChance: 0.01, coinMultiplier: 25, group: "Growth" },
  Rainbow: { name: "Rainbow", baseChance: 0.001, coinMultiplier: 50, group: "Growth" },
  Prismatic: { name: "Prismatic", baseChance: 0.0005, coinMultiplier: 80, group: "Growth" },
  Wet: { name: "Wet", baseChance: 0, coinMultiplier: 3, group: "Hydro" },
  Chilled: { name: "Chilled", baseChance: 0, coinMultiplier: 2, group: "Hydro" },
  Dawnlit: { name: "Dawnlit", baseChance: 0, coinMultiplier: 4, group: "Lunar" },
};

checkEqual("the memo derives again once live data lands", mutationKeys().includes("Prismatic"), true);
checkEqual("a multiplier the game changed reaches the price", price(["Wet"]), 300);

done();
