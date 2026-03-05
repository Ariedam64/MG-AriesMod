import { petCatalog, mutationCatalog } from "../data";

export type PetLike = {
  petSpecies: string;
  xp?: number | null;
  targetScale?: number | null;
  mutations?: string[] | null;
};

type PetCatalogEntry = {
  maturitySellPrice?: number;
  maxScale?: number;
  hoursToMature?: number;
};

type MutationCatalogEntry = {
  coinMultiplier?: number;
};

const SEC_PER_HOUR = 3600;
const XP_STRENGTH_MAX = 30;
const BASE_STRENGTH_FLOOR = 30;

const getCatalogEntry = (species: string): PetCatalogEntry | null => {
  if (!species) return null;
  const entry = (petCatalog as Record<string, PetCatalogEntry | undefined>)[species];
  return entry ?? null;
};

const getMutationEntry = (mutation: string): MutationCatalogEntry | null => {
  if (!mutation) return null;
  const entry = (mutationCatalog as Record<string, MutationCatalogEntry | undefined>)[mutation];
  return entry ?? null;
};

const getTargetScale = (pet: PetLike) => {
  const raw = pet?.targetScale;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 1;
};

const getXp = (pet: PetLike) => {
  const raw = pet?.xp;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, raw) : 0;
};

export const getPetMaxStrength = (pet: PetLike): number => {
  const entry = getCatalogEntry(pet?.petSpecies ?? "");
  if (!entry) return 0;

  const maxScale = typeof entry.maxScale === "number" && entry.maxScale > 1 ? entry.maxScale : 1;
  const targetScale = getTargetScale(pet);
  const ratio = maxScale > 1 ? (targetScale - 1) / (maxScale - 1) : 0;
  const raw = ratio * 20 + 80;

  const strength = Math.floor(Number.isFinite(raw) ? raw : 0);
  return Math.max(strength, 0);
};

const getBaseStrength = (maxStrength: number): number => {
  const base = maxStrength - BASE_STRENGTH_FLOOR;
  return Math.max(base, 0);
};

export const getPetStrength = (pet: PetLike): number => {
  const entry = getCatalogEntry(pet?.petSpecies ?? "");
  if (!entry) return 0;

  const hoursToMature = typeof entry.hoursToMature === "number" && entry.hoursToMature > 0
    ? entry.hoursToMature
    : 1;

  const maxStrength = getPetMaxStrength(pet);
  if (maxStrength <= 0) return 0;

  const xpRate = getXp(pet) / (hoursToMature * SEC_PER_HOUR);
  const xpComponent = Math.min(Math.floor(xpRate * XP_STRENGTH_MAX), XP_STRENGTH_MAX);
  const baseStrength = getBaseStrength(maxStrength);

  const strength = Math.min(baseStrength + xpComponent, maxStrength);
  return Math.max(strength, 0);
};

export const getPetCoinMultiplier = (pet: PetLike): number => {
  const mutations = Array.isArray(pet?.mutations) ? pet.mutations : [];

  return mutations.reduce((acc, mutation) => {
    const entry = getMutationEntry(mutation);
    const multiplier = entry?.coinMultiplier;
    if (typeof multiplier === "number" && Number.isFinite(multiplier) && multiplier > 0) {
      return acc * multiplier;
    }
    return acc;
  }, 1);
};

export const getPetValue = (pet: PetLike): number => {
  const entry = getCatalogEntry(pet?.petSpecies ?? "");
  if (!entry) return 0;

  const maturitySellPrice = typeof entry.maturitySellPrice === "number" ? entry.maturitySellPrice : 0;
  const maxStrength = getPetMaxStrength(pet);
  if (maxStrength <= 0) return 0;

  const strength = getPetStrength(pet);
  const targetScale = getTargetScale(pet);
  const coinMultiplier = getPetCoinMultiplier(pet);

  const raw = maturitySellPrice * (strength / maxStrength) * targetScale * coinMultiplier;
  if (!Number.isFinite(raw)) return 0;
  return Math.round(Math.max(raw, 0));
};

export const getPetInfo = (pet: PetLike) => ({
  value: getPetValue(pet),
  strength: getPetStrength(pet),
  maxStrength: getPetMaxStrength(pet),
  coinMultiplier: getPetCoinMultiplier(pet),
});

