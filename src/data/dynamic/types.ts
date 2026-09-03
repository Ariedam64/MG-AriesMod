// src/data/dynamic/types.ts

export type CapturedDataKey = "items" | "decor" | "mutations" | "eggs" | "pets" | "abilities" | "plants";
/**
 * `enums` is not a catalog: it holds the game's ordered value lists (rarity
 * order, weather order, …), which is where display ordering comes from rather
 * than a list written out in the mod.
 */
export type DataKey = CapturedDataKey | "weather" | "enums";
export type DataBag = Record<DataKey, Record<string, unknown> | null>;

export interface CaptureState {
  data: DataBag;
  /** Whether the API fetch has been started */
  fetchStarted: boolean;
  /** Whether all data has been loaded from the API */
  fetchComplete: boolean;
  /** Ability color polling (still uses bundle parsing) */
  colorPollingTimer: ReturnType<typeof setTimeout> | null;
  colorPollAttempts: number;
}
