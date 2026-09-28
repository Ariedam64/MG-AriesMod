// src/services/companion/dialogueContext.ts
// Fournisseurs de répliques contextuelles : la seule partie du dialogue qui lit
// l'état du jeu.
//
// Séparé de `dialogue.ts` (qui reste pur et testable hors navigateur) pour la
// même raison que `movement.ts` l'est : la logique de choix se teste, la lecture
// de l'état se branche. Le compte et la tournure des phrases vivent dans
// `dialogueLines.ts`, pur lui aussi.
//
// Aucune donnée de jeu n'est écrite en dur : tout passe par les atomes et les
// services existants (règle core.md).

import { weatherCatalog } from "../../data";
import { Atoms } from "../../store/atoms";
import { PetsService } from "../pets";
import type { ContextualLine } from "./dialogue";
import {
  harvestMessage,
  hungryPetMessage,
  ripeCropCount,
  sellMessage,
  weatherDisplayName,
  weatherMessage,
} from "./dialogueLines";
import { EmoteType } from "./emoteTypes";
import { weatherEmote } from "./reactions";

/** Seuil de faim en dessous duquel un pet est signalé. */
const HUNGRY_PET_THRESHOLD_PCT = 25;

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
  const ready = ripeCropCount(await Atoms.data.gardenTileObjects.get(), Date.now());
  if (ready === 0) return null;
  return { key: "harvest", message: harvestMessage(ready, Math.random), emote: EmoteType.Clapping };
}

async function hungryPetLine(): Promise<ContextualLine | null> {
  const pets = await PetsService.getPets();
  if (!Array.isArray(pets) || pets.length === 0) return null;

  const hungry = pets.filter((pet) => {
    const pct = PetsService.getHungerPctFor(pet as never);
    return Number.isFinite(pct) && pct < HUNGRY_PET_THRESHOLD_PCT;
  });
  if (hungry.length === 0) return null;

  return { key: "pets", message: hungryPetMessage(hungry.length, Math.random), emote: EmoteType.Crying };
}

async function cropsToSellLine(): Promise<ContextualLine | null> {
  const total = Number(await Atoms.shop.totalCropSellPrice.get());
  if (!Number.isFinite(total) || total <= 0) return null;
  return { key: "sell", message: sellMessage(total, Math.random), emote: EmoteType.Clapping };
}

async function weatherLine(): Promise<ContextualLine | null> {
  const weather = await Atoms.data.weather.get();
  if (!weather || typeof weather !== "string") return null;
  // Catalogue lu ici, pas à l'import : au `document-start` l'API n'a pas encore
  // répondu, et une copie figée garderait les noms embarqués toute la session.
  const name = weatherDisplayName(weather, weatherCatalog);
  return { key: "weather", message: weatherMessage(weather, name, Math.random), emote: weatherEmote(weather) };
}
