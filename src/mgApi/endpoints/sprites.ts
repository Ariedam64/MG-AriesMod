// mgApi/endpoints/sprites.ts

import { buildMgApiUrl, mgApiGetJson } from "../client/http";

export type SpriteCatalogEntry = { name: string; url: string };

export type SpriteCatalogResponse = {
  count: number;
  baseUrl: string;
  categories: string[];
  sprites: Record<string, SpriteCatalogEntry[]>;
};

/** Full sprite catalog (~600 sprites), grouped by category with ready-to-use PNG URLs. */
export async function fetchSpriteCatalog(): Promise<SpriteCatalogResponse | null> {
  return mgApiGetJson<SpriteCatalogResponse>("/assets/sprites");
}

/**
 * Category id (as returned by the catalog, e.g. "plants", "tallPlants", "pets")
 * to the atlas key prefix expected by /assets/sprites/composed, e.g. "sprite/plant".
 * Confirmed live against the API: tallPlants shares the "plant" prefix with plants,
 * weather and tiles have no "sprite/" prefix.
 */
const COMPOSE_KEY_PREFIX: Record<string, string> = {
  seeds: "sprite/seed",
  plants: "sprite/plant",
  tallPlants: "sprite/plant",
  pets: "sprite/pet",
  items: "sprite/item",
  decor: "sprite/decor",
  objects: "sprite/object",
  ui: "sprite/ui",
  animations: "sprite/animation",
  winter: "sprite/winter",
  weather: "weather",
  tiles: "tile",
};

/** Whether `composedSpriteUrl` supports this category (mutations don't compose onto themselves). */
export function isComposableCategory(category: string): boolean {
  return category in COMPOSE_KEY_PREFIX;
}

/** Builds the /assets/sprites/composed URL that pre-renders mutation overlays server-side. */
export function composedSpriteUrl(category: string, name: string, mutations: string[]): string {
  const prefix = COMPOSE_KEY_PREFIX[category] ?? `sprite/${category}`;
  return buildMgApiUrl("/assets/sprites/composed", {
    key: `${prefix}/${name}`,
    mutations: mutations.length ? mutations.join(",") : undefined,
  });
}
