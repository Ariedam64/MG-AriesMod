// The locker's filter settings, shared by the General tab and each crop
// override: the mode (lock or allow), then the size, colour and weather
// filters. The controls edit a settings draft in place and call `onChange`
// after each edit.

import { CROP_SIZE_MAX, CROP_SIZE_MIN } from "../../data/rules/cropSize";
import { pill } from "../../ui/kit/badges";
import { button, type KitButton } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import { segmented } from "../../ui/kit/segmented";
import { rangeDual, slider } from "../../ui/kit/sliders";
import { lockerCard } from "./lockerCard";
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

/** A slider and its read-out on one line. */
function sliderLine(control: HTMLElement): { root: HTMLElement; value: HTMLSpanElement } {
  const root = h("div", "lk-slider-line");
  const value = pill("");
  value.classList.add("lk-slider-value");
  root.append(control, value);
  return { root, value };
}

/** Recipe mode has none: the recipe editor's own line says how rows match. */
const WEATHER_MODE_HINTS: Record<WeatherMode, string> = {
  ANY: "Matches crops with any of the picked effects.",
  ALL: "Matches crops with every picked effect.",
  RECIPES: "",
};

export function lockerSettingsCard(state: SettingsDraft, onChange: () => void): SettingsCard {
  const root = h("div", "lk-settings");
  root.dataset.lockerSettingsCard = "1";

  // ---- mode ----------------------------------------------------------------
  const lockModeHint = h("div", "lk-hint");
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
    { ariaLabel: "Harvest mode", fullWidth: true },
  );
  const modeCard = lockerCard("Mode");
  modeCard.body.append(lockMode, lockModeHint);

  // In LOCK mode a size filter covering every size blocks every crop, while
  // its sliders at 50 and 100 look like no filter at all. This says so.
  const lockWarning = h("div", "lk-warning");
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
        ? "Only crops matching every active filter type can be harvested."
        : "Crops matching any active filter can't be harvested.";
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
      { value: "minimum", label: "Min" },
      { value: "maximum", label: "Max" },
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
    { ariaLabel: "Scale lock mode", fullWidth: true },
  );

  const minSlider = slider(CROP_SIZE_MIN, CROP_SIZE_MAX, 1, state.minScalePct, { fill: true });
  const maxSlider = slider(CROP_SIZE_MIN, CROP_SIZE_MAX, 1, state.maxScalePct, { fill: true });
  const range = rangeDual(CROP_SIZE_MIN, CROP_SIZE_MAX, 1, state.minScalePct, state.maxScalePct);
  const minLine = sliderLine(minSlider);
  const maxLine = sliderLine(maxSlider);
  const rangeLine = sliderLine(range.root);
  const noSize = h("div", "lk-hint", "Every size passes.");

  /** Reads the range thumbs, keeping at least one point between them. */
  const readRange = (commit: boolean) => {
    const { min, max } = normalizeScaleRange("RANGE", range.min.value, range.max.value);
    range.setValues(min, max);
    rangeLine.value.textContent = `${min} to ${max}`;
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

  minSlider.addEventListener("input", () => readSingle(minSlider, minLine, "minScalePct", false));
  minSlider.addEventListener("change", () => {
    readSingle(minSlider, minLine, "minScalePct", true);
    onChange();
  });
  maxSlider.addEventListener("input", () => readSingle(maxSlider, maxLine, "maxScalePct", false));
  maxSlider.addEventListener("change", () => {
    readSingle(maxSlider, maxLine, "maxScalePct", true);
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
    noSize.hidden = mode !== "NONE";
    minLine.root.hidden = mode !== "MINIMUM";
    maxLine.root.hidden = mode !== "MAXIMUM";
    rangeLine.root.hidden = mode !== "RANGE";
    minSlider.value = String(state.minScalePct);
    maxSlider.value = String(state.maxScalePct);
    minLine.value.textContent = String(state.minScalePct);
    maxLine.value.textContent = String(state.maxScalePct);
    range.setValues(state.minScalePct, state.maxScalePct);
    readRange(false);
    showLockWarning();
  };

  const sizeCard = lockerCard("Size");
  sizeCard.body.append(scaleMode, noSize, minLine.root, maxLine.root, rangeLine.root, lockWarning);

  // ---- colour --------------------------------------------------------------
  const colorButtons: Array<{ btn: KitButton; isOn: () => boolean }> = [];
  const colorButton = (label: string, modifier: string, isOn: () => boolean, toggle: () => void): KitButton => {
    const btn = button(label, {
      size: "sm",
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
  const toggleVisual = (tag: VisualTag) => {
    if (!state.visualMutations.delete(tag)) state.visualMutations.add(tag);
  };
  const showColors = () =>
    colorButtons.forEach(({ btn, isOn }) => {
      btn.setActive(isOn());
      btn.setAttribute("aria-pressed", isOn() ? "true" : "false");
    });

  const colors = h("div", "lk-colors");
  colors.append(
    colorButton("Normal", "normal", () => state.avoidNormal, () => (state.avoidNormal = !state.avoidNormal)),
    colorButton("Gold", "gold", () => state.visualMutations.has("Gold"), () => toggleVisual("Gold")),
    colorButton("Rainbow", "rainbow", () => state.visualMutations.has("Rainbow"), () => toggleVisual("Rainbow")),
  );
  const colorCard = lockerCard("Colour");
  colorCard.body.append(colors);

  // ---- weather -------------------------------------------------------------
  const weatherHint = h("div", "lk-hint");
  const weatherMode = segmented<WeatherMode>(
    [
      { value: "ANY", label: "Any" },
      { value: "ALL", label: "All" },
      { value: "RECIPES", label: "Recipes" },
    ],
    state.weatherMode,
    (value) => {
      if (value === state.weatherMode) return;
      state.weatherMode = value;
      showWeatherMode();
      onChange();
    },
    { ariaLabel: "Weather filter mode", fullWidth: true },
  );

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

  const recipes = weatherRecipeEditor(state, onChange);

  /** The tiles only count outside recipe mode, where the recipes replace them. */
  const showWeatherMode = () => {
    if (weatherMode.get() !== state.weatherMode) weatherMode.set(state.weatherMode);
    weatherHint.textContent = WEATHER_MODE_HINTS[state.weatherMode] ?? "";
    weatherHint.hidden = !weatherHint.textContent;
    const recipeMode = state.weatherMode === "RECIPES";
    mainGrid.hidden = recipeMode;
    recipes.root.hidden = !recipeMode;
  };

  const weatherCard = lockerCard("Weather");
  weatherCard.body.append(weatherMode, weatherHint, mainGrid, recipes.root);

  root.append(modeCard.root, sizeCard.root, colorCard.root, weatherCard.root);

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
