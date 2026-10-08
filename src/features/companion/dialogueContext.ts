// Contextual line providers: the only part of the dialogue that reads the game.
//
// Kept apart from `dialogue.ts`, which stays pure and checked outside the
// browser. Counting and phrasing live in `dialogueLines.ts`, pure as well. No
// game data is hardcoded: everything goes through the atoms and services.

import { weatherCatalog } from "../../data";
import { Atoms } from "../../game/store/atoms";
import { PetsService } from "../pets/pets";
import type { ContextualLine } from "./dialogue";
import {
  harvestMessage,
  hungryPetMessage,
  ripeCropCount,
  sellMessage,
  weatherDisplayName,
  weatherEmote,
  weatherMessage,
} from "./dialogueLines";
import { EmoteType } from "./emoteTypes";

/** Hunger below which a pet gets mentioned. */
const HUNGRY_PET_THRESHOLD_PCT = 25;

/**
 * Reads the game and returns the lines worth saying, most important first.
 * Each provider is isolated: a read that fails gives `null` and does not stop
 * the others from answering.
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
      // A silent provider must never stop the others.
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
  // The catalog is read here, not at import: at document-start the API has not
  // answered, and a frozen copy would keep the bundled names all session.
  const name = weatherDisplayName(weather, weatherCatalog);
  return { key: "weather", message: weatherMessage(weather, name, Math.random), emote: weatherEmote(weather) };
}
