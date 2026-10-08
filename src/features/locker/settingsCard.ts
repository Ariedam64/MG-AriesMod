// The locker's filter settings, shared by the global tab and each species
// override: harvest mode, size, colour, weather and weather recipes. The
// controls edit a settings draft in place and call `onChange` after each edit.

import { CROP_SIZE_MAX, CROP_SIZE_MIN } from "../../data/rules/cropSize";
import { pill } from "../../ui/kit/badges";
import { button, type KitButton } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { radioGroup } from "../../ui/kit/fields";
import { segmented } from "../../ui/kit/segmented";
import { rangeDual, slider } from "../../ui/kit/sliders";
import type { LockerScaleLockMode, VisualTag, WeatherMode } from "./settings";
import { normalizeScaleRange } from "./settings";
import type { SettingsDraft } from "./settingsDraft";
import { weatherGrid, weatherTile } from "./weatherPicker";
import { weatherRecipeEditor } from "./weatherRecipes";
import { weatherMutations } from "./weatherTags";

export type SettingsCard = {
  root: HTMLElement;
  /** Puts every control back in line with the draft. */
  refresh(): void;
  /** Greys the card out and blocks it, while its locker or override is off. */
  setDisabled(disabled: boolean): void;
};

const div = (className: string, text?: string): HTMLDivElement => {
  const el = document.createElement("div");
  el.className = className;
  if (text != null) el.textContent = text;
  return el;
};

const section = (title: string, ...content: HTMLElement[]): HTMLElement => {
  const { root, body } = card(title, { align: "center" });
  body.append(...content);
  return root;
};

/** "Min 62" style read-out under a slider. */
function sliderValue(label: string): { root: HTMLElement; value: HTMLSpanElement } {
  const root = div("lk-value");
  const value = pill("");
  root.append(div("qmm-label", label), value);
  return { root, value };
}

let weatherModeGroups = 0;

export function lockerSettingsCard(state: SettingsDraft, onChange: () => void): SettingsCard {
  const root = div("lk-settings");
  root.dataset.lockerSettingsCard = "1";

  // ---- harvest mode --------------------------------------------------------
  const lockModeHint = div("lk-hint");
  // In LOCK mode a size filter covering every size blocks every crop, while
  // its sliders at 50 and 100 look like no filter at all. This says so.
  const lockWarning = div("lk-warning");
  const lockMode = segmented<"lock" | "allow">(
    [
      { value: "lock", label: "Lock" },
      { value: "allow", label: "Allow" },
    ],
    state.lockMode === "ALLOW" ? "allow" : "lock",
    (value) => {
      const next = value === "allow" ? "ALLOW" : "LOCK";
      if (next === state.lockMode) return;
      state.lockMode = next;
      showLockMode();
      recipes.refresh();
      onChange();
    },
    { ariaLabel: "Harvest mode" },
  );

  const locksEverySize = (): boolean => {
    if (state.lockMode !== "LOCK") return false;
    switch (state.scaleLockMode) {
      case "RANGE": return state.minScalePct <= CROP_SIZE_MIN && state.maxScalePct >= CROP_SIZE_MAX;
      case "MINIMUM": return state.minScalePct <= CROP_SIZE_MIN;
      case "MAXIMUM": return state.maxScalePct >= CROP_SIZE_MAX;
      default: return false;
    }
  };
  const showLockWarning = () => {
    const blocked = locksEverySize();
    lockWarning.hidden = !blocked;
    lockWarning.textContent = blocked
      ? "This size filter covers every size, so nothing can be harvested. Pick None to stop filtering by size."
      : "";
  };
  const showLockMode = () => {
    const value = state.lockMode === "ALLOW" ? "allow" : "lock";
    if (lockMode.get() !== value) lockMode.set(value);
    lockModeHint.textContent =
      value === "allow"
        ? "Harvest only when every active filter category matches"
        : "Harvest is locked whenever any active filter matches";
    showLockWarning();
  };

  // ---- size ----------------------------------------------------------------
  type ScaleValue = "none" | "minimum" | "maximum" | "ranged";
  const SCALE_MODES: Record<ScaleValue, LockerScaleLockMode> = {
    none: "NONE",
    minimum: "MINIMUM",
    maximum: "MAXIMUM",
    ranged: "RANGE",
  };
  const scaleValueOf = (mode: LockerScaleLockMode) =>
    (Object.keys(SCALE_MODES) as ScaleValue[]).find((key) => SCALE_MODES[key] === mode) ?? "none";

  const scaleMode = segmented<ScaleValue>(
    [
      { value: "none", label: "None" },
      { value: "minimum", label: "Minimum" },
      { value: "maximum", label: "Maximum" },
      { value: "ranged", label: "Range" },
    ],
    scaleValueOf(state.scaleLockMode),
    (value) => {
      const mode = SCALE_MODES[value];
      if (mode === state.scaleLockMode) return;
      state.scaleLockMode = mode;
      // A range opened from the other modes' bounds is made valid before it is saved.
      if (mode === "RANGE") {
        range.setValues(state.minScalePct, state.maxScalePct);
        readRange(true);
      }
      showScale();
      onChange();
    },
    { ariaLabel: "Scale lock mode" },
  );

  const minSlider = slider(CROP_SIZE_MIN, CROP_SIZE_MAX, 1, state.minScalePct, { fill: true });
  const maxSlider = slider(CROP_SIZE_MIN, CROP_SIZE_MAX, 1, state.maxScalePct, { fill: true });
  const range = rangeDual(CROP_SIZE_MIN, CROP_SIZE_MAX, 1, state.minScalePct, state.maxScalePct);
  for (const el of [minSlider, maxSlider, range.root]) el.classList.add("lk-slider");

  const minValue = sliderValue("Minimum");
  const maxValue = sliderValue("Maximum");
  const rangeMin = sliderValue("Min");
  const rangeMax = sliderValue("Max");
  const rangeValues = div("lk-values");
  rangeValues.append(rangeMin.root, rangeMax.root);

  const minControls = div("lk-column");
  minControls.append(minSlider, minValue.root);
  const maxControls = div("lk-column");
  maxControls.append(maxSlider, maxValue.root);
  const rangeControls = div("lk-column");
  rangeControls.append(range.root, rangeValues);

  /** Reads the range thumbs, keeping at least one point between them. */
  const readRange = (commit: boolean) => {
    const { min, max } = normalizeScaleRange("RANGE", range.min.value, range.max.value);
    range.setValues(min, max);
    rangeMin.value.textContent = String(min);
    rangeMax.value.textContent = String(max);
    if (!commit) return;
    state.minScalePct = min;
    state.maxScalePct = max;
    showLockWarning();
  };
  const readSingle = (input: HTMLInputElement, read: { value: HTMLSpanElement }, key: "minScalePct" | "maxScalePct", commit: boolean) => {
    const n = Number.parseInt(input.value, 10);
    const value = Number.isFinite(n) ? n : state[key];
    read.value.textContent = String(value);
    if (!commit) return;
    state[key] = value;
    showLockWarning();
  };

  minSlider.addEventListener("input", () => readSingle(minSlider, minValue, "minScalePct", false));
  minSlider.addEventListener("change", () => {
    readSingle(minSlider, minValue, "minScalePct", true);
    onChange();
  });
  maxSlider.addEventListener("input", () => readSingle(maxSlider, maxValue, "maxScalePct", false));
  maxSlider.addEventListener("change", () => {
    readSingle(maxSlider, maxValue, "maxScalePct", true);
    onChange();
  });
  for (const thumb of [range.min, range.max]) {
    thumb.addEventListener("input", () => readRange(false));
    thumb.addEventListener("change", () => {
      readRange(true);
      onChange();
    });
  }

  const showScale = () => {
    const mode = state.scaleLockMode;
    if (scaleMode.get() !== scaleValueOf(mode)) scaleMode.set(scaleValueOf(mode));
    minControls.hidden = mode !== "MINIMUM";
    maxControls.hidden = mode !== "MAXIMUM";
    rangeControls.hidden = mode !== "RANGE";
    minSlider.value = String(state.minScalePct);
    maxSlider.value = String(state.maxScalePct);
    minValue.value.textContent = String(state.minScalePct);
    maxValue.value.textContent = String(state.maxScalePct);
    range.setValues(state.minScalePct, state.maxScalePct);
    readRange(false);
    showLockWarning();
  };

  const sizeStack = div("lk-column");
  sizeStack.append(scaleMode, minControls, maxControls, rangeControls);

  // ---- colour --------------------------------------------------------------
  const colorButton = (label: string, modifier: string, isOn: () => boolean, toggle: () => void): KitButton => {
    const btn = button(label, {
      size: "sm",
      tooltip: "Active filters influence harvest conditions",
      onClick: () => {
        toggle();
        showColors();
        onChange();
      },
    });
    btn.classList.add("lk-color", `lk-color--${modifier}`);
    colorButtons.push({ btn, isOn });
    return btn;
  };
  const colorButtons: Array<{ btn: KitButton; isOn: () => boolean }> = [];
  const toggleVisual = (tag: VisualTag) => {
    if (!state.visualMutations.delete(tag)) state.visualMutations.add(tag);
  };
  const colors = div("qmm-flex");
  colors.style.justifyContent = "center";
  colors.append(
    colorButton("Normal", "normal", () => state.avoidNormal, () => (state.avoidNormal = !state.avoidNormal)),
    colorButton("Gold", "gold", () => state.visualMutations.has("Gold"), () => toggleVisual("Gold")),
    colorButton("Rainbow", "rainbow", () => state.visualMutations.has("Rainbow"), () => toggleVisual("Rainbow")),
  );
  const showColors = () => colorButtons.forEach(({ btn, isOn }) => btn.setActive(isOn()));

  // ---- weather -------------------------------------------------------------
  const mainGrid = weatherGrid(false);
  const mainTiles = weatherMutations().map((info) => {
    const tile = weatherTile(info, false, (checked) => {
      if (checked) state.weatherSelected.add(info.key);
      else state.weatherSelected.delete(info.key);
      onChange();
    });
    mainGrid.appendChild(tile.root);
    return tile;
  });

  const modeName = `locker-weather-mode-${++weatherModeGroups}`;
  const weatherMode = radioGroup<WeatherMode>(
    modeName,
    [
      { value: "ANY", label: "Any match (OR)" },
      { value: "ALL", label: "All match (AND)" },
      { value: "RECIPES", label: "Recipes (match rows)" },
    ],
    state.weatherMode,
    (value) => {
      state.weatherMode = value;
      showWeatherMode();
      onChange();
    },
  );
  weatherMode.classList.add("qmm-flex");
  weatherMode.style.justifyContent = "center";

  const recipes = weatherRecipeEditor(state, onChange);
  const recipesSection = section("Weather recipes", recipes.root);

  /** The tiles only count outside recipe mode, where the rows replace them. */
  const showWeatherMode = () => {
    for (const input of Array.from(weatherMode.querySelectorAll<HTMLInputElement>("input"))) {
      input.checked = input.value === state.weatherMode;
    }
    const recipeMode = state.weatherMode === "RECIPES";
    mainGrid.classList.toggle("is-disabled", recipeMode);
    mainGrid.inert = recipeMode;
    recipesSection.hidden = !recipeMode;
  };

  root.append(
    section("Harvest mode", lockMode, lockModeHint, lockWarning),
    section("Filter by size", sizeStack),
    section("Filter by color", colors),
    section("Filter by weather", mainGrid),
    section("Weather filter mode", weatherMode),
    recipesSection,
  );

  const refresh = () => {
    showLockMode();
    showScale();
    showColors();
    mainTiles.forEach((tile) => tile.setChecked(state.weatherSelected.has(tile.key)));
    showWeatherMode();
    recipes.refresh();
  };
  refresh();

  return {
    root,
    refresh,
    setDisabled(disabled) {
      root.classList.toggle("is-disabled", disabled);
      root.inert = disabled;
    },
  };
}
