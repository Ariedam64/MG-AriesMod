// Ability chips take their colour from the live abilities catalog.
//
// The live API now gives every ability its colour as a hex string. The step
// that turns colours into the chips' `{ bg, hover }` pair took any `color`
// field as already converted and skipped, so the chips never saw the API
// colour and fell back to a hand-written table. Abilities missing from that
// table (Rebirth, Dust Boost, the Amber Moon ones) showed up grey.
//
// Run with: npm run check:abilitycolors

import { checkEqual, done } from "./_check";
import { captureState } from "../src/data/live/state";
import { startColorPolling } from "../src/data/live/abilityColors";
import { getAbilityChipColors } from "../src/features/pets/abilityChipColors";

(captureState.data as Record<string, unknown>).abilities = {
  ProduceScaleBoost: { name: "Crop Size Boost I", color: "#228B22" },
  AmberCapture: { name: "Amber Capture", color: "#D9822B" },
  GoldGranter: { name: "Gold Granter", color: "linear-gradient(135deg, #DCC846 0%, #C8AF1E 100%)" },
};

startColorPolling();

setTimeout(() => {
  checkEqual("an ability missing from the hand-written table takes the API colour", getAbilityChipColors("AmberCapture"), {
    bg: "rgba(217, 130, 43, 0.9)",
    hover: "rgba(217, 130, 43, 1)",
  });
  checkEqual("a known ability reads the same colour as before", getAbilityChipColors("ProduceScaleBoost"), {
    bg: "rgba(34, 139, 34, 0.9)",
    hover: "rgba(34, 139, 34, 1)",
  });
  checkEqual("a gradient is used as it is", getAbilityChipColors("GoldGranter").bg, "linear-gradient(135deg, #DCC846 0%, #C8AF1E 100%)");

  done();
}, 1_500);
