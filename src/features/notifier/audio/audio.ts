import { clamp } from "../../../lib/math";
import { encodeSoundFile } from "./encode";
import { SoundLibrary, looksLikeDataUrl, toDataUrl } from "./library";
import { AUDIO_CONTEXTS, AudioSettings, MIN_LOOP_GAP_MS, type ContextSettings } from "./settings";
import type { AudioContextKey, PlaybackMode, StopConfig, TriggerOverrides } from "./types";

export type { AudioContextKey, PlaybackMode, TriggerOverrides } from "./types";

/**
 * The alert sound engine. Plays one-shots through a queue that keeps them
 * apart, and loops until they are stopped (by hand, or once the item is
 * bought). Sounds come from the library, settings from each context.
 */

type LoopState = {
  key: string;
  context: AudioContextKey;
  timer: number | null;
  stopped: boolean;
  soundOverride?: string;
  stopOverride: StopConfig | null;
  loopIntervalOverride: number | null;
  baseStop: StopConfig;
  baseLoopInterval: number;
  volumeOverride: number | null;
  volume: number;
};

type PendingOneshot = {
  key: string;
  dataUrl: string | null;
  volume: number;
  context: AudioContextKey;
};

const clamp01 = (v: number) => clamp(v, 0, 1);

class AudioNotifier {
  private readonly settings = new AudioSettings();
  private readonly library = new SoundLibrary();
  private lastPlayTs = 0;

  private readonly loops = new Map<string, LoopState>();
  private oneshotQueue: PendingOneshot[] = [];
  private oneshotQueueTimer: number | null = null;
  private oneshotProcessing = false;

  /** Asked before each loop play when the loop stops on purchase. */
  private purchaseChecker?: (itemId: string) => boolean;

  private audioCtx: AudioContext | null = null;
  private primed = false;

  constructor() {
    this.library.load();
    this.settings.load();
    if (this.ensureValidDefaults()) this.settings.save();
  }

  private ctx(context: AudioContextKey): ContextSettings {
    return this.settings.contexts[context];
  }

  /**
   * Points every context's default sound at a sound that exists: the shops
   * fall back to the built-in sound, weather and pets to the shops' sound.
   * Returns whether anything changed.
   */
  private ensureValidDefaults(): boolean {
    const fallback = this.library.names()[0] ?? null;
    const valid = (name: string | null, prefer?: string | null) => {
      if (name && this.library.has(name)) return name;
      if (prefer && this.library.has(prefer)) return prefer;
      return fallback;
    };
    let changed = false;
    const shops = valid(this.ctx("shops").defaultSoundName);
    for (const key of AUDIO_CONTEXTS) {
      const target = this.ctx(key);
      const next = key === "shops" ? shops : valid(target.defaultSoundName, shops);
      if (next !== target.defaultSoundName) {
        target.defaultSoundName = next;
        changed = true;
      }
    }
    return changed;
  }

  /* ================================ Library ================================ */

  listSounds(): string[] {
    return this.library.names();
  }

  isProtectedSound(name: string): boolean {
    return this.library.isBuiltin(name);
  }

  private registerSound(name: string, dataUrl: string): void {
    this.library.add(name, dataUrl);
    let defaultsChanged = false;
    for (const key of AUDIO_CONTEXTS) {
      if (!this.ctx(key).defaultSoundName) {
        this.ctx(key).defaultSoundName = name;
        defaultsChanged = true;
      }
    }
    if (defaultsChanged) this.settings.save();
  }

  unregisterSound(name: string): void {
    if (!this.library.remove(name)) return;
    let wasDefault = false;
    for (const key of AUDIO_CONTEXTS) {
      if (this.ctx(key).defaultSoundName === name) {
        this.ctx(key).defaultSoundName = null;
        wasDefault = true;
      }
    }
    if (wasDefault || this.ensureValidDefaults()) this.settings.save();
  }

  /**
   * Imports audio files into the library, under unique names. A context with
   * no default sound yet gets the first one imported. Returns the names added
   * and an error line per file that failed.
   */
  async importFiles(files: Iterable<File>): Promise<{ added: string[]; errors: string[] }> {
    const added: string[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        const dataUrl = await encodeSoundFile(file);
        const name = this.library.uniqueName(file.name);
        this.registerSound(name, dataUrl);
        added.push(name);
      } catch (e: any) {
        errors.push(`Failed for "${file.name}": ${e?.message || e}`);
      }
    }
    if (added.length) {
      for (const key of AUDIO_CONTEXTS) {
        if (!this.getDefaultSoundName(key)) this.setDefaultSoundByName(added[0], key);
      }
    }
    return { added, errors };
  }

  setDefaultSoundByName(name: string, context: AudioContextKey = "shops"): void {
    if (!this.library.has(name) || this.ctx(context).defaultSoundName === name) return;
    this.ctx(context).defaultSoundName = name;
    this.settings.save();
  }

  /** The context's default sound; weather and pets fall back to the shops' one. */
  getDefaultSoundName(context: AudioContextKey = "shops"): string | null {
    const own = this.ctx(context).defaultSoundName;
    return context === "shops" ? own : own ?? this.ctx("shops").defaultSoundName;
  }

  /** A sound name or data URL as a playable data URL; nothing means the context's default. */
  private resolveToDataUrl(src: string | null | undefined, context: AudioContextKey): string | null {
    if (!src) {
      const name = this.getDefaultSoundName(context);
      return (name && this.library.get(name)) || null;
    }
    const s = src.trim();
    const named = this.library.get(s);
    if (named) return named;
    if (looksLikeDataUrl(s)) return s;
    if (/^[A-Za-z0-9+/=\s]+$/.test(s) && s.length > 100) return toDataUrl(s);
    return null;
  }

  /* =============================== Settings ================================ */

  setVolume(v: number, context: AudioContextKey = "shops"): void {
    const next = clamp01(v);
    if (this.ctx(context).volume === next) return;
    this.ctx(context).volume = next;
    this.forEachLoop(context, (st) => {
      if (st.volumeOverride == null) st.volume = next;
    });
    this.settings.save();
  }

  setPlaybackMode(mode: PlaybackMode, context: AudioContextKey = "shops"): void {
    if (this.ctx(context).mode === mode) return;
    this.ctx(context).mode = mode;
    this.settings.save();
  }

  getPlaybackMode(context: AudioContextKey = "shops"): PlaybackMode {
    return this.ctx(context).mode;
  }

  private setStop(mode: StopConfig["mode"], context: AudioContextKey): void {
    if (this.ctx(context).stop.mode === mode) return;
    this.ctx(context).stop = { mode };
    this.forEachLoop(context, (st) => {
      st.baseStop = { mode };
    });
    this.settings.save();
  }

  setStopManual(context: AudioContextKey = "shops"): void {
    this.setStop("manual", context);
  }

  setStopPurchase(context: AudioContextKey = "shops"): void {
    this.setStop("purchase", context);
  }

  setLoopInterval(ms: number, context: AudioContextKey = "shops"): void {
    const next = Math.max(MIN_LOOP_GAP_MS, ms | 0);
    if (this.ctx(context).loopIntervalMs === next) return;
    this.ctx(context).loopIntervalMs = next;
    this.forEachLoop(context, (st) => {
      st.baseLoopInterval = next;
    });
    this.settings.save();
  }

  getLoopInterval(context: AudioContextKey = "shops"): number {
    return this.ctx(context).loopIntervalMs;
  }

  setPurchaseChecker(fn?: (itemId: string) => boolean): void {
    this.purchaseChecker = fn;
  }

  getPlaybackSettings(context: AudioContextKey = "shops") {
    const ctx = this.ctx(context);
    return {
      volume: ctx.volume,
      mode: ctx.mode,
      stop: { mode: ctx.stop.mode },
      loopIntervalMs: ctx.loopIntervalMs,
      defaultSoundName: this.getDefaultSoundName(context),
    };
  }

  /* =============================== Playback ================================ */

  /**
   * Plays the alert `key` in the context's mode (or the override's). A loop
   * replaces any loop already running under the same key.
   */
  async trigger(key = "global", overrides: TriggerOverrides = {}, context: AudioContextKey = "shops"): Promise<void> {
    const sound = typeof overrides.sound === "string" && overrides.sound.trim() ? overrides.sound.trim() : undefined;
    const mode = overrides.mode === "oneshot" || overrides.mode === "loop" ? overrides.mode : this.ctx(context).mode;
    const rawVolume = overrides.volume == null ? NaN : Number(overrides.volume);
    const volumeOverride = Number.isFinite(rawVolume) ? clamp01(rawVolume) : null;
    const volume = volumeOverride ?? this.ctx(context).volume;

    this.stopLoop(key);
    if (mode === "oneshot") {
      this.enqueueOneshot({ key, dataUrl: this.resolveToDataUrl(sound ?? null, context), volume, context });
      return;
    }

    const stopOverride = overrides.stop ? { mode: overrides.stop.mode === "purchase" ? "purchase" : "manual" } as StopConfig : null;
    const interval = overrides.loopIntervalMs;
    const state: LoopState = {
      key,
      context,
      timer: null,
      stopped: false,
      soundOverride: sound,
      stopOverride,
      loopIntervalOverride: interval != null && Number.isFinite(interval) ? Math.max(MIN_LOOP_GAP_MS, Math.round(interval)) : null,
      baseStop: { mode: this.ctx(context).stop.mode },
      baseLoopInterval: this.ctx(context).loopIntervalMs,
      volumeOverride,
      volume,
    };
    this.loops.set(key, state);
    this.runLoop(state);
  }

  private forEachLoop(context: AudioContextKey, fn: (state: LoopState) => void): void {
    for (const st of this.loops.values()) {
      if (st.context === context) fn(st);
    }
  }

  stopLoop(key = "global"): void {
    const st = this.loops.get(key);
    if (!st) return;
    st.stopped = true;
    if (st.timer != null) clearTimeout(st.timer);
    st.timer = null;
    this.loops.delete(key);
  }

  stopAllLoops(): void {
    for (const key of [...this.loops.keys()]) this.stopLoop(key);
  }

  /** Unlocks audio on a user gesture, for browsers that block sound until one. */
  async prime(): Promise<void> {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audioCtx.state === "suspended") await this.audioCtx.resume();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.02);
    } catch {}
    this.primed = true;
  }

  /**
   * Plays one sound. Returns false when it came too soon after the previous
   * one (the caller retries). Without a sound, beeps if audio is unlocked.
   */
  private async playOnce(dataUrl: string | null, volume: number, awaitEnd = false): Promise<boolean> {
    if (!this.settings.enabled) return true;
    const now = Date.now();
    if (now - this.lastPlayTs < this.settings.minPlayGapMs) return false;
    this.lastPlayTs = now;

    if (!dataUrl) {
      if (this.primed && this.audioCtx) {
        try {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          gain.gain.value = volume * 0.1;
          osc.frequency.value = 880;
          osc.connect(gain).connect(this.audioCtx.destination);
          osc.start();
          osc.stop(this.audioCtx.currentTime + 0.06);
        } catch {}
      }
      return true;
    }

    try {
      const el = new Audio();
      el.src = dataUrl;
      el.volume = volume;
      el.crossOrigin = "anonymous";
      let ended: Promise<void> | null = null;
      let finish: (() => void) | null = null;
      if (awaitEnd) {
        ended = new Promise<void>((resolve) => {
          const done = () => {
            el.removeEventListener("ended", done);
            el.removeEventListener("error", done);
            resolve();
          };
          finish = done;
          el.addEventListener("ended", done);
          el.addEventListener("error", done);
        });
      }
      await el.play().catch(() => finish?.());
      if (ended) await ended;
    } catch {}
    return true;
  }

  /** One loop iteration: check the stop condition, play to the end, wait the interval, repeat. */
  private runLoop(state: LoopState): void {
    const run = async () => {
      if (state.stopped) return;
      const stop = state.stopOverride ?? state.baseStop;
      if (stop.mode === "purchase" && this.purchaseChecker) {
        try {
          if (this.purchaseChecker(state.key)) {
            this.stopLoop(state.key);
            return;
          }
        } catch {}
      }
      // Wait for the clip to end, so a sound never restarts over itself.
      await this.playOnce(this.resolveToDataUrl(state.soundOverride, state.context), state.volume, true);
      if (state.stopped) return;
      const gap = Math.max(MIN_LOOP_GAP_MS, (state.loopIntervalOverride ?? state.baseLoopInterval) | 0);
      state.timer = window.setTimeout(() => this.runLoop(state), gap);
    };
    run().catch(() => {});
  }

  /** Weather one-shots jump ahead of the shops' and pets' ones. */
  private enqueueOneshot(entry: PendingOneshot): void {
    const firstOther = entry.context === "weather" ? this.oneshotQueue.findIndex((item) => item.context !== "weather") : -1;
    if (firstOther === -1) this.oneshotQueue.push(entry);
    else this.oneshotQueue.splice(firstOther, 0, entry);
    this.scheduleOneshots();
  }

  private scheduleOneshots(): void {
    if (!this.oneshotQueue.length || this.oneshotQueueTimer != null) return;
    const wait = Math.max(0, this.settings.minPlayGapMs - (Date.now() - this.lastPlayTs));
    this.oneshotQueueTimer = window.setTimeout(() => {
      this.oneshotQueueTimer = null;
      if (!this.oneshotProcessing) this.playNextOneshot();
    }, wait);
  }

  private playNextOneshot(): void {
    const next = this.oneshotQueue.shift();
    if (!next) return;
    this.oneshotProcessing = true;
    void (async () => {
      let tooSoon = false;
      try {
        tooSoon = !(await this.playOnce(next.dataUrl, next.volume));
      } finally {
        this.oneshotProcessing = false;
        if (tooSoon) this.enqueueOneshot(next);
        this.scheduleOneshots();
      }
    })().catch(() => {});
  }
}

export const audio = new AudioNotifier();
