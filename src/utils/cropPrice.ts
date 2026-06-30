// cropPrice.ts
import {
  myCurrentGardenObject,
  myCurrentGrowSlotIndex,
  numPlayers,
  type CurrentGardenObject,
} from "../store/atoms";
import {
  valueFromGardenSlot,
  valueFromGardenPlant,
  DefaultPricing,
} from "../utils/calculators";

type CGO = CurrentGardenObject & { objectType?: string; slots?: any[] };
const isPlantObject = (o: CGO | null | undefined): o is CGO & { objectType: "plant" } =>
  !!o && o.objectType === "plant";

export interface CropPriceWatcher {
  get(): number | null;
  onChange(cb: () => void): () => void;
  stop(): void;
}

/** Notifie sur: myCurrentGardenObject **et** myCurrentGrowSlotIndex */
export function startCropPriceWatcherViaGardenObject(): CropPriceWatcher {
  let cur: CurrentGardenObject = null;
  let players: number | undefined = undefined;
  let selectedSlotId: number | null = null;
  let lastPrice: number | null = null;

  const listeners = new Set<() => void>();
  const notify = () => { for (const fn of listeners) try { fn(); } catch {} };

  let scheduled = false;
  const scheduleRecomputeAndNotify = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; recomputeAndNotify(); });
  };

  function computeSelectedSlotPrice(): number | null {
    if (!isPlantObject(cur)) return null;
    const slots = Array.isArray((cur as CGO).slots) ? (cur as CGO).slots! : [];
    if (!slots.length) return null;
    const slot = selectedSlotId != null
      ? (slots.find((s: any) => s?.slotId === selectedSlotId) ?? slots[0])
      : slots[0];
    const val = valueFromGardenSlot(slot, DefaultPricing, players);
    return Number.isFinite(val) && val > 0 ? val : null;
  }

  function computeWholePlantPrice(): number | null {
    if (!isPlantObject(cur)) return null;
    const v = valueFromGardenPlant(cur as any, DefaultPricing, players);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  function recomputeAndNotify() {
    const slotVal = computeSelectedSlotPrice();
    const next = (slotVal ?? computeWholePlantPrice()) ?? null;
    if (next !== lastPrice) { lastPrice = next; notify(); }
  }

  (async () => {
    try { cur = await myCurrentGardenObject.get(); } catch {}
    try { players = await numPlayers.get(); } catch {}
    try { selectedSlotId = await myCurrentGrowSlotIndex.get(); } catch {}

    numPlayers.onChange((n) => { players = n as number; });

    myCurrentGardenObject.onChange((v) => { cur = v; scheduleRecomputeAndNotify(); });
    myCurrentGrowSlotIndex.onChange((idx) => {
      selectedSlotId = Number.isFinite(idx as number) ? (idx as number) : null;
      scheduleRecomputeAndNotify();
    });

    recomputeAndNotify();
  })();

  return {
    get() { return lastPrice; },
    onChange(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); },
    stop() { listeners.clear(); },
  };
}
