// The locker menu's working copy of the settings. The controls edit sets in
// place; every edit is saved through `lockerService` straight away, and every
// change the service announces is read back into the same objects.

import { Emitter } from "../../lib/emitter";
import { lockerService } from "./locker";
import {
  defaultSettings,
  type LockerLockMode,
  type LockerScaleLockMode,
  type LockerSettingsPersisted,
  type LockerStatePersisted,
  type VisualTag,
  type WeatherMode,
} from "./settings";
import { keepOfferedTags, normalizeRecipe } from "./weatherTags";

export type SettingsDraft = {
  minScalePct: number;
  maxScalePct: number;
  scaleLockMode: LockerScaleLockMode;
  lockMode: LockerLockMode;
  avoidNormal: boolean;
  visualMutations: Set<VisualTag>;
  weatherMode: WeatherMode;
  weatherSelected: Set<string>;
  weatherRecipes: Array<Set<string>>;
};

export type OverrideDraft = {
  enabled: boolean;
  settings: SettingsDraft;
  /** False for a species the player opened but never configured. */
  hasPersistedSettings: boolean;
};

function newDraft(): SettingsDraft {
  return draftFrom(defaultSettings());
}

function draftFrom(settings: LockerSettingsPersisted): SettingsDraft {
  const draft: SettingsDraft = {
    ...settings,
    visualMutations: new Set<VisualTag>(),
    weatherSelected: new Set(),
    weatherRecipes: [],
  };
  readInto(draft, settings);
  return draft;
}

function refill<T>(target: Set<T>, values: Iterable<T>): void {
  target.clear();
  for (const value of values) target.add(value);
}

/** Overwrites `draft` in place, sets included, so the controls holding it see the new values. */
function readInto(draft: SettingsDraft, settings: LockerSettingsPersisted): void {
  draft.minScalePct = settings.minScalePct;
  draft.maxScalePct = settings.maxScalePct;
  draft.scaleLockMode = settings.scaleLockMode;
  draft.lockMode = settings.lockMode;
  draft.avoidNormal = settings.avoidNormal;
  refill(draft.visualMutations, settings.visualMutations);
  draft.weatherMode = settings.weatherMode;
  refill(draft.weatherSelected, settings.weatherSelected);
  keepOfferedTags(draft.weatherSelected);
  draft.weatherRecipes.length = 0;
  for (const recipe of settings.weatherRecipes) {
    const set = new Set(recipe);
    keepOfferedTags(set);
    draft.weatherRecipes.push(set);
  }
}

/** Copies one draft into another in place. */
function copyDraft(target: SettingsDraft, source: SettingsDraft): void {
  readInto(target, toPersisted(source));
}

function toPersisted(draft: SettingsDraft): LockerSettingsPersisted {
  keepOfferedTags(draft.weatherSelected);
  draft.weatherRecipes.forEach(normalizeRecipe);
  return {
    minScalePct: draft.minScalePct,
    maxScalePct: draft.maxScalePct,
    scaleLockMode: draft.scaleLockMode,
    lockMode: draft.lockMode,
    avoidNormal: draft.avoidNormal,
    visualMutations: Array.from(draft.visualMutations),
    weatherMode: draft.weatherMode,
    weatherSelected: Array.from(draft.weatherSelected),
    weatherRecipes: draft.weatherRecipes.map((set) => Array.from(set)),
  };
}

export class LockerMenuStore {
  readonly global: OverrideDraft = { enabled: false, settings: newDraft(), hasPersistedSettings: true };
  private readonly overrides = new Map<string, OverrideDraft>();
  private readonly changes = new Emitter<void>();
  private syncing = false;

  constructor(initial: LockerStatePersisted) {
    this.syncFromService(initial);
  }

  subscribe(listener: () => void): () => void {
    return this.changes.on(listener);
  }

  /** Reads the saved state back in. Species the service no longer holds are forgotten. */
  syncFromService(state: LockerStatePersisted): void {
    this.syncing = true;
    try {
      this.global.enabled = state.enabled;
      readInto(this.global.settings, state.settings);
      for (const [key, value] of Object.entries(state.overrides)) {
        const entry = this.ensureOverride(key);
        entry.enabled = value.enabled;
        readInto(entry.settings, value.settings);
        entry.hasPersistedSettings = true;
      }
      for (const key of Array.from(this.overrides.keys())) {
        if (!(key in state.overrides)) this.overrides.delete(key);
      }
      this.changes.emit();
    } finally {
      this.syncing = false;
    }
  }

  setGlobalEnabled(enabled: boolean): void {
    this.global.enabled = enabled;
    this.saveGlobal();
  }

  notifyGlobalSettingsChanged(): void {
    this.saveGlobal();
  }

  /** The draft for a species, created with the defaults the first time it is opened. */
  ensureOverride(key: string): OverrideDraft {
    let entry = this.overrides.get(key);
    if (!entry) {
      entry = { enabled: false, settings: newDraft(), hasPersistedSettings: false };
      this.overrides.set(key, entry);
    }
    return entry;
  }

  isOverrideEnabled(key: string): boolean {
    return this.overrides.get(key)?.enabled === true;
  }

  setOverrideEnabled(key: string, enabled: boolean): void {
    const entry = this.ensureOverride(key);
    // A species switched on for the first time starts from the global settings.
    if (enabled && !entry.enabled && !entry.hasPersistedSettings) {
      copyDraft(entry.settings, this.global.settings);
    }
    entry.enabled = enabled;
    this.saveOverride(key);
  }

  notifyOverrideSettingsChanged(key: string): void {
    if (this.overrides.has(key)) this.saveOverride(key);
  }

  private saveGlobal(): void {
    if (this.syncing) return;
    lockerService.setGlobalState({ enabled: this.global.enabled, settings: toPersisted(this.global.settings) });
    this.changes.emit();
  }

  private saveOverride(key: string): void {
    if (this.syncing) return;
    const entry = this.overrides.get(key);
    if (!entry) return;
    entry.hasPersistedSettings = true;
    lockerService.setOverride(key, { enabled: entry.enabled, settings: toPersisted(entry.settings) });
    this.changes.emit();
  }
}
