// The companion's base: makes an NPC stand where we decide.
//
// The game reads its NPCs' positions from `quinoaDataAtom.npcs`, a map of
// playerId to tile index that comes from the room state. The `read()` of that
// atom is patched (through the existing `fakeAtoms` mechanism) to add our
// entry. Everything else follows: the game recomputes npcQuinoaUsersAtom,
// npcAvatarDataAtom and npcInteractionTilesAtom, creates the avatar view and
// animates it.
//
// Walking comes for free: the avatar layer interpolates between two adjacent
// tiles and plays the walk or run cycle, so the index only has to move one
// tile at a time (see movement.ts).
//
// This module is the ONLY one faking `quinoaDataAtom`. The fakeAtoms registry
// is keyed by label, so two modules patching the same atom overwrite each
// other (which is why fakeModal and the editor already share a single patch
// on `myDataAtom`).

import { fakeShow, fakeUpdate, fakeHide, fakeDispose, type FakeConfig } from "../../game/fakeAtoms";
import { makeAtom } from "../../game/store/hub";
import { readCompanionMap } from "./map";
import { COMPANION_TICK_LABEL, bumpTick, ensureTickAtom } from "./tick";

/** The prefix of the game's NPC ids: `NPC_Reina`, `NPC_Wade`, ... */
const NPC_ID_PREFIX = "NPC_";

const QUINOA_DATA_LABEL = "quinoaDataAtom";

const quinoaData = makeAtom<{ npcs?: Record<string, number> | null } | null>(QUINOA_DATA_LABEL);

type NpcsPatch = { npcs: Record<string, number> };

/**
 * Our entry overrides the game's for the same playerId (the companion wins,
 * including during the borrowed merchant's weather event). Weather shops are
 * buildings separate from the NPCs, so moving the NPC does not block them.
 */
const COMPANION_PATCH: FakeConfig<NpcsPatch> = {
  label: QUINOA_DATA_LABEL,
  // An artificial dependency: without it the recompute only follows the room
  // state (about 420 ms measured), too slow for a step's 130 ms interpolation.
  extraDeps: [COMPANION_TICK_LABEL],
  merge: (real: any, fake: any) => {
    const base = real && typeof real === "object" ? real : {};
    const realNpcs = base.npcs && typeof base.npcs === "object" ? base.npcs : {};
    const fakeNpcs = fake?.npcs && typeof fake.npcs === "object" ? fake.npcs : {};
    return { ...base, npcs: { ...realNpcs, ...fakeNpcs } };
  },
};

export type NpcIdentity = {
  playerId: string;
  name: string;
  spawnLayer: string;
  /** True when the game has it out right now (active weather merchant, permanent NPC). */
  present: boolean;
  /** The native spawn tile, useful as a fallback position. */
  spawnTile: number | null;
};

/** True while the merge really applies (patch installed AND active). */
let active = false;
let currentPayload: NpcsPatch = { npcs: {} };

/**
 * The NPC roster, worked out at run time, never hardcoded.
 *
 * Two sources that complete each other:
 *  - `mapAtom.npcSpawns`, whose keys are the spawn layer names, which are
 *    exactly the NPCs' names. It lists them ALL, absent weather merchants included.
 *  - `quinoaDataAtom.npcs`, which only holds those present right now, but
 *    gives their real playerIds.
 *
 * Observed ids win; the prefix is only a fallback for absent NPCs, which
 * cannot be observed.
 */
export async function listNpcIdentities(): Promise<NpcIdentity[]> {
  const map = await readCompanionMap();
  const presentIds = new Set(await readPresentNpcIds());

  const byId = new Map<string, NpcIdentity>();

  for (const name of map?.npcSpawnLayers ?? []) {
    const playerId = NPC_ID_PREFIX + name;
    byId.set(playerId, {
      playerId,
      name,
      spawnLayer: name,
      present: presentIds.has(playerId),
      spawnTile: map?.npcSpawnTile(name) ?? null,
    });
  }

  // An NPC present but missing from the layers (an unexpected map) must not be left out.
  for (const playerId of presentIds) {
    if (byId.has(playerId)) continue;
    const name = playerId.startsWith(NPC_ID_PREFIX) ? playerId.slice(NPC_ID_PREFIX.length) : playerId;
    byId.set(playerId, { playerId, name, spawnLayer: name, present: true, spawnTile: null });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The playerIds of the NPCs the game has out right now. */
async function readPresentNpcIds(): Promise<string[]> {
  try {
    const data = await quinoaData.get();
    const npcs = data?.npcs;
    if (!npcs || typeof npcs !== "object") return [];
    // Our own injections are not "game" NPCs.
    return Object.keys(npcs).filter((id) => !(id in currentPayload.npcs));
  } catch {
    return [];
  }
}

/**
 * Installs AND activates the patch (idempotent).
 *
 * `active` follows the fake's real state, not just the patch being installed:
 * `fakeHide` turns the merge off without removing the hook, so without this
 * flag reactivating would return early and the companion would stay invisible.
 */
export async function installInjection(): Promise<void> {
  if (active) return;
  // The tick must exist before the first patched read, or `extraDeps`
  // resolves nothing and the dependency is never registered.
  ensureTickAtom();
  await fakeShow(COMPANION_PATCH, currentPayload);
  active = true;
}

/** Puts the companion on a tile. The movement loop's only call. */
export async function setCompanionTile(playerId: string, tileIndex: number): Promise<void> {
  if (!Number.isInteger(tileIndex) || tileIndex < 0) return;
  currentPayload = { npcs: { [playerId]: tileIndex } };
  if (!active) {
    ensureTickAtom();
    // fakeShow reuses the patch already installed and reactivates it with this payload.
    await fakeShow(COMPANION_PATCH, currentPayload);
    active = true;
    return;
  }
  await fakeUpdate(QUINOA_DATA_LABEL, currentPayload);
  // The payload alone triggers no recompute: the tick pushes the new position
  // all the way to the screen before the next step.
  await bumpTick();
}

/** Removes the companion but keeps the patch in place (instant reactivation). */
export async function hideCompanion(): Promise<void> {
  if (!active) return;
  currentPayload = { npcs: {} };
  active = false;
  await fakeHide(QUINOA_DATA_LABEL);
}

/** Removes the patch and restores the original `read()`. */
export async function disposeInjection(): Promise<void> {
  currentPayload = { npcs: {} };
  active = false;
  await fakeDispose(QUINOA_DATA_LABEL);
}
