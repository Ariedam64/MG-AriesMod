// Breadth-first search over the walkable grid.
//
// Movement used to be greedy: try the axis with the largest gap, then the
// other. Only two candidates, so no way around anything; worse, once ALIGNED
// on an axis there was no vertical candidate at all, and a single wall ahead
// froze the companion. The BFS removes that whole class of block. The map is
// 101 by 60, about 6,000 tiles: a full search costs a fraction of a
// millisecond, nothing next to a step every 150 ms.
//
// Pure: checked by scripts/checkCompanionMovement.ts.

import type { IsWalkable, XY } from "./movement";

/** True when the tile is an acceptable arrival. */
export type IsGoal = (x: number, y: number) => boolean;

/**
 * A safety bound, above the known map size (101 by 60). Stops an unexpected
 * map from turning one step into an endless sweep.
 */
const MAX_EXPLORED_NODES = 12_000;

/** Possible moves: orthogonal, like the game's walking. */
const STEPS: ReadonlyArray<XY> = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

const keyOf = (x: number, y: number): string => `${x},${y}`;

/**
 * The FIRST step of the shortest path from `from` to the nearest arrival, or
 * `null` when none can be reached.
 *
 * The arrival is a predicate, not a tile: that lets the same code serve
 * following ("any tile within N of the player", while the player's own tile is
 * off limits) and wandering ("this exact tile"). Aiming at an exact tile would
 * fail in the first case. An arrival must be walkable: a step is never
 * offered towards a tile he cannot stand on.
 */
export function findFirstStep(
  from: XY,
  isGoal: IsGoal,
  isWalkable: IsWalkable,
  maxExploredNodes: number = MAX_EXPLORED_NODES,
): XY | null {
  // Already there: nothing to do, and certainly not a step "to move".
  if (isGoal(from.x, from.y)) return null;

  // For each tile reached, the first step of the path that leads there: that
  // is all the caller uses, so the path is never rebuilt.
  const firstStepTo = new Map<string, XY>();
  const seen = new Set<string>([keyOf(from.x, from.y)]);
  let frontier: XY[] = [from];
  let explored = 0;

  while (frontier.length > 0 && explored < maxExploredNodes) {
    const nextFrontier: XY[] = [];

    for (const tile of frontier) {
      const stepToTile = firstStepTo.get(keyOf(tile.x, tile.y)) ?? null;

      for (const step of STEPS) {
        const x = tile.x + step.x;
        const y = tile.y + step.y;
        const key = keyOf(x, y);
        if (seen.has(key)) continue;
        seen.add(key);
        explored++;
        if (!isWalkable(x, y)) continue;

        // A direct neighbour of `from` IS the first step; further out, the
        // first step of the tile we came from is inherited.
        const firstStep = stepToTile ?? { x, y };
        if (isGoal(x, y)) return firstStep;

        firstStepTo.set(key, firstStep);
        nextFrontier.push({ x, y });
      }
    }

    frontier = nextFrontier;
  }

  return null;
}
