// The Feeding tab of the Pets menu: per species, which crops the Instant
// Feed button may use, and the switch for its floating widget.

import { petCatalog, plantCatalog } from "../../data";
import { card } from "../../ui/kit/card";
import { settingRow } from "../../ui/kit/layout";
import { rarityBadge } from "../../ui/kit/rarityBadge";
import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import { switchInput } from "../../ui/kit/toggles";
import { VTabs, type VTabItem } from "../../ui/kit/vtabs";
import { isInstantFeedWidgetEnabled, setInstantFeedWidgetEnabled } from "./feedWidget";
import { PetsService } from "./pets";
import { petIcon } from "./petIcon";
import { ensurePetsStyles } from "./styles";

type SpeciesItem = VTabItem & { rarity?: string };

const LIST_ICON_PX = 22;
const CROP_ICON_PX = 28;

function speciesItems(): SpeciesItem[] {
  return Object.keys(petCatalog).map((species) => {
    const entry = (petCatalog as Record<string, { name?: string; rarity?: string } | undefined>)[species];
    return { id: species, title: String(entry?.name || species), rarity: entry?.rarity };
  });
}

function renderSpeciesItem(item: SpeciesItem, btn: HTMLButtonElement): void {
  btn.replaceChildren();
  btn.classList.add("pt-species");

  const title = document.createElement("div");
  title.className = "pt-species__name";
  title.textContent = item.title || "Pet";

  btn.append(petIcon({ petSpecies: item.id, name: item.title }, LIST_ICON_PX), title);

  const rarity = String(item.rarity || "").trim();
  if (rarity) {
    const badge = rarityBadge(rarity);
    badge.style.margin = "0";
    badge.style.alignSelf = "center";
    btn.appendChild(badge);
  }
}

function message(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "pt-empty";
  el.textContent = text;
  return el;
}

/** The crop's own sprite, from the name the catalog gives it; its initial until then. */
function cropIcon(crop: string, name: string): HTMLElement {
  const box = document.createElement("span");
  box.className = "pt-crop-icon";
  box.textContent = name.charAt(0).toUpperCase();
  const entry = (plantCatalog as Record<string, { crop?: { sprite?: unknown } } | undefined>)[crop];
  const sprite = typeof entry?.crop?.sprite === "string" ? entry.crop.sprite : "";
  const candidates = [sprite, crop].filter(Boolean);
  attachSpriteIcon(box, ["crop", "tallplant", "plant"], candidates, CROP_ICON_PX, "feed-crop");
  return box;
}

function cropRow(species: string, crop: string, name: string): HTMLElement {
  const toggle = switchInput(PetsService.isInstantFeedCropAllowed(species, crop), (on) =>
    PetsService.setInstantFeedCropAllowed(species, crop, on),
  );
  toggle.setAttribute("aria-label", `Feed ${name}`);
  const { row } = settingRow(name, name !== crop ? crop : null, toggle);
  row.prepend(cropIcon(crop, name));
  return row;
}

export function renderFeedingTab(view: HTMLElement): void {
  ensurePetsStyles();
  view.replaceChildren();

  const tab = document.createElement("div");
  tab.className = "pt-tab";
  const layout = document.createElement("div");
  layout.className = "pt-split";
  tab.appendChild(layout);
  view.appendChild(tab);

  const tabs = new VTabs({
    filterPlaceholder: "Find a pet",
    emptyText: "No pets found.",
    fillAvailableHeight: true,
    renderItem: (item, btn) => renderSpeciesItem(item as SpeciesItem, btn),
  });

  const side = document.createElement("div");
  side.className = "pt-feed-side";
  layout.append(tabs.root, side);

  const widget = settingRow(
    "Floating feed button",
    "Shows the Instant Feed button over the game.",
    switchInput(isInstantFeedWidgetEnabled(), setInstantFeedWidgetEnabled),
  );
  side.appendChild(widget.row);

  const panel = card("Crops", { subtitle: "The crops Instant Feed may give this pet." });
  const crops = document.createElement("div");
  crops.className = "pt-crops";
  panel.body.appendChild(crops);
  side.appendChild(panel.root);

  const renderCrops = (species: string | null) => {
    crops.replaceChildren();
    if (!species) {
      panel.setTitle("Crops");
      crops.appendChild(message("Pick a pet on the left to choose its crops."));
      return;
    }
    const entry = (petCatalog as Record<string, { name?: string } | undefined>)[species];
    panel.setTitle(`${String(entry?.name || species)} eats`);
    const compatible = Array.from(new Set(PetsService.getCompatibleCropsForSpecies(species).map(String).filter(Boolean)));
    if (!compatible.length) {
      crops.appendChild(message("No compatible crops for this pet."));
      return;
    }
    compatible
      .map((crop) => ({ crop, name: String((plantCatalog as Record<string, { name?: string } | undefined>)[crop]?.name || crop) }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(({ crop, name }) => crops.appendChild(cropRow(species, crop, name)));
  };

  const items = speciesItems();
  tabs.setItems(items);
  if (items.length) tabs.select(items[0].id);
  tabs.onSelect((id) => renderCrops(id));
  renderCrops(items[0]?.id ?? null);
}
