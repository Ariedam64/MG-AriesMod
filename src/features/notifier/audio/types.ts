/** The three kinds of alert, each with its own sound settings. */
export type AudioContextKey = "shops" | "weather" | "pets";

export type PlaybackMode = "oneshot" | "loop";

/** When a loop stops: by hand (the alert turns off), or once the item is bought. */
export type StopConfig = { mode: "manual" } | { mode: "purchase" };

/** What a single alert may change from its context's settings. */
export type TriggerOverrides = {
  /** A library sound name, or a data URL. */
  sound?: string | null;
  mode?: PlaybackMode | null;
  stop?: StopConfig | null;
  loopIntervalMs?: number | null;
  volume?: number | null;
};
