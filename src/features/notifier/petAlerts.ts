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

function evaluatePet(pet: PetInfo): void {
  const petId = String(pet?.slot?.id || "");
  if (!petId || !prefs.globalEnabled) {
    wasBelow.set(petId, false);
    return;
  }

  const { enabled, thresholdPct } = prefFor(petId);
  const hungerPct = PetsService.getHungerPctFor(pet);
  const below = enabled && Number.isFinite(hungerPct) && hungerPct < thresholdPct;
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
