// src/data/dynamic/index.ts
// MGData - Game data module (fetched from mg-api.ariedam.fr)

import { startColorPolling, stopColorPolling } from "./abilityColors";
import { getData, getAllData, hasData, waitForData, waitForAnyData } from "./accessors";
import { isAllDataCaptured, fetchAllData } from "./capture";

;
;
;
export { formatAbilityLog, isPetAbilityAction } from "./abilityFormatter";

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
