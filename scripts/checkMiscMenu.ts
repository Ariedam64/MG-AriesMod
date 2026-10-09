// The Misc menu builds, every control in it still reaches its setting, and a
// deleter card shows one state at a time.
//
// The menu cannot be opened outside the game. This builds it in a fake DOM,
// drives the controls a player uses, and checks each lands in the saved
// settings. The deleter card is driven with a stand-in controller, so no run
// touches the game.
//
// Run with: npm run check:miscmenu
import { checkEqual, run } from "./_check";
import "./_installFakeDom";
import { Emitter } from "../src/lib/emitter";
import { readAriesPath } from "../src/platform/storage";
import { renderMiscMenu } from "../src/features/misc/menu";
import { createDeleterSection } from "../src/features/deleters/section";
import type { DeleterController, DeleterEvent } from "../src/features/deleters/run";

type El = HTMLElement & { children: El[]; click(): void; dispatchEvent(e: { type: string }): boolean };
const all = (root: Element, selector: string) => Array.from(root.querySelectorAll(selector)) as El[];
const text = (el: Element) => (el.textContent ?? "").trim();
const rowNamed = (root: Element, title: string) =>
  all(root, ".qmm-setting-row").find((row) => text(row.querySelector(".qmm-setting-row__title")!) === title)!;
const change = (input: El, value: { checked?: boolean; value?: string }) => {
  if (value.checked !== undefined) (input as unknown as HTMLInputElement).checked = value.checked;
  if (value.value !== undefined) (input as unknown as HTMLInputElement).value = value.value;
  input.dispatchEvent({ type: "change" });
};
const button = (root: Element, label: string) => all(root, ".qmm-btn").find((b) => text(b) === label)!;
const shown = (el: El | null | undefined) => !!el && !(el as any).hidden;

function fakeController(): DeleterController & { running: boolean; paused: boolean; release(): void } {
  let selection: ReturnType<DeleterController["getSelection"]> = [];
  let release = () => {};
  const controller = {
    events: new Emitter<DeleterEvent>(),
    running: false,
    paused: false,
    getSelection: () => selection,
    setSelection: (entries: typeof selection) => { selection = entries; },
    clearSelection: () => { selection = []; },
    run: () => {
      controller.running = true;
      return new Promise<void>((resolve) => {
        release = () => {
          controller.running = false;
          resolve();
        };
      });
    },
    isRunning: () => controller.running,
    isPaused: () => controller.paused,
    pause: () => { controller.paused = true; },
    resume: () => { controller.paused = false; },
    cancel: () => release(),
    release: () => release(),
  };
  return controller;
}

async function main() {
  // Sprite icons ask the mod's API for their images: never answered here.
  (globalThis as any).fetch = () => new Promise(() => {});

  // --- The menu ---------------------------------------------------------------
  const container = document.createElement("div") as unknown as El;
  await renderMiscMenu(container);
  const cards = all(container, ".qmm-collapse");
  checkEqual(
    "the cards come in order, everyday ones first",
    cards.map((card) => text(card.querySelector(".qmm-section-label")!)),
    ["Display", "Movement", "Inventory", "Seed deleter", "Decor deleter", "Auto reconnect"],
  );

  change(rowNamed(container, "Crop price").querySelector(".qmm-switch") as El, { checked: false });
  checkEqual("the Crop price switch is saved", readAriesPath("misc.showCropPrice"), false);
  checkEqual("Garden view has its button", !!button(rowNamed(container, "Garden view"), "Open"), true);
  const debugSwitch = rowNamed(container, "Debug menu")?.querySelector(".qmm-switch") as El;
  checkEqual("the Debug menu switch starts off", (debugSwitch as any)?.checked, false);
  change(debugSwitch, { checked: true });
  checkEqual("the Debug menu switch is saved", readAriesPath("misc.showDebugMenu"), true);

  change(rowNamed(container, "Ghost mode").querySelector(".qmm-switch") as El, { checked: true });
  checkEqual("the Ghost mode switch is saved", readAriesPath("misc.ghostMode"), true);
  change(rowNamed(container, "Ghost mode").querySelector(".qmm-switch") as El, { checked: false });
  const delay = rowNamed(container, "Step delay").querySelector("input") as unknown as El;
  change(delay, { value: "3" });
  checkEqual("the step delay is held at its minimum", readAriesPath("misc.ghostDelayMs"), 10);
  change(delay, { value: "120" });
  checkEqual("the step delay is saved", readAriesPath("misc.ghostDelayMs"), 120);

  change(rowNamed(container, "Keep one slot free").querySelector(".qmm-switch") as El, { checked: true });
  checkEqual("the keep a slot free switch is saved", readAriesPath("misc.keepInventorySlotFree"), true);
  for (const title of ["Seed Silo", "Decor Shed", "Tool Shack"]) {
    checkEqual(`the ${title} auto-store has its switch`, !!rowNamed(container, title)?.querySelector(".qmm-switch"), true);
  }

  const autoReco = cards[5];
  checkEqual("auto reconnect says why it is off", !!autoReco.querySelector(".qws-misc-note"), true);
  checkEqual("its switch cannot be turned on", (rowNamed(autoReco, "Enabled").querySelector(".qmm-switch") as any).disabled, true);
  checkEqual("its delay cannot be moved", (rowNamed(autoReco, "Delay").querySelector("input") as any).disabled, true);

  // --- A deleter card -----------------------------------------------------------
  const controller = fakeController();
  const card = createDeleterSection({
    sprite: "sprite/ui/SeedIcon",
    title: "Seed deleter",
    description: "",
    groupNoun: { one: "species", many: "species" },
    unitNoun: { one: "seed", many: "seeds" },
    storageLabel: "Seed Silo",
    selectLabel: "Choose seeds",
    clearLabel: "Clear",
    spriteCategories: ["seed"],
    fallbackIcon: "",
    estimateDelayMs: 35,
    runDelayMs: 35,
    collapsed: false,
    onToggleCollapsed: () => {},
    controller,
    openSelector: async () => {
      controller.setSelection([
        { id: "Carrot", label: "Carrot", qty: 40, fromStorage: 10 },
        { id: "Aloe", label: "Aloe", qty: 1, fromStorage: 0 },
      ]);
    },
  }) as unknown as El;
  const part = (selector: string) => card.querySelector(selector) as El;

  checkEqual("an empty card shows its empty state", shown(part(".qws-del-empty")), true);
  checkEqual("an empty card hides the selection", shown(part(".qws-del-selection")), false);
  checkEqual("picking is the empty card's primary action", button(card, "Choose seeds").classList.contains("qmm-btn--primary"), true);
  checkEqual("there is nothing to clear or start yet", [shown(button(card, "Clear")), shown(button(card, "Start deleting"))], [false, false]);

  button(card, "Choose seeds").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  checkEqual("a selection replaces the empty state", [shown(part(".qws-del-empty")), shown(part(".qws-del-selection"))], [false, true]);
  checkEqual("the totals read as a phrase", text(part(".qws-del-totals__value")), "41 seeds");
  checkEqual("the kinds are counted", text(part(".qws-del-totals__groups")), "2 species");
  checkEqual("what comes from storage is flagged", text(part(".qws-del-totals").querySelector(".qmm-pill")!), "10 from the Seed Silo");
  checkEqual("each pick gets a chip", all(card, ".qws-del-chip").length, 2);
  checkEqual("starting is now the action, picking steps back", button(card, "Choose seeds").classList.contains("qmm-btn--primary"), false);
  checkEqual("clear and start are offered", [shown(button(card, "Clear")), shown(button(card, "Start deleting"))], [true, true]);

  button(card, "Start deleting").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.events.emit({ type: "progress", done: 5, total: 41, label: "Carrot" });
  checkEqual("a run shows only its progress", [shown(part(".qws-del-selection")), shown(part(".qws-del-progress"))], [false, true]);
  checkEqual("the progress counts", text(part(".qws-del-progress__count")), "5 / 41");
  checkEqual(
    "a run offers pause and stop, nothing else",
    ["Choose seeds", "Clear", "Start deleting", "Pause", "Resume", "Stop"].map((label) => shown(button(card, label))),
    [false, false, false, true, false, true],
  );
  button(card, "Pause").click();
  checkEqual("a paused run offers resume", [shown(button(card, "Pause")), shown(button(card, "Resume"))], [false, true]);

  controller.release();
  controller.events.emit({ type: "finished" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  checkEqual("after the run the selection is back", [shown(part(".qws-del-selection")), shown(part(".qws-del-progress"))], [true, false]);

  button(card, "Clear").click();
  checkEqual("clearing brings the empty state back", shown(part(".qws-del-empty")), true);
  checkEqual("and hides start", shown(button(card, "Start deleting")), false);
}

run(main);
