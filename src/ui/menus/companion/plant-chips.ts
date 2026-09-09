// src/ui/menus/companion/plant-chips.ts
// Vignettes de ce qu'on plante : une graine, ou un œuf.
//
// Deux atlas différents, et c'est le jeu qui en décide ainsi : les graines ont
// le leur, les œufs vivent avec les animaux. Aucun nom n'est écrit en dur — on
// part de l'identifiant de l'objet et des catalogues, en proposant au résolveur
// les graphies plausibles plutôt qu'en pariant sur une seule.

import { eggCatalog, plantCatalog } from "../../../data";
import { attachSpriteIcon } from "../../spriteIconCache";
import { BORDER, CARD_BG, TEAL, TEAL_BORDER, TEAL_DIM, TEXT_DIM, WARN, css } from "../panel-ui";
import type { PlantItem, PlantKind } from "../../../services/companion/chat/plant";

const SPRITE_LOG_TAG = "companion-plant";
const ICON_PX = 24;

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
 * Toutes les graphies plausibles d'un nom dans un atlas.
 *
 * Un catalogue peut servir un chemin (`sprite/pet/CommonEgg`) là où l'atlas
 * n'attend que le dernier segment, et les espaces disparaissent d'une source à
 * l'autre. On propose les deux formes plutôt que de choisir à l'aveugle.
 */
function spellings(...names: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const name of names) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) continue;
    for (const form of [trimmed, trimmed.split(/[./]/).pop() ?? trimmed]) {
      if (!form) continue;
      out.add(form);
      out.add(form.replace(/\s+/g, ""));
    }
  }
  return [...out];
}

function seedCandidates(species: string, name: string): string[] {
  const entry = (plantCatalog as Record<string, { seed?: { name?: unknown } } | undefined>)[species];
  const catalogName = typeof entry?.seed?.name === "string" ? entry.seed.name : null;
  return spellings(species, catalogName, name);
}

function eggCandidates(eggId: string, name: string): string[] {
  const entry = (eggCatalog as Record<string, { tileRef?: unknown; name?: unknown } | undefined>)[eggId];
  const tileRef = typeof entry?.tileRef === "string" ? entry.tileRef : null;
  const catalogName = typeof entry?.name === "string" ? entry.name : null;
  return spellings(eggId, tileRef, catalogName, name);
}

/** Le sprite d'un posable, graine ou œuf, sans son nom. */
export function plantItemIcon(item: { kind: PlantKind; id: string; name: string }, sizePx = ICON_PX): HTMLElement {
  const box = iconHolder(sizePx);
  const isEgg = item.kind === "egg";
  const candidates = isEgg ? eggCandidates(item.id, item.name) : seedCandidates(item.id, item.name);
  if (candidates.length) {
    attachSpriteIcon(box, isEgg ? ["pet"] : ["seed"], candidates, sizePx, SPRITE_LOG_TAG);
  }
  return box;
}

/** Infobulle d'un posable : le nom, et ce que c'est quand ce n'est pas une graine. */
export function plantItemTitle(item: PlantItem): string {
  return item.kind === "egg" ? `${item.name} (egg)` : item.name;
}

export type PlantTile = {
  el: HTMLButtonElement;
  /** `left` est ce qu'il reste en réserve une fois le plan servi. */
  update(left: number, selected: boolean): void;
};

/**
 * Tuile de la palette : un sprite, ce qu'il en reste, et rien d'autre.
 *
 * La tuile se met à jour plutôt que de se reconstruire : peindre une case
 * change tous les compteurs, et rebâtir la palette à chaque geste rechargerait
 * les sprites sous la main du joueur.
 *
 * À zéro elle se grise sans disparaître — savoir qu'on n'a plus de carottes
 * vaut mieux que de chercher où elles sont passées.
 */
export function plantTile(item: PlantItem, onClick: () => void): PlantTile {
  const el = document.createElement("button");
  el.type = "button";
  el.title = plantItemTitle(item);
  css(el, {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1px",
    padding: "5px 6px 3px",
    borderRadius: "10px",
    cursor: "pointer",
    lineHeight: "1",
    transition: "background 120ms ease, border-color 120ms ease, opacity 120ms ease",
  });

  const count = document.createElement("span");
  css(count, { fontSize: "10px" });

  el.append(plantItemIcon(item), count);
  el.addEventListener("click", onClick);

  return {
    el,
    update(left, selected) {
      const empty = left <= 0;
      count.textContent = String(Math.max(0, left));
      css(el, {
        background: selected ? TEAL_DIM : CARD_BG,
        border: `1px solid ${selected ? TEAL_BORDER : BORDER}`,
        opacity: empty && !selected ? "0.45" : "1",
      });
      css(count, { color: selected ? TEAL : empty ? WARN : TEXT_DIM });
    },
  };
}
