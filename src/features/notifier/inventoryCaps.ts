import { Atoms } from "../../game/store/atoms";
import type { View } from "../../game/store/hub";
import { Emitter } from "../../lib/emitter";
import { decorCatalog, toolCatalog } from "../../data";

/**
 * Tools and decor the player cannot buy more of: a one-time purchase already
 * owned, or a stack at its maximum. Their shop alerts stay off, since the
 * game would refuse the purchase anyway.
 */

let toolCounts = new Map<string, number>();
let decorCounts = new Map<string, number>();
const changed = new Emitter<void>();

function isCapReachedIn(catalog: Record<string, any>, counts: Map<string, number>, itemId: string): boolean {
  const meta = catalog[itemId];
  if (!meta) return false;
  const owned = counts.get(itemId) || 0;
  if (meta.isOneTimePurchase && owned >= 1) return true;
  const max = Number(meta.maxInventoryQuantity);
  return Number.isFinite(max) && max > 0 && owned >= max;
}

/** Whether an alert item (`Tool:Shovel`, `Decor:Bench`) is capped. Seeds and eggs never are. */
export function isCapReached(id: string): boolean {
  if (id.startsWith("Tool:")) return isCapReachedIn(toolCatalog, toolCounts, id.slice(5));
  if (id.startsWith("Decor:")) return isCapReachedIn(decorCatalog, decorCounts, id.slice(6));
  return false;
}

function countsOf(items: unknown, idOf: (item: any) => unknown): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of Array.isArray(items) ? items : []) {
    const id = String(idOf(item) ?? "");
    if (id) counts.set(id, Number(item?.quantity) || 0);
  }
  return counts;
}

/** Reads the inventory once, then follows it. Each update re-applies the caps. */
async function follow<T>(view: View<T>, apply: (value: T) => void): Promise<void> {
  const update = (value: T) => {
    try {
      apply(value);
    } catch {}
    changed.emit();
  };
  try {
    update(await view.get());
  } catch {}
  try {
    await view.onChange(update);
  } catch {}
}

export const InventoryCaps = {
  async start(): Promise<void> {
    await follow(Atoms.inventory.myToolInventory, (items) => {
      toolCounts = countsOf(items, (it) => it?.toolId);
    });
    await follow(Atoms.inventory.myDecorInventory, (items) => {
      decorCounts = countsOf(items, (it) => it?.decorId ?? it?.id);
    });
  },

  /** Fires after every inventory update. */
  onChange(cb: () => void): () => void {
    return changed.on(cb);
  },
};
