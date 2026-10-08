import { spaceWords } from "../lib/format";
import { decorCatalog, eggCatalog, mutationCatalog, plantCatalog, toolCatalog } from "./index";

const entryOf = (catalog: unknown, id: string): any => (catalog as Record<string, any>)?.[id];

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// The catalog's own names, undefined when the catalog does not know the id.

export function seedCatalogName(species: string): string | undefined {
  const entry = entryOf(plantCatalog, species);
  return text(entry?.seed?.name) ?? text(entry?.plant?.name) ?? text(entry?.crop?.name);
}

export const eggCatalogName = (eggId: string) => text(entryOf(eggCatalog, eggId)?.name);
export const toolCatalogName = (toolId: string) => text(entryOf(toolCatalog, toolId)?.name);
export const decorCatalogName = (decorId: string) => text(entryOf(decorCatalog, decorId)?.name);

// Display names, each with the fallback its lists have always shown.

export function cropName(species: string): string {
  const entry = entryOf(plantCatalog, species);
  return text(entry?.crop?.name) ?? text(entry?.name) ?? spaceWords(species);
}

export const eggName = (eggId: string): string => eggCatalogName(eggId) ?? spaceWords(eggId);

export const mutationName = (mutation: string): string =>
  text(entryOf(mutationCatalog, mutation)?.name) ?? spaceWords(mutation);

export const seedLabel = (species: string): string => seedCatalogName(species) ?? `${species} Seed`;

export const decorLabel = (decorId: string): string => decorCatalogName(decorId) ?? (decorId || "Decor");
