// src/services/companion/state.ts
// Lecture et écriture des réglages du companion, sous `aries_mod.companion`.
//
// La *forme* de ces réglages vit dans `settingsShape.ts`, qui est pur. Ici ne
// reste que le stockage, et les deux commodités qui en découlent.

import { readAriesPath, writeAriesPath } from "../../utils/localStorage";
import { DEFAULT_COMPANION_SETTINGS, coerceSettings, type CompanionSettings, type SettingsGroup } from "./settingsShape";

// Ré-exportés pour que les appelants n'aient qu'une porte d'entrée.
export * from "./settingsShape";

const STORAGE_PATH = "companion";

/** Relit la config en réparant toute valeur absente ou invalide. */
export function loadCompanionSettings(): CompanionSettings {
  return coerceSettings(readAriesPath<Partial<CompanionSettings>>(STORAGE_PATH, undefined));
}

export function saveCompanionSettings(settings: CompanionSettings): void {
  writeAriesPath(STORAGE_PATH, settings);
}

/** Met à jour une partie de la config et rend la version consolidée. */
export function patchCompanionSettings(patch: Partial<CompanionSettings>): CompanionSettings {
  saveCompanionSettings({ ...loadCompanionSettings(), ...patch });
  return loadCompanionSettings();
}

/** Le joueur n'a jamais ouvert cet écran de réglages. */
export function isUnreviewed(group: SettingsGroup): boolean {
  return !loadCompanionSettings().reviewedSettings.includes(group);
}

/** Note qu'un écran de réglages a été ouvert. Idempotent. */
export function markReviewed(group: SettingsGroup): void {
  const current = loadCompanionSettings().reviewedSettings;
  if (current.includes(group)) return;
  patchCompanionSettings({ reviewedSettings: [...current, group] });
}
