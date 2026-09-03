// src/services/hatchTracker.ts
//
// Hatch detection from the activity log rather than the websocket.
//
// The old path intercepted the outgoing `HatchEgg` message and then polled the
// inventory for a pet that hadn't been there before. That misses whatever the
// poll doesn't catch — a reload mid-hatch, a Double Hatch adding two pets at
// once — and it can only ever say "a pet appeared", not which egg produced it.
//
// The log says both, exactly:
//   { action: "hatchEgg",  parameters: { eggId, pet } }          → one pull
//   { action: "DoubleHatch(II)", parameters: { pet, extraPet } } → a bonus pet
//
// The distinction matters: per the game's own Bad Luck Protection rules a bonus
// pet is not a pull, so it never moves a counter. Both still count as hatched.

import { getActivityLogHistory, type ActivityLogEntry } from "./activityLogHistory";
import { myActivityLog } from "../store/atoms";
import { StatsService } from "./stats";
import { GOLD_MUTATION, RAINBOW_MUTATION, protectedSpecies } from "./hatchPity";
import { readAriesPath, writeAriesPath } from "../utils/localStorage";

const STATE_PATH = "hatch.tracker";
const HATCH_ACTION = "hatchEgg";
const DOUBLE_HATCH_ACTIONS = new Set(["doublehatch", "doublehatchii"]);

/** Enough to out-live any log window; the log itself keeps far fewer. */
const SEEN_LIMIT = 4000;

export type HatchRarity = "normal" | "gold" | "rainbow";

export interface EggCounters {
  /** Rare species id -> consecutive misses. */
  species: Record<string, number>;
  gold: number;
  rainbow: number;
  /** Pulls observed for this egg. Unused on the offsets side. */
  pulls: number;
}

export interface HatchTrackerState {
  /** Pet ids already accounted for, so a log re-push never double-counts. */
  seenPetIds: string[];
  /** Observed misses, per egg. */
  counters: Record<string, EggCounters>;
  /**
   * Manual head start per counter. The server's real counters are not exposed
   * and pre-update accounts began at half the threshold, so the displayed
   * value is `offset + observed`.
   */
  offsets: Record<string, EggCounters>;
  /** Timestamp of the newest hatch ingested, for display only. */
  lastHatchAt: number;
  /** Set once the first log snapshot has been absorbed as history. */
  bootstrapped: boolean;
}

interface HatchEvent {
  petId: string;
  species: string;
  eggId: string | null;
  hasGold: boolean;
  hasRainbow: boolean;
  timestamp: number;
  /** False for a Double Hatch bonus pet: hatched, but not a rolled outcome. */
  isPull: boolean;
}

type Listener = (state: HatchTrackerState) => void;

const listeners = new Set<Listener>();
let cachedState: HatchTrackerState | null = null;

/* --------------------------------- state --------------------------------- */

function emptyCounters(): EggCounters {
  return { species: {}, gold: 0, rainbow: 0, pulls: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function normalizeCounters(raw: unknown): EggCounters {
  const out = emptyCounters();
  if (!isRecord(raw)) return out;
  if (isRecord(raw.species)) {
    for (const [species, value] of Object.entries(raw.species)) {
      const count = toCount(value);
      if (count > 0) out.species[species] = count;
    }
  }
  out.gold = toCount(raw.gold);
  out.rainbow = toCount(raw.rainbow);
  out.pulls = toCount(raw.pulls);
  return out;
}

function normalizeCounterMap(raw: unknown): Record<string, EggCounters> {
  const out: Record<string, EggCounters> = {};
  if (!isRecord(raw)) return out;
  for (const [eggId, value] of Object.entries(raw)) {
    out[eggId] = normalizeCounters(value);
  }
  return out;
}

function loadState(): HatchTrackerState {
  if (cachedState) return cachedState;
  let raw: unknown = null;
  try {
    raw = readAriesPath<unknown>(STATE_PATH);
  } catch {}

  const seenPetIds: string[] = [];
  if (isRecord(raw) && Array.isArray(raw.seenPetIds)) {
    for (const id of raw.seenPetIds) {
      if (typeof id === "string" && id) seenPetIds.push(id);
    }
  }

  cachedState = {
    seenPetIds,
    counters: normalizeCounterMap(isRecord(raw) ? raw.counters : null),
    offsets: normalizeCounterMap(isRecord(raw) ? raw.offsets : null),
    lastHatchAt: isRecord(raw) ? toCount(raw.lastHatchAt) : 0,
    bootstrapped: isRecord(raw) ? raw.bootstrapped === true : false,
  };
  return cachedState;
}

function saveState(state: HatchTrackerState): void {
  if (state.seenPetIds.length > SEEN_LIMIT) {
    state.seenPetIds.splice(0, state.seenPetIds.length - SEEN_LIMIT);
  }
  cachedState = state;
  try { writeAriesPath(STATE_PATH, state); } catch {}
  for (const listener of listeners) {
    try { listener(state); } catch {}
  }
}

/* ------------------------------- log parsing ------------------------------ */

function readPet(raw: unknown, eggIdFallback: string | null, timestamp: number, isPull: boolean): HatchEvent | null {
  if (!isRecord(raw)) return null;
  const petId = typeof raw.id === "string" ? raw.id.trim() : "";
  const species = typeof raw.petSpecies === "string" ? raw.petSpecies.trim() : "";
  if (!petId || !species) return null;

  let hasGold = false;
  let hasRainbow = false;
  if (Array.isArray(raw.mutations)) {
    for (const mutation of raw.mutations) {
      if (typeof mutation !== "string") continue;
      const normalized = mutation.trim().toLowerCase();
      if (normalized === GOLD_MUTATION.toLowerCase()) hasGold = true;
      if (normalized === RAINBOW_MUTATION.toLowerCase()) hasRainbow = true;
    }
  }

  const sourceEggId = typeof raw.sourceEggId === "string" && raw.sourceEggId.trim() ? raw.sourceEggId : null;
  return {
    petId,
    species,
    eggId: eggIdFallback ?? sourceEggId,
    hasGold,
    hasRainbow,
    timestamp,
    isPull,
  };
}

function extractHatchEvents(entries: ActivityLogEntry[]): HatchEvent[] {
  const events: HatchEvent[] = [];
  for (const entry of entries) {
    const action = typeof entry?.action === "string" ? entry.action.trim() : "";
    if (!action) continue;
    const timestamp = Number(entry.timestamp) || 0;
    const parameters = entry.parameters;
    if (!isRecord(parameters)) continue;

    if (action === HATCH_ACTION) {
      const eggId = typeof parameters.eggId === "string" && parameters.eggId.trim() ? parameters.eggId : null;
      const event = readPet(parameters.pet, eggId, timestamp, true);
      if (event) events.push(event);
      continue;
    }

    if (DOUBLE_HATCH_ACTIONS.has(action.toLowerCase())) {
      // `pet` here is the pet whose ability procced, not a hatch; only
      // `extraPet` is newly born.
      const event = readPet(parameters.extraPet, null, timestamp, false);
      if (event) events.push(event);
    }
  }
  events.sort((a, b) => a.timestamp - b.timestamp);
  return events;
}

function rarityOf(event: HatchEvent): HatchRarity {
  if (event.hasRainbow) return "rainbow";
  if (event.hasGold) return "gold";
  return "normal";
}

/* ------------------------------ counter rules ----------------------------- */

/**
 * Applies one pull to an egg's counters.
 *
 * A miss adds one, the outcome resets to zero. Gold and Rainbow are separate
 * rolls: a Rainbow does not clear Gold — the game's own rule is that a
 * guarantee never downgrades good luck, so an unspent Gold stays due.
 */
function applyPull(counters: EggCounters, event: HatchEvent, rareSpecies: string[]): void {
  counters.pulls += 1;
  for (const species of rareSpecies) {
    if (event.species === species) counters.species[species] = 0;
    else counters.species[species] = (counters.species[species] ?? 0) + 1;
  }
  counters.gold = event.hasGold ? 0 : counters.gold + 1;
  counters.rainbow = event.hasRainbow ? 0 : counters.rainbow + 1;
}

/* -------------------------------- ingestion ------------------------------- */

/**
 * Folds new hatches into the counters.
 *
 * `countStats` is false for the first pass over the persisted history: those
 * pets were already tallied by the previous websocket-based detection (or by
 * the inventory seeding), so re-counting them would inflate the table. Their
 * counters are still replayed — a miss count from a partial window is a lower
 * bound, which is the right shape for it.
 */
function ingest(entries: ActivityLogEntry[], countStats: boolean): boolean {
  const events = extractHatchEvents(entries);
  if (!events.length) return false;

  const state = loadState();
  const seen = new Set(state.seenPetIds);
  let changed = false;

  for (const event of events) {
    if (seen.has(event.petId)) continue;
    seen.add(event.petId);
    state.seenPetIds.push(event.petId);
    changed = true;

    if (countStats) {
      try { StatsService.incrementPetHatched(event.species, rarityOf(event)); } catch {}
    }

    if (event.timestamp > state.lastHatchAt) state.lastHatchAt = event.timestamp;

    if (!event.isPull || !event.eggId) continue;
    const counters = (state.counters[event.eggId] ??= emptyCounters());
    applyPull(counters, event, protectedSpecies(event.eggId));
  }

  if (changed) saveState(state);
  return changed;
}

/* ------------------------------- public API ------------------------------- */

export const HatchTracker = {
  getState(): HatchTrackerState {
    return loadState();
  },

  /** Observed misses for one egg, before the manual offset. */
  getCounters(eggId: string): EggCounters {
    return loadState().counters[eggId] ?? emptyCounters();
  },

  getOffsets(eggId: string): EggCounters {
    return loadState().offsets[eggId] ?? emptyCounters();
  },

  setOffset(eggId: string, key: string, value: number): void {
    const state = loadState();
    const offsets = (state.offsets[eggId] ??= emptyCounters());
    const next = toCount(value);
    if (key === "gold") offsets.gold = next;
    else if (key === "rainbow") offsets.rainbow = next;
    else if (next > 0) offsets.species[key] = next;
    else delete offsets.species[key];
    saveState(state);
  },

  // Deliberately no reset: a counter that can be cleared is worse than useless,
  // since the server's own never resets except on the outcome itself. Only
  // `setOffset` moves a counter by hand.

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

/**
 * Watches the activity log for hatches.
 *
 * Everything already visible when the tracker first runs is absorbed as
 * history: those pets are in the inventory the hatch table seeds itself from,
 * and were tallied by the previous websocket detection, so counting them again
 * would double the table. Their pity counters are replayed all the same. From
 * the next log push on, hatches count for real.
 */
export async function startHatchTracker(): Promise<() => void> {
  const firstRun = !loadState().bootstrapped;

  const consume = (logs: unknown, countStats: boolean) => {
    if (!Array.isArray(logs)) return;
    try { ingest(logs as ActivityLogEntry[], countStats); } catch {}
  };

  try {
    ingest(getActivityLogHistory(), false);
  } catch {}

  try {
    consume(await myActivityLog.get(), !firstRun);
  } catch {}

  if (firstRun) {
    const state = loadState();
    state.bootstrapped = true;
    saveState(state);
  }

  let unsubscribe: (() => void) | null = null;
  try {
    unsubscribe = await myActivityLog.onChange(next => consume(next, true));
  } catch {}

  return () => {
    try { unsubscribe?.(); } catch {}
  };
}
