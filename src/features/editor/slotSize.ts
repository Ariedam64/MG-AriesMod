// Size editing for the grow slots of a placed plant, as a pure model the
// current-item panel renders from.
//
// A grow slot carries a whole-number Crop Size in [50, 100] (see
// `data/rules/cropSize`). Each slot is edited either with the slider
// ("percent" mode, always in range) or by typing a number ("custom" mode). The
// typed number is written to the slot as typed; the game clamps it when it
// draws the crop, so the panel shows the clamped value.

import { CROP_SIZE_MAX, CROP_SIZE_MIN, readCropSize } from "../../data/rules/cropSize";
import { clamp } from "../../lib/math";

export type SlotScaleMode = "percent" | "custom";

/** Whole-number size in [50, 100]. A value that is not a number counts as the maximum. */
export function clampSizePercent(value: number): number {
  return clamp(Math.round(Number.isFinite(value) ? value : CROP_SIZE_MAX), CROP_SIZE_MIN, CROP_SIZE_MAX);
}

/** A typed size, accepting a comma as the decimal point and stray spaces. Blank or not a number gives null. */
export function parseSizeText(raw: string): number | null {
  const normalized = String(raw ?? "").replace(",", ".").replace(/\s+/g, "");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** What the panel shows for one slot. `size` is what was written, `pct` its clamped value. */
export type SlotSizeState = { pct: number; size: number; mode: SlotScaleMode };

/** The result of an edit: the new state of every slot, the size to write, and which slots get it. */
export type SlotSizeEdit = { states: SlotSizeState[]; size: number; targets: number[] };

/** A slot as the panel first shows it. A slot with no readable size shows the maximum. */
export function initialSlotSize(slot: unknown, mode: SlotScaleMode | undefined): SlotSizeState {
  const size = readCropSize(slot) ?? CROP_SIZE_MAX;
  return { pct: clampSizePercent(size), size, mode: mode === "custom" ? "custom" : "percent" };
}

function applyEdit(
  states: SlotSizeState[],
  idx: number,
  applyAll: boolean,
  next: SlotSizeState,
): SlotSizeEdit {
  const targets = applyAll ? states.map((_, i) => i) : [idx];
  return {
    states: states.map((state, i) => (targets.includes(i) ? { ...next } : state)),
    size: next.size,
    targets,
  };
}

/** The slider moved: the size is the slider's value, in percent mode. */
export function editSlotPercent(states: SlotSizeState[], idx: number, value: number, applyAll: boolean): SlotSizeEdit {
  const pct = clampSizePercent(value);
  return applyEdit(states, idx, applyAll, { pct, size: pct, mode: "percent" });
}

/** A custom size was committed. Null when the text is not a number, which changes nothing. */
export function editSlotCustom(
  states: SlotSizeState[],
  idx: number,
  raw: string,
  applyAll: boolean,
): SlotSizeEdit | null {
  const size = parseSizeText(raw);
  if (size == null) return null;
  return applyEdit(states, idx, applyAll, { pct: clampSizePercent(size), size, mode: "custom" });
}

/**
 * The custom toggle flipped. Entering custom mode keeps the size; leaving it
 * brings an out-of-range custom size back into range.
 */
export function editSlotMode(
  states: SlotSizeState[],
  idx: number,
  mode: SlotScaleMode,
  applyAll: boolean,
): SlotSizeEdit {
  const current = states[idx];
  const size = mode === "custom" ? current.size : clampSizePercent(current.size);
  return applyEdit(states, idx, applyAll, { pct: clampSizePercent(size), size, mode });
}
