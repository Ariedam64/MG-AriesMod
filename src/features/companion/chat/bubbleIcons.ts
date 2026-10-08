// Bubble icons that come from the game's catalogs.
//
// Each maker returns `null` when the catalog does not know the object;
// `compose` then drops the fragment and the sentence reads without a picture.
// On purpose: a made-up atlas key raises no error, it draws an empty square,
// which is worse than a bare sentence. Catalogs are read on each call.

import { eggCatalog, petCatalog, plantCatalog } from "../../../data";
import { API_TO_INTERNAL } from "../../../ui/kit/sprites/resolver";
import { mutationChip, type BubbleTag, type GameThingTag, type MutationTag, type PetThingTag } from "./bubbleTags";

type CatalogSprite = { name?: unknown; sprite?: unknown; tileRef?: unknown } | undefined;

/**
 * An icon's size in a bubble, in pixels.
 *
 * Without it the game sizes the icon on its font, 13 px at the usual zoom,
 * where a crop is unreadable. The tag only takes an absolute value while the
 * game's font follows the render (13, 15, 21, 33 depending on zoom), so "one
 * and a half times the text" cannot be asked for. It is set for the middle
 * steps, where reading happens most.
 */
const BUBBLE_ICON_PX = 28;

/**
 * A pet's size in a bubble, smaller than the rest.
 *
 * The game makes the same difference in its own inline rendering: a factor of
 * 0.7 for a pet against 1.35 for everything else. Their art has more margin
 * around the subject, so at equal size they crush the line. The spirit of that
 * ratio is kept without going down to half, which would make the pet as small
 * as the text.
 */
const PET_ICON_PX = 20;

/**
 * A catalog entry's atlas frame key, like `sprite/plant/Carrot`.
 *
 * That is what `Sprite.from` resolves in the game's cache; the keys come from
 * the atlas JSON, not the bundle. Two shapes depending on the source: the
 * bundled catalog gives the key in `tileRef`; the live catalog, downloaded
 * from the mod's API, serves a URL (`.../assets/sprites/plants/Carrot.png?v=1125`)
 * whose key must be rebuilt: singular category, then name.
 *
 * The query is cut BEFORE the extension: the other order leaves `?v=1125`
 * stuck to the name, which drew an empty square.
 */
function spriteKeyOf(entry: CatalogSprite): string | null {
  if (typeof entry?.tileRef === "string" && entry.tileRef) return entry.tileRef;

  const url = entry?.sprite;
  if (typeof url !== "string" || !url) return null;
  if (url.startsWith("sprite/")) return url;

  const parts = url.split(/[?#]/)[0].split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const name = parts[parts.length - 1].replace(/\.[a-z0-9]+$/i, "");
  const category = API_TO_INTERNAL[parts[parts.length - 2].toLowerCase()];
  return name && category ? `sprite/${category}/${name}` : null;
}

function thing(entry: CatalogSprite, label: string, iconSizePx = BUBBLE_ICON_PX): GameThingTag | null {
  const sprite = spriteKeyOf(entry);
  if (!sprite) return null;
  return { gameThing: { name: label, sprite }, iconSizePx };
}

type PlantEntry = { seed?: CatalogSprite; plant?: CatalogSprite; crop?: CatalogSprite } | undefined;

function plantEntry(species: string): PlantEntry {
  return (plantCatalog as Record<string, PlantEntry>)[species];
}

/** A species' crop, icon only. */
export function cropIcon(species: string): GameThingTag | null {
  const entry = plantEntry(species);
  return thing(entry?.crop ?? entry?.plant, "");
}

/** A species' seed, icon only. */
export function seedIcon(species: string): GameThingTag | null {
  return thing(plantEntry(species)?.seed, "");
}

/** An egg, icon only. */
export function eggIcon(eggId: string): GameThingTag | null {
  return thing((eggCatalog as Record<string, CatalogSprite>)[eggId], "");
}

/**
 * A crop variant: its sprite, then its mutations as chips.
 *
 * The game cannot stack a mutation on a crop in a bubble: its mutated plant
 * compositor lives in a private cache no tag reaches. So they go side by side,
 * which says the same. The chips carry their own names: the sentence need not
 * repeat them.
 */
export function variantIcons(species: string, mutations: string[]): BubbleTag[] {
  const crop = cropIcon(species);
  return [...(crop ? [crop] : []), ...mutationChips(mutations)];
}

/* ---------------------------------- pets ---------------------------------- */

/**
 * A species' pet, as a flat catalog icon.
 *
 * For summaries: a sale of twenty-three pets does not need twenty-three
 * composed renders. To show ONE specific pet, `petThing` does far better.
 */
export function petSpeciesIcon(species: string): GameThingTag | null {
  return thing((petCatalog as Record<string, CatalogSprite>)[species], "", PET_ICON_PX);
}

/**
 * A specific pet, drawn by the game's renderer.
 *
 * The only tag that really composes: it takes the inventory object and hands
 * it to the pet renderer, so a Gold Bee comes out golden. `gameThing` cannot,
 * it only stacks a texture. `null` without an object: the tag would raise a
 * render error rather than settle for an empty square.
 */
export function petThing(item: unknown, name: string): PetThingTag | null {
  if (!item || typeof item !== "object") return null;
  return { petThing: { name, pet: item }, iconSizePx: PET_ICON_PX };
}

/**
 * One icon per species of a group of pets, the most numerous first.
 *
 * The composed render first, using the first pet of each species: the only
 * path that draws a pet in a bubble. The atlas key is only a fallback, for
 * the thread.
 */
export function petRowIcons(pets: Array<{ species: string; item?: unknown }>, limit = 2): BubbleTag[] {
  const counts = new Map<string, number>();
  for (const pet of pets) counts.set(pet.species, (counts.get(pet.species) ?? 0) + 1);

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([species]) => species);

  const icons: BubbleTag[] = [];
  for (const species of ranked) {
    const one = pets.find((pet) => pet.species === species);
    const icon = petThing(one?.item, "") ?? petSpeciesIcon(species);
    if (icon) icons.push(icon);
  }
  return icons;
}

/* ------------------------------- mutations -------------------------------- */

/**
 * The chips of a list of mutations.
 *
 * Each chip already carries its name next to the icon: the sentence that
 * introduces them need not name them, it would say it twice.
 */
export function mutationChips(mutations: string[], backgroundColor?: number): MutationTag[] {
  // The same size as the other icons: a chip at text size would get lost
  // next to a 28 px crop.
  return mutations.map((mutation) => ({ ...mutationChip(mutation, backgroundColor), iconSizePx: BUBBLE_ICON_PX }));
}
