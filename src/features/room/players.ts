// The players in the current room: listing them, teleporting to their garden,
// and what their crops are worth.

import { toastSimple } from "../../ui/toast";
import { PlayerService } from "../../game/player";
import { Atoms } from "../../game/store/atoms";
import { clampFinite } from "../../lib/math";
import { sumGardenValue, sumInventoryValue } from "../../data/rules/cropValue";
import { gardenOfSlot, inventoryOfSlot, playersInSlotOrder, playersOf, slotOf, type Player } from "./roomState";
import { mapCols, sortedSpawnTiles } from "./spawnTiles";

/** Players in slot order, each with the spawn tile of its garden. */
export async function listPlayers(): Promise<Player[]> {
  const state = await Atoms.root.state.get();
  if (!state) return [];
  const ordered = playersInSlotOrder(state);
  const spawns = await sortedSpawnTiles();
  return ordered.map((p, i) => ({ ...p, gardenPosition: spawns[i] ?? null }));
}

export function onPlayersChange(cb: (players: Player[]) => void) {
  return Atoms.root.state.onChange(async () => {
    try {
      cb(await listPlayers());
    } catch {}
  });
}

/** Reads one player's slot out of the current room state. */
export async function playerSlot(playerId: string): Promise<any> {
  const state = await Atoms.root.state.get();
  return state ? slotOf(state, playerId) : null;
}

async function playerName(playerId: string): Promise<string | null> {
  try {
    const state = await Atoms.root.state.get();
    const p = playersOf(state).find((x) => String(x?.id) === String(playerId));
    return p && typeof p.name === "string" && p.name ? p.name : null;
  } catch {
    return null;
  }
}

export async function teleportToGarden(playerId: string): Promise<void> {
  const player = (await listPlayers()).find((x) => String(x.id) === String(playerId));
  const tileId = player?.gardenPosition ?? null;
  if (tileId == null) {
    await toastSimple("Teleport", "No garden position for this player.", "error");
    return;
  }
  const cols = await mapCols();
  await PlayerService.teleport(tileId % cols, Math.floor(tileId / cols));
  await toastSimple("Teleport", `Teleported to ${await playerName(playerId)}'s garden`, "success");
}

/** The friend bonus counts between 1 and 6 players. */
async function playersInRoom(): Promise<number> {
  try {
    return clampFinite(Math.floor(Number(await Atoms.server.numPlayers.get())), 1, 6, 1);
  } catch {
    return 1;
  }
}

export async function inventoryValue(playerId: string): Promise<number> {
  try {
    const items = inventoryOfSlot(await playerSlot(playerId))?.items ?? [];
    if (!items.length) return 0;
    return sumInventoryValue(items, undefined, await playersInRoom());
  } catch {
    return 0;
  }
}

export async function gardenValue(playerId: string): Promise<number> {
  try {
    const garden = gardenOfSlot(await playerSlot(playerId));
    if (!garden) return 0;
    return sumGardenValue(garden.tileObjects ?? {}, undefined, await playersInRoom());
  } catch {
    return 0;
  }
}
