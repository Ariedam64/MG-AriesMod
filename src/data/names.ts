// src/utils/catalogIndex.ts
import { plantCatalog, eggCatalog, toolCatalog, decorCatalog } from "./";


// Normalisation (clé/label)

// tileRef (objet/chaîne/nombre) → dernier segment normalisé

// DataURI


/* ========================= Index plantes (singleton) ======================== */



/* ============================== Helpers exports ============================= */







// --- add near the other helper exports ---

export function seedNameFromSpecies(
  species: string,
  cat: any = plantCatalog as any
): string | undefined {
  const e = cat?.[species];
  return e?.seed?.name ?? e?.plant?.name ?? e?.crop?.name ?? undefined;
}

export function eggNameFromId(
  eggId: string,
  cat: any = eggCatalog as any
): string | undefined {
  return cat?.[eggId]?.name ?? undefined;
}

export function toolNameFromId(
  toolId: string,
  cat: any = toolCatalog as any
): string | undefined {
  return cat?.[toolId]?.name ?? undefined;
}

export function decorNameFromId(
  decorId: string,
  cat: any = decorCatalog as any
): string | undefined {
  return cat?.[decorId]?.name ?? undefined;
}






// Caches





/* ---------------------------------- TOOLS --------------------------------- */



/* --------------------------------- DECOR ---------------------------------- */

