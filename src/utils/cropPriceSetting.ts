// src/utils/cropPriceSetting.ts
// Affiche ou masque le prix que le mod ajoute à l'infobulle des crops.
//
// Deux affichages le lisent : le badge posé sur la carte Pixi du jardin
// (`cropValuePixi.ts`) et la ligne ajoutée aux infobulles HTML
// (`cropValues.ts`). Tous deux s'abonnent ici, pour que le bouton du menu Misc
// agisse tout de suite, sans rechargement.
//
// Module à part plutôt que dans `services/misc.ts` : celui-ci tire le joueur,
// les inventaires et les modales, et ces deux utilitaires n'ont besoin que
// d'un booléen.

import { readAriesPath, writeAriesPath } from "./localStorage";

const PATH_SHOW_CROP_PRICE = "misc.showCropPrice";

const listeners = new Set<(on: boolean) => void>();

/** Affiché tant que le joueur ne l'a pas explicitement coupé. */
export function readShowCropPrice(): boolean {
  try {
    return readAriesPath<unknown>(PATH_SHOW_CROP_PRICE) !== false;
  } catch {
    return true;
  }
}

export function writeShowCropPrice(on: boolean): void {
  const next = !!on;
  if (readShowCropPrice() === next) return;
  try {
    writeAriesPath(PATH_SHOW_CROP_PRICE, next);
  } catch {}
  for (const listener of listeners) {
    try {
      listener(next);
    } catch {}
  }
}

export function onShowCropPriceChange(cb: (on: boolean) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
