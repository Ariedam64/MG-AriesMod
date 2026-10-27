// Rapid fire on Action must not undo a pickup.
//
// Holding Action with Rapid fire on taps Space every 100 ms. Putting a plant
// in a pot puts the potted plant in hand, so the next tap, about 100 ms after
// the pot, planted it straight back: the pot was used up and the plant was in
// the garden again. Decor, edge decor, pets and crystals go the same way.
// After one of these pickups the loop has to wait for the key to be released
// and pressed again. Harvesting is what rapid fire is for, so it keeps going.
//
// Run with: npm run check:rapidfirepickup
import "./_keyboardDom";
import { check, run } from "./_check";
import { installGameKeybindsOnce } from "../src/features/keybinds/gameRemap";
import { setKeybindHoldDetection } from "../src/features/keybinds/keybinds";
import { runOutgoing } from "../src/game/ws/outgoing";
import { sleep } from "../src/lib/async";

const PICKUPS = ["PotPlant", "PickupDecor", "PickupEdgeDecor", "PickupPet", "PickupCrystal"];
/** Three ticks of the 10 Hz loop, with room to spare. */
const HOLD_MS = 350;

// The game's canvas: the synthetic keys land on the element the physical key hit.
const canvas = document.createElement("canvas");
document.body.appendChild(canvas);
let synthetic = 0;
canvas.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.code === "Space") synthetic++;
});

function physical(type: "keydown" | "keyup"): void {
  const event = {
    type, code: "Space", key: " ", target: canvas, repeat: false,
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {},
  };
  window.dispatchEvent(event as unknown as Event);
}

run(async () => {
  setKeybindHoldDetection("game.action", true);
  installGameKeybindsOnce();

  physical("keydown");
  check("holding Action starts rapid fire at once", synthetic === 1, `${synthetic} synthetic Space`);
  runOutgoing({ type: "HarvestCrop", slot: 0, slotsIndex: 0 });
  const beforeHarvest = synthetic;
  await sleep(HOLD_MS);
  check("rapid fire keeps going after a harvest", synthetic - beforeHarvest >= 2, `${synthetic - beforeHarvest} taps after HarvestCrop`);
  physical("keyup");
  await sleep(50);

  for (const type of PICKUPS) {
    physical("keydown");
    runOutgoing({ type, slot: 0 });
    const afterPickup = synthetic;
    await sleep(HOLD_MS);
    check(
      `no tap follows a ${type} while the key is still held`,
      synthetic === afterPickup,
      `${synthetic - afterPickup} synthetic Space in ${HOLD_MS} ms after ${type}, each one can put the item straight back`,
    );
    physical("keyup");
    await sleep(50);

    const beforePress = synthetic;
    physical("keydown");
    check(`rapid fire comes back on the next press after a ${type}`, synthetic > beforePress, "no tap on the new press");
    physical("keyup");
    await sleep(50);
  }
});
