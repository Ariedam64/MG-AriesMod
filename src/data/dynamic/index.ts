// src/data/dynamic/index.ts
// MGData - Game data module (fetched from mg-api.ariedam.fr)

import { startColorPolling, stopColorPolling } from "./logic/abilityColors";
import { getData, getAllData, hasData, waitForData, waitForAnyData } from "./logic/accessors";
import { isAllDataCaptured, fetchAllData } from "./logic/capture";

export type { CapturedDataKey, DataKey, DataBag } from "./types";
export type { AbilityColor } from "./logic/abilityColors";
export type { ActivityLogEntry, PetAbilityAction } from "./logic/abilityFormatter";
export { formatAbilityLog, filterPetAbilityLogs, isPetAbilityAction, PET_ABILITY_ACTIONS } from "./logic/abilityFormatter";

export const MGData = {
  /** Initialize module: fetch all data from API, start ability color polling */
  init(): void {
    fetchAllData();
    startColorPolling();
  },

  /** Check if all data has been loaded */
  isReady: isAllDataCaptured,

  /** Get data for a specific key */
  get: getData,

  /** Get all data */
  getAll: getAllData,

  /** Check if data exists for a specific key */
  has: hasData,

  /** Wait for specific data to be available */
  waitFor: waitForData,

  /** Wait for any data to be available */
  waitForAny: waitForAnyData,

  /** No-op (sprites now come from the API with URLs included) */
  resolveSprites(): void {
    /* no-op — API data already includes sprite URLs */
  },

  /** Cleanup */
  cleanup(): void {
    stopColorPolling();
  },
};
