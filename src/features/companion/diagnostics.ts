// Measures which companion positions the GAME really consumes.
//
// The loop injects a tile at a fixed rate, but the renderer only sees it when
// Jotai recomputes the NPC atoms. If that is slower than our step, the game
// sees a jump of several tiles at once and snaps instead of animating the
// walk (`AvatarView.preDraw`: snap as soon as the Manhattan distance is over 1).
//
// So this follows the SAME atom as the avatar layer (`npcQuinoaUsersAtom`) and
// records every position seen, to tell two causes apart:
//   - deltas > 1  => the recompute rate is too slow (our fault)
//   - deltas == 1 => the game snaps for another reason (forceSnap)

import { sleep } from "../../lib/async";
import { makeAtom } from "../../game/store/hub";

const DEFAULT_SAMPLE_MS = 6000;

type Observation = { atMs: number; x: number; y: number };

type DiagnosticReport = {
  /** Distinct positions the game saw during the sample. */
  observations: number;
  /** Median interval between two positions seen, in ms. */
  medianIntervalMs: number | null;
  /** The largest tile gap between two observations in a row. */
  maxDelta: number;
  /** How often the game saw a jump of more than one tile, so a snap. */
  snapCount: number;
  /** The share of transitions that snapped. */
  snapRatio: number;
  verdict: string;
};

const npcQuinoaUsers = makeAtom<Array<{ playerId: string; position?: { x: number; y: number } | null }>>(
  "npcQuinoaUsersAtom",
);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/** Samples the positions the game sees for `npcId`. Run it while the companion walks. */
export async function diagnoseCompanion(npcId: string, sampleMs = DEFAULT_SAMPLE_MS): Promise<DiagnosticReport> {
  const seen: Observation[] = [];

  const record = (entries: Array<{ playerId: string; position?: { x: number; y: number } | null }> | null) => {
    const entry = Array.isArray(entries) ? entries.find((e) => e?.playerId === npcId) : null;
    const pos = entry?.position;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    const last = seen[seen.length - 1];
    if (last && last.x === pos.x && last.y === pos.y) return;
    seen.push({ atMs: performance.now(), x: pos.x, y: pos.y });
  };

  let unsub: (() => void) | null = null;
  try {
    unsub = await npcQuinoaUsers.onChangeNow((next) => record(next));
  } catch {
    return {
      observations: 0,
      medianIntervalMs: null,
      maxDelta: 0,
      snapCount: 0,
      snapRatio: 0,
      verdict: "Could not subscribe to npcQuinoaUsersAtom.",
    };
  }

  await sleep(sampleMs);
  try {
    unsub?.();
  } catch {}

  const intervals: number[] = [];
  let maxDelta = 0;
  let snapCount = 0;
  for (let i = 1; i < seen.length; i++) {
    const prev = seen[i - 1];
    const curr = seen[i];
    intervals.push(curr.atMs - prev.atMs);
    const delta = Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
    if (delta > maxDelta) maxDelta = delta;
    if (delta > 1) snapCount++;
  }

  const transitions = Math.max(0, seen.length - 1);
  const snapRatio = transitions === 0 ? 0 : snapCount / transitions;

  return {
    observations: seen.length,
    medianIntervalMs: median(intervals),
    maxDelta,
    snapCount,
    snapRatio: Number(snapRatio.toFixed(2)),
    verdict: buildVerdict(seen.length, snapCount, maxDelta),
  };
}

function buildVerdict(observations: number, snapCount: number, maxDelta: number): string {
  if (observations < 2) {
    return "No position seen: the companion is not moving, or the atom is not read again. Make sure he walks during the sample.";
  }
  if (snapCount === 0) {
    return "The game only sees one-tile steps. The rate is not the cause: the snap comes from elsewhere (forceSnap).";
  }
  return `The game sees jumps of up to ${maxDelta} tiles: the recompute rate is slower than our step. That is the cause of the snap.`;
}
