// The weather mutation tiles: an icon and a name that toggle like a checkbox.

import { weatherIcon } from "./menuIcons";
import type { WeatherMutationInfo } from "./weatherTags";

export type WeatherTile = {
  key: string;
  root: HTMLLabelElement;
  setChecked(checked: boolean): void;
};

/** `dense` is the smaller tile of the recipe editor. */
export function weatherTile(info: WeatherMutationInfo, dense: boolean, onToggle: (checked: boolean) => void): WeatherTile {
  const root = document.createElement("label");
  root.className = "lk-tile";
  root.title = "Active filters influence harvest conditions";

  const input = document.createElement("input");
  input.type = "checkbox";
  const caption = document.createElement("div");
  caption.className = "lk-tile__caption";
  caption.textContent = info.label;
  root.append(input, weatherIcon(info.key, dense ? 40 : 52), caption);

  const setChecked = (checked: boolean) => {
    input.checked = checked;
    root.classList.toggle("is-checked", checked);
  };
  input.addEventListener("change", () => {
    root.classList.toggle("is-checked", input.checked);
    onToggle(input.checked);
  });
  return { key: info.key, root, setChecked };
}

export function weatherGrid(dense: boolean): HTMLDivElement {
  const grid = document.createElement("div");
  grid.className = dense ? "lk-weather-grid is-dense" : "lk-weather-grid";
  return grid;
}
