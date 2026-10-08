// src/services/pet-alerts.ts
import { PetsService } from "../pets/pets";
import type { PetInfo } from "../../game/player";
import { audio } from "./audio";
import { readAriesPath, writeAriesPath } from "../../platform/storage";

type PetAlertPref = {
  enabled?: boolean;
  thresholdPct?: number;
};

type PetAlertState = {
  globalEnabled: boolean;
  generalEnabled: boolean;
  defaultThresholdPct: number;
  pets: Record<string, PetAlertPref>;
};

const clampPct = (v: number) => Math.max(1, Math.min(100, Math.round(v)));

let prefs: PetAlertState = {
  globalEnabled: true,
  generalEnabled: false,
  defaultThresholdPct: 25,
  pets: {},
};

let started = false;
let unsubPets: (() => void) | null = null;
let lastPets: PetInfo[] = [];
const seenBelow = new Map<string, boolean>();

function loadPrefs(): PetAlertState {
  try {
    const parsed = readAriesPath<PetAlertState>("pets.alerts");
    if (parsed && typeof parsed === "object") {
      prefs = {
        globalEnabled: parsed.globalEnabled !== false,
        generalEnabled: !!parsed.generalEnabled,
        defaultThresholdPct: clampPct(parsed.defaultThresholdPct ?? prefs.defaultThresholdPct),
        pets: typeof parsed.pets === "object" && parsed.pets ? parsed.pets : {},
      };
    }
  } catch {
    /* ignore corrupted storage */
  }
  return prefs;
}

function savePrefs() {
  try {
    writeAriesPath("pets.alerts", prefs);
  } catch {
    /* ignore persist errors */
  }
}

function prefFor(petId: string): { enabled: boolean; thresholdPct: number } {
  const baseThreshold = clampPct(prefs.defaultThresholdPct);
  if (prefs.generalEnabled) {
    return { enabled: prefs.globalEnabled !== false, thresholdPct: baseThreshold };
  }
  if (!petId) return { enabled: false, thresholdPct: baseThreshold };
  const entry = prefs.pets[petId] ?? {};
  const enabled = entry.enabled ?? false;
  const thresholdPct = clampPct(entry.thresholdPct ?? baseThreshold);
  return { enabled, thresholdPct };
}

async function triggerAlert(key: string) {
  try { await audio.trigger(key, {}, "pets"); } catch {}
}

function evaluatePet(pet: PetInfo) {
  const petId = String((pet as any)?.slot?.id || "");
  if (!petId || !prefs.globalEnabled) {
    seenBelow.set(petId, false);
    return;
  }

  const { enabled, thresholdPct } = prefFor(petId);
  const hungerPct = PetsService.getHungerPctFor(pet);
  const below = enabled && Number.isFinite(hungerPct) && hungerPct < thresholdPct;
  const wasBelow = seenBelow.get(petId) === true;
  const loopKey = prefs.generalEnabled ? "pets:general" : `pet:${petId}`;
  const mode = audio.getPlaybackMode?.("pets") ?? "oneshot";

  if (below) {
    if (mode === "loop") {
      void triggerAlert(loopKey); // ensure loop is running
    } else if (!wasBelow) {
      void triggerAlert(loopKey); // one-shot on transition only
    }
  } else {
    try { audio.stopLoop(loopKey); } catch {}
  }

  seenBelow.set(petId, below);
}

async function evaluateAll(pets: PetInfo[] | null = null) {
  const list = pets ?? lastPets;
  for (const pet of Array.isArray(list) ? list : []) {
    try { evaluatePet(pet); } catch {}
  }
}

async function ensureStarted() {
  if (started) return;
  loadPrefs();
  try {
    unsubPets = await PetsService.onPetsChangeNow((arr) => {
      lastPets = Array.isArray(arr) ? arr.slice(0, 3) : [];
      void evaluateAll(lastPets);
    });
  } catch {
    unsubPets = null;
  }
  started = true;
}

function stop() {
  try { unsubPets?.(); } catch {}
  unsubPets = null;
  started = false;
  seenBelow.clear();
}

export const PetAlertService = {
  async start(): Promise<() => void> {
    await ensureStarted();
    return () => stop();
  },

  isGlobalEnabled(): boolean {
    return prefs.globalEnabled !== false;
  },

  setGlobalEnabled(on: boolean): void {
    prefs.globalEnabled = !!on;
    if (!on) seenBelow.clear();
    savePrefs();
  },

  isGeneralEnabled(): boolean {
    return !!prefs.generalEnabled;
  },

  setGeneralEnabled(on: boolean): void {
    prefs.generalEnabled = !!on;
    savePrefs();
    void this.refreshNow();
  },

  getGeneralThresholdPct(): number {
    return clampPct(prefs.defaultThresholdPct);
  },

  setGeneralThresholdPct(pct: number): number {
    const next = clampPct(pct);
    prefs.defaultThresholdPct = next;
    savePrefs();
    void this.refreshNow();
    return next;
  },

  getDefaultThresholdPct(): number {
    return clampPct(prefs.defaultThresholdPct);
  },

  setDefaultThresholdPct(pct: number): number {
    const next = clampPct(pct);
    prefs.defaultThresholdPct = next;
    savePrefs();
    return next;
  },

  isPetEnabled(petId: string): boolean {
    return prefFor(petId).enabled;
  },

  setPetEnabled(petId: string, on: boolean): void {
    if (!petId) return;
    prefs.pets[petId] = { ...(prefs.pets[petId] || {}), enabled: !!on };
    savePrefs();
    void evaluateAll();
  },

  getPetThresholdPct(petId: string): number {
    return prefFor(petId).thresholdPct;
  },

  setPetThresholdPct(petId: string, pct: number): number {
    if (!petId) return this.getDefaultThresholdPct();
    const next = clampPct(pct);
    prefs.pets[petId] = { ...(prefs.pets[petId] || {}), thresholdPct: next };
    savePrefs();
    void evaluateAll();
    return next;
  },

  async refreshNow(): Promise<void> {
    await evaluateAll();
  },
};
