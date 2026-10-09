// The active pets as the Instant Feed widget shows them: read out of the
// game's pet slots, named, and labelled with their strength.

import { getPetStrength, getPetMaxStrength } from "../../data/rules/petValue";

export const DEFAULT_LABEL = "Instant Feed";
/** One button per active pet slot. */
export const MAX_BUTTONS = 3;

export type ActivePetSlot = {
  id: string;
  name?: string | null;
  petSpecies?: string | null;
  mutations?: string[];
  xp?: number;
  targetScale?: number;
};

export function normalizeActivePets(value: unknown): ActivePetSlot[] {
  const list = Array.isArray(value) ? value : [];
  const out: ActivePetSlot[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as any;
    // Prefer slot.* when a slot wrapper exists (matches _activeSlotToPet in pets.ts)
    const slot = raw?.slot && typeof raw.slot === "object" ? raw.slot : raw;
    const id = String(slot?.id ?? "").trim();
    if (!id) continue;
    const name = (slot?.name ?? raw?.name ?? raw?.petName ?? null) as string | null;
    const petSpecies = (slot?.petSpecies ?? raw?.petSpecies ?? raw?.species ?? null) as
      | string
      | null;
    const mutationsRaw =
      slot?.mutations ??
      raw?.mutations ??
      raw?.data?.mutations ??
      raw?.slot?.data?.mutations ??
      raw?.pet?.mutations ??
      null;
    const mutations = Array.isArray(mutationsRaw)
      ? mutationsRaw.map((m: unknown) => String(m ?? "").trim()).filter(Boolean)
      : undefined;
    const xpRaw = Number(slot?.xp ?? raw?.xp);
    const xp = Number.isFinite(xpRaw) ? xpRaw : undefined;
    const targetScaleRaw = Number(slot?.targetScale ?? raw?.targetScale);
    const targetScale = Number.isFinite(targetScaleRaw) ? targetScaleRaw : undefined;
    out.push({ id, name, petSpecies, mutations, xp, targetScale });
    if (out.length >= MAX_BUTTONS) break;
  }
  return out;
}

export function activePetsSignature(list: ActivePetSlot[]): string {
  if (!list.length) return "";
  return list
    .map((pet) => {
      const id = String(pet.id ?? "");
      const species = String(pet.petSpecies ?? "");
      const name = String(pet.name ?? "");
      const muts = Array.isArray(pet.mutations)
        ? pet.mutations.map((m) => String(m ?? "").trim()).filter(Boolean).sort().join(",")
        : "";
      // Use the displayed strength (not raw xp) so xp ticks that don't change
      // the visible value never trigger a re-render.
      const strength = strengthLabel(pet)?.text ?? "";
      return `${id}|${species}|${name}|${muts}|${strength}`;
    })
    .join(";");
}

export function petDisplayName(pet: ActivePetSlot): string {
  const name = String(pet.name ?? "").trim();
  if (name) return name;
  const species = String(pet.petSpecies ?? "").trim();
  if (species) return species.charAt(0).toUpperCase() + species.slice(1);
  return "Pet";
}

export function strengthLabel(pet: ActivePetSlot): { text: string; maxed: boolean } | null {
  const petLike = {
    petSpecies: String(pet.petSpecies ?? ""),
    xp: pet.xp,
    targetScale: pet.targetScale,
    mutations: pet.mutations,
  };
  const maxStr = getPetMaxStrength(petLike);
  if (maxStr <= 0) return null;
  const str = getPetStrength(petLike);
  const maxed = str >= maxStr;
  return { text: maxed ? `STR ${maxStr}` : `STR ${str}/${maxStr}`, maxed };
}

export function buttonTitle(pet: ActivePetSlot): string {
  const name = petDisplayName(pet);
  const strength = strengthLabel(pet);
  return strength ? `${DEFAULT_LABEL}: ${name} (${strength.text})` : `${DEFAULT_LABEL}: ${name}`;
}
