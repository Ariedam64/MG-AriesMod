import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { Emitter } from "../../lib/emitter";
import { clamp } from "../../lib/math";
import { audio, type PlaybackMode, type TriggerOverrides } from "./audio";

/**
 * Custom alert rules: per item (`Seed:Carrot`) or per weather (`Weather:Rain`)
 * overrides of the sound, volume and loop settings, plus the loop defaults of
 * the shops and weather alerts.
 */

export type NotifierContext = "shops" | "weather";

type StopMode = "manual" | "purchase";

export type NotifierRule = {
  sound?: string | null;
  /** Volume override (0..1). When absent, the context's volume applies. */
  volume?: number | null;
  playbackMode?: PlaybackMode | null;
  stopMode?: StopMode | null;
  loopIntervalMs?: number | null;
};

/** A stored rule: only the fields that override something. */
type StoredRule = {
  sound?: string;
  volume?: number;
  playbackMode?: PlaybackMode;
  stopMode?: StopMode;
  loopIntervalMs?: number;
};

export type ContextStopDefaults = {
  stopMode: StopMode;
  stopRepeats: number | null;
  loopIntervalMs: number;
};

const RULES_PATH = "notifier.rules";
const LOOP_DEFAULTS_PATH = "notifier.loopDefaults";

const MIN_LOOP_INTERVAL_MS = 150;

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/* ================================== Rules ================================== */

let rules = new Map<string, StoredRule>();
let rulesLoaded = false;
const rulesChanged = new Emitter<Record<string, NotifierRule>>();

function sanitizeVolume(value: unknown): number | undefined {
  if (value == null) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  // Very old rules stored a percentage.
  return clamp(num > 1 ? num / 100 : num, 0, 1);
}

function sanitizeLoopInterval(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(MIN_LOOP_INTERVAL_MS, Math.floor(n)) : undefined;
}

/** Applies a patch: a field present in the patch replaces the stored one, or clears it when invalid. */
function mergeRule(prev: StoredRule | undefined, patch: Partial<NotifierRule>): StoredRule | null {
  const next: StoredRule = { ...(prev ?? {}) };
  const set = <K extends keyof StoredRule>(key: K, value: StoredRule[K] | undefined) => {
    if (value === undefined) delete next[key];
    else next[key] = value;
  };

  if (hasOwn(patch, "sound")) {
    const sound = typeof patch.sound === "string" ? patch.sound.trim() : "";
    set("sound", sound || undefined);
  }
  if (hasOwn(patch, "volume")) set("volume", sanitizeVolume(patch.volume));
  if (hasOwn(patch, "playbackMode")) {
    const mode = patch.playbackMode;
    set("playbackMode", mode === "oneshot" || mode === "loop" ? mode : undefined);
  }
  // "manual" is every context's fallback, so only "purchase" is worth storing.
  if (hasOwn(patch, "stopMode")) set("stopMode", patch.stopMode === "purchase" ? "purchase" : undefined);
  if (hasOwn(patch, "loopIntervalMs")) set("loopIntervalMs", sanitizeLoopInterval(patch.loopIntervalMs));

  return Object.keys(next).length ? next : null;
}

function rulesEqual(a: StoredRule | null | undefined, b: StoredRule | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.sound === b.sound &&
    a.volume === b.volume &&
    a.playbackMode === b.playbackMode &&
    a.stopMode === b.stopMode &&
    a.loopIntervalMs === b.loopIntervalMs
  );
}

function ensureRulesLoaded(): void {
  if (rulesLoaded) return;
  rulesLoaded = true;
  rules = new Map();
  const stored = readAriesPath<Record<string, Partial<NotifierRule>>>(RULES_PATH);
  if (!stored || typeof stored !== "object") return;
  for (const [id, raw] of Object.entries(stored)) {
    const rule = mergeRule(undefined, raw && typeof raw === "object" ? raw : {});
    if (rule) rules.set(String(id), rule);
  }
}

function saveRules(): void {
  const out: Record<string, StoredRule> = {};
  for (const [id, rule] of rules) out[id] = { ...rule };
  writeAriesPath(RULES_PATH, out);
}

const copyRule = (rule: StoredRule): NotifierRule => ({ ...rule });

function rulesSnapshot(): Record<string, NotifierRule> {
  ensureRulesLoaded();
  const out: Record<string, NotifierRule> = {};
  for (const [id, rule] of rules) out[id] = copyRule(rule);
  return out;
}

function commitRules(): void {
  saveRules();
  rulesChanged.emit(rulesSnapshot());
}

export const NotifierRules = {
  get(id: string): NotifierRule | null {
    if (!id) return null;
    ensureRulesLoaded();
    const rule = rules.get(id);
    return rule ? copyRule(rule) : null;
  },

  getAll(): Record<string, NotifierRule> {
    return rulesSnapshot();
  },

  set(id: string, patch: Partial<NotifierRule>): void {
    if (!id || !patch || typeof patch !== "object") return;
    ensureRulesLoaded();
    const prev = rules.get(id);
    const next = mergeRule(prev, patch);
    if (rulesEqual(prev, next)) return;
    if (next) rules.set(id, next);
    else rules.delete(id);
    commitRules();
  },

  clear(id: string): void {
    if (!id) return;
    ensureRulesLoaded();
    if (rules.delete(id)) commitRules();
  },

  onChange(cb: (all: Record<string, NotifierRule>) => void): () => void {
    ensureRulesLoaded();
    return rulesChanged.on(cb);
  },
};

/** Whether a rule overrides anything at all. */
function hasRule(rule: NotifierRule | null | undefined): rule is NotifierRule {
  return !!(rule && (rule.sound || rule.volume != null || rule.playbackMode || rule.stopMode || rule.loopIntervalMs != null));
}

/** The audio overrides a shop rule asks for, or null when it asks for none. */
export function ruleOverrides(rule: NotifierRule | null | undefined): TriggerOverrides | null {
  if (!rule) return null;
  const overrides: TriggerOverrides = {};
  if (rule.sound) overrides.sound = rule.sound;
  if (rule.volume != null && Number.isFinite(rule.volume)) overrides.volume = clamp(Number(rule.volume), 0, 1);
  if (rule.playbackMode === "loop" || rule.playbackMode === "oneshot") overrides.mode = rule.playbackMode;
  if (rule.stopMode === "purchase" || rule.stopMode === "manual") overrides.stop = { mode: rule.stopMode };
  if (rule.loopIntervalMs != null && Number.isFinite(rule.loopIntervalMs)) {
    overrides.loopIntervalMs = Math.max(MIN_LOOP_INTERVAL_MS, Math.floor(Number(rule.loopIntervalMs)));
  }
  return Object.keys(overrides).length ? overrides : null;
}

/** A sound name short enough for a summary line. */
function shortSoundName(name: string): string {
  return name.length > 32 ? `${name.slice(0, 29)}…` : name;
}

function formatInterval(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 1) return `${ms} ms`;
  return seconds >= 10 ? `${Math.round(seconds)} s` : `${(Math.round(seconds * 10) / 10).toFixed(1)} s`;
}

/** One line describing what a rule overrides, e.g. "Sound: Ding • Volume: 40%". */
export function formatRuleSummary(rule?: NotifierRule | null): string {
  if (!rule) return "";
  const parts: string[] = [];
  if (rule.sound) {
    const label = audio.listSounds().includes(rule.sound) ? rule.sound : shortSoundName(rule.sound);
    parts.push(`Sound: ${label}`);
  }
  if (rule.volume != null) parts.push(`Volume: ${Math.round(clamp(Number(rule.volume), 0, 1) * 100)}%`);
  if (rule.playbackMode === "oneshot") parts.push("Mode: One-shot");
  else if (rule.playbackMode === "loop") parts.push("Mode: Loop");
  if (rule.stopMode === "purchase") parts.push("Stop: Until purchase");
  else if (rule.stopMode === "manual") parts.push("Stop: Manual");
  if (rule.loopIntervalMs != null) {
    const raw = Number(rule.loopIntervalMs);
    if (Number.isFinite(raw)) parts.push(`Interval: ${formatInterval(Math.max(1, Math.round(raw)))}`);
  }
  return parts.join(" • ");
}

/* ============================== Loop defaults ============================== */

// Only the loop interval is really per context: shop loops always stop on
// purchase and weather alerts never loop. The stop fields are still written,
// in the shape older builds stored.
let loopIntervals: Partial<Record<NotifierContext, number>> = {};
let loopDefaultsLoaded = false;

const normalizeInterval = (ms: number) => Math.max(MIN_LOOP_INTERVAL_MS, Math.floor(ms || 0));

function ensureLoopDefaultsLoaded(): void {
  if (loopDefaultsLoaded) return;
  loopDefaultsLoaded = true;
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

function saveLoopDefaults(): void {
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
    ensureLoopDefaultsLoaded();
    const loopIntervalMs = normalizeInterval(loopIntervals[context] ?? audio.getLoopInterval(context));
    return { stopMode: context === "shops" ? "purchase" : "manual", stopRepeats: null, loopIntervalMs };
  },

  /** Remembers a context's loop interval; an invalid one keeps the current value. */
  setLoopInterval(context: NotifierContext, ms: number): void {
    ensureLoopDefaultsLoaded();
    const current = LoopDefaults.get(context).loopIntervalMs;
    loopIntervals[context] = Number.isFinite(ms) ? normalizeInterval(ms) : current;
    saveLoopDefaults();
  },
};
