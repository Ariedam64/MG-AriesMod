/**
 * What the two notification bells share: the controller the overlay drives,
 * and the "bell ring" motion they both play while items are waiting.
 */

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** The surface the overlay uses, whichever bell is showing. */
export interface BellController {
  stop(): void;
  /** The bell's on-screen box in page (client) coordinates, or null while it is not drawn. */
  getScreenRect(): ScreenRect | null;
  setWiggle(active: boolean): void;
}

/**
 * A burst of fast, decaying swings around the bell's mounting point over the
 * first half of the cycle, then a rest until the next ring. Reads as a bell
 * actually ringing rather than a slow metronome sway. Offsets are fractions
 * of one cycle.
 */
export const BELL_RING_SEQUENCE: ReadonlyArray<{ offset: number; deg: number }> = [
  { offset: 0, deg: 0 },
  { offset: 0.05, deg: 15 },
  { offset: 0.1, deg: -13 },
  { offset: 0.15, deg: 11 },
  { offset: 0.2, deg: -9 },
  { offset: 0.25, deg: 7 },
  { offset: 0.3, deg: -5 },
  { offset: 0.35, deg: 3 },
  { offset: 0.4, deg: -2 },
  { offset: 0.45, deg: 1 },
  { offset: 0.5, deg: 0 },
  { offset: 1, deg: 0 },
];

export const BELL_RING_DURATION_MS = 1600;

export const BELL_GLYPH = "\u{1F514}";

const DEG_TO_RAD = Math.PI / 180;

/** Ring angle in radians at a point of the cycle (0..1), interpolated between the keyframes. */
export function bellRingAngleAt(cycleOffset: number): number {
  for (let i = 1; i < BELL_RING_SEQUENCE.length; i++) {
    const next = BELL_RING_SEQUENCE[i];
    if (cycleOffset > next.offset) continue;
    const prev = BELL_RING_SEQUENCE[i - 1];
    const span = next.offset - prev.offset;
    const ratio = span > 0 ? (cycleOffset - prev.offset) / span : 0;
    return (prev.deg + (next.deg - prev.deg) * ratio) * DEG_TO_RAD;
  }
  return 0;
}
