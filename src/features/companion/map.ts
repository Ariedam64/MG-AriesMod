// Reads the game grid from `mapAtom`, which the game already exposes parsed.
// The view itself is built in `mapView.ts`.

import { makeAtom } from "../../game/store/hub";
import { buildCompanionMap, type CompanionMap, type GameMap } from "./mapView";

const mapAtom = makeAtom<GameMap | null>("mapAtom");

/** Reads the current map. `null` while the game is not ready. */
export async function readCompanionMap(): Promise<CompanionMap | null> {
  try {
    return buildCompanionMap(await mapAtom.get());
  } catch {
    return null;
  }
}

/** Follows map changes (room change, restaging). */
export async function onMapChange(cb: (map: CompanionMap | null) => void): Promise<() => void> {
  try {
    return await mapAtom.onChange((raw) => cb(buildCompanionMap(raw)));
  } catch {
    return () => {};
  }
}
