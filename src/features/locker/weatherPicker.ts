// The weather mutation tiles: an icon and a name that toggle like a checkbox.

import { h } from "../../ui/kit/dom";
import { weatherIcon } from "./menuIcons";
import type { WeatherMutationInfo } from "./weatherTags";

export type WeatherTile = {
  key: string;
  root: HTMLLabelElement;
  setChecked(checked: boolean): void;
};

/** `dense` is the smaller tile of the recipe editor. */
export function weatherTile(info: WeatherMutationInfo, dense: boolean, onToggle: (checked: boolean) => void): WeatherTile {
  const root = h("label", "lk-tile");
  const input = h("input");
  input.type = "checkbox";
  root.append(input, weatherIcon(info.key, dense ? 32 : 40), h("div", "lk-tile__caption", info.label));

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
  return h("div", dense ? "lk-weather-grid is-dense" : "lk-weather-grid");
}
