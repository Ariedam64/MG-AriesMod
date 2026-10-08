// The plant "brush": how the slots of the next plant to place are configured
// in the item picker, and the tile object they turn into. Pure, so it can be
// checked in node; `brush.ts` holds the live state.

import { clampSizePercent, type SlotScaleMode } from "./slotSize";
import { ensureSlotIds, type TileObject } from "./gardenModel";

/** One slot of the brush. `sizePercent` is the slider, `customScale` the typed size. */
export type BrushSlotConfig = {
  enabled: boolean;
  sizePercent: number;
  customScale: number;
  sizeMode: SlotScaleMode;
  /** Mutation ids as stored on a slot ("Gold", "Wet", "Ambershine"...). */
  mutations: string[];
};

export type BrushSlots = {
  species: string | null;
  slots: BrushSlotConfig[];
  /** "Edit all slots together". */
  applyAll: boolean;
};

export const DEFAULT_SIZE_PERCENT = 50;

// Fixed timings make every planted crop fully grown, whatever the clock says.
const PLANTED_AT = 1760779438723;
const MATURED_AT = 1760865838723;
const SLOT_START_TIME = 1760866288723;
const SLOT_END_TIME = 1760867858782;

export const emptyBrushSlots = (): BrushSlots => ({ species: null, slots: [], applyAll: false });

export const defaultBrushSlot = (): BrushSlotConfig => ({
  enabled: true,
  sizePercent: DEFAULT_SIZE_PERCENT,
  customScale: DEFAULT_SIZE_PERCENT,
  sizeMode: "percent",
  mutations: [],
});

/** How many slots a plant grows: one, or one per slot offset for a multi-harvest plant. */
export function maxSlotsForPlant(entry: unknown): number {
  const plant = (entry as { plant?: { harvestType?: unknown; slotOffsets?: unknown } } | null)?.plant;
  const offsets = Array.isArray(plant?.slotOffsets) ? plant.slotOffsets : [];
  return plant?.harvestType === "Multiple" && offsets.length > 0 ? offsets.length : 1;
}

function normalizeSlot(slot: Partial<BrushSlotConfig>): BrushSlotConfig {
  const pct = clampSizePercent(Number(slot.sizePercent));
  const mode: SlotScaleMode = slot.sizeMode === "custom" ? "custom" : "percent";
  const customScale = clampSizePercent(Number.isFinite(slot.customScale) ? (slot.customScale as number) : pct);
  return {
    enabled: slot.enabled !== false,
    sizePercent: mode === "custom" ? customScale : pct,
    customScale,
    sizeMode: mode,
    mutations: Array.isArray(slot.mutations) ? slot.mutations : [],
  };
}

/**
 * The brush for `species`: a fresh one (every slot at the default size) when
 * the species changed, else the current slots cut to `maxSlots`, cleaned, and
 * never fewer than one.
 */
export function syncBrushSlots(state: BrushSlots, species: string, maxSlots: number): BrushSlots {
  if (state.species !== species) {
    return { species, slots: Array.from({ length: maxSlots }, defaultBrushSlot), applyAll: false };
  }
  const kept = state.slots.slice(0, maxSlots);
  const slots = (kept.length ? kept : [defaultBrushSlot()]).map(normalizeSlot);
  return { ...state, slots, applyAll: !!state.applyAll };
}

const targetsOf = (state: BrushSlots, idx: number) => (i: number) => state.applyAll || i === idx;

/** Writes `patch` to slot `idx`, or to every slot with "edit all", in `mode`. */
export function patchBrushSlot(
  state: BrushSlots,
  idx: number,
  mode: SlotScaleMode,
  patch: Partial<BrushSlotConfig>,
): BrushSlots {
  const hit = targetsOf(state, idx);
  return { ...state, slots: state.slots.map((c, i) => (hit(i) ? { ...c, sizeMode: mode, ...patch } : c)) };
}

/** Adds or removes one mutation on slot `idx`, or on every slot with "edit all". */
export function toggleBrushMutation(state: BrushSlots, idx: number, mutationId: string): BrushSlots {
  const hit = targetsOf(state, idx);
  return {
    ...state,
    slots: state.slots.map((c, i) => {
      if (!hit(i)) return c;
      const prev = Array.isArray(c.mutations) ? c.mutations : [];
      const mutations = prev.includes(mutationId) ? prev.filter((m) => m !== mutationId) : [...prev, mutationId];
      return { ...c, mutations };
    }),
  };
}

export const addBrushSlot = (state: BrushSlots, maxSlots: number): BrushSlots =>
  state.slots.length >= maxSlots ? state : { ...state, slots: [...state.slots, defaultBrushSlot()] };

export const removeBrushSlot = (state: BrushSlots): BrushSlots =>
  state.slots.length <= 1 ? state : { ...state, slots: state.slots.slice(0, -1) };

/** The size a brush slot plants with. */
export const brushSlotSize = (cfg: BrushSlotConfig): number =>
  clampSizePercent(cfg.sizeMode === "custom" ? cfg.customScale : cfg.sizePercent);

/** A grow slot as the game stores it, fully grown. */
export const makeGrowSlot = (species: string, size: number, mutations: string[] = []) => ({
  species,
  startTime: SLOT_START_TIME,
  endTime: SLOT_END_TIME,
  size,
  mutations,
});

/** The plant tile object the brush places, or null when no slot is enabled. */
export function brushPlantObject(species: string, slots: BrushSlotConfig[], maxSlots: number): TileObject | null {
  const growSlots = slots
    .slice(0, maxSlots)
    .filter((cfg) => cfg.enabled)
    .map((cfg) => makeGrowSlot(species, brushSlotSize(cfg), Array.isArray(cfg.mutations) ? cfg.mutations.slice() : []));
  if (!growSlots.length) return null;
  return {
    objectType: "plant",
    species,
    slots: ensureSlotIds(growSlots),
    plantedAt: PLANTED_AT,
    maturedAt: MATURED_AT,
  };
}
