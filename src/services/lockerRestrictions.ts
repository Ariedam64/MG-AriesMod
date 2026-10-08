// src/services/lockerRestrictions.ts
type LockerRestrictionsState = {
  /** Minimum players in room (1-6) required to allow selling crops. */
  minRequiredPlayers: number;
  /** Per-egg lock map: true means hatching is blocked. */
  eggLocks: Record<string, boolean>;
  /** When true, decor pickup (PlaceDecor) is blocked. */
  decorPickupLocked: boolean;
  /** Rules for Sell All Pets confirmation. */
  sellAllPets: SellAllPetsRules;
};

import { readAriesPath, writeAriesPath } from "../utils/localStorage";

const ARIES_LOCKER_RESTRICTIONS_PATH = "locker.restrictions";

type SellAllPetsRules = {
  enabled: boolean;
  protectGold: boolean;
  protectRainbow: boolean;
  protectMaxStr: boolean;
  maxStrThreshold: number;
  protectedRarities: string[];
};

const clampPercent = (value: number): number => Math.max(0, Math.min(50, Math.round(value)));

const roundToStep = (value: number, step: number): number =>
  Math.round(value / step) * step;

const VALID_RARITIES = new Set(["Common", "Uncommon", "Rare", "Legendary", "Mythical", "Divine", "Celestial"]);

const DEFAULT_SELL_ALL_PETS_RULES: SellAllPetsRules = {
  enabled: true,
  protectGold: true,
  protectRainbow: true,
  protectMaxStr: true,
  maxStrThreshold: 95,
  protectedRarities: [],
};

const DEFAULT_STATE: LockerRestrictionsState = {
  minRequiredPlayers: 1,
  eggLocks: {},
  decorPickupLocked: false,
  sellAllPets: { ...DEFAULT_SELL_ALL_PETS_RULES },
};

export const FRIEND_BONUS_STEP = 10;
export const FRIEND_BONUS_MAX = 50;

const sanitizePercent = (value: number): number => {
  const clamped = clampPercent(value);
  return Math.max(0, Math.min(FRIEND_BONUS_MAX, roundToStep(clamped, FRIEND_BONUS_STEP)));
};

const sanitizePlayers = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(6, Math.round(value)));
};

const sanitizeEggLocks = (raw: any): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, any>)) {
    if (!key) continue;
    out[key] = value === true;
  }
  return out;
};

const sanitizeSellAllPetsRules = (raw: any): SellAllPetsRules => {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SELL_ALL_PETS_RULES };
  const maxStrRaw = Number(raw.maxStrThreshold);
  const maxStrThreshold = Number.isFinite(maxStrRaw)
    ? Math.max(0, Math.min(100, Math.round(maxStrRaw)))
    : DEFAULT_SELL_ALL_PETS_RULES.maxStrThreshold;
  const rawRarities = Array.isArray(raw.protectedRarities) ? raw.protectedRarities : [];
  const protectedRarities = rawRarities.filter(
    (r: unknown): r is string => typeof r === "string" && VALID_RARITIES.has(r),
  );
  return {
    enabled: raw.enabled !== false,
    protectGold: raw.protectGold !== false,
    protectRainbow: raw.protectRainbow !== false,
    protectMaxStr: raw.protectMaxStr !== false,
    maxStrThreshold,
    protectedRarities,
  };
};

export function friendBonusPercentFromMultiplier(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return 0;

  // Some sources expose the bonus as 1.0 -> 1.5, others as 1 -> 6 (players count).
  if (n > 0 && n <= 2) {
    return clampPercent(Math.round((n - 1) * 100));
  }

  const clamped = Math.max(1, Math.min(6, Math.round(n)));
  return clampPercent((clamped - 1) * 10);
}

export function friendBonusPercentFromPlayers(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(1, Math.min(6, Math.round(n)));
  return clampPercent((clamped - 1) * 10);
}

export function percentToRequiredFriendCount(percent: number): number {
  const pct = sanitizePercent(percent);
  return Math.max(1, Math.min(6, Math.round(pct / 10) + 1));
}

const requiredPercentFromPlayers = (players: number): number =>
  sanitizePercent((sanitizePlayers(players) - 1) * 10);

class LockerRestrictionsService {
  private state: LockerRestrictionsState = { ...DEFAULT_STATE };
  private listeners = new Set<(state: LockerRestrictionsState) => void>();

  constructor() {
    this.load();
  }

  private load(): void {
    if (typeof window === "undefined") {
      this.state = { ...DEFAULT_STATE };
      return;
    }

    try {
      const parsed = readAriesPath<any>(ARIES_LOCKER_RESTRICTIONS_PATH) ?? {};
      const players = sanitizePlayers(Number(parsed?.minRequiredPlayers ?? parsed?.minFriendBonusPct));
      const eggLocks = sanitizeEggLocks(parsed?.eggLocks);
      const decorPickupLocked = parsed?.decorPickupLocked === true;
      const sellAllPets = sanitizeSellAllPetsRules(parsed?.sellAllPets);
      this.state = { minRequiredPlayers: players, eggLocks, decorPickupLocked, sellAllPets };
    } catch {
      this.state = { ...DEFAULT_STATE };
    }
  }

  private save(): void {
    if (typeof window === "undefined") return;
    try {
      writeAriesPath(ARIES_LOCKER_RESTRICTIONS_PATH, this.state);
    } catch {
      /* ignore */
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch {
        /* ignore */
      }
    }
  }

  getState(): LockerRestrictionsState {
    return { ...this.state };
  }

  getSellAllPetsRules(): SellAllPetsRules {
    return { ...(this.state.sellAllPets ?? DEFAULT_SELL_ALL_PETS_RULES) };
  }

  setSellAllPetsRules(next: Partial<SellAllPetsRules>): void {
    const current = this.getSellAllPetsRules();
    const merged = { ...current, ...next };
    const sanitized = sanitizeSellAllPetsRules(merged);
    const prev = this.state.sellAllPets;
    const same =
      prev?.enabled === sanitized.enabled &&
      prev?.protectGold === sanitized.protectGold &&
      prev?.protectRainbow === sanitized.protectRainbow &&
      prev?.protectMaxStr === sanitized.protectMaxStr &&
      prev?.maxStrThreshold === sanitized.maxStrThreshold &&
      JSON.stringify((prev?.protectedRarities ?? []).slice().sort()) ===
        JSON.stringify(sanitized.protectedRarities.slice().sort());
    if (same) return;
    this.state = { ...this.state, sellAllPets: sanitized };
    this.save();
    this.emit();
  }

  setMinRequiredPlayers(value: number): void {
    const players = sanitizePlayers(value);
    if (players === this.state.minRequiredPlayers) return;
    this.state = { ...this.state, minRequiredPlayers: players };
    this.save();
    this.emit();
  }

  setEggLock(eggId: string, locked: boolean): void {
    if (!eggId) return;
    const nextLocks = { ...this.state.eggLocks, [eggId]: !!locked };
    this.state = { ...this.state, eggLocks: nextLocks };
    this.save();
    this.emit();
  }

  setDecorPickupLocked(locked: boolean): void {
    if (!!locked === this.state.decorPickupLocked) return;
    this.state = { ...this.state, decorPickupLocked: !!locked };
    this.save();
    this.emit();
  }

  isEggLocked(eggId: string | null | undefined): boolean {
    if (!eggId) return false;
    return this.state.eggLocks?.[eggId] === true;
  }

  allowsCropSale(currentFriendBonusPercent: number | null | undefined): boolean {
    const required = requiredPercentFromPlayers(this.state.minRequiredPlayers);
    if (required <= 0) return true;
    if (!Number.isFinite(currentFriendBonusPercent as number)) return false;
    const current = clampPercent(Number(currentFriendBonusPercent));
    return current + 0.0001 >= required;
  }

  getRequiredPercent(): number {
    return requiredPercentFromPlayers(this.state.minRequiredPlayers);
  }

  isDecorPickupLocked(): boolean {
    return this.state.decorPickupLocked === true;
  }

  subscribe(listener: (state: LockerRestrictionsState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const lockerRestrictionsService = new LockerRestrictionsService();
