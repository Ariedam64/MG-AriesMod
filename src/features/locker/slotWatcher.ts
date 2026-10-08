// The crop the player has selected in the garden: which plant, which of its
// fruits, and that fruit's size and mutations. The locker judges this crop to
// draw its purple outline and to back up the harvest rule.

import {
  myCurrentGardenObject,
  myCurrentGrowSlotIndex,
  type CurrentGardenObject,
  type PlantSlotTiming,
} from "../../game/store/atoms";
import { CROP_SIZE_MAX, readCropSize } from "../../data/rules/cropSize";
import { clamp } from "../../lib/math";
import { Emitter, Subscriptions } from "../../lib/emitter";
import { normalizeMutationsList } from "./harvestRules";

export type LockerSlotInfo = {
  isPlant: boolean;
  /** Position of the selected fruit in the plant's `slots[]`. */
  slotIndex: number | null;
  /** The selected grow slot as the game holds it. */
  slot: any | null;
  /** Species of the selected fruit, else of the garden object. */
  seedKey: string | null;
  sizePercent: number | null;
  mutations: string[];
};

export const emptySlotInfo = (): LockerSlotInfo => ({
  isPlant: false,
  slotIndex: null,
  slot: null,
  seedKey: null,
  sizePercent: null,
  mutations: [],
});

/** The species a garden object or grow slot names, under whichever field carries it. */
export function extractSeedKey(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const fields = obj as Record<string, unknown>;
  for (const key of ["seedKey", "species", "seedSpecies", "plantSpecies", "cropSpecies", "speciesId"]) {
    const value = fields[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/** Crop Size of a grow slot, in [50, 100]. Falls back to a full-size slot. */
export function extractSizePercent(slot: unknown): number {
  if (!slot || typeof slot !== "object") return CROP_SIZE_MAX;
  return (
    readCropSize(slot) ??
    // A pre-rework slot converts its scale with its species' maximum, which
    // older payloads name under another field.
    readCropSize({ ...(slot as Record<string, unknown>), species: extractSeedKey(slot) }) ??
    CROP_SIZE_MAX
  );
}

type PlantObject = { objectType: "plant"; slots?: unknown[] };

const isPlantObject = (obj: unknown): obj is PlantObject =>
  !!obj && typeof obj === "object" && (obj as { objectType?: unknown }).objectType === "plant";

/** Which of the plant's fruits the cursor selects, as a position in `slots[]`. */
function selectedSlotIndex(slots: unknown[], selectedSlotId: number | null): number | null {
  const available = slots.map((_, i) => i).filter((i) => slots[i] != null);
  if (!available.length) return null;
  const bySlotId = Number.isFinite(selectedSlotId as number)
    ? slots.findIndex((s) => !!s && typeof s === "object" && (s as { slotId?: unknown }).slotId === selectedSlotId)
    : -1;
  if (bySlotId >= 0) return bySlotId;
  const raw = Number.isFinite(selectedSlotId as number) ? (selectedSlotId as number) : 0;
  const pos = Math.max(0, clamp(raw, 0, slots.length - 1));
  return available[clamp(pos, 0, available.length - 1)] ?? null;
}

/** The selected crop of a garden object, given the game's selected slot id. */
function selectedSlotInfo(gardenObject: unknown, selectedSlotId: number | null): LockerSlotInfo {
  const objectKey = extractSeedKey(gardenObject);
  if (!isPlantObject(gardenObject)) return { ...emptySlotInfo(), seedKey: objectKey };

  const slots = Array.isArray(gardenObject.slots) ? gardenObject.slots : [];
  const slotIndex = selectedSlotIndex(slots, selectedSlotId);
  const slot = slotIndex == null ? null : (slots[slotIndex] ?? null);
  if (!slot) return { ...emptySlotInfo(), isPlant: true, seedKey: objectKey };

  return {
    isPlant: true,
    slotIndex,
    slot,
    // A fruit can be its own species (a FourLeafClover on a Clover plant), and
    // per-crop overrides are keyed by it.
    seedKey: extractSeedKey(slot) ?? objectKey,
    sizePercent: extractSizePercent(slot),
    mutations: normalizeMutationsList((slot as { mutations?: unknown }).mutations),
  };
}

const sameStrings = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

const sameSlotInfo = (a: LockerSlotInfo, b: LockerSlotInfo): boolean =>
  a.isPlant === b.isPlant &&
  a.slotIndex === b.slotIndex &&
  a.slot === b.slot &&
  a.seedKey === b.seedKey &&
  a.sizePercent === b.sizePercent &&
  sameStrings(a.mutations, b.mutations);

function slotSignature(slot: PlantSlotTiming | null | undefined): string {
  if (!slot) return "∅";
  const start = Number.isFinite(slot.startTime) ? slot.startTime : 0;
  const end = Number.isFinite(slot.endTime) ? slot.endTime : 0;
  const mutations = Array.isArray(slot.mutations) ? slot.mutations.join(",") : "";
  return `${slot.species ?? ""}|${start}|${end}|${readCropSize(slot) ?? 0}|${mutations}`;
}

/** Content key of a garden object, so a fresh but identical object is not a change. */
function gardenObjectSignature(obj: CurrentGardenObject): string {
  if (!obj) return "∅";
  if (!isPlantObject(obj)) {
    const fields = obj as Record<string, unknown>;
    const entries = Object.keys(fields).sort().map((key) => `${key}:${JSON.stringify(fields[key])}`);
    return `other|${entries.join(";")}`;
  }
  const plant = obj as Record<string, any>;
  const slots = Array.isArray(plant.slots) ? plant.slots.map((s: PlantSlotTiming) => slotSignature(s)).join("||") : "";
  return `${plant.objectType}|${plant.species ?? ""}|${plant.plantedAt ?? 0}|${plant.maturedAt ?? 0}|slots:${slots}`;
}

export interface LockerSlotWatcher {
  get(): LockerSlotInfo;
  onChange(cb: (info: LockerSlotInfo) => void): () => void;
  stop(): void;
}

/** Follows the selected garden object and fruit, notifying when the selected crop changes. */
export function startLockerSlotWatcher(): LockerSlotWatcher {
  let gardenObject: CurrentGardenObject = null;
  let gardenSig = gardenObjectSignature(null);
  let selectedSlotId: number | null = null;
  let info = emptySlotInfo();
  let stopped = false;
  const changes = new Emitter<LockerSlotInfo>();
  const subs = new Subscriptions();

  const recompute = () => {
    if (stopped) return;
    const next = selectedSlotInfo(gardenObject, selectedSlotId);
    if (sameSlotInfo(next, info)) return;
    info = next;
    changes.emit(info);
  };

  // Applied at once so a harvest never meets the previous fruit's verdict, and
  // again after the current tick, once the other atoms changed by the same
  // update have landed.
  const recomputeNowAndAfterTick = () => {
    recompute();
    queueMicrotask(recompute);
  };

  const takeGardenObject = (next: CurrentGardenObject): boolean => {
    const sig = gardenObjectSignature(next ?? null);
    if (sig === gardenSig) return false;
    gardenObject = next;
    gardenSig = sig;
    return true;
  };

  // A new garden object usually comes with a new selected slot id right
  // behind it. Waiting one task for that id avoids judging the new plant with
  // the old plant's fruit; the id change, if it comes, recomputes instead.
  let pendingGardenRecompute: ReturnType<typeof setTimeout> | null = null;
  const cancelPendingGardenRecompute = () => {
    if (pendingGardenRecompute != null) clearTimeout(pendingGardenRecompute);
    pendingGardenRecompute = null;
  };
  const recomputeAfterIdSettles = () => {
    if (pendingGardenRecompute != null) return;
    pendingGardenRecompute = setTimeout(() => {
      pendingGardenRecompute = null;
      recomputeNowAndAfterTick();
    }, 0);
  };

  void (async () => {
    try { selectedSlotId = await myCurrentGrowSlotIndex.get(); } catch {}
    try { takeGardenObject(await myCurrentGardenObject.get()); } catch {}
    if (stopped) return;

    subs.add(
      myCurrentGardenObject.onChange((next) => {
        if (takeGardenObject(next)) recomputeAfterIdSettles();
      }),
    );
    subs.add(
      myCurrentGrowSlotIndex.onChange(async (id) => {
        selectedSlotId = Number.isFinite(id as number) ? (id as number) : 0;
        try { takeGardenObject(await myCurrentGardenObject.get()); } catch {}
        cancelPendingGardenRecompute();
        recomputeNowAndAfterTick();
      }),
    );
    recompute();
  })();

  return {
    get: () => info,
    onChange: (cb) => changes.on(cb),
    stop() {
      stopped = true;
      cancelPendingGardenRecompute();
      changes.clear();
      subs.dispose();
    },
  };
}
