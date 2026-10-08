// Reading and writing the companion's settings, under `aries_mod.companion`.
//
// Their shape lives in `settingsShape.ts`, which is pure. Only storage is
// left here, and the two conveniences built on it.

import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { coerceSettings, type CompanionSettings, type SettingsGroup } from "./settingsShape";

// Re-exported so callers have a single way in.
export * from "./settingsShape";

const STORAGE_PATH = "companion";

/** Reads the settings, repairing any missing or invalid value. */
export function loadCompanionSettings(): CompanionSettings {
  return coerceSettings(readAriesPath<Partial<CompanionSettings>>(STORAGE_PATH, undefined));
}

/** Updates part of the settings and returns the whole, repaired. */
export function patchCompanionSettings(patch: Partial<CompanionSettings>): CompanionSettings {
  writeAriesPath(STORAGE_PATH, { ...loadCompanionSettings(), ...patch });
  return loadCompanionSettings();
}

/** The player never opened this settings screen. */
export function isUnreviewed(group: SettingsGroup): boolean {
  return !loadCompanionSettings().reviewedSettings.includes(group);
}

/** Notes that a settings screen was opened. Idempotent. */
export function markReviewed(group: SettingsGroup): void {
  const current = loadCompanionSettings().reviewedSettings;
  if (current.includes(group)) return;
  patchCompanionSettings({ reviewedSettings: [...current, group] });
}
