// The Misc menu's small cards: display, movement, inventory, auto reconnect.
// Each one is a few setting rows, in the order players reach for them.

import { clamp } from "../../lib/math";
import { pill } from "../../ui/kit/badges";
import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import { numberInput } from "../../ui/kit/fields";
import { settingRow } from "../../ui/kit/layout";
import { slider } from "../../ui/kit/sliders";
import { switchInput } from "../../ui/kit/toggles";
import {
  AUTO_RECO_TEMPORARILY_DISABLED,
  readAutoRecoDelayMs,
  readAutoRecoEnabled,
  writeAutoRecoDelayMs,
  writeAutoRecoEnabled,
} from "../autoReco/settings";
import { autoStores } from "../autoStore/stores";
import { readShowCropPrice, writeShowCropPrice } from "../cropPrice/setting";
import { openGardenView } from "./gardenView";
import { readGhostDelayMs, readGhostEnabled, setGhostDelayMs, setGhostEnabled } from "./ghost";
import { readInventorySlotReserveEnabled, writeInventorySlotReserveEnabled } from "./inventoryReserve";
import { sectionCard } from "./sectionCard";

const AUTO_RECO_MAX_SECONDS = 300;
const AUTO_RECO_STEP_SECONDS = 30;
const MOVE_DELAY_MIN_MS = 10;
const MOVE_DELAY_MAX_MS = 1000;
const MOVE_DELAY_DEFAULT_MS = 50;

/** `Instant`, `45 s`, `2 min`, `2 min 30 s`: the auto reconnect delay. */
const formatShortDuration = (seconds: number): string => {
  if (seconds <= 0) return "Instant";
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
};

export function buildDisplaySection(modalHost: () => HTMLElement): HTMLElement {
  const card = sectionCard("display", "Display", "What the mod adds to the game's screens.");

  // Applies at once: both price displays subscribe to the setting.
  const priceToggle = switchInput(readShowCropPrice(), writeShowCropPrice);

  const gardenViewButton = button("Open", {
    variant: "primary",
    size: "sm",
    onClick: () => openGardenView(modalHost()),
  });

  card.body.append(
    settingRow("Crop price", "A crop's sell price in its tooltip.", priceToggle).row,
    settingRow("Garden view", "Your whole garden as a flat grid, nothing hidden.", gardenViewButton).row,
  );
  return card.root;
}

export function buildMovementSection(): HTMLElement {
  const card = sectionCard("player", "Movement");

  const ghostToggle = switchInput(readGhostEnabled(), setGhostEnabled);

  const delayInput = numberInput(MOVE_DELAY_MIN_MS, MOVE_DELAY_MAX_MS, 5, readGhostDelayMs());
  delayInput.setAttribute("aria-label", "Step delay in milliseconds");
  delayInput.addEventListener("change", () => {
    const value = clamp(
      Math.floor(Number(delayInput.value) || MOVE_DELAY_DEFAULT_MS),
      MOVE_DELAY_MIN_MS,
      MOVE_DELAY_MAX_MS,
    );
    delayInput.value = String(value);
    setGhostDelayMs(value);
  });

  card.body.append(
    settingRow("Ghost mode", "Walk through anything in your way.", ghostToggle).row,
    settingRow("Step delay", "Milliseconds per step. Lower is faster.", delayInput.wrap).row,
  );
  return card.root;
}

const STORES = [
  { title: "Seed Silo", hint: "Seeds of a species it already holds.", icon: "sprite/decor/SeedSilo", store: autoStores.seedSilo },
  { title: "Decor Shed", hint: "Decor it already holds.", icon: "sprite/decor/DecorShed", store: autoStores.decorShed },
  { title: "Tool Shack", hint: "Tools it already holds.", icon: "sprite/decor/ToolShack", store: autoStores.toolShack },
];

export function buildInventorySection(): HTMLElement {
  const card = sectionCard("inventory", "Inventory", "Keep room free, and put away what already has a place.");

  const guardToggle = switchInput(readInventorySlotReserveEnabled(), writeInventorySlotReserveEnabled);
  card.body.append(
    settingRow("Keep one slot free", "At 99 of 100, refuses anything that needs a new slot.", guardToggle, {
      icon: "sprite/ui/InventoryBag",
      iconTag: "misc",
    }).row,
    h("div", "qws-misc-sub", "Auto-store new items in"),
  );

  for (const entry of STORES) {
    const control = switchInput(entry.store.isEnabled(), on => entry.store.setEnabled(on));
    card.body.append(settingRow(entry.title, entry.hint, control, { icon: entry.icon, iconTag: "misc" }).row);
  }
  return card.root;
}

export function buildAutoRecoSection(): HTMLElement {
  const card = sectionCard("autoReco", "Auto reconnect", "Log back in when this account opens in another session.");

  const featureDisabled = AUTO_RECO_TEMPORARILY_DISABLED;
  const initialSeconds = Math.round(readAutoRecoDelayMs() / 1000);

  const delaySlider = slider(0, AUTO_RECO_MAX_SECONDS, AUTO_RECO_STEP_SECONDS, initialSeconds, { fill: true });
  delaySlider.setAttribute("aria-label", "Reconnect delay");
  const delayValue = pill(formatShortDuration(initialSeconds));
  const delayControl = h("div", "qws-misc-range");
  delayControl.append(delaySlider, delayValue);

  const enabledToggle = switchInput(featureDisabled ? false : readAutoRecoEnabled(), on => {
    writeAutoRecoEnabled(on);
    delaySlider.disabled = !on;
  });
  enabledToggle.disabled = featureDisabled;
  delaySlider.disabled = featureDisabled || !readAutoRecoEnabled();

  const snapSeconds = (value: number) =>
    clamp(Math.round(value / AUTO_RECO_STEP_SECONDS) * AUTO_RECO_STEP_SECONDS, 0, AUTO_RECO_MAX_SECONDS);

  const applySeconds = (raw: number, persist: boolean) => {
    const seconds = snapSeconds(raw);
    delaySlider.value = String(seconds);
    delayValue.textContent = formatShortDuration(seconds);
    if (persist) writeAutoRecoDelayMs(seconds * 1000);
  };
  delaySlider.addEventListener("input", () => applySeconds(Number(delaySlider.value), false));
  delaySlider.addEventListener("change", () => applySeconds(Number(delaySlider.value), true));

  if (featureDisabled) {
    card.body.append(
      h("div", "qws-misc-note", "Turned off for now, at the game developers' request. It should come back later."),
    );
  }
  card.body.append(
    settingRow("Enabled", null, enabledToggle).row,
    settingRow("Delay", "Wait before reconnecting.", delayControl).row,
  );
  return card.root;
}
