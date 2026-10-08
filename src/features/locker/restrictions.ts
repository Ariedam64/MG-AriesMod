// The locker's restrictions on actions other than harvesting: selling crops
// below a friend bonus, picking up decor, hatching chosen eggs, and the
// confirmation before Sell All Pets lets protected pets go.

import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { Emitter } from "../../lib/emitter";
import { clamp, clampFinite } from "../../lib/math";

const STORAGE_PATH = "locker.restrictions";

export const FRIEND_BONUS_STEP = 10;
export const FRIEND_BONUS_MAX = 50;
const MAX_PLAYERS = 6;

const PET_RARITIES = ["Common", "Uncommon", "Rare", "Legendary", "Mythical", "Divine", "Celestial"] as const;

type SellAllPetsRules = {
  enabled: boolean;
  protectGold: boolean;
  protectRainbow: boolean;
  protectMaxStr: boolean;
  maxStrThreshold: number;
  protectedRarities: string[];
};

type LockerRestrictionsState = {
  /** Players in the room (1-6) needed before crops may be sold. */
  minRequiredPlayers: number;
  /** Per-egg lock map: true blocks hatching that egg. */
  eggLocks: Record<string, boolean>;
  decorPickupLocked: boolean;
  sellAllPets: SellAllPetsRules;
};

const DEFAULT_SELL_ALL_PETS_RULES: SellAllPetsRules = {
  enabled: true,
  protectGold: true,
  protectRainbow: true,
  protectMaxStr: true,
  maxStrThreshold: 95,
  protectedRarities: [],
};

const defaultState = (): LockerRestrictionsState => ({
  minRequiredPlayers: 1,
  eggLocks: {},
  decorPickupLocked: false,
  sellAllPets: { ...DEFAULT_SELL_ALL_PETS_RULES },
});

/** A friend bonus percentage on the slider's 10% steps, 0 to 50. */
const toBonusStep = (value: number): number =>
  clamp(Math.round(clamp(Math.round(value), 0, FRIEND_BONUS_MAX) / FRIEND_BONUS_STEP) * FRIEND_BONUS_STEP, 0, FRIEND_BONUS_MAX);

const toPlayerCount = (value: number): number => (Number.isFinite(value) ? clamp(Math.round(value), 1, MAX_PLAYERS) : 1);

const percentFromPlayerCount = (players: number): number => clamp((players - 1) * 10, 0, FRIEND_BONUS_MAX);

/** The bonus as a percentage. The atom has held both 1.0-1.5 and a 1-6 player count. */
export function friendBonusPercentFromMultiplier(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return 0;
  if (n <= 2) return clamp(Math.round((n - 1) * 100), 0, FRIEND_BONUS_MAX);
  return percentFromPlayerCount(toPlayerCount(n));
}

export function friendBonusPercentFromPlayers(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? percentFromPlayerCount(toPlayerCount(n)) : null;
}

export function percentToRequiredFriendCount(percent: number): number {
  return clamp(Math.round(toBonusStep(percent) / 10) + 1, 1, MAX_PLAYERS);
}

const requiredPercentFromPlayers = (players: number): number => toBonusStep((toPlayerCount(players) - 1) * 10);

function sanitizeEggLocks(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key) out[key] = value === true;
  }
  return out;
}

function sanitizeSellAllPetsRules(raw: any): SellAllPetsRules {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SELL_ALL_PETS_RULES };
  const rarities: readonly string[] = PET_RARITIES;
  return {
    enabled: raw.enabled !== false,
    protectGold: raw.protectGold !== false,
    protectRainbow: raw.protectRainbow !== false,
    protectMaxStr: raw.protectMaxStr !== false,
    maxStrThreshold: Math.round(clampFinite(raw.maxStrThreshold, 0, 100, DEFAULT_SELL_ALL_PETS_RULES.maxStrThreshold)),
    protectedRarities: (Array.isArray(raw.protectedRarities) ? raw.protectedRarities : []).filter(
      (r: unknown): r is string => typeof r === "string" && rarities.includes(r),
    ),
  };
}

const sameRules = (a: SellAllPetsRules, b: SellAllPetsRules): boolean =>
  a.enabled === b.enabled &&
  a.protectGold === b.protectGold &&
  a.protectRainbow === b.protectRainbow &&
  a.protectMaxStr === b.protectMaxStr &&
  a.maxStrThreshold === b.maxStrThreshold &&
  JSON.stringify(a.protectedRarities.slice().sort()) === JSON.stringify(b.protectedRarities.slice().sort());

class LockerRestrictionsService {
  private state = defaultState();
  private readonly changes = new Emitter<LockerRestrictionsState>();

  constructor() {
    if (typeof window === "undefined") return;
    try {
      const saved = readAriesPath<any>(STORAGE_PATH) ?? {};
      this.state = {
        // Older saves name the setting `minFriendBonusPct`.
        minRequiredPlayers: toPlayerCount(Number(saved?.minRequiredPlayers ?? saved?.minFriendBonusPct)),
        eggLocks: sanitizeEggLocks(saved?.eggLocks),
        decorPickupLocked: saved?.decorPickupLocked === true,
        sellAllPets: sanitizeSellAllPetsRules(saved?.sellAllPets),
      };
    } catch {
      this.state = defaultState();
    }
  }

  private update(patch: Partial<LockerRestrictionsState>): void {
    this.state = { ...this.state, ...patch };
    if (typeof window !== "undefined") {
      try {
        writeAriesPath(STORAGE_PATH, this.state);
      } catch {}
    }
    this.changes.emit(this.getState());
  }

  getState(): LockerRestrictionsState {
    return { ...this.state };
  }

  getSellAllPetsRules(): SellAllPetsRules {
    return { ...this.state.sellAllPets };
  }

  setSellAllPetsRules(next: Partial<SellAllPetsRules>): void {
    const sanitized = sanitizeSellAllPetsRules({ ...this.getSellAllPetsRules(), ...next });
    if (!sameRules(this.state.sellAllPets, sanitized)) this.update({ sellAllPets: sanitized });
  }

  setMinRequiredPlayers(value: number): void {
    const players = toPlayerCount(value);
    if (players !== this.state.minRequiredPlayers) this.update({ minRequiredPlayers: players });
  }

  setEggLock(eggId: string, locked: boolean): void {
    if (eggId) this.update({ eggLocks: { ...this.state.eggLocks, [eggId]: !!locked } });
  }

  setDecorPickupLocked(locked: boolean): void {
    if (!!locked !== this.state.decorPickupLocked) this.update({ decorPickupLocked: !!locked });
  }

  isEggLocked(eggId: string | null | undefined): boolean {
    return !!eggId && this.state.eggLocks[eggId] === true;
  }

  isDecorPickupLocked(): boolean {
    return this.state.decorPickupLocked;
  }

  getRequiredPercent(): number {
    return requiredPercentFromPlayers(this.state.minRequiredPlayers);
  }

  /** An unknown bonus only passes when no bonus is required. */
  allowsCropSale(currentFriendBonusPercent: number | null | undefined): boolean {
    const required = this.getRequiredPercent();
    if (required <= 0) return true;
    if (!Number.isFinite(currentFriendBonusPercent as number)) return false;
    return clamp(Math.round(Number(currentFriendBonusPercent)), 0, FRIEND_BONUS_MAX) + 0.0001 >= required;
  }

  subscribe(listener: (state: LockerRestrictionsState) => void): () => void {
    return this.changes.on(listener);
  }
}

export const lockerRestrictionsService = new LockerRestrictionsService();
