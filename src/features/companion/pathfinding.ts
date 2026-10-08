// src/services/companion/pathfinding.ts
// Parcours en largeur (BFS) sur la grille marchable.
//
// Pourquoi ce module existe
// -------------------------
// Le déplacement était glouton : on tentait l'axe du plus grand écart, puis
// l'autre. Deux candidats seulement, donc aucune capacité à contourner. Pire,
// une fois ALIGNÉ sur un axe (`dy === 0`), il n'existe même plus de candidat
// vertical : un simple mur en face suffisait à figer le companion.
//
// Le BFS supprime toute cette classe de blocages. La map fait 101 x 60, soit
// ~6 000 tuiles : une recherche complète coûte une fraction de milliseconde,
// négligeable face au pas toutes les 150 ms.
//
// Module PUR : aucun import à l'exécution, hasard et état exclus. Testé par
// scripts/checkCompanionMovement.ts.

import type { IsWalkable, XY } from "./movement";

/** Vrai si la tuile est une arrivée acceptable. */
export type IsGoal = (x: number, y: number) => boolean;

/**
 * Borne de sécurité, au-delà de la taille de la map connue (101 x 60).
 * Empêche une map inattendue de transformer un pas en balayage sans fin.
 */
const MAX_EXPLORED_NODES = 12_000;

/** Déplacements possibles : orthogonaux, comme la marche du jeu. */
const STEPS: ReadonlyArray<XY> = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

const keyOf = (x: number, y: number): string => `${x},${y}`;

/**
 * Rend le PREMIER pas du plus court chemin de `from` vers l'arrivée la plus
 * proche, ou `null` si aucune n'est atteignable.
 *
 * L'arrivée est un prédicat et non une tuile : c'est ce qui permet au même code
 * de servir au suivi (« n'importe quelle case à moins de N du joueur », alors
 * que la case du joueur elle-même est interdite) et à la flânerie (« cette
 * case précise »). Viser une tuile exacte aurait échoué dans le premier cas.
 *
 * Une arrivée doit être marchable : on ne propose jamais un pas vers une case
 * où le companion ne peut pas se tenir.
 */
export function findFirstStep(
  from: XY,
  isGoal: IsGoal,
  isWalkable: IsWalkable,
  maxExploredNodes: number = MAX_EXPLORED_NODES
): XY | null {
  // Déjà arrivé : rien à faire, et surtout pas un pas « pour bouger ».
  if (isGoal(from.x, from.y)) return null;

  // Pour chaque tuile atteinte, le premier pas du chemin qui y mène : c'est la
  // seule chose que l'appelant consomme, inutile de reconstruire le chemin.
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

        // Un voisin direct de `from` EST le premier pas ; plus loin, on hérite
        // du premier pas de la tuile d'où l'on vient.
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
