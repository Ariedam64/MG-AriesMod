// The coin value of the crop the player has selected: the selected fruit's,
// or the whole plant's when no single fruit resolves.

import {
  myCurrentGardenObject,
  myCurrentGrowSlotIndex,
  numPlayers,
  type CurrentGardenObject,
} from "../../game/store/atoms";
import { valueFromGardenSlot, valueFromGardenPlant, DefaultPricing } from "../../data/rules/cropValue";
import { resolveGrowSlot } from "../../data/rules/growSlot";
import { Emitter, Subscriptions } from "../../lib/emitter";

export interface CropPriceWatcher {
  get(): number | null;
  onChange(cb: () => void): () => void;
  stop(): void;
}

const isPlantObject = (obj: CurrentGardenObject): obj is CurrentGardenObject & { objectType: "plant"; slots?: any[] } =>
  !!obj && (obj as { objectType?: unknown }).objectType === "plant";

const positive = (value: number): number | null => (Number.isFinite(value) && value > 0 ? value : null);

/** Recomputes on a new garden object or a new selected fruit, at most once a frame. */
export function startCropPriceWatcherViaGardenObject(): CropPriceWatcher {
  let gardenObject: CurrentGardenObject = null;
  let players: number | undefined = undefined;
  let selectedSlotId: number | null = null;
  let price: number | null = null;
  const changes = new Emitter<void>();
  const subs = new Subscriptions();

  const computePrice = (): number | null => {
    if (!isPlantObject(gardenObject)) return null;
    const slot = resolveGrowSlot(Array.isArray(gardenObject.slots) ? gardenObject.slots : [], selectedSlotId);
    const slotValue = slot ? positive(valueFromGardenSlot(slot, DefaultPricing, players)) : null;
    return slotValue ?? positive(valueFromGardenPlant(gardenObject as any, DefaultPricing, players));
  };

  const recompute = () => {
    const next = computePrice();
    if (next === price) return;
    price = next;
    changes.emit();
  };

  let scheduled = false;
  const scheduleRecompute = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      recompute();
    });
  };

  void (async () => {
    try { gardenObject = await myCurrentGardenObject.get(); } catch {}
    try { players = await numPlayers.get(); } catch {}
    try { selectedSlotId = await myCurrentGrowSlotIndex.get(); } catch {}

    subs.add(numPlayers.onChange((n) => { players = n; }));
    subs.add(myCurrentGardenObject.onChange((next) => { gardenObject = next; scheduleRecompute(); }));
    subs.add(
      myCurrentGrowSlotIndex.onChange((id) => {
        selectedSlotId = Number.isFinite(id as number) ? (id as number) : null;
        scheduleRecompute();
      }),
    );
    recompute();
  })();

  return {
    get: () => price,
    onChange: (cb) => changes.on(cb),
    stop() {
      changes.clear();
      subs.dispose();
    },
  };
}
