// The garden editor's panels, built in a fake DOM and driven like a player
// would: the item picker's slot settings, and the current item panel writing
// a placed plant's slots to the plan.
//
// What this guards:
//   - "Edit all slots together" moves every slot, in the brush and on a
//     placed plant, and keeps every slot's controls showing what was written;
//   - without it, a slider only touches its own slot;
//   - a blank custom size writes nothing (it used to write size 0);
//   - mutations and extra slots land on the planned plant.
//
// Run with: npm run check:editorpanels

import { installFakeDom } from "./_fakeDom";
import { showItemPicker, hideItemPicker } from "../src/features/editor/ui/itemPicker";
import { showCurrentItemPanel, hideCurrentItemPanel } from "../src/features/editor/ui/currentItemPanel";
import { brushSlotsFor, picker } from "../src/features/editor/brush";
import { brushPlantObject, defaultBrushSlot } from "../src/features/editor/brushSlots";
import { makeEmptyGarden, tileObjectAt, withTileObject } from "../src/features/editor/gardenModel";
import { getPlannedGarden, setPlannedGarden } from "../src/features/editor/plannedGarden";
import { setCurrentEditorTile } from "../src/features/editor/session";
import type { EditorTileTarget } from "../src/features/editor/tileMap";

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

installFakeDom();
const doc = document as any;
doc.contains = (node: any) => doc.documentElement.contains(node);
// The audio player scans the page's URL once it loads.
(globalThis as any).location ??= { href: "https://magicgarden.gg/", origin: "https://magicgarden.gg" };

type El = any;
const all = (root: El, selector: string): El[] => root.querySelectorAll(selector);
const byId = (id: string): El => doc.getElementById(id);
const fire = (el: El, type: string) => el.dispatchEvent({ type, preventDefault() {}, stopPropagation() {} });
const setValue = (el: El, value: string, type: string) => {
  el.value = value;
  fire(el, type);
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function main(): Promise<void> {
  /* --------------------------- picker, brush slots -------------------------- */

  // Strawberry grows five slots in the bundled catalog.
  picker.mode = "plants";
  picker.selectedPlantId = "Strawberry";
  showItemPicker();
  const details = () => byId("qws-editor-side-details");
  check("picker: one slot box per brush slot", all(details(), ".qws-pnl-range").length, 5);

  setValue(all(details(), ".qws-pnl-range")[1], "80", "input");
  check(
    "brush: a slider moves only its own slot",
    brushSlotsFor("Strawberry").slots.map((s) => s.sizePercent),
    [50, 80, 50, 50, 50],
  );

  const editAll = all(details(), ".qmm-switch")[0];
  editAll.checked = true;
  fire(editAll, "change");
  setValue(all(details(), ".qws-pnl-range")[0], "65", "input");
  check(
    "brush, edit all: every slot takes the size",
    brushSlotsFor("Strawberry").slots.map((s) => s.sizePercent),
    [65, 65, 65, 65, 65],
  );
  check(
    "brush, edit all: every slider shows it",
    all(details(), ".qws-pnl-range").map((s: El) => s.value),
    ["65", "65", "65", "65", "65"],
  );

  const firstMode = all(details(), ".qmm-switch")[1];
  firstMode.checked = true;
  fire(firstMode, "change");
  const field = all(details(), ".qmm-input")[0];
  setValue(field, "7", "input");
  check("brush: a half typed custom size stays in its field", field.value, "7");
  check("brush: it is stored clamped", brushSlotsFor("Strawberry").slots[0].customScale, 50);
  check("brush, edit all: the other fields show the stored size", all(details(), ".qmm-input")[1].value, "50");
  hideItemPicker();
  check("picker: hiding removes it", byId("qws-editor-side"), null);

  /* ----------------------- current item, placed plant ----------------------- */

  const target: EditorTileTarget = { tileType: "Dirt", localTileIndex: 4, userSlotIdx: 0 };
  const plant = brushPlantObject("Strawberry", [defaultBrushSlot(), defaultBrushSlot(), defaultBrushSlot()], 5);
  setPlannedGarden(withTileObject(makeEmptyGarden(), "Dirt", 4, plant));
  setCurrentEditorTile(target);
  showCurrentItemPanel();
  const panel = () => byId("qws-editor-current-item");
  const planSlots = () => tileObjectAt(getPlannedGarden(), "Dirt", 4)?.slots ?? [];

  check("current item: one slot box per slot", all(panel(), ".qws-pnl-range").length, 3);

  setValue(all(panel(), ".qws-pnl-range")[1], "90", "input");
  check("placed plant: a slider writes only its slot", planSlots().map((s: any) => s.size), [50, 90, 50]);

  const customInputs = () => all(panel(), ".qmm-input");
  setValue(customInputs()[0], "", "change");
  check("placed plant: a blank custom size writes nothing", planSlots().map((s: any) => s.size), [50, 90, 50]);

  const switches = () => all(panel(), ".qmm-switch");
  // The first switch is "Edit all slots together", then one per slot.
  const editAllPlaced = switches()[0];
  editAllPlaced.checked = true;
  fire(editAllPlaced, "change");
  const modeOfLast = switches()[3];
  modeOfLast.checked = true;
  fire(modeOfLast, "change");
  check(
    "placed plant, edit all: the custom toggle switches every slot",
    switches().slice(1).map((s: El) => s.checked),
    [true, true, true],
  );
  check("placed plant, edit all: every slot gets that slot's size", planSlots().map((s: any) => s.size), [50, 50, 50]);

  setValue(customInputs()[2], "75", "change");
  check("placed plant, edit all: a custom size lands on every slot", planSlots().map((s: any) => s.size), [75, 75, 75]);
  check(
    "placed plant, edit all: every field shows it",
    customInputs().map((i: El) => i.value),
    ["75", "75", "75"],
  );

  editAllPlaced.checked = false;
  fire(editAllPlaced, "change");
  const addGold = all(panel(), "button").find((b: El) => b.title === "Add Gold");
  addGold.click();
  await tick();
  check("placed plant: a mutation lands on its slot", planSlots().map((s: any) => s.mutations), [["Gold"], [], []]);
  check(
    "placed plant: the slot shows it as active",
    all(panel(), "button").filter((b: El) => b.title === "Remove Gold").length,
    1,
  );

  const plus = all(panel(), "button").find((b: El) => b.textContent === "+");
  plus.click();
  await tick();
  check("placed plant: + adds a slot", planSlots().length, 4);
  check("placed plant: the panel redraws with it", all(panel(), ".qws-pnl-range").length, 4);

  hideCurrentItemPanel();
  check("current item: hiding removes it", byId("qws-editor-current-item"), null);
}

main()
  .catch((error) => {
    failures += 1;
    console.error("FAIL the check threw", error);
  })
  .finally(() => {
    if (failures) {
      console.error(`\n${failures} check(s) failed`);
      process.exit(1);
    }
    console.log("\nall editor panel checks passed");
    process.exit(0);
  });
