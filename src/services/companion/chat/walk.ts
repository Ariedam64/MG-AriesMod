// src/services/companion/chat/walk.ts
// Faire marcher le companion pendant qu'il travaille.
//
// Purement visuel : le serveur accepte les commandes d'où qu'on soit, et rien
// ici ne conditionne une action. C'est ce qui donne à voir qu'il fait quelque
// chose plutôt que de tout déclencher depuis un coin de la carte.
//
// D'où la règle qui gouverne ce fichier : un trajet qui échoue ne doit jamais
// empêcher l'action. Au pire on renonce à marcher et on continue.

import { CompanionService } from "..";
import { readMySlotIdx } from "../anchors";
import { readCompanionMap } from "../map";
import type { XY } from "../movement";

/** Deux échecs d'affilée : c'est structurel, pas une case isolée. */
const GIVE_UP_AFTER = 2;

export type Walker = {
  /** Va sur la tuile de terre d'un crop, désignée par son index de parcelle. */
  toGardenTile(dirtTileIdx: number): Promise<void>;
  /** Va sur une position du monde : un pet, par exemple. */
  toPosition(position: XY | null | undefined): Promise<void>;
  /**
   * Va devant un bâtiment, désigné par sa clé de map.
   *
   * Rend `false` quand le bâtiment est introuvable ou qu'on n'a pas marché :
   * l'appelant décide alors quoi en dire, mais ne renonce jamais à son action.
   */
  toBuilding(name: string): Promise<boolean>;
  /** Rend le companion à son mode. À appeler une fois la série finie. */
  release(): void;
  /** Faux quand on a renoncé, ou qu'il n'y a personne à faire marcher. */
  readonly walking: boolean;
};

/** Walker inerte : aucune marche, aucun délai. */
const IDLE: Walker = {
  async toGardenTile() {},
  async toPosition() {},
  async toBuilding() {
    return false;
  },
  release() {},
  walking: false,
};

/**
 * Prépare la marche pour une série d'actions.
 *
 * `onGiveUp` est appelé une seule fois, quand on renonce : chaque échec coûte
 * son délai d'attente, et insister ralentirait tout le lot pour un décor.
 */
export async function createWalker(onGiveUp: (message: string) => void): Promise<Walker> {
  if (!CompanionService.isRunning()) return IDLE;

  const slotIdx = await readMySlotIdx();
  if (slotIdx === null) return IDLE;

  let walking = true;
  let failures = 0;

  const record = (arrived: boolean): void => {
    failures = arrived ? 0 : failures + 1;
    if (walking && failures >= GIVE_UP_AFTER) {
      walking = false;
      CompanionService.releaseTask();
      onGiveUp("Cannot get around there, so I work from here.");
    }
  };

  const goTo = async (tile: XY | null): Promise<void> => {
    if (!walking) return;
    if (!tile) {
      record(false);
      return;
    }
    record(await CompanionService.walkTo(tile));
  };

  return {
    async toGardenTile(dirtTileIdx) {
      if (!walking) return;
      await goTo(CompanionService.gardenTileXY(slotIdx, dirtTileIdx));
    },
    async toPosition(position) {
      if (!walking) return;
      const x = Number(position?.x);
      const y = Number(position?.y);
      // Les positions du monde sont continues ; la grille, elle, ne l'est pas.
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        record(false);
        return;
      }
      await goTo({ x: Math.round(x), y: Math.round(y) });
    },
    async toBuilding(name) {
      if (!walking) return false;
      const map = await readCompanionMap();
      if (!map) return false;

      // Les tuiles d'activation sont celles depuis lesquelles le jeu propose
      // d'interagir. On prend la première où l'on peut réellement se tenir :
      // certaines sont posées sur le bâtiment lui-même, donc infranchissables.
      const tiles = map.buildingActivationTiles(name);
      const spot = tiles.map((tile) => map.toXY(tile)).find((xy) => map.isWalkable(xy.x, xy.y));
      if (!spot) return false;

      await goTo(spot);
      return walking;
    },
    release() {
      if (walking) CompanionService.releaseTask();
      walking = false;
    },
    get walking() {
      return walking;
    },
  };
}
