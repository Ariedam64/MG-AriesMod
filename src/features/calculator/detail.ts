// The right side of the Calculator: the selected crop with its price and
// weight, its Size, the mutations and the friend bonus. Every choice is
// written into the crop's own state, which the menu keeps per crop.

import { coin } from "../../data";
import { CROP_SIZE_MAX, CROP_SIZE_MIN } from "../../data/rules/cropSize";
import { clamp } from "../../lib/math";
import type { LockerSeedOption } from "../locker/seedOptions";
import { pill } from "../../ui/kit/badges";
import { card, plainCard } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { slider } from "../../ui/kit/sliders";
import {
  COLOR_LABELS,
  FRIEND_BONUS_LABELS,
  LIGHTING_LABELS,
  WEATHER_LABELS,
  calculatorPrice,
  calculatorWeight,
  formatCoins,
  formatWeight,
  friendPlayersLabel,
  friendPlayersOf,
  mutationsOf,
  type CalculatorState,
} from "./compute";
import { optionPicker } from "./mutationPicker";
import { cropEmoji, cropPreview } from "./sprites";

export type SelectedCrop = { key: string; option: LockerSeedOption | undefined; state: CalculatorState };

export type CalculatorDetail = {
  root: HTMLElement;
  /** Shows a crop and its choices, or the empty state when there is none. */
  show(crop: SelectedCrop | null): void;
};

/** A picker under a small label, with the current choice's name on the right. */
function pickRow(label: string, picker: HTMLElement): { root: HTMLElement; value: HTMLElement } {
  const root = h("div", "qws-calc-pick");
  const head = h("div", "qws-calc-pick__head");
  const value = h("span", "qws-calc-pick__value");
  head.append(h("span", "qws-calc-pick__label", label), value);
  root.append(head, picker);
  return { root, value };
}

function credit(): HTMLElement {
  const el = h("div", "qws-calc-credit");
  const link = h("a", undefined, "Daserix' Magic Garden Calculators");
  link.href = "https://daserix.github.io/magic-garden-calculator";
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  el.append("Based on ", link);
  return el;
}

export function calculatorDetail(): CalculatorDetail {
  let current: SelectedCrop | null = null;
  // Set while the pickers are moved to a newly selected crop's choices, so
  // their change callbacks do not write back or redraw once per picker.
  let syncing = false;

  // The crop: its sprite scaled with the Size, its name, price and weight.
  const preview = cropPreview();
  const stage = h("div", "qws-calc-stage");
  stage.appendChild(preview.root);

  const name = h("div", "qws-calc-name");
  const price = h("div", "qws-calc-price");
  const coinIcon = h("img");
  coinIcon.src = coin.img64;
  coinIcon.alt = "";
  coinIcon.draggable = false;
  coinIcon.setAttribute("aria-hidden", "true");
  const priceValue = h("span", undefined, "-");
  price.append(coinIcon, priceValue);
  const weight = h("div", "qws-calc-weight", "-");
  const summary = h("div", "qws-calc-summary");
  summary.append(name, price, weight);

  const top = h("div", "qws-calc-hero__top");
  top.append(stage, summary);

  const sizeSlider = slider(CROP_SIZE_MIN, CROP_SIZE_MAX, 1, CROP_SIZE_MIN, { fill: true });
  sizeSlider.setAttribute("aria-label", "Size");
  const sizeValue = pill(String(CROP_SIZE_MIN));
  const sizeRow = h("div", "qws-calc-size");
  sizeRow.append(h("span", "qws-calc-size__label", "Size"), sizeSlider, sizeValue);

  const hero = plainCard();
  hero.classList.add("qws-calc-hero");
  hero.append(top, sizeRow);

  // Mutations and friend bonus: each picker writes into the current crop.
  const pickers: Array<{ setEnabled(enabled: boolean): void; sync(state: CalculatorState): void }> = [];

  function addPicker<T extends string>(
    labels: readonly T[],
    label: string,
    ariaLabel: string,
    read: (state: CalculatorState) => T,
    write: (state: CalculatorState, value: T) => void,
    spriteChanges: boolean,
  ): HTMLElement {
    const picker = optionPicker(labels, labels[0], ariaLabel, (value) => {
      row.value.textContent = value;
      if (syncing || !current) return;
      write(current.state, value);
      if (spriteChanges) refreshSprite();
      refreshPrice();
    });
    const row = pickRow(label, picker);
    row.value.textContent = labels[0];
    pickers.push({ setEnabled: picker.setEnabled, sync: (state) => picker.set(read(state)) });
    return row.root;
  }

  const mutations = card("Mutations");
  mutations.body.append(
    addPicker(COLOR_LABELS, "Color", "Mutations", (s) => s.color, (s, v) => (s.color = v), true),
    addPicker(WEATHER_LABELS, "Weather", "Weather condition", (s) => s.weather, (s, v) => (s.weather = v), true),
    addPicker(LIGHTING_LABELS, "Lighting", "Weather lighting", (s) => s.lighting, (s, v) => (s.lighting = v), true),
  );

  const friends = card("Friend bonus", { subtitle: "Each extra player in the room adds 10%." });
  const friendPicker = optionPicker(FRIEND_BONUS_LABELS, FRIEND_BONUS_LABELS[0], "Friend bonus", (label) => {
    if (syncing || !current) return;
    current.state.friendPlayers = friendPlayersOf(label);
    refreshPrice();
  });
  friends.body.appendChild(friendPicker);
  pickers.push({
    setEnabled: friendPicker.setEnabled,
    sync: (state) => friendPicker.set(friendPlayersLabel(state.friendPlayers)),
  });

  const empty = h("div", "qws-calc-empty", "No crops to show yet. They appear once the game data has loaded.");

  const root = h("div", "qws-calc__detail qmm-scroll");
  root.append(hero, mutations.root, friends.root, empty, credit());

  function refreshPrice(): void {
    priceValue.textContent = current ? formatCoins(calculatorPrice(current.key, current.state)) : "-";
  }

  function refreshSize(size: number): void {
    sizeSlider.value = String(size);
    sizeValue.textContent = String(size);
    preview.setSize(size);
    weight.textContent = formatWeight(current ? calculatorWeight(current.key, size) : null);
  }

  function refreshSprite(): void {
    if (!current?.option) {
      preview.clear();
      return;
    }
    preview.show(current.option, mutationsOf(current.state), cropEmoji(current.option, current.key));
  }

  sizeSlider.addEventListener("input", () => {
    if (!current) return;
    const size = clamp(Math.round(Number(sizeSlider.value)), CROP_SIZE_MIN, CROP_SIZE_MAX);
    current.state.size = size;
    refreshSize(size);
    refreshPrice();
  });

  return {
    root,
    show(crop) {
      current = crop;
      const live = crop != null;
      for (const el of [hero, mutations.root, friends.root]) el.hidden = !live;
      empty.hidden = live;

      name.textContent = crop ? crop.option?.cropName || crop.key : "";
      sizeSlider.disabled = !live;
      refreshSize(crop ? crop.state.size : CROP_SIZE_MIN);

      syncing = true;
      try {
        for (const { setEnabled, sync } of pickers) {
          setEnabled(live);
          if (crop) sync(crop.state);
        }
      } finally {
        syncing = false;
      }

      refreshSprite();
      refreshPrice();
    },
  };
}
