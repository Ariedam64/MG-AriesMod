// src/ui/menus/companion/chat-icons.ts
// Dessine dans le fil les vignettes que la bulle affiche en jeu.
//
// Deux mécaniques pour une même intention. En jeu, le companion pose un tag et
// c'est le moteur du jeu qui dessine. Ici, on est dans du DOM : le balisage du
// jeu s'y afficherait en toutes lettres, donc on redessine les mêmes objets
// avec l'atlas du mod.
//
// La description vient du même endroit dans les deux cas — les tags de la
// bulle — ce qui évite que le menu finisse par dire autre chose que la bulle.

import { attachSpriteIcon } from "../../spriteIconCache";
import { css } from "../panel-ui";
import type { BubbleTag } from "../../../services/companion/chat/bubbleTags";

const SPRITE_LOG_TAG = "companion-thread";

/**
 * Découpe une clé d'atlas en catégorie et nom.
 *
 * Les tags portent le chemin complet (`sprite/plant/Carrot`) parce que c'est ce
 * que le jeu attend ; le résolveur du mod, lui, veut les deux moitiés
 * séparément. On retire la requête avant l'extension : un catalogue servi en
 * direct ajoute `?v=1125`, et l'ordre inverse laisserait l'extension collée au
 * nom.
 */
function splitSpriteKey(key: string): { category: string; name: string } | null {
  const parts = key.split(/[?#]/)[0].split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const name = parts[parts.length - 1].replace(/\.[a-z0-9]+$/i, "");
  return name ? { category: parts[parts.length - 2], name } : null;
}

function holder(sizePx: number): HTMLElement {
  const box = document.createElement("span");
  css(box, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    verticalAlign: "-4px",
    marginRight: "4px",
    flexShrink: "0",
  });
  return box;
}

/** L'espèce d'un animal, lue sur l'objet d'inventaire que porte le tag. */
function petSpeciesOf(pet: unknown): string | null {
  const species = (pet as { petSpecies?: unknown } | null)?.petSpecies;
  return typeof species === "string" && species ? species : null;
}

/**
 * Une vignette pour un tag de bulle, ou `null` si on ne sait pas la dessiner.
 *
 * Rendre `null` plutôt qu'une case vide : le texte se suffit, et un carré gris
 * devant chaque message serait pire que pas d'image du tout.
 */
export function tagIcon(tag: BubbleTag, sizePx: number): HTMLElement | null {
  if ("mutation" in tag) {
    const box = holder(sizePx);
    // L'atlas `ui` porte les pastilles rondes ; la catégorie `mutation` porte
    // les calques appliqués sur la plante, illisibles à cette taille.
    attachSpriteIcon(box, ["ui", "mutation"], [`Mutation${tag.mutation}`, tag.mutation], sizePx, SPRITE_LOG_TAG);
    return box;
  }

  if ("petThing" in tag) {
    const species = petSpeciesOf(tag.petThing.pet);
    if (!species) return null;
    const box = holder(sizePx);
    attachSpriteIcon(box, ["pet"], [species, species.replace(/\s+/g, "")], sizePx, SPRITE_LOG_TAG);
    return box;
  }

  const split = splitSpriteKey(tag.gameThing.sprite);
  if (!split) return null;
  const box = holder(sizePx);
  attachSpriteIcon(box, [split.category], [split.name], sizePx, SPRITE_LOG_TAG);
  return box;
}

/** Toutes les vignettes d'un message, dans l'ordre où la bulle les pose. */
export function tagIcons(tags: BubbleTag[] | undefined, sizePx: number): HTMLElement[] {
  if (!tags || tags.length === 0) return [];
  return tags.map((tag) => tagIcon(tag, sizePx)).filter((icon): icon is HTMLElement => icon !== null);
}

/** Le même balisage que le jeu : `<0/>` pour une icône en ligne. */
const TAG_MARKER = /<(\d+)\/>/g;

/**
 * Découpe une phrase balisée et rend ses morceaux, icônes à leur place.
 *
 * C'est ce qui sépare « un sprite puis trois noms » de « chaque nom avec son
 * sprite ». Le fil a la place de nommer, autant que l'image soit à côté de ce
 * qu'elle désigne.
 *
 * Une balise qui pointe vers une icône introuvable disparaît simplement : le
 * texte autour se referme dessus.
 */
export function renderTagged(text: string, tags: BubbleTag[] | undefined, sizePx: number): Node[] {
  if (!tags || tags.length === 0) return [document.createTextNode(text)];

  const out: Node[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TAG_MARKER)) {
    const at = match.index ?? 0;
    if (at > cursor) out.push(document.createTextNode(text.slice(cursor, at)));
    cursor = at + match[0].length;

    const tag = tags[Number(match[1])];
    const icon = tag ? tagIcon(tag, sizePx) : null;
    if (icon) out.push(icon);
  }

  if (cursor < text.length) out.push(document.createTextNode(text.slice(cursor)));
  return out;
}
