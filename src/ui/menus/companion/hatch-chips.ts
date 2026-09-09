// src/ui/menus/companion/hatch-chips.ts
// Vignettes des critères de conservation : espèces, capacités.
//
// Une capacité n'a pas de sprite — elle a une couleur, celle que le gestionnaire
// d'animaux lui donne déjà. On reprend la même plutôt que d'en inventer une
// seconde : c'est le repère que le joueur a déjà en tête.

import { attachSpriteIcon } from "../../spriteIconCache";
import { getAbilityChipColors } from "../pets-ability-colors";
import { TEXT_DIM, css } from "../panel-ui";

const SPRITE_LOG_TAG = "companion-hatch";
const ICON_PX = 26;

function iconHolder(sizePx: number): HTMLElement {
  const box = document.createElement("div");
  css(box, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    flex: "0 0 auto",
  });
  return box;
}

/**
 * L'animal d'une espèce.
 *
 * Le repli sur l'initiale n'est pas décoratif : certaines espèces récentes
 * n'ont pas encore d'entrée dans l'atlas embarqué, et une case vide ne se
 * distinguerait pas d'un bug.
 */
export function petSpeciesIcon(species: string, sizePx = ICON_PX): HTMLElement {
  const box = iconHolder(sizePx);
  const candidates = [species, species.replace(/\s+/g, "")].filter(Boolean);
  attachSpriteIcon(box, ["pet"], candidates, sizePx, SPRITE_LOG_TAG, {
    onNoSpriteFound: () => {
      css(box, { fontSize: "12px", fontWeight: "700", color: TEXT_DIM });
      box.textContent = species.charAt(0).toUpperCase();
    },
  });
  return box;
}

/** La pastille colorée d'une capacité, dans les couleurs du gestionnaire d'animaux. */
export function abilityIcon(abilityId: string, sizePx = ICON_PX): HTMLElement {
  const box = iconHolder(sizePx);
  const square = document.createElement("span");
  const { bg } = getAbilityChipColors(abilityId);
  css(square, {
    display: "inline-block",
    width: "13px",
    height: "13px",
    borderRadius: "4px",
    background: bg,
    boxShadow: "0 0 0 1px rgba(0,0,0,0.4) inset, 0 0 0 1px rgba(255,255,255,0.1)",
  });
  box.append(square);
  return box;
}
