// Telling a restock apart from an ordinary update.
//
// Since build 1449 a shop is `{ restockId, startedAtMs, inventory, deadlineMs }`:
// there is no countdown any more, and a new `restockId` is the restock.

/** The restock id of every shop stocking one kind of item, by shop key (`seed`, `dawn`...). */
export type Restocks = Record<string, string | null>;

/**
 * Whether a kind restocked between two readings: a shop already open got a new
 * restock, or a shop opened (a weather shop). A shop closing is not a restock,
 * and neither is a shop's first restock id arriving after it loaded empty.
 */
export function hasRestocked(prev: Restocks | undefined, next: Restocks | undefined): boolean {
  if (!prev || !next) return false;
  return Object.entries(next).some(([shop, id]) => {
    if (id == null) return false;
    if (!(shop in prev)) return true;
    return prev[shop] != null && prev[shop] !== id;
  });
}
