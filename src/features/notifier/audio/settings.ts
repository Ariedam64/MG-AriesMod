import { clamp } from "../../../lib/math";
import { readAriesPath, writeAriesPath } from "../../../platform/storage";
import type { AudioContextKey, PlaybackMode, StopConfig } from "./types";

/**
 * The sound settings of each alert context (shops, weather, pets), and the
 * two global ones (sound on, minimum gap between plays), kept in storage.
 */

export type ContextSettings = {
  volume: number;
  mode: PlaybackMode;
  stop: StopConfig;
  loopIntervalMs: number;
  defaultSoundName: string | null;
};

const SETTINGS_PATH = "audio.settings";

export const AUDIO_CONTEXTS: AudioContextKey[] = ["shops", "weather", "pets"];
export const MIN_LOOP_GAP_MS = 150;

const DEFAULT_VOLUME = 0.7;
const DEFAULT_LOOP_INTERVAL_MS = 1500;
const DEFAULT_MIN_PLAY_GAP_MS = 1200;

const freshContext = (): ContextSettings => ({
  volume: DEFAULT_VOLUME,
  mode: "oneshot",
  stop: { mode: "manual" },
  loopIntervalMs: DEFAULT_LOOP_INTERVAL_MS,
  defaultSoundName: null,
});

/** A stored stop condition. The retired "repeat" mode reads as manual. */
function readStop(value: unknown): StopConfig | null {
  const mode = (value as { mode?: unknown } | null)?.mode;
  if (mode === "purchase") return { mode: "purchase" };
  if (mode === "manual" || mode === "repeat") return { mode: "manual" };
  return null;
}

/** Applies the fields of a stored context that are valid; returns which ones were. */
function applyStored(target: ContextSettings, stored: Record<string, unknown>): Set<keyof ContextSettings> {
  const loaded = new Set<keyof ContextSettings>();
  if (typeof stored.volume === "number") {
    target.volume = clamp(stored.volume, 0, 1);
    loaded.add("volume");
  }
  if (stored.mode === "loop" || stored.mode === "oneshot") {
    target.mode = stored.mode;
    loaded.add("mode");
  }
  const stop = stored.stop && typeof stored.stop === "object" ? readStop(stored.stop) : null;
  if (stop) {
    target.stop = stop;
    loaded.add("stop");
  }
  if (typeof stored.loopIntervalMs === "number" && Number.isFinite(stored.loopIntervalMs)) {
    target.loopIntervalMs = Math.max(MIN_LOOP_GAP_MS, Math.floor(stored.loopIntervalMs));
    loaded.add("loopIntervalMs");
  }
  if (typeof stored.defaultSoundName === "string") {
    target.defaultSoundName = stored.defaultSoundName.trim() || null;
    loaded.add("defaultSoundName");
  }
  return loaded;
}

export class AudioSettings {
  enabled = true;
  minPlayGapMs = DEFAULT_MIN_PLAY_GAP_MS;
  readonly contexts: Record<AudioContextKey, ContextSettings> = {
    shops: freshContext(),
    weather: freshContext(),
    pets: freshContext(),
  };

  /**
   * Reads the stored settings. The shops' settings also sit at the top level,
   * where builds before per-context settings kept them, and a weather or pets
   * field never stored falls back to the shops' value.
   */
  load(): void {
    const stored = readAriesPath<Record<string, any>>(SETTINGS_PATH);
    if (!stored || typeof stored !== "object") return;

    if (typeof stored.enabled === "boolean") this.enabled = stored.enabled;
    if (typeof stored.minPlayGapMs === "number") this.minPlayGapMs = Math.max(0, stored.minPlayGapMs | 0);

    const shops = this.contexts.shops;
    applyStored(shops, {
      ...stored,
      loopIntervalMs: typeof stored.loopIntervalMs === "number" ? Math.max(MIN_LOOP_GAP_MS, stored.loopIntervalMs | 0) : undefined,
    });

    const contexts = stored.contexts && typeof stored.contexts === "object" ? stored.contexts : {};
    const shopsStored = contexts.shops;
    if (shopsStored && typeof shopsStored === "object") applyStored(shops, shopsStored);

    for (const key of ["weather", "pets"] as const) {
      const target = this.contexts[key];
      const conf = contexts[key];
      const loaded = conf && typeof conf === "object" ? applyStored(target, conf) : new Set<keyof ContextSettings>();
      if (!loaded.has("volume")) target.volume = shops.volume;
      if (!loaded.has("mode")) target.mode = shops.mode;
      if (!loaded.has("stop")) target.stop = { mode: shops.stop.mode };
      if (!loaded.has("loopIntervalMs")) target.loopIntervalMs = shops.loopIntervalMs;
      if (!loaded.has("defaultSoundName")) target.defaultSoundName = shops.defaultSoundName;
    }
  }

  save(): void {
    const { shops } = this.contexts;
    const contexts = Object.fromEntries(AUDIO_CONTEXTS.map((key) => [key, { ...this.contexts[key] }]));
    writeAriesPath(SETTINGS_PATH, {
      enabled: this.enabled,
      volume: shops.volume,
      minPlayGapMs: this.minPlayGapMs,
      mode: shops.mode,
      stop: shops.stop,
      loopIntervalMs: shops.loopIntervalMs,
      defaultSoundName: shops.defaultSoundName,
      contexts,
    });
  }
}
