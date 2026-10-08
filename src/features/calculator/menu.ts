// The Calculator menu: pick a crop on the left, then set its Size, mutations
// and friend bonus on the right to see its sell price and weight.

import { coin } from "../../data";
import { CROP_SIZE_MAX, CROP_SIZE_MIN } from "../../data/rules/cropSize";
import { clamp } from "../../lib/math";
import {
  getLockerSeedEmojiForKey,
  getLockerSeedEmojiForSeedName,
  getLockerSeedOptions,
  type LockerSeedOption,
} from "../locker/seedOptions";
import { Menu } from "../../ui/kit/menu";
import { plainCard, sectionLabel } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { slider as rangeSlider } from "../../ui/kit/sliders";
import { color } from "../../ui/kit/theme";
import { VTabs } from "../../ui/kit/vtabs";
import {
  COLOR_LABELS,
  FRIEND_BONUS_LABELS,
  LIGHTING_LABELS,
  WEATHER_LABELS,
  calculatorPrice,
  calculatorWeight,
  defaultCalculatorState,
  formatCoins,
  formatWeight,
  friendPlayersLabel,
  friendPlayersOf,
  mutationsOf,
  type CalculatorState,
} from "./compute";
import { optionPicker } from "./mutationPicker";
import { cropListIcon, cropPreview } from "./sprites";

const LIST_ICON_PX = 24;

function seedEmoji(option: LockerSeedOption | undefined, key: string): string {
  return (
    getLockerSeedEmojiForKey(key) ||
    (option?.seedName ? getLockerSeedEmojiForSeedName(option.seedName) : undefined) ||
    "🌱"
  );
}

/** A centred section card with an optional heading. */
function section(title: string | null): HTMLDivElement {
  const card = plainCard();
  Object.assign(card.style, { padding: "12px", gap: "10px" });
  if (title) {
    const heading = sectionLabel(title);
    heading.style.textAlign = "center";
    card.appendChild(heading);
  }
  return card;
}

function priceDisplay(): { root: HTMLElement; value: HTMLElement } {
  const root = h("div");
  Object.assign(root.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "12px",
    fontSize: "20px",
    fontWeight: "700",
    color: color.gold,
  });
  const icon = h("img");
  icon.src = coin.img64;
  icon.alt = "";
  icon.draggable = false;
  icon.setAttribute("aria-hidden", "true");
  Object.assign(icon.style, { width: "20px", height: "20px", pointerEvents: "none", userSelect: "none" });
  const value = h("span", undefined, "-");
  value.style.lineHeight = "1";
  root.append(icon, value);
  return { root, value };
}

function sourceHint(): HTMLElement {
  const el = h("div");
  Object.assign(el.style, {
    fontSize: "11px",
    color: color.textSoft,
    textAlign: "center",
    marginTop: "20px",
    paddingBottom: "4px",
  });
  const link = h("a", undefined, "Daserix' Magic Garden Calculators");
  link.href = "https://daserix.github.io/magic-garden-calculator";
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  Object.assign(link.style, { color: color.accent, textDecoration: "underline" });
  el.append("Based on ", link);
  return el;
}

function renderCropsTab(root: HTMLElement): void {
  root.replaceChildren();
  Object.assign(root.style, { padding: "8px", boxSizing: "border-box", height: "66vh", overflow: "auto", display: "grid" });

  const layout = h("div");
  Object.assign(layout.style, {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)",
    gap: "10px",
    height: "100%",
    overflow: "hidden",
  });

  const listPane = h("div");
  Object.assign(listPane.style, { display: "flex", flexDirection: "column", minHeight: "0" });

  const detailScroll = h("div", "qmm-scroll");
  Object.assign(detailScroll.style, { overflow: "auto", minHeight: "0" });

  const detail = h("div");
  Object.assign(detail.style, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    width: "min(440px, 100%)",
    margin: "0 auto",
  });
  detailScroll.appendChild(detail);
  layout.append(listPane, detailScroll);
  root.append(layout, sourceHint());

  // Preview: the sprite, scaled with the Size, the Size slider and the weight.
  const price = priceDisplay();
  const preview = cropPreview();
  const spriteBox = h("div");
  Object.assign(spriteBox.style, { display: "flex", alignItems: "center", justifyContent: "center", padding: "12px" });
  spriteBox.appendChild(preview.root);

  const sizeSlider = rangeSlider(CROP_SIZE_MIN, CROP_SIZE_MAX, 1, CROP_SIZE_MIN, { fill: true });
  Object.assign(sizeSlider.style, { flex: "1 1 auto", minWidth: "0" });
  const sizeLabel = h("span", undefined, "Size");
  Object.assign(sizeLabel.style, { fontSize: "12px", color: color.textSoft });
  const sizeValue = h("span", undefined, `${CROP_SIZE_MIN}%`);
  Object.assign(sizeValue.style, { width: "4ch", fontSize: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums" });
  const sizeRow = h("div");
  Object.assign(sizeRow.style, { display: "flex", alignItems: "center", gap: "8px" });
  sizeRow.append(sizeLabel, sizeSlider, sizeValue);
  const weight = h("div", undefined, "-");
  Object.assign(weight.style, { fontSize: "11px", color: color.textDim, textAlign: "center", fontVariantNumeric: "tabular-nums" });

  const previewCard = section(null);
  previewCard.append(spriteBox, sizeRow, weight);

  const colorHost = h("div");
  const weatherHost = h("div");
  const lightingHost = h("div");
  const mutationsCard = section("Mutations");
  mutationsCard.append(colorHost, weatherHost, lightingHost);

  const friendHost = h("div");
  const friendCard = section("Friend bonus");
  friendCard.appendChild(friendHost);

  detail.append(price.root, previewCard, mutationsCard, friendCard);

  // State: one set of choices per crop, kept while the menu lives.
  const states = new Map<string, CalculatorState>();
  const optionByKey = new Map<string, LockerSeedOption>();
  const listIcons = new Map<string, HTMLElement>();
  let selectedKey: string | null = null;

  const stateFor = (key: string): CalculatorState => {
    let state = states.get(key);
    if (!state) states.set(key, (state = defaultCalculatorState()));
    return state;
  };

  function refreshPrice(): void {
    price.value.textContent = selectedKey ? formatCoins(calculatorPrice(selectedKey, stateFor(selectedKey))) : "-";
  }

  function refreshSize(size: number): void {
    sizeSlider.value = String(size);
    sizeValue.textContent = String(size);
    preview.setSize(size);
    weight.textContent = formatWeight(selectedKey ? calculatorWeight(selectedKey, size) : null);
  }

  function refreshSprite(): void {
    const option = selectedKey ? optionByKey.get(selectedKey) : undefined;
    if (!selectedKey || !option) {
      preview.clear();
      return;
    }
    preview.show(option, mutationsOf(stateFor(selectedKey)), seedEmoji(option, selectedKey));
  }

  /** Rebuilds the four pickers for the selected crop, inert when there is none. */
  function renderPickers(): void {
    const state = selectedKey ? stateFor(selectedKey) : defaultCalculatorState();
    const live = selectedKey != null;
    const pick = <K extends keyof CalculatorState>(field: K, spriteChanges: boolean) =>
      live
        ? (value: CalculatorState[K]) => {
            state[field] = value;
            if (spriteChanges) refreshSprite();
            refreshPrice();
          }
        : undefined;

    colorHost.replaceChildren(optionPicker(COLOR_LABELS, state.color, "Mutations", pick("color", true)));
    weatherHost.replaceChildren(optionPicker(WEATHER_LABELS, state.weather, "Weather condition", pick("weather", true)));
    lightingHost.replaceChildren(optionPicker(LIGHTING_LABELS, state.lighting, "Weather lighting", pick("lighting", true)));
    const pickFriends = pick("friendPlayers", false);
    friendHost.replaceChildren(
      optionPicker(
        FRIEND_BONUS_LABELS,
        friendPlayersLabel(state.friendPlayers),
        "Friend bonus",
        pickFriends && ((label) => pickFriends(friendPlayersOf(label))),
      ),
    );
  }

  function renderDetail(): void {
    sizeSlider.disabled = !selectedKey;
    refreshSize(selectedKey ? stateFor(selectedKey).size : CROP_SIZE_MIN);
    renderPickers();
    refreshSprite();
    refreshPrice();
  }

  sizeSlider.addEventListener("input", () => {
    if (!selectedKey) return;
    const size = clamp(Math.round(Number(sizeSlider.value)), CROP_SIZE_MIN, CROP_SIZE_MAX);
    stateFor(selectedKey).size = size;
    refreshSize(size);
    refreshPrice();
  });

  const tabs = new VTabs({
    emptyText: "No crops available.",
    fillAvailableHeight: true,
    onSelect: (id) => {
      if (id === selectedKey) return;
      selectedKey = id;
      renderDetail();
    },
    renderItem: (item, btn) => {
      // Icons are kept between renders: the list redraws on every selection,
      // and a fresh icon would flash its emoji for a frame.
      let icon = listIcons.get(item.id);
      if (!icon) {
        const option = optionByKey.get(item.id);
        icon = option ? cropListIcon(option, seedEmoji(option, option.key), LIST_ICON_PX) : h("span");
        listIcons.set(item.id, icon);
      }
      const label = h("span", undefined, item.title);
      Object.assign(label.style, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
      btn.append(icon, label, h("span"));
    },
  });
  listPane.appendChild(tabs.root);

  function renderList(): void {
    const options = getLockerSeedOptions();
    optionByKey.clear();
    listIcons.clear();
    for (const option of options) optionByKey.set(option.key, option);

    tabs.setItems(options.map((option) => ({ id: option.key, title: option.cropName || option.key })));
    const selected = tabs.getSelected()?.id ?? null;
    if (!selected && options.length) {
      tabs.select(options[0].key);
      return;
    }
    selectedKey = selected;
    renderDetail();
  }

  renderList();

  // The live plant catalog can land after the menu is drawn.
  window.addEventListener("gemini:data-updated", (event) => {
    if ((event as CustomEvent<{ key: string }>).detail?.key === "plants") renderList();
  });
}

export async function renderCalculatorMenu(container: HTMLElement) {
  const ui = new Menu({ id: "calculator", compact: true });
  ui.addTab("crops", "Crops", renderCropsTab);
  ui.mount(container);
}
