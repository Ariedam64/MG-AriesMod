// The Appearance tab: the menus' theme, an accent colour of the player's own,
// and the menu size. Every change shows at once and is saved.

import { button } from "../../ui/kit/button";
import { pill } from "../../ui/kit/badges";
import { card } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { flexRow, settingRow } from "../../ui/kit/layout";
import { slider } from "../../ui/kit/sliders";
import { themes, type ThemeId } from "../../ui/kit/theme";
import {
  DEFAULT_APPEARANCE,
  SCALE_MAX,
  SCALE_MIN,
  applyAppearance,
  readAppearance,
  saveAppearance,
  type Appearance,
} from "./appearance";
import { ensureSettingsStyles } from "./styles";

/** A theme's button: a small window in its own colours, and its name. */
function themeButton(id: ThemeId, onPick: () => void): HTMLButtonElement {
  const { label, swatches } = themes[id];
  const btn = h("button", "qws-set-theme");
  btn.type = "button";
  btn.dataset.theme = id;
  btn.setAttribute("aria-label", `${label} theme`);

  const preview = h("span", "qws-set-theme__preview");
  preview.style.background = swatches.paper;
  preview.style.borderColor = swatches.sandEdge;
  const band = h("span", "qws-set-theme__band");
  band.style.background = swatches.sepia;
  const text = h("span", "qws-set-theme__text", "Aa");
  text.style.color = swatches.bark;
  const chip = h("span", "qws-set-theme__chip");
  chip.style.background = swatches.sepiaStrong;
  chip.style.boxShadow = `0 3px 0 ${swatches.sepiaShade}`;
  preview.append(band, text, chip);

  btn.append(preview, h("span", "qws-set-theme__label", label));
  btn.addEventListener("click", onPick);
  return btn;
}

export function renderAppearanceTab(view: HTMLElement): void {
  ensureSettingsStyles();
  let look = readAppearance();

  const themeButtons = (Object.keys(themes) as ThemeId[]).map((id) =>
    // A theme comes with its own accent, so picking one drops a custom colour.
    themeButton(id, () => commit({ theme: id, accent: null })));
  const themeGrid = h("div", "qws-set-themes");
  themeGrid.append(...themeButtons);
  const themeCard = card("Theme", { subtitle: "The colours of every menu." });
  themeCard.body.appendChild(themeGrid);

  const picker = h("input", "qws-set-color");
  picker.type = "color";
  picker.setAttribute("aria-label", "Accent colour");
  // Dragging in the picker previews; letting go saves.
  picker.addEventListener("input", () => applyAppearance({ ...look, accent: picker.value }));
  picker.addEventListener("change", () => commit({ accent: picker.value }));
  const themeAccent = button("Theme colour", { size: "sm", onClick: () => commit({ accent: null }) });
  const accentControls = flexRow({ gap: 8 });
  accentControls.append(picker, themeAccent);

  const size = slider(SCALE_MIN * 100, SCALE_MAX * 100, 5, look.scale * 100);
  const sizeValue = pill("", "ok");
  const readSize = () => Number(size.value) / 100;
  size.addEventListener("input", () => {
    sizeValue.textContent = `${size.value}%`;
    applyAppearance({ ...look, scale: readSize() });
  });
  size.addEventListener("change", () => commit({ scale: readSize() }));
  const sizeControls = flexRow({ gap: 8 });
  sizeControls.append(size, sizeValue);

  const tuneCard = card("Fine tuning");
  tuneCard.body.append(
    settingRow("Accent colour", "Buttons, title bands and selections.", accentControls).row,
    settingRow("Menu size", "Windows and the launcher.", sizeControls).row,
  );

  const reset = button("Reset appearance", { onClick: () => commit(DEFAULT_APPEARANCE) });

  function refresh() {
    for (const btn of themeButtons) {
      const active = btn.dataset.theme === look.theme;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
    picker.value = look.accent ?? themes[look.theme].swatches.sepia;
    themeAccent.setEnabled(look.accent !== null);
    size.value = String(Math.round(look.scale * 100));
    sizeValue.textContent = `${size.value}%`;
  }

  function commit(next: Partial<Appearance>) {
    look = { ...look, ...next };
    saveAppearance(look);
    look = readAppearance();
    refresh();
  }

  refresh();
  const tab = h("div", "qws-set-tab");
  tab.append(themeCard.root, tuneCard.root, reset);
  view.replaceChildren(tab);
}
