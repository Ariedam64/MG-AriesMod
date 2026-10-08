// Editing pet teams: every change is saved locally and, with the sync on,
// sent to the game's own pet teams.

import { petTeamName, type PetTeam } from "./teamReconcile";
import { commitTeams, newTeamId, teamsRef } from "./teamStore";
import { maybeCreateServerTeam, sendDeletePetTeam, sendMovePetTeam, sendSavePetTeam } from "./teamSync";

const SLOT_COUNT = 3;

export function createTeam(name?: string): PetTeam {
  const list = teamsRef();
  const team: PetTeam = {
    id: newTeamId(),
    name: petTeamName(name ?? "") || `Team ${list.length + 1}`,
    slots: [null, null, null],
    serverId: null,
  };
  commitTeams([...list, team]);
  return team;
}

export function deleteTeam(teamId: string): boolean {
  const list = teamsRef();
  const removed = list.find((t) => t.id === teamId);
  if (!removed) return false;
  commitTeams(list.filter((t) => t !== removed));
  if (removed.serverId) sendDeletePetTeam(removed.serverId);
  return true;
}

/** Renames a team or sets its slots. Returns the saved team, or null when it does not exist. */
export function saveTeam(patch: { id: string; name?: string; slots?: (string | null)[] }): PetTeam | null {
  const list = teamsRef();
  const index = list.findIndex((t) => t.id === patch.id);
  if (index < 0) return null;
  const current = list[index];
  const next: PetTeam = {
    id: current.id,
    name: typeof patch.name === "string" ? petTeamName(patch.name) : current.name,
    slots: Array.isArray(patch.slots) ? patch.slots.slice(0, SLOT_COUNT) : current.slots,
    serverId: current.serverId ?? null,
  };
  commitTeams(list.map((t, i) => (i === index ? next : t)));

  const petIds = next.slots.filter((x): x is string => !!x);
  if (!next.serverId) maybeCreateServerTeam(next);
  else if (petIds.length) sendSavePetTeam(next.serverId, next.name.trim() || "Team", petIds);
  return next;
}

/** Puts the teams in this order. Unknown ids are ignored; teams left out keep their place at the end. */
export function setTeamsOrder(ids: string[]): void {
  const byId = new Map(teamsRef().map((t) => [t.id, t] as const));
  const next: PetTeam[] = [];
  for (const id of ids) {
    const team = byId.get(id);
    if (team) {
      next.push(team);
      byId.delete(id);
    }
  }
  next.push(...byId.values());
  commitTeams(next);

  // Server indexes count linked teams only.
  next.filter((t) => t.serverId).forEach((t, serverIndex) => sendMovePetTeam(t.serverId!, serverIndex));
}
