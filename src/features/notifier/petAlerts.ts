import { PetsService } from "../pets/pets";
import type { PetInfo } from "../../game/player";
import { clamp } from "../../lib/math";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { audio } from "./audio/audio";

/**
 * Hunger alerts for the active pets: a sound when a pet's hunger drops below
 * the threshold. With one shared threshold ("general"), one alert covers
 * every pet; otherwise each pet uses its own stored setting.
 */

type PetAlertPref = {
  enabled?: boolean;
  thresholdPct?: number;
};

type PetAlertPrefs = {
  globalEnabled: boolean;
  generalEnabled: boolean;
  defaultThresholdPct: number;
  pets: Record<string, PetAlertPref>;
};

const PREFS_PATH = "pets.alerts";
const ACTIVE_PET_SLOTS = 3;

const clampPct = (v: number) => clamp(Math.round(v), 1, 100);

let prefs: PetAlertPrefs = {
  globalEnabled: true,
  generalEnabled: false,
  defaultThresholdPct: 25,
  pets: {},
};

let started = false;
let lastPets: PetInfo[] = [];
/** Whether each pet was below its threshold at the last check. */
const wasBelow = new Map<string, boolean>();
/** Pets the Feeding Trough will feed; null while unknown or unreadable. */
let troughFed: Set<string> | null = null;

function loadPrefs(): void {
  const stored = readAriesPath<PetAlertPrefs>(PREFS_PATH);
  if (!stored || typeof stored !== "object") return;
  prefs = {
    globalEnabled: stored.globalEnabled !== false,
    generalEnabled: !!stored.generalEnabled,
    defaultThresholdPct: clampPct(stored.defaultThresholdPct ?? prefs.defaultThresholdPct),
    pets: typeof stored.pets === "object" && stored.pets ? stored.pets : {},
  };
}

function savePrefs(): void {
  writeAriesPath(PREFS_PATH, prefs);
}

function prefFor(petId: string): { enabled: boolean; thresholdPct: number } {
  const baseThreshold = clampPct(prefs.defaultThresholdPct);
  if (prefs.generalEnabled) return { enabled: prefs.globalEnabled !== false, thresholdPct: baseThreshold };
  if (!petId) return { enabled: false, thresholdPct: baseThreshold };
  const entry = prefs.pets[petId] ?? {};
  return { enabled: entry.enabled ?? false, thresholdPct: clampPct(entry.thresholdPct ?? baseThreshold) };
}

/**
 * Whether a pet's hunger alert should sound. A pet the Feeding Trough will
 * feed stays quiet, as the game's own warning does; a null set means the
 * trough could not be read, and the alert behaves as before.
 */
export function hungerAlertDue(
  petId: string,
  enabled: boolean,
  hungerPct: number,
  thresholdPct: number,
  troughFedIds: Set<string> | null
): boolean {
  if (!enabled || !Number.isFinite(hungerPct) || hungerPct >= thresholdPct) return false;
  return !troughFedIds?.has(petId);
}

function evaluatePet(pet: PetInfo): void {
  const petId = String(pet?.slot?.id || "");
  if (!petId || !prefs.globalEnabled) {
    wasBelow.set(petId, false);
    return;
  }

  const { enabled, thresholdPct } = prefFor(petId);
  const below = hungerAlertDue(petId, enabled, PetsService.getHungerPctFor(pet), thresholdPct, troughFed);
  const loopKey = prefs.generalEnabled ? "pets:general" : `pet:${petId}`;

  if (!below) {
    audio.stopLoop(loopKey);
  } else if (audio.getPlaybackMode("pets") === "loop" || !wasBelow.get(petId)) {
    // A loop is (re)started on every update; a one-shot plays when the pet crosses the threshold.
    audio.trigger(loopKey, {}, "pets").catch(() => {});
  }
  wasBelow.set(petId, below);
}

function evaluateAll(): void {
  for (const pet of lastPets) {
    try {
      evaluatePet(pet);
    } catch {}
  }
}

export const PetAlertService = {
  async start(): Promise<void> {
    if (started) return;
    loadPrefs();
    try {
      await PetsService.onPetsChangeNow((pets) => {
        lastPets = Array.isArray(pets) ? pets.slice(0, ACTIVE_PET_SLOTS) : [];
        evaluateAll();
      });
    } catch {}
    try {
      // Re-evaluated when the trough changes, so an alert comes back once the
      // trough runs out of food for that pet.
      await PetsService.onTroughFedChange((ids) => {
        troughFed = ids;
        evaluateAll();
      });
    } catch {}
    started = true;
  },

  isGeneralEnabled(): boolean {
    return !!prefs.generalEnabled;
  },

  setGeneralEnabled(on: boolean): void {
    prefs.generalEnabled = on;
    savePrefs();
    evaluateAll();
  },

  getGeneralThresholdPct(): number {
    return clampPct(prefs.defaultThresholdPct);
  },

  /** Sets the shared threshold and returns it as stored (whole percent, 1 to 100). */
  setGeneralThresholdPct(pct: number): number {
    prefs.defaultThresholdPct = clampPct(pct);
    savePrefs();
    evaluateAll();
    return prefs.defaultThresholdPct;
  },
};
