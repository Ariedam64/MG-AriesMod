// src/data/dynamic/logic/capture.ts
// Fetches all game data from the mg-api.ariedam.fr API.

import type { CapturedDataKey } from "../types";
import { captureState } from "../state";
import { getJSON } from "../../../utils/mgCommon";
import { withDiscordPollPause } from "../../../ariesModAPI/client/events";

const API_BASE = "https://mg-api.ariedam.fr";

interface ApiData {
  plants: Record<string, unknown>;
  pets: Record<string, unknown>;
  items: Record<string, unknown>;
  decor: Record<string, unknown>;
  eggs: Record<string, unknown>;
  mutations: Record<string, unknown>;
  abilities: Record<string, unknown>;
  weathers: Record<string, unknown>;
}

function setCapturedData(key: CapturedDataKey | "weather", value: Record<string, unknown>): void {
  if (captureState.data[key] != null) return;
  captureState.data[key] = value;

  try {
    window.dispatchEvent(new CustomEvent("gemini:data-updated", { detail: { key } }));
  } catch {
    /* ignore in non-browser contexts */
  }
}

export function isAllDataCaptured(): boolean {
  return Object.values(captureState.data).every((v) => v != null);
}

export async function fetchAllData(): Promise<void> {
  if (captureState.fetchStarted) return;
  captureState.fetchStarted = true;

  try {
    const data = await withDiscordPollPause(() => getJSON<ApiData>(`${API_BASE}/data`));

    if (data.plants) setCapturedData("plants", data.plants);
    if (data.pets) setCapturedData("pets", data.pets);
    if (data.items) setCapturedData("items", data.items);
    if (data.decor) setCapturedData("decor", data.decor);
    if (data.eggs) setCapturedData("eggs", data.eggs);
    if (data.mutations) setCapturedData("mutations", data.mutations);
    if (data.abilities) setCapturedData("abilities", data.abilities);
    if (data.weathers) setCapturedData("weather", data.weathers);

    captureState.fetchComplete = true;
    console.log("[MGData] all data loaded from API", {
      plants: Object.keys(data.plants || {}).length,
      pets: Object.keys(data.pets || {}).length,
      items: Object.keys(data.items || {}).length,
      decor: Object.keys(data.decor || {}).length,
      eggs: Object.keys(data.eggs || {}).length,
      mutations: Object.keys(data.mutations || {}).length,
      abilities: Object.keys(data.abilities || {}).length,
      weathers: Object.keys(data.weathers || {}).length,
    });
  } catch (err) {
    console.error("[MGData] failed to fetch data from API", err);
    // Allow retry
    captureState.fetchStarted = false;
  }
}
