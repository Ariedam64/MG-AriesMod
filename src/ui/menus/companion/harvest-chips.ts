// src/ui/menus/companion/harvest-chips.ts
// Vignettes de crops pour l'aperçu de récolte.
//
// Deux sources d'images, et c'est voulu : l'atlas déjà chargé pour un crop nu,
// l'API du mod pour un crop porteur de mutations, qui empile les calques côté
// serveur. Recomposer nous-mêmes reviendrait à réécrire un compositeur qui
// existe déjà, et à deviner l'ordre des calques.
//
// Aucun nom d'espèce ni de mutation n'est écrit en dur : tout vient du jardin
// observé et des catalogues.

import { plantCatalog } from "../../../data";
import { composedSpriteUrl, isComposableCategory } from "../../../mgApi/endpoints/sprites";
import { attachSpriteIcon } from "../../spriteIconCache";
import { INTERNAL_TO_API } from "../../spriteResolver";
import { setImageSafe } from "../../../utils/discordCsp";
import { BORDER, CARD_BG, TEAL, TEAL_BORDER, TEAL_DIM, TEXT, TEXT_DIM, css } from "../panel-ui";

const SPRITE_LOG_TAG = "companion-harvest";
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

/** Clé d'atlas que le catalogue donne au crop d'une espèce, ex. `sprite/plant/Aloe`. */
function catalogCropKey(species: string): string | null {
  const entry = (plantCatalog as Record<string, { crop?: { sprite?: unknown }; plant?: { sprite?: unknown } } | undefined>)[
    species
  ];
  const key = entry?.crop?.sprite ?? entry?.plant?.sprite;
  return typeof key === "string" && key ? key : null;
}

/** Toutes les graphies plausibles d'un nom dans l'atlas. */
function spellings(...names: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const name of names) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) continue;
    out.add(trimmed);
    out.add(trimmed.replace(/\W+/g, ""));
  }
  return [...out];
}

/**
 * Nom de sprite d'une espèce, débarrassé de tout ce qui n'est pas le nom.
 *
 * Selon la source des données, le catalogue sert une clé d'atlas
 * (`sprite/plant/Aloe`) ou une URL complète avec cache-buster
 * (`…/plants/Aloe.png?v=1125`). L'ordre compte : il faut retirer la requête
 * AVANT l'extension, sinon la chaîne se termine par `?v=1125` et l'extension
 * reste collée au nom — c'est ce qui produisait la clé `Aloe.png?v=1125`, que
 * l'API rejetait en 400.
 */
function spriteBaseName(species: string): string {
  const last = catalogCropKey(species)?.split("/").pop() ?? null;
  if (!last) return species;
  const withoutQuery = last.split(/[?#]/)[0];
  return withoutQuery.replace(/\.[a-z0-9]+$/i, "") || species;
}

/**
 * Sprite du crop, pas de la graine.
 *
 * Le nom seul ne suffit pas : deviner à partir de l'espèce tombe souvent sur la
 * graine, qui porte le même nom dans un autre atlas. On part donc du nom que le
 * catalogue donne au crop, et on ne retombe sur des graphies devinées que si le
 * catalogue ne connaît pas l'espèce.
 */
function attachAtlasCrop(box: HTMLElement, species: string, sizePx: number): void {
  const candidates = spellings(spriteBaseName(species), species);
  const bases = candidates.map((value) => value.replace(/icon$/i, "")).filter(Boolean);
  const all = [...new Set([...candidates, ...bases.map((base) => `${base}Icon`)])];
  if (all.length) attachSpriteIcon(box, ["crop", "tallplant", "plant"], all, sizePx, SPRITE_LOG_TAG);
}

export function speciesIcon(species: string, sizePx = ICON_PX): HTMLElement {
  const box = iconHolder(sizePx);
  attachAtlasCrop(box, species, sizePx);
  return box;
}

/**
 * URL de rendu composé d'un crop et de ses mutations.
 *
 * Le segment qui précède le nom peut être écrit dans deux vocabulaires : celui
 * du mod, au singulier (`plant`), ou celui de l'API, au pluriel (`plants`).
 * On accepte les deux, et on retombe sur les plantes en dernier recours — les
 * crops y vivent tous, `crop` n'étant qu'une catégorie de recherche interne.
 */
function composedUrl(species: string, mutations: string[]): string {
  const key = catalogCropKey(species);
  const parts = key ? key.split(/[?#]/)[0].split("/").filter(Boolean) : [];
  const segment = parts.length >= 2 ? parts[parts.length - 2] : "";
  const apiCategory = INTERNAL_TO_API[segment] ?? (isComposableCategory(segment) ? segment : "plants");
  return composedSpriteUrl(apiCategory, spriteBaseName(species), mutations);
}

/**
 * Le crop tel qu'il apparaît une fois ses mutations posées dessus.
 *
 * Le rendu composé vient du réseau et peut manquer : nom inconnu de l'API,
 * hors ligne, endpoint en erreur. Un `onerror` bascule alors sur le sprite nu
 * de l'atlas — mieux vaut le bon crop sans ses mutations qu'une case vide.
 */
export function variantIcon(species: string, mutations: string[], sizePx = ICON_PX): HTMLElement {
  if (mutations.length === 0) return speciesIcon(species, sizePx);

  const box = iconHolder(sizePx);
  const url = composedUrl(species, mutations);
  const img = document.createElement("img");
  img.alt = "";
  css(img, { maxWidth: "100%", maxHeight: "100%", imageRendering: "auto" });
  img.addEventListener("error", () => {
    // Un repli silencieux ressemble à un rendu composé qui n'aurait rien
    // superposé : on dit lequel des deux s'est produit.
    console.warn("[companion] composed sprite failed, falling back to the plain crop:", url);
    box.replaceChildren();
    attachAtlasCrop(box, species, sizePx);
  });
  setImageSafe(img, url);
  box.append(img);
  return box;
}

/**
 * Badge d'interface d'une mutation.
 *
 * L'atlas `ui` porte les pastilles rondes (`MutationGold`, `MutationWet`…) que
 * le jeu affiche dans ses propres écrans. La catégorie `mutation`, elle, porte
 * les calques appliqués sur la plante : superbes en jeu, illisibles à 26 px.
 */
export function mutationIconEl(mutation: string, sizePx = ICON_PX): HTMLElement {
  const box = iconHolder(sizePx);
  const candidates = spellings(mutation).flatMap((name) => [`Mutation${name}`, name]);
  attachSpriteIcon(box, ["ui", "mutation"], candidates, sizePx, SPRITE_LOG_TAG);
  return box;
}

/* ------------------------------- Tuiles ---------------------------------- */

export type TileOptions = {
  icon: HTMLElement;
  /** Nom complet, donné en infobulle puisqu'il n'est pas écrit. */
  title: string;
  /**
   * Effectif sous le sprite. Omis, la tuile n'affiche que l'icône.
   *
   * La récolte en a besoin : le chiffre dit combien de crops partiraient. Un
   * filtre de conservation, lui, décrit ce qu'on veut à l'avenir, et compter ce
   * qu'on possède déjà n'y répond à aucune question.
   */
  count?: number;
  selected: boolean;
  onClick: () => void;
};

/**
 * Tuile de sélection : un sprite, son effectif, et rien d'autre.
 *
 * L'état sélectionné passe par la bordure et le fond, jamais par la couleur
 * d'un texte : sur une image déjà colorée, une nuance de libellé ne se verrait
 * pas.
 */
export function spriteTile(options: TileOptions): HTMLButtonElement {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.title = options.title;
  css(tile, {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1px",
    padding: "5px 6px 3px",
    borderRadius: "10px",
    cursor: "pointer",
    lineHeight: "1",
    transition: "background 120ms ease, border-color 120ms ease",
    background: options.selected ? TEAL_DIM : CARD_BG,
    border: `1px solid ${options.selected ? TEAL_BORDER : BORDER}`,
  });

  tile.append(options.icon);
  if (options.count !== undefined) {
    const count = document.createElement("span");
    css(count, { fontSize: "10px", color: options.selected ? TEAL : TEXT_DIM });
    count.textContent = String(options.count);
    tile.append(count);
  }
  tile.addEventListener("click", options.onClick);
  tile.addEventListener("mouseenter", () => {
    if (!options.selected) css(tile, { background: "rgba(255,255,255,0.06)" });
  });
  tile.addEventListener("mouseleave", () => {
    if (!options.selected) css(tile, { background: CARD_BG });
  });

  return tile;
}

/**
 * Vignette dont le nom est écrit, à côté de l'icône plutôt qu'en infobulle.
 *
 * Pour les listes qu'on ne reconnaît pas à l'œil. Une espèce se retrouve à son
 * sprite, mais une capacité n'a qu'un carré de couleur : sur une longue liste,
 * la retrouver reviendrait à survoler les carrés un par un.
 */
export function labelledTile(options: {
  icon: HTMLElement;
  label: string;
  selected: boolean;
  onClick: () => void;
}): HTMLButtonElement {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.title = options.label;
  css(tile, {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 9px 4px 5px",
    borderRadius: "10px",
    cursor: "pointer",
    lineHeight: "1",
    transition: "background 120ms ease, border-color 120ms ease",
    background: options.selected ? TEAL_DIM : CARD_BG,
    border: `1px solid ${options.selected ? TEAL_BORDER : BORDER}`,
  });

  const name = document.createElement("span");
  css(name, {
    fontSize: "11.5px",
    fontWeight: options.selected ? "600" : "500",
    color: options.selected ? TEAL : TEXT,
    whiteSpace: "nowrap",
  });
  name.textContent = options.label;

  tile.append(options.icon, name);
  tile.addEventListener("click", options.onClick);
  tile.addEventListener("mouseenter", () => {
    if (!options.selected) css(tile, { background: "rgba(255,255,255,0.06)" });
  });
  tile.addEventListener("mouseleave", () => {
    if (!options.selected) css(tile, { background: CARD_BG });
  });

  return tile;
}

/** Tuile « tout », qui n'a pas de sprite : un mot suffit. */
export function allTile(label: string, selected: boolean, onClick: () => void): HTMLButtonElement {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.textContent = label;
  css(tile, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "40px",
    padding: "0 10px",
    alignSelf: "stretch",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "11px",
    lineHeight: "1",
    background: selected ? TEAL_DIM : CARD_BG,
    border: `1px solid ${selected ? TEAL_BORDER : BORDER}`,
    color: selected ? TEAL : TEXT,
  });
  tile.addEventListener("click", onClick);
  return tile;
}

/** Grille de tuiles, qui passe à la ligne. */
export function tileRow(): HTMLElement {
  const row = document.createElement("div");
  css(row, { display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: "5px" });
  return row;
}

export type SegmentedOption<T extends string> = { value: T; label: string; title?: string };

/** Contrôle segmenté : un choix parmi peu, sans ouvrir de liste déroulante. */
export function segmented<T extends string>(
  options: Array<SegmentedOption<T>>,
  selected: T,
  onSelect: (value: T) => void
): HTMLElement {
  const wrap = document.createElement("div");
  css(wrap, {
    display: "inline-flex",
    padding: "2px",
    gap: "2px",
    borderRadius: "9px",
    background: "rgba(0,0,0,0.22)",
    border: `1px solid ${BORDER}`,
  });

  for (const option of options) {
    const active = option.value === selected;
    const button = document.createElement("button");
    button.type = "button";
    if (option.title) button.title = option.title;
    button.textContent = option.label;
    css(button, {
      padding: "4px 10px",
      borderRadius: "7px",
      border: "none",
      cursor: "pointer",
      fontSize: "11px",
      lineHeight: "1",
      background: active ? TEAL_DIM : "transparent",
      color: active ? TEAL : TEXT_DIM,
    });
    button.addEventListener("click", () => onSelect(option.value));
    wrap.append(button);
  }

  return wrap;
}
