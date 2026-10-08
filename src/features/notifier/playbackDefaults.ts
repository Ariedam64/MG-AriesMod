import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { audio, type AudioContextKey, type PlaybackMode } from "./audio/audio";

/**
 * How each kind of alert plays by default, as the Settings tab sets it: the
 * playback mode, the stop condition and the loop interval, kept on the audio
 * engine, plus the loop interval the rule editor offers as the default.
 */

export type NotifierContext = "shops" | "weather";

export type ContextStopDefaults = {
  stopMode: "manual" | "purchase";
  stopRepeats: number | null;
  loopIntervalMs: number;
};

const LOOP_DEFAULTS_PATH = "notifier.loopDefaults";

export const MIN_LOOP_INTERVAL_MS = 150;
export const MAX_LOOP_INTERVAL_MS = 10_000;

/** A loop interval typed by the player, as a whole number of ms in range; anything else is `fallback`. */
export function clampLoopInterval(raw: unknown, fallback: number): number {
  const text = typeof raw === "string" ? raw.trim() : raw;
  const n = text === "" || text == null ? NaN : Number(text);
  const value = Number.isFinite(n) ? n : fallback;
  return Math.max(MIN_LOOP_INTERVAL_MS, Math.min(MAX_LOOP_INTERVAL_MS, Math.floor(value)));
}

// Only the loop interval is really per context: shop loops always stop on
// purchase and weather alerts never loop. The stop fields are still written,
// in the shape older builds stored.
let loopIntervals: Partial<Record<NotifierContext, number>> = {};
let loaded = false;

const normalizeInterval = (ms: number) => Math.max(MIN_LOOP_INTERVAL_MS, Math.floor(ms || 0));

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  loopIntervals = {};
  const stored = readAriesPath<Record<string, any>>(LOOP_DEFAULTS_PATH);
  if (!stored || typeof stored !== "object") return;
  for (const context of ["shops", "weather"] as const) {
    const entry = stored[context];
    if (!entry) continue;
    const raw = Number(entry.loopIntervalMs);
    loopIntervals[context] = normalizeInterval(Number.isFinite(raw) ? raw : audio.getLoopInterval(context));
  }
}

function save(): void {
  const out: Record<string, ContextStopDefaults> = {};
  for (const context of ["shops", "weather"] as const) {
    const loopIntervalMs = loopIntervals[context];
    if (loopIntervalMs == null) continue;
    out[context] = { stopMode: context === "shops" ? "purchase" : "manual", stopRepeats: null, loopIntervalMs };
  }
  writeAriesPath(LOOP_DEFAULTS_PATH, out);
}

export const LoopDefaults = {
  get(context: NotifierContext): ContextStopDefaults {
    ensureLoaded();
    const loopIntervalMs = normalizeInterval(loopIntervals[context] ?? audio.getLoopInterval(context));
    return { stopMode: context === "shops" ? "purchase" : "manual", stopRepeats: null, loopIntervalMs };
  },

  /** Remembers a context's loop interval; an invalid one keeps the current value. */
  setLoopInterval(context: NotifierContext, ms: number): void {
    ensureLoaded();
    const current = LoopDefaults.get(context).loopIntervalMs;
    loopIntervals[context] = Number.isFinite(ms) ? normalizeInterval(ms) : current;
    save();
  },
};

/**
 * Applies what the Settings tab chose for a context. Shop loops stop once the
 * item is bought, weather alerts always play once, and pet loops run until
 * the alert turns off.
 */
export function setContextPlayback(context: AudioContextKey, mode: PlaybackMode, loopIntervalMs: number): void {
  audio.setPlaybackMode(context === "weather" ? "oneshot" : mode, context);
  audio.setLoopInterval(loopIntervalMs, context);
  if (context === "shops" && mode === "loop") audio.setStopPurchase(context);
  else audio.setStopManual(context);
  if (context !== "pets") LoopDefaults.setLoopInterval(context, loopIntervalMs);
}
