import { startColorPolling } from "./abilityColors";
import { fetchAllData } from "./capture";
import { captureState } from "./state";
import type { DataBag, DataKey } from "./types";

export { formatAbilityLog, isPetAbilityAction } from "./abilityFormatter";

/** Live game data from the public Magic Garden API, shared on the page as `window.MGData`. */
export const MGData = {
  /** Starts the API fetch and the ability colour enrichment. */
  init(): void {
    void fetchAllData();
    startColorPolling();
  },

  /** Live data for a key, or null until the API has answered. */
  get<K extends DataKey>(key: K): DataBag[K] {
    return captureState.data[key];
  },
};
