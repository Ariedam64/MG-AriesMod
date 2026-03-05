// src/data/index.ts
// Unified data access layer: dynamic capture first, hardcoded fallback.

import { MGData } from "./dynamic";
import * as hardcoded from "./hardcoded-data.clean.js";

export { MGData } from "./dynamic";
export type { CapturedDataKey, DataKey, DataBag, AbilityColor } from "./dynamic";
export type { ActivityLogEntry, PetAbilityAction } from "./dynamic";
export { formatAbilityLog, filterPetAbilityLogs, isPetAbilityAction, PET_ABILITY_ACTIONS } from "./dynamic";

/* ------------------------------------------------------------------ */
/*  Helper: create a proxy that reads dynamic data first, then static */
/* ------------------------------------------------------------------ */

type AnyRecord = Record<string, unknown>;

function makeCatalogProxy(dynamicKey: string, staticObj: AnyRecord): AnyRecord {
  return new Proxy(Object.create(null) as AnyRecord, {
    get(_target, prop, receiver) {
      if (typeof prop === "symbol") return undefined;
      const dynamic = MGData.get(dynamicKey as "plants") as AnyRecord | null;
      if (dynamic && prop in dynamic) return dynamic[prop];
      if (prop in staticObj) return (staticObj as AnyRecord)[prop];
      return undefined;
    },
    has(_target, prop) {
      if (typeof prop === "symbol") return false;
      const dynamic = MGData.get(dynamicKey as "plants") as AnyRecord | null;
      if (dynamic && prop in dynamic) return true;
      return prop in staticObj;
    },
    ownKeys() {
      const dynamic = MGData.get(dynamicKey as "plants") as AnyRecord | null;
      const staticKeys = Object.keys(staticObj);
      if (!dynamic) return staticKeys;
      const merged = new Set([...Object.keys(dynamic), ...staticKeys]);
      return Array.from(merged);
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === "symbol") return undefined;
      const dynamic = MGData.get(dynamicKey as "plants") as AnyRecord | null;
      if (dynamic && prop in dynamic) {
        return { configurable: true, enumerable: true, value: dynamic[prop] };
      }
      if (prop in staticObj) {
        return { configurable: true, enumerable: true, value: (staticObj as AnyRecord)[prop] };
      }
      return undefined;
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Proxied catalogs (dynamic-first, hardcoded fallback)               */
/* ------------------------------------------------------------------ */

export const plantCatalog = makeCatalogProxy("plants", hardcoded.plantCatalog as AnyRecord);
export const petCatalog = makeCatalogProxy("pets", hardcoded.petCatalog as AnyRecord);
export const petAbilities = makeCatalogProxy("abilities", hardcoded.petAbilities as AnyRecord);
export const mutationCatalog = makeCatalogProxy("mutations", hardcoded.mutationCatalog as AnyRecord);
export const eggCatalog = makeCatalogProxy("eggs", hardcoded.eggCatalog as AnyRecord);
export const toolCatalog = makeCatalogProxy("items", hardcoded.toolCatalog as AnyRecord);
export const decorCatalog = makeCatalogProxy("decor", hardcoded.decorCatalog as AnyRecord);
export const weatherCatalog = makeCatalogProxy("weather", hardcoded.weatherCatalog as AnyRecord);

/* ------------------------------------------------------------------ */
/*  Static-only re-exports (no dynamic equivalent)                     */
/* ------------------------------------------------------------------ */

export const rarity = hardcoded.rarity;
export const harvestType = hardcoded.harvestType;
export const coin = hardcoded.coin;

// Tile refs (sprite references, no dynamic equivalent)
export const tileRefsMap = hardcoded.tileRefsMap;
export const tileRefsPlants = hardcoded.tileRefsPlants;
export const tileRefsTallPlants = hardcoded.tileRefsTallPlants;
export const tileRefsSeeds = hardcoded.tileRefsSeeds;
export const tileRefsItems = hardcoded.tileRefsItems;
export const tileRefsAnimations = hardcoded.tileRefsAnimations;
export const tileRefsPets = hardcoded.tileRefsPets;
export const tileRefsMutations = hardcoded.tileRefsMutations;
export const tileRefsMutationLabels = hardcoded.tileRefsMutationLabels;
export const tileRefsDecor = hardcoded.tileRefsDecor;
