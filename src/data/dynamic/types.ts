// src/data/dynamic/types.ts

export type CapturedDataKey = "items" | "decor" | "mutations" | "eggs" | "pets" | "abilities" | "plants";
export type DataKey = CapturedDataKey | "weather";
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
