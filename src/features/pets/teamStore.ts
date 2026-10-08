// The player's pet teams as the mod keeps them: the list, its storage under
// `pets.teams`, and change notifications. Edits that also reach the game go
// through `teams.ts`; this module only holds and saves the list.

import { Emitter } from "../../lib/emitter";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import type { PetTeam } from "./teamReconcile";

export type { PetTeam };

const STORAGE_PATH = "pets.teams";
const SLOT_COUNT = 3;

/**
 * Last local id seen for each server team. Team shortcuts are stored under
 * `pets.team.<local id>`, so a team that disappears from the server and comes
 * back must get its old local id again, or its shortcut is lost.
 */
const localIdByServerId = new Map<string, string>();
const changes = new Emitter<PetTeam[]>();

const normalizeSlots = (slots: unknown): (string | null)[] =>
  Array.isArray(slots)
    ? slots.slice(0, SLOT_COUNT).map((x: unknown) => (x ? String(x) : null))
    : [null, null, null];

function load(): PetTeam[] {
  const saved = readAriesPath<PetTeam[]>(STORAGE_PATH) ?? [];
  if (!Array.isArray(saved)) return [];
  const seen = new Set<string>();
  const out: PetTeam[] = [];
  for (const t of saved) {
    const id = String(t?.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: String(t?.name || "Team"),
      slots: normalizeSlots(t?.slots),
      serverId: t?.serverId ? String(t.serverId) : null,
    });
  }
  // Duplicates came from an old bug; save the cleaned list once.
  if (out.length !== saved.length) save(out);
  for (const t of out) if (t.serverId) localIdByServerId.set(t.serverId, t.id);
  return out;
}

function save(list: PetTeam[]): void {
  for (const t of list) {
    if (t?.serverId && t?.id) localIdByServerId.set(String(t.serverId), String(t.id));
  }
  writeAriesPath(STORAGE_PATH, list);
}

let teams: PetTeam[] = load();

const copy = (t: PetTeam): PetTeam => ({ ...t, slots: t.slots.slice(0, SLOT_COUNT) });

/** The live list. Only the team modules mutate it; everyone else reads `getTeams`. */
export function teamsRef(): PetTeam[] {
  return teams;
}

/** Replaces the list, saves it and tells subscribers. */
export function commitTeams(next: PetTeam[]): void {
  teams = next;
  save(teams);
  changes.emit(getTeams());
}

export function getTeams(): PetTeam[] {
  return teams.map(copy);
}

export function getTeamById(teamId: string): PetTeam | null {
  const team = teams.find((t) => t.id === teamId);
  return team ? copy(team) : null;
}

/** Calls back at once with the current teams, then on every change. */
export function onTeamsChange(cb: (all: PetTeam[]) => void): () => void {
  const off = changes.on(cb);
  try { cb(getTeams()); } catch {}
  return off;
}

export function rememberLocalId(serverId: string, localId: string): void {
  localIdByServerId.set(serverId, localId);
}

export function knownLocalId(serverId: string): string | undefined {
  return localIdByServerId.get(serverId);
}

/** The team whose pets are exactly these, in any order. */
export function teamIdForPets(petIds: string[]): string | null {
  const wanted = new Set(petIds.map((id) => String(id || "")).filter(Boolean));
  if (!wanted.size) return null;
  for (const team of teams) {
    const slots = team.slots.map((id) => String(id || "")).filter(Boolean);
    if (slots.length !== wanted.size) continue;
    const slotSet = new Set(slots);
    if ([...wanted].every((id) => slotSet.has(id))) return team.id;
  }
  return null;
}

export function newTeamId(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid;
  } catch {}
  return `t_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
}
