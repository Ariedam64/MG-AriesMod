// Sanity check for the Crop Size rework: value/weight must match the game's own
// `1 + (maxSizeMultiplier - 1) * (size - 50) / 50` formula.
import { cropSizeMultiplier, cropWeight, readCropSize } from "../src/utils/cropSize";
import { estimateProduceValue } from "../src/utils/calculators";

const cases: Array<[string, number, number]> = [
  // species, size, expected coins (baseSellPrice * multiplier)
  ["Carrot", 50, 20],
  ["Carrot", 100, 60],
  ["Carrot", 75, 40],
  ["Banana", 50, 1750],
  ["Banana", 100, 2975],
];

let failed = 0;
for (const [species, size, expected] of cases) {
  const got = estimateProduceValue(species, size, []);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${species}@${size} -> ${got} (expected ${expected}) mult=${cropSizeMultiplier(species, size).toFixed(4)}`);
}

console.log("readCropSize size:", readCropSize({ species: "Carrot", size: 73 }));
console.log("readCropSize legacy scale 2 (maxScale 3):", readCropSize({ species: "Carrot", scale: 2 }));
console.log("readCropSize none:", readCropSize({ species: "Carrot" }));
console.log("weight Carrot@100:", cropWeight("Carrot", 100));
console.log(failed ? `${failed} FAILURES` : "all good");
process.exit(failed ? 1 : 0);
