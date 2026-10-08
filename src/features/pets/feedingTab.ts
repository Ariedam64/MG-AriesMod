// The Feeding tab of the Pets menu: per species, which crops the Instant
// Feed button may use, and the switch for its floating widget.

import { petCatalog, plantCatalog } from "../../data";
import { card } from "../../ui/kit/card";
import { color } from "../../ui/kit/theme";
import { switchInput } from "../../ui/kit/toggles";
import { VTabs, type VTabItem } from "../../ui/kit/vtabs";
import { rarityBadge } from "../notifier/menu";
import { isInstantFeedWidgetEnabled, setInstantFeedWidgetEnabled } from "./feedWidget";
import { PetsService } from "./pets";
import { petIcon } from "./petIcon";

type SpeciesItem = VTabItem & { rarity?: string };

const LIST_ICON_PX = 22;

function speciesItems(): SpeciesItem[] {
  return Object.keys(petCatalog).map((species) => {
    const entry = (petCatalog as Record<string, { name?: string; rarity?: string } | undefined>)[species];
    return { id: species, title: String(entry?.name || species), rarity: entry?.rarity };
  });
}

function renderSpeciesItem(item: SpeciesItem, btn: HTMLButtonElement): void {
  btn.replaceChildren();
  btn.style.gridTemplateColumns = "24px 1fr auto";
  btn.style.gap = "10px";

  const title = document.createElement("div");
  title.textContent = item.title || "Pet";
  Object.assign(title.style, { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: "0" });

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
  el.textContent = text;
  el.style.opacity = "0.75";
  return el;
}

function cropRow(species: string, crop: string, name: string): HTMLElement {
  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: "8px",
    padding: "6px 4px",
    borderBottom: `1px solid ${color.border}`,
  });

  const label = document.createElement("div");
  Object.assign(label.style, { display: "flex", flexDirection: "column", gap: "2px" });
  const nameEl = document.createElement("div");
  nameEl.textContent = name;
  nameEl.style.fontSize = "13px";
  label.appendChild(nameEl);
  if (name !== crop) {
    const idEl = document.createElement("div");
    idEl.textContent = crop;
    Object.assign(idEl.style, { fontSize: "11px", opacity: "0.6" });
    label.appendChild(idEl);
  }

  const toggle = switchInput(PetsService.isInstantFeedCropAllowed(species, crop), (on) =>
    PetsService.setInstantFeedCropAllowed(species, crop, on),
  );
  row.append(label, toggle);
  return row;
}

export function renderFeedingTab(view: HTMLElement): void {
  view.replaceChildren();

  const layout = document.createElement("div");
  Object.assign(layout.style, {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)",
    gap: "10px",
    alignItems: "stretch",
    height: "54vh",
    minHeight: "0",
  });
  view.appendChild(layout);

  const left = document.createElement("div");
  Object.assign(left.style, { display: "flex", flexDirection: "column", height: "100%", minHeight: "0" });
  const tabs = new VTabs({
    emptyText: "No pets found.",
    fillAvailableHeight: true,
    renderItem: (item, btn) => renderSpeciesItem(item as SpeciesItem, btn),
  });
  Object.assign(tabs.root.style, { flex: "1 1 auto", minHeight: "0" });
  left.appendChild(tabs.root);

  const right = document.createElement("div");
  Object.assign(right.style, { display: "flex", flexDirection: "column", gap: "10px", minHeight: "0" });
  const panel = card("🍖 Instant Feed", { tone: "muted", subtitle: "Allow or block crops for the Instant Feed button." });
  Object.assign(panel.root.style, { display: "grid", gridTemplateRows: "auto 1fr", minHeight: "0", height: "100%" });
  Object.assign(panel.body.style, { gridTemplateRows: "auto 1fr", minHeight: "0" });
  right.appendChild(panel.root);
  layout.append(left, right);

  const widgetRow = document.createElement("label");
  Object.assign(widgetRow.style, { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" });
  const widgetLabel = document.createElement("span");
  widgetLabel.textContent = "Show floating Instant Feed widget";
  widgetLabel.style.fontSize = "13px";
  widgetRow.append(switchInput(isInstantFeedWidgetEnabled(), setInstantFeedWidgetEnabled), widgetLabel);
  panel.body.appendChild(widgetRow);

  const crops = document.createElement("div");
  Object.assign(crops.style, { display: "flex", flexDirection: "column", gap: "6px", overflow: "auto", minHeight: "0" });
  panel.body.appendChild(crops);

  const renderCrops = (species: string | null) => {
    crops.replaceChildren();
    if (!species) {
      crops.appendChild(message("Select a pet to configure instant feed crops."));
      return;
    }
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
