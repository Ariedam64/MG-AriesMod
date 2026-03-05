// src/data/dynamic/index.ts
// MGData - Dynamic game data capture module

import { installObjectHooks, restoreObjectHooks } from "./logic/hooks";
import { startPulseScanning, stopPulseScanning } from "./logic/scanning";
import { startWeatherPolling, stopWeatherPolling } from "./logic/weather";
import { startColorPolling, stopColorPolling } from "./logic/abilityColors";
import { resolveSprites } from "./logic/sprites";
import { getData, getAllData, hasData, waitForData, waitForAnyData } from "./logic/accessors";
import { isAllDataCaptured } from "./logic/capture";

export type { CapturedDataKey, DataKey, DataBag } from "./types";
export type { AbilityColor } from "./logic/abilityColors";
export type { ActivityLogEntry, PetAbilityAction } from "./logic/abilityFormatter";
export { formatAbilityLog, filterPetAbilityLogs, isPetAbilityAction, PET_ABILITY_ACTIONS } from "./logic/abilityFormatter";

export const MGData = {
  /** Initialize module (install hooks, start scanning, weather and color polling) */
  init(): void {
    installObjectHooks();
    startPulseScanning();
    startWeatherPolling();
    startColorPolling();
  },

  /** Check if all data has been captured */
  isReady: isAllDataCaptured,

  /** Get captured data for a specific key */
  get: getData,

  /** Get all captured data */
  getAll: getAllData,

  /** Check if data exists for a specific key */
  has: hasData,

  /** Wait for specific data to be captured */
  waitFor: waitForData,

  /** Wait for any data to be captured */
  waitForAny: waitForAnyData,

  /** Resolve sprite IDs for all captured data (call after sprite system is ready) */
  resolveSprites,

  /** Cleanup (restore hooks and stop scanning) */
  cleanup(): void {
    restoreObjectHooks();
    stopPulseScanning();
    stopWeatherPolling();
    stopColorPolling();
  },
};
