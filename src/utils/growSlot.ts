// src/utils/growSlot.ts
// Which grow slot the game is showing, mirroring the game's own resolution.
//
// `mySelectedSlotIdAtom` is a raw selection cursor, not a slotId that is
// guaranteed to exist: it starts at 0, and harvesting a fruit leaves it
// pointing at an id that is gone. The game resolves it as "exact match, else
// the next id upwards, else the lowest id" — matching on equality alone
// strands the selection on `slots[0]`, so nothing derived from the selected
// fruit (price, size, lock state) follows what the player picked.
//
// Since v1125 the game also publishes the already-resolved id as
// `myCurrentGrowSlotIdAtom`; reading that first makes the exact match hit, and
// this resolution stays as the fallback for older builds.

type SlotLike = { slotId?: number | null };

const slotIdOf = (slot: SlotLike | null | undefined): number =>
  Number.isFinite(slot?.slotId as number) ? (slot!.slotId as number) : 0;

const bySlotId = (a: SlotLike, b: SlotLike): number => slotIdOf(a) - slotIdOf(b);

/** The slot the given cursor points at, resolved the way the game does. */
export function resolveGrowSlot<T extends SlotLike>(
  slots: readonly T[] | null | undefined,
  selectedSlotId: number | null | undefined,
): T | null {
  if (!Array.isArray(slots) || slots.length === 0) return null;

  if (selectedSlotId != null && Number.isFinite(selectedSlotId)) {
    const exact = slots.find((slot) => slot && slot.slotId === selectedSlotId);
    if (exact) return exact;

    const sorted = [...slots].sort(bySlotId);
    return sorted.find((slot) => slotIdOf(slot) >= selectedSlotId) ?? sorted[0] ?? null;
  }

  // No cursor yet: the game starts at 0, which resolves to the lowest id.
  return [...slots].sort(bySlotId)[0] ?? null;
}

/** Position of the resolved slot in `slots`, or -1 when there is none. */
export function resolveGrowSlotIndex<T extends SlotLike>(
  slots: readonly T[] | null | undefined,
  selectedSlotId: number | null | undefined,
): number {
  const slot = resolveGrowSlot(slots, selectedSlotId);
  if (!slot || !Array.isArray(slots)) return -1;
  return slots.indexOf(slot);
}
