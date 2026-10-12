// The popup that picks a pet for a team slot: every pet the player owns, from
// the bag, the Pet Hutch and the active slots, searchable by name, species,
// ability or mutation, and filterable by where the pet is.

import { petCatalog } from "../../data";
import { getPetMaxStrength, getPetStrength } from "../../data/rules/petValue";
import { pill } from "../../ui/kit/badges";
import { h } from "../../ui/kit/dom";
import { textInput } from "../../ui/kit/fields";
import { openModal } from "../../ui/kit/modal";
import { rarityBadge } from "../../ui/kit/rarityBadge";
import { segmented } from "../../ui/kit/segmented";
import { abilityDots } from "./abilityChips";
import { abilityName } from "./abilityNames";
import { canonicalSpecies, type InventoryPet } from "./inventoryPets";
import { petIcon } from "./petIcon";
import { ensurePetPickerStyles } from "./petPickerStyles";

export type PetSource = "active" | "bag" | "hutch";
export type PickablePet = { pet: InventoryPet; source: PetSource };
type SourceFilter = PetSource | "all";

const SOURCE_ORDER: Record<PetSource, number> = { active: 0, bag: 1, hutch: 2 };
const SOURCE_LABEL: Record<PetSource, string> = { active: "Active", bag: "Bag", hutch: "Hutch" };
const ICON_PX = 48;

function speciesName(species: string): string {
  const entry = (petCatalog as Record<string, any>)[canonicalSpecies(species)];
  return typeof entry?.name === "string" && entry.name ? entry.name : species;
}

function speciesRarity(species: string): string | null {
  const entry = (petCatalog as Record<string, any>)[canonicalSpecies(species)];
  return typeof entry?.rarity === "string" ? entry.rarity : null;
}

/**
 * Every owned pet with where it is, minus `exclude`. The owned list mixes the
 * bag, the hutch and the active slots, so the active and hutch lists decide the
 * label and whatever is left is in the bag.
 */
export function labelPetSources(sources: {
  active: InventoryPet[];
  hutch: InventoryPet[];
  owned: InventoryPet[];
  exclude: Set<string>;
}): PickablePet[] {
  const where = new Map<string, PetSource>();
  for (const pet of sources.hutch) where.set(pet.id, "hutch");
  for (const pet of sources.active) where.set(pet.id, "active");
  const out: PickablePet[] = [];
  const seen = new Set<string>();
  for (const pet of [...sources.active, ...sources.hutch, ...sources.owned]) {
    if (sources.exclude.has(pet.id) || seen.has(pet.id)) continue;
    seen.add(pet.id);
    out.push({ pet, source: where.get(pet.id) ?? "bag" });
  }
  return out;
}

const displayName = (pet: InventoryPet): string => pet.name?.trim() || speciesName(pet.petSpecies);

/** Everything a search can match, lowercased. */
function searchText(pet: InventoryPet): string {
  return [pet.name ?? "", pet.petSpecies, speciesName(pet.petSpecies), ...pet.mutations, ...pet.abilities.map(abilityName)]
    .join(" ")
    .toLowerCase();
}

/** The pets a search and a source filter keep: active first, then bag, then hutch, strongest first. */
export function filterPickablePets(pets: PickablePet[], filter: { query: string; source: SourceFilter }): PickablePet[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return pets
    .filter((entry) => filter.source === "all" || entry.source === filter.source)
    .filter((entry) => {
      const text = searchText(entry.pet);
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) =>
      SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]
      || getPetStrength(b.pet) - getPetStrength(a.pet)
      || displayName(a.pet).localeCompare(displayName(b.pet)));
}

/** "STR 72/85" while it can grow; at its max a single number, shown in gold. */
export function strengthLabel(strength: number, maxStrength: number): string {
  return maxStrength > 0 && strength < maxStrength ? `STR ${strength}/${maxStrength}` : `STR ${strength}`;
}

function petCard(entry: PickablePet, onPick: () => void): HTMLButtonElement {
  const { pet } = entry;
  const card = h("button", "pt-pick-card");
  card.type = "button";
  card.title = `Put ${displayName(pet)} in this slot`;

  const name = h("div", "pt-pick-card__name", displayName(pet));
  const species = h("div", "pt-pick-card__species");
  const rarity = speciesRarity(pet.petSpecies);
  if (rarity) species.appendChild(rarityBadge(rarity, { size: 14 }));
  species.appendChild(h("span", undefined, speciesName(pet.petSpecies)));

  const strength = getPetStrength(pet);
  const maxStrength = getPetMaxStrength(pet);
  const str = h("span", "pt-pick-card__str", strengthLabel(strength, maxStrength));
  str.classList.toggle("is-max", maxStrength > 0 && strength >= maxStrength);

  const meta = h("div", "pt-pick-card__meta");
  meta.append(str, abilityDots(pet.abilities, { size: 10, gap: 3 }));

  const text = h("div", "pt-pick-card__text");
  text.append(name, species, meta);

  const where = h("span", `pt-pick-card__where is-${entry.source}`, SOURCE_LABEL[entry.source]);
  card.append(petIcon(pet, ICON_PX), text, where);
  card.addEventListener("click", onPick);
  return card;
}

/** Opens the picker. Resolves with the chosen pet, or null when the popup is closed without a choice. */
export function openPetPickerModal(options: {
  host: HTMLElement;
  title: string;
  subtitle?: string;
  pets: PickablePet[];
}): Promise<InventoryPet | null> {
  ensurePetPickerStyles();
  return new Promise((resolve) => {
    let chosen: InventoryPet | null = null;
    const modal = openModal({
      host: options.host,
      title: options.title,
      widthPx: 560,
      maxHeightPx: 640,
      onClose: () => resolve(chosen),
    });

    let query = "";
    let source: SourceFilter = "all";
    const counts: Record<SourceFilter, number> = { all: options.pets.length, active: 0, bag: 0, hutch: 0 };
    for (const entry of options.pets) counts[entry.source] += 1;

    const search = textInput("Search by name, species, ability or mutation");
    search.classList.add("pt-pick-search");
    search.addEventListener("input", () => {
      query = search.value;
      render();
    });
    // Enter takes the first match, so a search plus Enter is a pick.
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = filterPickablePets(options.pets, { query, source })[0];
      if (first) pick(first.pet);
    });

    const sources = segmented<SourceFilter>(
      (["all", "active", "bag", "hutch"] as const).map((value) => ({
        value,
        label: `${value === "all" ? "All" : SOURCE_LABEL[value]} ${counts[value]}`,
        disabled: value !== "all" && counts[value] === 0,
      })),
      "all",
      (value) => {
        source = value;
        render();
      },
      { fullWidth: true, ariaLabel: "Where the pet is" },
    );

    const tools = h("div", "pt-pick-tools");
    if (options.subtitle) tools.appendChild(h("div", "pt-pick-subtitle", options.subtitle));
    tools.append(search, sources);
    const grid = h("div", "pt-pick-grid");
    const status = h("div", "pt-pick-status");
    modal.body.classList.add("pt-pick-body");
    modal.body.append(tools, grid);
    modal.footer.appendChild(status);

    function pick(pet: InventoryPet): void {
      chosen = pet;
      modal.close();
    }

    function render(): void {
      const shown = filterPickablePets(options.pets, { query, source });
      grid.replaceChildren(...shown.map((entry) => petCard(entry, () => pick(entry.pet))));
      if (shown.length === 0) {
        const empty = h("div", "pt-pick-empty");
        empty.append(
          h("div", "pt-pick-empty__title", options.pets.length === 0 ? "No pets to choose" : "No pet matches"),
          h("div", "pt-pick-empty__hint", options.pets.length === 0
            ? "Pets in your bag, your Pet Hutch or your active slots show up here."
            : "Try another name, species, ability or mutation."),
        );
        grid.appendChild(empty);
      }
      status.replaceChildren(pill(`${shown.length} of ${options.pets.length} pets`));
    }

    render();
    try { search.focus(); } catch {}
  });
}
