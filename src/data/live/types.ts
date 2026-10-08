/**
 * The live catalogs, plus `enums`, which is not a catalog: it holds the game's
 * ordered value lists (rarity order, weather order), which is where display
 * ordering comes from rather than a list written out in the mod.
 */
export type DataKey = "items" | "decor" | "mutations" | "eggs" | "pets" | "abilities" | "plants" | "weather" | "enums";
export type DataBag = Record<DataKey, Record<string, unknown> | null>;

export interface CaptureState {
  data: DataBag;
  /** Whether the API fetch has started; reset when it fails so it can be retried. */
  fetchStarted: boolean;
  /** Ability colour enrichment, retried until the abilities have landed. */
  colorPollingTimer: ReturnType<typeof setTimeout> | null;
  colorPollAttempts: number;
}
