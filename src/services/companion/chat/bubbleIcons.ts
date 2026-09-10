// src/services/companion/chat/bubbleIcons.ts
// Les icônes de bulle qui viennent des catalogues du jeu.
//
// Séparé de `bubbleTags.ts` parce que les catalogues traversent le pont d'état
// dès l'import : le composeur, lui, doit rester vérifiable hors navigateur.
//
// Chaque fabricant rend `null` quand le catalogue ne connaît pas l'objet.
// `compose` fait alors disparaître le fragment, et la phrase se lit sans image.
// C'est voulu : une clé d'atlas inventée ne lève pas d'erreur, elle dessine un
// carré vide, ce qui est pire qu'une phrase nue.

import { eggCatalog, petCatalog, plantCatalog } from "../../../data";
import { mutationChip, type BubbleTag, type GameThingTag, type MutationTag, type PetThingTag } from "./bubbleTags";
import { API_TO_INTERNAL } from "../../../ui/spriteResolver";

type CatalogSprite = { name?: unknown; sprite?: unknown; tileRef?: unknown } | undefined;

/**
 * Taille d'une icône en bulle, en pixels.
 *
 * Sans elle, le jeu dimensionne l'icône sur sa police — 13 px au zoom courant —
 * et un crop y devient illisible. Le tag n'accepte qu'une valeur absolue, alors
 * que la police du jeu, elle, suit le rendu (13, 15, 21, 33 selon le zoom) : on
 * ne peut donc pas demander « une fois et demie le texte ». On cale sur les
 * paliers du milieu, où la lecture se fait le plus souvent.
 */
const BUBBLE_ICON_PX = 28;

/**
 * Taille d'un animal en bulle, plus petite que le reste.
 *
 * Le jeu fait la même distinction dans son propre rendu en ligne : facteur
 * `0.7` pour un animal contre `1.35` pour tout le reste. Leur art porte plus de
 * marge autour du sujet, donc à taille égale ils écrasent la ligne.
 *
 * On garde l'esprit de ce rapport sans aller jusqu'à la moitié, qui rendrait
 * l'animal aussi menu que le texte.
 */
const PET_ICON_PX = 20;

/**
 * La clé de frame d'atlas d'une entrée de catalogue, façon `sprite/plant/Carrot`.
 *
 * C'est ce que `Sprite.from` résout dans le cache du jeu — les clés viennent
 * des JSON d'atlas, pas du bundle, d'où leur absence du code du jeu.
 *
 * Deux formes selon la source. Le catalogue embarqué donne directement la clé
 * dans `tileRef`. Le catalogue dynamique, lui, est téléchargé depuis l'API du
 * mod et sert une URL — `…/assets/sprites/plants/Carrot.png?v=1125` — dont il
 * faut refaire la clé : catégorie au singulier, puis nom.
 *
 * On retire la requête AVANT l'extension : l'ordre inverse laisse `?v=1125`
 * collé au nom, et c'est ce qui produisait un carré vide.
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

function nameOf(entry: CatalogSprite, fallback: string): string {
  return typeof entry?.name === "string" && entry.name ? entry.name : fallback;
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

/** Le crop d'une espèce, icône seule. */
export function cropIcon(species: string): GameThingTag | null {
  const entry = plantEntry(species);
  return thing(entry?.crop ?? entry?.plant, "");
}

/** Le crop d'une espèce, icône et nom. */
export function cropNamed(species: string): GameThingTag | null {
  const entry = plantEntry(species);
  const crop = entry?.crop ?? entry?.plant;
  return thing(crop, nameOf(crop, species));
}

/** La graine d'une espèce, icône seule. */
export function seedIcon(species: string): GameThingTag | null {
  return thing(plantEntry(species)?.seed, "");
}

/** Un œuf, icône seule. */
export function eggIcon(eggId: string): GameThingTag | null {
  return thing((eggCatalog as Record<string, CatalogSprite>)[eggId], "");
}

/**
 * Une variante de crop : son sprite, puis ses mutations en pastilles.
 *
 * Le jeu ne sait pas empiler une mutation sur un crop dans une bulle — son
 * compositeur de plantes mutées vit dans un cache privé, hors d'atteinte d'un
 * tag. On les met donc côte à côte, ce qui dit la même chose.
 *
 * Les pastilles portent déjà leur nom : la phrase n'a pas à les répéter.
 */
export function variantIcons(species: string, mutations: string[]): BubbleTag[] {
  const crop = cropIcon(species);
  return [...(crop ? [crop] : []), ...mutationChips(mutations)];
}

/* --------------------------------- Pets ---------------------------------- */

/**
 * L'animal d'une espèce, icône plate tirée du catalogue.
 *
 * À réserver aux résumés : une vente de vingt-trois animaux n'a pas besoin de
 * vingt-trois rendus composés. Pour montrer UN animal précis, `petThing` fait
 * bien mieux.
 */
export function petSpeciesIcon(species: string): GameThingTag | null {
  return thing((petCatalog as Record<string, CatalogSprite>)[species], "", PET_ICON_PX);
}

/**
 * Un animal précis, rendu par le moteur du jeu.
 *
 * C'est le seul tag qui compose vraiment : il reçoit l'objet d'inventaire et le
 * passe au rendu d'animal, donc un Gold Bee sort doré. `gameThing` ne le peut
 * pas, il n'empile qu'une texture.
 *
 * Rend `null` sans objet : le tag lèverait une erreur de rendu plutôt que de se
 * contenter d'un carré vide.
 */
export function petThing(item: unknown, name: string): PetThingTag | null {
  if (!item || typeof item !== "object") return null;
  return { petThing: { name, pet: item }, iconSizePx: PET_ICON_PX };
}

/**
 * Une icône par espèce d'un groupe d'animaux, la plus nombreuse d'abord.
 *
 * Le rendu composé d'abord, en prenant le premier animal de chaque espèce comme
 * représentant : c'est le seul chemin qui dessine un pet en bulle. La clé
 * d'atlas ne sert que de repli, pour le fil.
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

/* ------------------------------ Mutations -------------------------------- */

/**
 * Les pastilles d'une liste de mutations.
 *
 * Chaque pastille porte déjà son nom à côté de l'icône : la phrase qui les
 * introduit n'a donc pas à les nommer, elle dirait deux fois la même chose.
 */
export function mutationChips(mutations: string[], backgroundColor?: number): MutationTag[] {
  // Même taille que les autres icônes : une pastille à la taille du texte se
  // perdrait à côté d'un crop de 28 px.
  return mutations.map((mutation) => ({ ...mutationChip(mutation, backgroundColor), iconSizePx: BUBBLE_ICON_PX }));
}
