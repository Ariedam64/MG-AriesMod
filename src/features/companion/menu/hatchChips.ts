// Thumbnails for the keep rules: species and abilities.
//
// An ability has no sprite, it has a colour: the one the pet manager already
// gives it. That one is reused rather than inventing a second: it is the cue
// the player already has in mind.

import { attachSpriteIcon } from "../../../ui/kit/sprites/iconCache";
import { getAbilityChipColors } from "../../pets/abilityChipColors";
import { iconSlot, part } from "./dom";

const SPRITE_LOG_TAG = "companion-hatch";
const ICON_PX = 26;

/**
 * A species' pet.
 *
 * The initial as a fallback is not decoration: some recent species have no
 * entry in the bundled atlas yet, and an empty box would look like a bug.
 */
export function petSpeciesIcon(species: string, sizePx = ICON_PX): HTMLElement {
  const box = iconSlot(sizePx);
  const candidates = [species, species.replace(/\s+/g, "")].filter(Boolean);
  attachSpriteIcon(box, ["pet"], candidates, sizePx, SPRITE_LOG_TAG, {
    onNoSpriteFound: () => {
      box.replaceChildren(part("span", "qws-cmp-initial", species.charAt(0).toUpperCase()));
    },
  });
  return box;
}

/** An ability's coloured chip, in the pet manager's colours. */
export function abilityIcon(abilityId: string, sizePx = ICON_PX): HTMLElement {
  const box = iconSlot(sizePx);
  const chip = part("span", "qws-cmp-ability");
  chip.style.background = getAbilityChipColors(abilityId).bg;
  box.append(chip);
  return box;
}
