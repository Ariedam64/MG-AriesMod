// Thumbnails of what gets planted: a seed, or an egg.
//
// Two atlases, as the game decides: seeds have their own, eggs live with the
// pets. No name is hardcoded: the object's id and the catalogs give the
// spellings the resolver tries, rather than betting on one.

import { eggCatalog } from "../../../data";
import { eggCatalogName, seedCatalogName } from "../../../data/names";
import { attachSpriteIcon } from "../../../ui/kit/sprites/iconCache";
import type { PlantItem, PlantKind } from "../chat/plant";
import { iconSlot, part, spriteSpellings } from "./dom";

const SPRITE_LOG_TAG = "companion-plant";
const ICON_PX = 24;

function seedCandidates(species: string, name: string): string[] {
  return spriteSpellings(species, seedCatalogName(species), name);
}

function eggCandidates(eggId: string, name: string): string[] {
  const tileRef = (eggCatalog as Record<string, { tileRef?: unknown } | undefined>)[eggId]?.tileRef;
  return spriteSpellings(eggId, typeof tileRef === "string" ? tileRef : null, eggCatalogName(eggId), name);
}

/** A plantable's sprite, seed or egg, without its name. */
export function plantItemIcon(item: { kind: PlantKind; id: string; name: string }, sizePx = ICON_PX): HTMLElement {
  const box = iconSlot(sizePx);
  const isEgg = item.kind === "egg";
  const candidates = isEgg ? eggCandidates(item.id, item.name) : seedCandidates(item.id, item.name);
  if (candidates.length) attachSpriteIcon(box, isEgg ? ["pet"] : ["seed"], candidates, sizePx, SPRITE_LOG_TAG);
  return box;
}

export type PlantTile = {
  el: HTMLButtonElement;
  /** `left` is what remains in stock once the plan is served. */
  update(left: number, selected: boolean): void;
};

/**
 * A palette tile: a sprite, what is left of it, and nothing else.
 *
 * The tile updates rather than being rebuilt: painting a tile changes every
 * count, and rebuilding the palette on each stroke would reload the sprites
 * under the player's hand. At zero it greys out without vanishing: knowing
 * the carrots ran out beats wondering where they went.
 */
export function plantTile(item: PlantItem, onClick: () => void): PlantTile {
  const el = part("button", "qws-cmp-tile");
  el.type = "button";
  el.title = item.kind === "egg" ? `${item.name} (egg)` : item.name;

  const count = part("span", "qws-cmp-tile__count");
  el.append(plantItemIcon(item), count);
  el.addEventListener("click", onClick);

  return {
    el,
    update(left, selected) {
      count.textContent = String(Math.max(0, left));
      el.classList.toggle("is-selected", selected);
      el.classList.toggle("is-empty", left <= 0);
      el.setAttribute("aria-pressed", selected ? "true" : "false");
    },
  };
}
