// The pets service other features call: one object over the modules that do
// the work (teams, their sync with the game, switching, the owned-pet cache,
// feeding rules, and the ability log).

import { PlayerService, type PetState } from "../../game/player";
import { Atoms } from "../../game/store/atoms";
import { shareGlobal } from "../../platform/pageContext";
import {
  clearAbilityLogs,
  getAbilityLogsSessionStart,
  getSeenAbilityIds,
  onAbilityLogs,
  restoreAbilityLogs,
  startAbilityLogsWatcher,
} from "./abilityLogs";
import { abilityName, abilityNameWithoutLevel } from "./abilityNames";
import {
  getCompatibleCropsForSpecies,
  getHungerPctFor,
  getInstantFeedAllowedCrops,
  getOverride,
  isInstantFeedCropAllowed,
  setInstantFeedCropAllowed,
} from "./feeding";
import { getInventoryPets, getPetLookup } from "./inventoryPets";
import { chooseSlotPet } from "./petPicker";
import { createTeam, deleteTeam, saveTeam, setTeamsOrder } from "./teams";
import { getTeamById, getTeams, onTeamsChange } from "./teamStore";
import { getActivePetIds, getActiveTeamId, getLastUsedTeamId, usePetIds, useTeam, waitForTeamEquipped } from "./teamSwitch";
import { isTeamSyncEnabled, setTeamSyncEnabled, startPetTeamSync } from "./teamSync";

export type { InventoryPet } from "./inventoryPets";
export type { PetTeam } from "./teamStore";

export const PetsService = {
  // Equipped pets, straight from the player service.
  getPets(): Promise<PetState> { return PlayerService.getPets(); },
  onPetsChange(cb: (pets: PetState) => void) { return PlayerService.onPetsChange(cb); },
  onPetsChangeNow(cb: (pets: PetState) => void) { return PlayerService.onPetsChangeNow(cb); },

  getAbilityName: abilityName,
  getAbilityNameWithoutLevel: abilityNameWithoutLevel,

  getOverride,
  getCompatibleCropsForSpecies,
  getHungerPctFor,
  getInstantFeedAllowedCrops,
  isInstantFeedCropAllowed,
  setInstantFeedCropAllowed,

  getTeams,
  getTeamById,
  /** Calls back at once with the current teams, then on every change. */
  onTeamsChange,
  /** Same as `onTeamsChange`, for callers that await their subscription. */
  async onTeamsChangeNow(cb: Parameters<typeof onTeamsChange>[0]): Promise<() => void> {
    return onTeamsChange(cb);
  },
  createTeam,
  deleteTeam,
  saveTeam,
  setTeamsOrder,

  isTeamSyncEnabled,
  setTeamSyncEnabled,
  startPetTeamSync,

  getInventoryPets,
  getPetLookup,
  chooseSlotPet,

  useTeam,
  usePetIds,
  getActivePetIds,
  getActiveTeamId,
  getLastUsedTeamId,
  waitForTeamEquipped,

  startAbilityLogsWatcher,
  onAbilityLogs,
  getAbilityLogsSessionStart,
  getSeenAbilityIds,
  clearAbilityLogs,
};

// Import-time side effects, kept on purpose. The saved ability logs load now
// so the Logs tab has them before the watcher starts, and the service is put
// on the page for console debugging.
restoreAbilityLogs();
try {
  shareGlobal("QWS_PetsService", PetsService);
  shareGlobal("QWS_Atoms", Atoms);
} catch {}
