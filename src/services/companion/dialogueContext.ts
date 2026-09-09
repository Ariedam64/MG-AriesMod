// src/services/companion/dialogueContext.ts
// Fournisseurs de répliques contextuelles : la seule partie du dialogue qui lit
// l'état du jeu.
//
// Séparé de `dialogue.ts` (qui reste pur et testable hors navigateur) pour la
// même raison que `movement.ts` l'est : la logique de choix se teste, la lecture
// de l'état se branche.
//
// Aucune donnée de jeu n'est écrite en dur : tout passe par les atomes et les
// services existants (règle core.md).

import { Atoms } from "../../store/atoms";
import { PetsService } from "../pets";
import type { ContextualLine } from "./dialogue";

/**
 * Sous-slots mûrs d'une tuile.
 *
 * Compter les crops prêts ne sert ici qu'à décider s'il y a de quoi en parler :
 * on veut un effectif, pas les identifiants. La récolte, elle, passe par
 * `workflowScan`, qui résout les vrais `slotId` (les plantes sparse en ont des
 * non contigus) ; s'appuyer sur ces index-ci pour agir serait une erreur.
 */
function matureSubSlotCount(obj: unknown, now: number): number {
  const slots = (obj as { slots?: unknown })?.slots;
  if (!Array.isArray(slots)) return 0;
  let count = 0;
  for (const slot of slots) {
    const end = (slot as { endTime?: unknown } | null)?.endTime;
    if (typeof end === "number" && end > 0 && end <= now) count++;
  }
  return count;
}

/** Seuil de faim en dessous duquel un pet est signalé. */
const HUNGRY_PET_THRESHOLD_PCT = 25;

const plural = (count: number, singular: string, pluralForm: string) =>
  count === 1 ? singular : pluralForm;

/**
 * Interroge l'état du jeu et rend les répliques pertinentes, par priorité
 * décroissante. Chaque fournisseur est isolé : une lecture qui échoue rend
 * simplement `null` et n'empêche pas les autres de répondre.
 */
export async function collectContextualLines(): Promise<ContextualLine[]> {
  const providers: Array<() => Promise<ContextualLine | null>> = [
    readyHarvestLine,
    hungryPetLine,
    cropsToSellLine,
    weatherLine,
  ];

  const lines: ContextualLine[] = [];
  for (const provider of providers) {
    try {
      const line = await provider();
      if (line) lines.push(line);
    } catch {
      // Un fournisseur muet ne doit jamais empêcher les autres de parler.
    }
  }
  return lines;
}

async function readyHarvestLine(): Promise<ContextualLine | null> {
  const tileObjects = await Atoms.data.gardenTileObjects.get();
  if (!tileObjects || typeof tileObjects !== "object") return null;

  const now = Date.now();
  let ready = 0;
  for (const obj of Object.values(tileObjects as Record<string, unknown>)) {
    ready += matureSubSlotCount(obj, now);
  }
  if (ready === 0) return null;

  return {
    key: "harvest",
    message: `${ready} ${plural(ready, "crop is", "crops are")} ready to harvest, by the way.`,
  };
}

async function hungryPetLine(): Promise<ContextualLine | null> {
  const pets = await PetsService.getPets();
  if (!Array.isArray(pets) || pets.length === 0) return null;

  const hungry = pets.filter((pet) => {
    const pct = PetsService.getHungerPctFor(pet as never);
    return Number.isFinite(pct) && pct < HUNGRY_PET_THRESHOLD_PCT;
  });
  if (hungry.length === 0) return null;

  return {
    key: "pets",
    message: `${hungry.length} ${plural(hungry.length, "pet is", "pets are")} getting hungry.`,
  };
}

async function cropsToSellLine(): Promise<ContextualLine | null> {
  const total = Number(await Atoms.shop.totalCropSellPrice.get());
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    key: "sell",
    message: `You're carrying ${Math.round(total).toLocaleString("en-US")} coins worth of crops.`,
  };
}

async function weatherLine(): Promise<ContextualLine | null> {
  const weather = await Atoms.data.weather.get();
  if (!weather || typeof weather !== "string") return null;
  return { key: "weather", message: `We're getting ${weather} right now.` };
}
