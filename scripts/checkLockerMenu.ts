// The Locker menu builds and its controls reach the locker.
//
// The menu is the only way players set the locker, and it cannot be opened
// outside the game. This builds it in a fake DOM and drives the controls a
// player uses most, checking that each one lands in the saved settings.
//
// Run with: npm run check:lockermenu
import "./_installFakeDom";
import { renderLockerMenu } from "../src/features/locker/menu";
import { lockerService } from "../src/features/locker/locker";
import { lockerRestrictionsService } from "../src/features/locker/restrictions";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

type El = HTMLElement & { children: El[]; click(): void; dispatchEvent(e: { type: string }): boolean };
const all = (root: Element, selector: string) => Array.from(root.querySelectorAll(selector)) as El[];
const byText = (root: Element, selector: string, text: string) =>
  all(root, selector).find((el) => (el.textContent ?? "").trim() === text);
const change = (input: El, checked: boolean) => {
  (input as unknown as HTMLInputElement).checked = checked;
  input.dispatchEvent({ type: "change" });
};

async function main() {
  // Sprite icons ask the mod's API for their images: never answered here.
  (globalThis as any).fetch = () => new Promise(() => {});
  const container = document.createElement("div") as unknown as El;
  await renderLockerMenu(container);
  const views = all(container, ".qmm-view");
  const view = (id: string) => views.find((v) => v.dataset.id === id)!;

  check("three tabs are built", views.length, 3);
  for (const v of views) check(`the ${v.dataset.id} tab renders without an error`, v.children.length > 0, true);

  // --- General ---------------------------------------------------------------
  const general = view("locker-general");
  const settings = () => lockerService.getState().settings;
  change(all(general, ".qmm-switch")[0], true);
  check("the Enabled switch turns the locker on", lockerService.getState().enabled, true);

  byText(general, ".qmm-btn", "Gold")!.click();
  check("the Gold button filters gold crops", settings().visualMutations.join(","), "Gold");

  byText(general, ".qmm-seg__btn", "Minimum")!.click();
  check("the Minimum size mode is saved", settings().scaleLockMode, "MINIMUM");

  const wetTile = all(general, ".lk-tile").find((tile) => tile.textContent?.includes("Wet"))!;
  change(all(wetTile, "input")[0], true);
  check("a weather tile adds its mutation", settings().weatherSelected.includes("Wet"), true);

  const recipesRadio = all(general, ".qmm-radio").find((r) => (r as unknown as HTMLInputElement).value === "RECIPES")!;
  change(recipesRadio, true);
  check("the Recipes mode is saved", settings().weatherMode, "RECIPES");

  byText(general, ".qmm-btn", "+ Recipe")!.click();
  const editor = all(general, ".lk-recipe")[0];
  const frozen = all(editor, ".lk-tile").find((tile) => tile.textContent?.includes("Frozen"))!;
  change(all(frozen, "input")[0], true);
  byText(editor, ".qmm-btn", "✔️")!.click();
  check("a saved recipe row is stored", JSON.stringify(settings().weatherRecipes), '[["Frozen"]]');

  // --- Overrides -------------------------------------------------------------
  const overrides = view("locker-overrides");
  const carrot = all(overrides, ".qmm-vtab").find((tab) => tab.dataset.id === "Carrot")!;
  check("every crop is listed", all(overrides, ".qmm-vtab").length > 10, true);
  carrot.click();
  const detail = all(overrides, ".lk-overrides__detail")[0];
  check("selecting a crop opens its settings", all(detail, ".lk-settings").length, 1);
  change(all(detail, ".qmm-switch")[0], true);
  const carrotOverride = lockerService.getState().overrides.Carrot;
  check("the Override switch gives the crop its own filters", carrotOverride?.enabled, true);
  check("which start as a copy of the global ones", carrotOverride?.settings.visualMutations.join(","), "Gold");

  // --- Restrictions ----------------------------------------------------------
  const restrictions = view("locker-restrictions");
  const decorCard = all(restrictions, ".qmm-card").find((c) => c.textContent?.includes("Decor pick locker"))!;
  change(all(decorCard, ".qmm-switch")[0], true);
  check("the decor switch locks decor pickup", lockerRestrictionsService.isDecorPickupLocked(), true);

  const eggCard = all(restrictions, ".qmm-card").find((c) => c.textContent?.includes("Egg hatch locker"))!;
  const eggRows = all(eggCard, ".qmm-setting-row");
  check("every egg of the catalog is listed", eggRows.length > 3, true);
  change(all(eggRows[0], ".qmm-switch")[0], true);
  check("an egg switch locks that egg", Object.values(lockerRestrictionsService.getState().eggLocks).includes(true), true);

  const petsCard = all(restrictions, ".qmm-card").find((c) => c.textContent?.includes("Sell all pets protections"))!;
  change(all(petsCard, ".qmm-switch")[1], false);
  check("a protection switch is saved", lockerRestrictionsService.getSellAllPetsRules().protectGold, false);

  console.log(failed ? `${failed} FAILURE(S)` : "All checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("FAIL the menu threw", error);
  process.exit(1);
});
