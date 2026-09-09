// src/services/companion/anchors.ts
// Traduit le mode choisi par l'utilisateur en une ancre + une zone praticable,
// les deux seules choses que `movement.ts` a besoin de connaître.
//
// C'est ici que vivent les différences entre modes ; le moteur de déplacement
// reste identique pour tous. Ajouter un mode revient à ajouter un cas ici, sans
// toucher au cœur testé.
//
// Rien n'est écrit en dur : les tuiles du jardin sont dérivées de `mapAtom`
// (règle core.md).

import { makeAtom } from "../../store/hub";
import type { Anchor, IsWalkable, XY } from "./movement";
import type { CompanionMap } from "./map";

// Le mode est une donnée de réglage : il vit dans `settingsShape.ts`, qui est
// pur. On le réexporte ici parce que c'est de ce module que tout le reste le
// prend déjà, et que le déplacer plus loin ne clarifierait rien.
export { COMPANION_MODES, type CompanionMode } from "./settingsShape";
import type { CompanionMode } from "./settingsShape";

/** Slot du joueur local dans la salle : indexe ses tuiles de jardin. */
const myUserSlotIdx = makeAtom<number | null>("myUserSlotIdxAtom");

export type ResolvedAnchor = {
  anchor: Anchor;
  /** Marchabilité brute de la map. La zone du mode vit dans `anchor.zone`. */
  isWalkable: IsWalkable;
  /** Mode réellement appliqué : peut différer du demandé en cas de repli. */
  effectiveMode: CompanionMode;
};

export type AnchorRequest = {
  mode: CompanionMode;
  map: CompanionMap;
  player: XY;
};

/**
 * Résout le mode courant.
 *
 * Repli assumé : un mode dont les données manquent (jardin introuvable) retombe
 * sur le suivi plutôt que de laisser le companion immobile sans explication. `effectiveMode` dit ce qui a réellement été appliqué,
 * pour que l'UI puisse le signaler.
 */
export async function resolveAnchor(request: AnchorRequest): Promise<ResolvedAnchor> {
  const { mode, map, player } = request;

  if (mode === "garden") {
    const resolved = await resolveGardenAnchor(map);
    if (resolved) return resolved;
  }
  return followAnchor(map, player);
}

function followAnchor(map: CompanionMap, player: XY): ResolvedAnchor {
  return {
    anchor: { tile: player, onArrival: "wander", tracksPlayer: true },
    isWalkable: map.isWalkable,
    effectiveMode: "follow",
  };
}

/**
 * Jardin : la zone est la parcelle du joueur, l'ancre son centre.
 *
 * Le rayon de flânerie est calculé pour couvrir toute la parcelle — sinon le
 * companion resterait agglutiné au centre d'un jardin plus grand que le rayon
 * par défaut, qui n'a pas le même sens ici.
 */
async function resolveGardenAnchor(map: CompanionMap): Promise<ResolvedAnchor | null> {
  const slot = await readMySlotIdx();
  if (slot === null) return null;

  const tiles = map.gardenTilesForSlot(slot);
  if (tiles.length === 0) return null;

  const allowed = new Set(tiles);
  // Zone, PAS marchabilité : hors de son jardin le companion doit pouvoir
  // traverser le reste de la map pour y revenir à pied.
  const zone: IsWalkable = (x, y) => allowed.has(map.toIndex(x, y));

  const positions = tiles.map((tile) => map.toXY(tile));
  const center = nearestTo(centroid(positions), positions);
  const radius = positions.reduce(
    (max, tile) => Math.max(max, Math.abs(tile.x - center.x), Math.abs(tile.y - center.y)),
    1
  );

  return {
    anchor: { tile: center, onArrival: "wander", tracksPlayer: false, zone, wanderRadius: radius },
    isWalkable: map.isWalkable,
    effectiveMode: "garden",
  };
}

/** Slot du joueur dans la salle : c'est lui qui indexe ses tuiles de jardin. */
export async function readMySlotIdx(): Promise<number | null> {
  try {
    const slot = Number(await myUserSlotIdx.get());
    return Number.isInteger(slot) && slot >= 0 ? slot : null;
  } catch {
    return null;
  }
}

function centroid(tiles: XY[]): XY {
  let sumX = 0;
  let sumY = 0;
  for (const tile of tiles) {
    sumX += tile.x;
    sumY += tile.y;
  }
  return { x: Math.round(sumX / tiles.length), y: Math.round(sumY / tiles.length) };
}

/** Le centre géométrique peut tomber hors zone : on prend la tuile réelle la plus proche. */
function nearestTo(target: XY, tiles: XY[]): XY {
  let best = tiles[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tile of tiles) {
    const distance = Math.abs(tile.x - target.x) + Math.abs(tile.y - target.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tile;
    }
  }
  return { ...best };
}
