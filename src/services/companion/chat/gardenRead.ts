// src/services/companion/chat/gardenRead.ts
// Lit le jardin et en tire ce que le companion a le droit de récolter.
//
// On réutilise `scanGarden` de `workflowScan.ts` plutôt que de relire les tuiles
// nous-mêmes : c'est lui qui porte le calcul de taille, la classification des
// mutations, et surtout la résolution du `slotId` (fix v3.1.503 — `HarvestCrop`
// attend le slotId du sous-slot, pas sa position dans le tableau ; les plantes
// sparse ont des slotIds non contigus). Dupliquer cette logique, c'est
// s'exposer à récolter le mauvais crop.
//
// Le tri entre « à prendre » et « à laisser » revient au Locker. Le companion
// n'a pas ses propres critères : ceux du Locker sont plus riches (plages de
// taille, recettes météo, exceptions par espèce) et surtout ce sont ceux que le
// joueur a déjà réglés. En avoir deux jeux, c'est promettre qu'ils divergeront.

import { Atoms } from "../../../store/atoms";
import { lockerService } from "../../locker";
import { scanGarden } from "../../workflowScan";
import { mutationsOf, type HarvestRow } from "./harvest";

/** Ce que le jardin offre, et ce que le Locker met de côté. */
export type HarvestScope = {
  rows: HarvestRow[];
  /** Crops mûrs écartés par le Locker : de quoi le dire au joueur. */
  lockedOut: number;
};

/** Espèces présentes dans le jardin. `scanGarden` filtre dessus, on ne veut rien exclure. */
function speciesInGarden(tileObjects: Record<string, unknown>): Set<string> {
  const species = new Set<string>();
  for (const raw of Object.values(tileObjects)) {
    const tile = raw as Record<string, unknown> | null;
    if (!tile || tile.objectType !== "plant") continue;
    const name = tile.species;
    if (typeof name === "string" && name) species.add(name);
  }
  return species;
}

/** Toutes les lignes du jardin, mûres ou non, sans jugement. */
export async function readHarvestRows(): Promise<HarvestRow[]> {
  let tileObjects: Record<string, unknown> | null = null;
  try {
    tileObjects = (await Atoms.data.gardenTileObjects.get()) as Record<string, unknown> | null;
  } catch {
    return [];
  }
  if (!tileObjects || typeof tileObjects !== "object") return [];

  const species = speciesInGarden(tileObjects);
  if (species.size === 0) return [];

  const scan = scanGarden(tileObjects, species);
  const now = Date.now();
  const rows: HarvestRow[] = [];

  for (const plant of scan.plants) {
    for (const crop of plant.crops) {
      rows.push({
        tileIndex: plant.tileIndex,
        // `slotIndex` porte le slotId résolu par scanGarden, pas un index de tableau.
        slotId: crop.slotIndex,
        species: crop.species,
        sizePct: crop.sizePct,
        growthPct: Math.round(crop.growthPct),
        mutations: Array.isArray(crop.mutations) ? crop.mutations : [],
        ready: crop.endTime > 0 && crop.endTime <= now,
      });
    }
  }

  return rows;
}

/**
 * Ce que le companion peut récolter : mûr, et autorisé par le Locker.
 *
 * L'espèce sert directement de clé de graine, comme le fait déjà l'interception
 * de `HarvestCrop` dans `ws-hook.ts` : le Locker indexe ses exceptions sur ce
 * nom-là. Passer par une conversion serait s'inventer un second vocabulaire, et
 * la promesse qu'il divergera un jour.
 *
 * Un Locker désactivé autorise tout, ce qui donne le comportement attendu par
 * défaut : tout ce qui est mûr.
 */
export async function readHarvestable(): Promise<HarvestScope> {
  const rows = await readHarvestRows();
  const ripe = rows.filter((row) => row.ready);

  const allowed = ripe.filter((row) => {
    try {
      return lockerService.allowsHarvest({
        seedKey: row.species,
        sizePercent: row.sizePct,
        mutations: mutationsOf(row),
      });
    } catch {
      // Un Locker en erreur ne doit pas décider à la place du joueur : on
      // s'abstient plutôt que de récolter ce qu'il protégeait peut-être.
      return false;
    }
  });

  return { rows: allowed, lockedOut: ripe.length - allowed.length };
}
