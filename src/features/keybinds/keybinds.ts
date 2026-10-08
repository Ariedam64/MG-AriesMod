// The shortcut registry: which actions exist, the key each one is bound to,
// and who to tell when that changes. Bindings persist under `keybinds.*` in the
// mod's storage; an action never rebound keeps its catalog default.

import { Emitter } from "../../lib/emitter";
import { hotkeyToPretty, hotkeyToString, matchHotkey, stringToHotkey, type Hotkey } from "../../lib/hotkey";
import { readAriesPath, updateAriesPath } from "../../platform/storage";
import {
  SECTION_CONFIG,
  type KeybindAction,
  type KeybindActionConfig,
  type KeybindId,
  type KeybindSection,
} from "./catalog";

export type { Hotkey } from "../../lib/hotkey";
export type { KeybindAction, KeybindActionConfig, KeybindId, KeybindSection } from "./catalog";

const BINDINGS_PATH = "keybinds.bindings";
const HOLD_PATH = "keybinds.hold";
/** The storage key the `storage` event reports when another tab saves. */
const ARIES_ROOT_KEY = "aries_mod";
/** Stored for an action the player cleared, so its default does not come back. */
const STORED_NONE = "__none__";

/** What an unbound action reads as in a label. */
const UNBOUND_LABEL = "None";

const sections: KeybindSection[] = SECTION_CONFIG.map((section) => ({ ...section, actions: [] }));
const actions = new Map<KeybindId, KeybindAction>();
const holdDefaults = new Map<KeybindId, boolean>();

const cache = new Map<KeybindId, Hotkey | null>();
const holdCache = new Map<KeybindId, boolean>();
const changes = new Map<KeybindId, Emitter<Hotkey | null>>();
const holdChanges = new Map<KeybindId, Emitter<boolean>>();

const cloneHotkey = (hk: Hotkey | null | undefined): Hotkey | null => (hk ? { ...hk } : null);

/* -------------------------------- registry -------------------------------- */

function register(section: KeybindSection, config: KeybindActionConfig): void {
  const action: KeybindAction = {
    ...config,
    sectionId: section.id,
    defaultHotkey: cloneHotkey(config.defaultHotkey),
    holdDetection: config.holdDetection ? { ...config.holdDetection } : undefined,
  };
  actions.set(action.id, action);
  if (action.holdDetection) holdDefaults.set(action.id, !!action.holdDetection.defaultEnabled);
  section.actions.push(action);
}

for (let i = 0; i < SECTION_CONFIG.length; i++) {
  for (const config of SECTION_CONFIG[i].actions) register(sections[i], config);
}

/**
 * Replaces the runtime actions of a section, the ones that follow the player's
 * data, like one action per pet team. The section's catalog actions stay
 * first. Bindings are stored by id, so an action that comes back keeps its key.
 */
export function setDynamicActions(sectionId: string, configs: KeybindActionConfig[]): void {
  const index = SECTION_CONFIG.findIndex((s) => s.id === sectionId);
  if (index < 0) return;
  const section = sections[index];
  const fixed = new Set(SECTION_CONFIG[index].actions.map((a) => a.id));
  for (const old of section.actions) {
    if (fixed.has(old.id)) continue;
    actions.delete(old.id);
    holdDefaults.delete(old.id);
    cache.delete(old.id);
    holdCache.delete(old.id);
  }
  section.actions = section.actions.filter((a) => fixed.has(a.id));
  for (const config of configs) {
    if (!fixed.has(config.id)) register(section, config);
  }
}

export function getKeybindSections(): KeybindSection[] {
  return sections.map((section) => ({
    ...section,
    actions: section.actions.map((action) => ({
      ...action,
      defaultHotkey: cloneHotkey(action.defaultHotkey),
      holdDetection: action.holdDetection ? { ...action.holdDetection } : undefined,
    })),
  }));
}

/* --------------------------------- storage -------------------------------- */

function readStored(id: KeybindId): Hotkey | null | undefined {
  const raw = readAriesPath<Record<string, unknown>>(BINDINGS_PATH)?.[id];
  if (raw == null) return undefined;
  if (raw === STORED_NONE || typeof raw !== "string") return null;
  return stringToHotkey(raw) ?? null;
}

function writeStored(id: KeybindId, hk: Hotkey | null | undefined): void {
  updateAriesPath<Record<string, unknown>>(BINDINGS_PATH, (current) => {
    const next = current && typeof current === "object" ? { ...current } : {};
    if (hk === undefined) delete next[id];
    else next[id] = hk ? hotkeyToString(hk) : STORED_NONE;
    return next;
  });
}

function readHoldStored(id: KeybindId): boolean | undefined {
  const raw = readAriesPath<Record<string, unknown>>(HOLD_PATH)?.[id];
  if (typeof raw === "string") return raw === "1";
  if (typeof raw === "number") return raw === 1;
  if (typeof raw === "boolean") return raw;
  return undefined;
}

function writeHoldStored(id: KeybindId, enabled: boolean): void {
  updateAriesPath<Record<string, unknown>>(HOLD_PATH, (current) => {
    const next = current && typeof current === "object" ? { ...current } : {};
    next[id] = enabled;
    return next;
  });
}

/* ------------------------------ change events ----------------------------- */

function emitterFor<T>(map: Map<KeybindId, Emitter<T>>, id: KeybindId): Emitter<T> {
  let emitter = map.get(id);
  if (!emitter) {
    emitter = new Emitter<T>();
    map.set(id, emitter);
  }
  return emitter;
}

function emitChange(id: KeybindId): void {
  changes.get(id)?.emit(getKeybind(id));
}

function emitHoldChange(id: KeybindId): void {
  holdChanges.get(id)?.emit(getKeybindHoldDetection(id));
}

export function onKeybindChange(id: KeybindId, cb: (hk: Hotkey | null) => void): () => void {
  return emitterFor(changes, id).on(cb);
}

export function onKeybindHoldDetectionChange(id: KeybindId, cb: (enabled: boolean) => void): () => void {
  if (!holdDefaults.has(id)) return () => {};
  return emitterFor(holdChanges, id).on(cb);
}

/* -------------------------------- bindings -------------------------------- */

export function getKeybind(id: KeybindId): Hotkey | null {
  if (!cache.has(id)) {
    const stored = readStored(id);
    cache.set(id, stored === undefined ? cloneHotkey(actions.get(id)?.defaultHotkey) : stored);
  }
  return cloneHotkey(cache.get(id));
}

export function getDefaultKeybind(id: KeybindId): Hotkey | null {
  return cloneHotkey(actions.get(id)?.defaultHotkey);
}

/** Binds an action. Any other action holding the same key loses it. */
export function setKeybind(id: KeybindId, hk: Hotkey | null): void {
  const next = cloneHotkey(hk);
  const wanted = hotkeyToString(next);
  if (hotkeyToString(getKeybind(id)) === wanted) return;

  if (next) {
    for (const otherId of actions.keys()) {
      if (otherId === id || hotkeyToString(getKeybind(otherId)) !== wanted) continue;
      cache.set(otherId, null);
      writeStored(otherId, null);
      emitChange(otherId);
    }
  }

  cache.set(id, next);
  writeStored(id, next);
  emitChange(id);
}

export function resetKeybind(id: KeybindId): void {
  cache.delete(id);
  writeStored(id, undefined);
  emitChange(id);
}

export function getKeybindHoldDetection(id: KeybindId): boolean {
  if (!holdDefaults.has(id)) return false;
  if (!holdCache.has(id)) {
    const stored = readHoldStored(id);
    holdCache.set(id, stored === undefined ? !!holdDefaults.get(id) : stored);
  }
  return holdCache.get(id) ?? false;
}

export function setKeybindHoldDetection(id: KeybindId, enabled: boolean): void {
  if (!holdDefaults.has(id) || getKeybindHoldDetection(id) === enabled) return;
  holdCache.set(id, enabled);
  writeHoldStored(id, enabled);
  emitHoldChange(id);
}

export function eventMatchesKeybind(id: KeybindId, e: KeyboardEvent): boolean {
  return matchHotkey(e, getKeybind(id));
}

/** The binding as a player reads it, the same way the Keybinds menu shows it. */
export function getKeybindLabel(id: KeybindId): string {
  const hk = getKeybind(id);
  return hk ? hotkeyToPretty(hk) : UNBOUND_LABEL;
}

// Another tab saved: drop the cached bindings and let every listener re-read.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== ARIES_ROOT_KEY) return;
    cache.clear();
    holdCache.clear();
    for (const id of actions.keys()) emitChange(id);
    for (const id of holdDefaults.keys()) emitHoldChange(id);
  });
}
