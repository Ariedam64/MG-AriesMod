// src/services/companion/map.ts
// Lecture de la grille du jeu pour le companion : conversion index <-> {x,y}
// et marchabilité des tuiles.
//
// Tout vient de `mapAtom`, que le jeu expose déjà pré-parsé :
//   { cols, rows, collisionTiles, conditionalCollisionRegions, npcSpawns, ... }
// Rien n'est hardcodé ici (règle core.md) : si la map change, on suit.
//
// Rappel de format : la position d'un NPC dans l'état de room est un INDEX de
// tuile, que le jeu reconvertit en {x: i % cols, y: floor(i / cols)}.

import { makeAtom } from "../../store/hub";
import type { XY } from "./movement";

/** Forme partielle de `mapAtom` : seuls les champs dont le companion a besoin. */
type GameMap = {
  cols: number;
  rows: number;
  /** Tuiles bloquées en permanence. */
  collisionTiles?: Iterable<number> | null;
  /** Régions bloquées selon une condition de jeu (boutique fermée, etc.). */
  conditionalCollisionRegions?: Array<{ condition?: string; tiles?: Iterable<number> | null }> | null;
  /** Point d'apparition natif de chaque NPC, indexé par nom de layer. */
  npcSpawns?: Record<string, number> | null;
  /** Tuiles de terre de chaque joueur, indexées par slot puis index local. */
  userSlotIdxAndDirtTileIdxToGlobalTileIdx?: Array<number[] | undefined> | null;
  /** Idem pour le ponton qui borde la parcelle. */
  userSlotIdxAndBoardwalkTileIdxToGlobalTileIdx?: Array<number[] | undefined> | null;
  /** Bâtiments : tuiles d'apparition et tuiles d'activation. */
  locations?: Record<string, { spawnTileIdx?: number[]; activationTilesIdxs?: number[] }> | null;
};

import { matchBuildingName } from "./buildings";

const mapAtom = makeAtom<GameMap | null>("mapAtom");

/** Vue exploitable de la grille, reconstruite à chaque changement de map. */
export type CompanionMap = {
  cols: number;
  rows: number;
  toIndex(x: number, y: number): number;
  toXY(index: number): XY;
  isWalkable(x: number, y: number): boolean;
  /** Noms des layers d'apparition NPC : ce sont aussi les noms des NPC. */
  npcSpawnLayers: string[];
  /** Point d'apparition natif d'un NPC, via son `spawnLayer`. */
  npcSpawnTile(spawnLayer: string): number | null;
  /** Noms des bâtiments de la map (seedShop, silo, trainStation…). */
  buildingNames: string[];
  /** Tuiles depuis lesquelles on active un bâtiment. */
  buildingActivationTiles(name: string): number[];
  /**
   * Retrouve un bâtiment par mots-clés, parmi les noms que la map expose.
   *
   * On ne code aucun nom de bâtiment en dur : la map en est la seule source,
   * et ses clés changent d'une version du jeu à l'autre. Un nom doit contenir
   * tous les fragments de `required` et au moins un de `alternatives` — c'est
   * ce qui sépare la boutique d'animaux de la niche, qui parlent toutes deux
   * d'animaux. Rend `null` plutôt que de deviner.
   */
  findBuilding(required: string[], alternatives: string[]): string | null;
  /** Tuiles de la parcelle d'un joueur : terre + ponton. */
  gardenTilesForSlot(userSlotIdx: number): number[];
  /**
   * Tuile globale d'une case de terre, depuis son index local à la parcelle.
   *
   * C'est l'index que le protocole appelle `slot` dans `HarvestCrop` et que
   * `garden.tileObjects` utilise comme clé — d'où le nom du champ de map,
   * `userSlotIdxAndDirtTileIdxToGlobalTileIdx`. Sans cette conversion, un crop
   * n'a pas de position sur la carte.
   */
  gardenTileToGlobal(userSlotIdx: number, dirtTileIdx: number): number | null;
  /**
   * Nombre de cases de terre d'une parcelle, donc la borne des index locaux.
   *
   * Sans elle, savoir quelles cases existent obligerait à sonder
   * `gardenTileToGlobal` jusqu'à tomber sur un trou, avec une borne arbitraire.
   */
  dirtTileCount(userSlotIdx: number): number;
};

function toSet(source: Iterable<number> | null | undefined): Set<number> {
  if (!source) return new Set();
  if (source instanceof Set) return source as Set<number>;
  try {
    return new Set(source);
  } catch {
    return new Set();
  }
}

/**
 * Construit la vue companion depuis la valeur brute de `mapAtom`.
 *
 * Les régions à collision conditionnelle sont traitées comme bloquées en
 * permanence. C'est volontairement conservateur : on ne sait pas ici si la
 * condition est active, et un companion planté au milieu d'une boutique fermée
 * est bien plus visible qu'un companion qui contourne une zone un peu large.
 */
export function buildCompanionMap(raw: GameMap | null | undefined): CompanionMap | null {
  if (!raw || !Number.isFinite(raw.cols) || !Number.isFinite(raw.rows)) return null;
  const cols = Number(raw.cols);
  const rows = Number(raw.rows);
  if (cols <= 0 || rows <= 0) return null;

  const blocked = toSet(raw.collisionTiles);
  for (const region of raw.conditionalCollisionRegions ?? []) {
    for (const tile of toSet(region?.tiles)) blocked.add(tile);
  }

  const npcSpawns = raw.npcSpawns ?? {};
  const locations = raw.locations ?? {};
  const dirtBySlot = raw.userSlotIdxAndDirtTileIdxToGlobalTileIdx ?? [];
  const boardwalkBySlot = raw.userSlotIdxAndBoardwalkTileIdxToGlobalTileIdx ?? [];

  return {
    cols,
    rows,
    toIndex: (x, y) => y * cols + x,
    toXY: (index) => ({ x: index % cols, y: Math.floor(index / cols) }),
    isWalkable(x, y) {
      if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
      if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
      return !blocked.has(y * cols + x);
    },
    npcSpawnLayers: Object.keys(npcSpawns),
    npcSpawnTile(spawnLayer) {
      const tile = npcSpawns[spawnLayer];
      return Number.isFinite(tile) ? Number(tile) : null;
    },
    buildingNames: Object.keys(locations),
    buildingActivationTiles(name) {
      const tiles = locations[name]?.activationTilesIdxs;
      return Array.isArray(tiles) ? tiles.filter((t) => Number.isInteger(t)) : [];
    },
    findBuilding(required, alternatives) {
      return matchBuildingName(Object.keys(locations), required, alternatives);
    },
    gardenTilesForSlot(userSlotIdx) {
      if (!Number.isInteger(userSlotIdx) || userSlotIdx < 0) return [];
      // Terre ET ponton : le companion doit pouvoir longer les plates-bandes,
      // pas seulement se tenir dessus.
      const dirt = dirtBySlot[userSlotIdx];
      const boardwalk = boardwalkBySlot[userSlotIdx];
      const tiles = new Set<number>();
      for (const tile of Array.isArray(dirt) ? dirt : []) tiles.add(tile);
      for (const tile of Array.isArray(boardwalk) ? boardwalk : []) tiles.add(tile);
      return [...tiles];
    },
    gardenTileToGlobal(userSlotIdx, dirtTileIdx) {
      if (!Number.isInteger(userSlotIdx) || userSlotIdx < 0) return null;
      if (!Number.isInteger(dirtTileIdx) || dirtTileIdx < 0) return null;
      const dirt = dirtBySlot[userSlotIdx];
      if (!Array.isArray(dirt)) return null;
      const global = dirt[dirtTileIdx];
      return Number.isInteger(global) ? Number(global) : null;
    },
    dirtTileCount(userSlotIdx) {
      if (!Number.isInteger(userSlotIdx) || userSlotIdx < 0) return 0;
      const dirt = dirtBySlot[userSlotIdx];
      return Array.isArray(dirt) ? dirt.length : 0;
    },
  };
}

/** Lit la map courante. Rend `null` si le jeu n'est pas encore prêt. */
export async function readCompanionMap(): Promise<CompanionMap | null> {
  try {
    return buildCompanionMap(await mapAtom.get());
  } catch {
    return null;
  }
}

/** S'abonne aux changements de map (changement de salle, restaging). */
export async function onMapChange(cb: (map: CompanionMap | null) => void): Promise<() => void> {
  try {
    return await mapAtom.onChange((raw) => cb(buildCompanionMap(raw)));
  } catch {
    return () => {};
  }
}
