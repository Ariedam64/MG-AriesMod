// src/services/petTeamReconcile.ts
// Pure core of the native pet-team sync (see pets.ts). Kept free of atoms and
// UI so the linking rules can be checked in node.

export type PetTeam = {
  id: string;
  name: string;
  slots: (string | null)[];
  /** Server-generated id of the native (in-game) pet team this is linked to, once synced. */
  serverId?: string | null;
};

export type ServerPetTeamMember = { petId: string; petSpecies?: string; name?: string | null };
export type ServerPetTeam = { id: string; name: string; members: ServerPetTeamMember[]; emblem?: unknown };

export function serverMemberIds(team: ServerPetTeam): string[] {
  return Array.isArray(team?.members)
    ? team.members.map(m => String(m?.petId || "")).filter(Boolean)
    : [];
}

export function sameMemberSet(a: (string | null)[], b: string[]): boolean {
  const aa = a.filter((x): x is string => !!x).slice().sort();
  const bb = b.slice().sort();
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}

/** The game's SavePetTeam keeps the trimmed name cut to this many grapheme clusters. */
export const PET_TEAM_NAME_MAX_CLUSTERS = 16;

/** The name exactly as the server will store it. */
export function petTeamName(name: string): string {
  const trimmed = String(name ?? "").trim();
  let parts: string[];
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    parts = Array.from(seg.segment(trimmed), s => s.segment);
  } catch {
    parts = Array.from(trimmed);
  }
  return parts.length <= PET_TEAM_NAME_MAX_CLUSTERS
    ? trimmed
    : parts.slice(0, PET_TEAM_NAME_MAX_CLUSTERS).join("");
}

function nameKey(name: string | undefined): string {
  return name ? petTeamName(name).toLowerCase() : "";
}

export type ReconcileEnv = {
  /** Name sent in a create still in flight for this local team, if any. */
  sentName(localId: string): string | undefined;
  /** Local id this server team had before it was last dropped, to keep its keybind. */
  knownLocalId(serverId: string): string | undefined;
  newId(): string;
};

export type ReconcileResult = {
  teams: PetTeam[];
  changed: boolean;
  /** Local teams that just got linked: their pending create is settled. */
  linkedLocalIds: string[];
  /** Linked teams whose current content must be pushed to the server as an update. */
  pushUpdates: { serverId: string; name: string; petIds: string[] }[];
  /** Unlinked local teams with no server counterpart: candidates for a create. */
  needsCreate: PetTeam[];
  /** Local teams dropped because their server team is gone. */
  dropped: PetTeam[];
};

/**
 * Links local teams to server teams and mirrors the server onto them.
 * Mutates the local team objects in place (callers hold references to them)
 * and returns the new list.
 */
export function reconcilePetTeams(
  teams: PetTeam[],
  serverTeams: ServerPetTeam[],
  env: ReconcileEnv,
): ReconcileResult {
  const serverById = new Map(serverTeams.map(t => [String(t.id), t]));
  const linkedServerIds = new Set(teams.map(t => t.serverId).filter((v): v is string => !!v));

  // Every free server team carrying this name, not just one: two teams may
  // share a name ("Team 3" again after a delete), and keeping only the last
  // one per name left the other unmatchable, so it was imported as a copy.
  const freeByName = (key: string): ServerPetTeam[] =>
    key ? serverTeams.filter(t => !linkedServerIds.has(String(t.id)) && nameKey(t.name) === key) : [];

  const result: ReconcileResult = {
    teams, changed: false, linkedLocalIds: [], pushUpdates: [], needsCreate: [], dropped: [],
  };
  const folded = new Set<PetTeam>();

  for (const local of teams) {
    if (folded.has(local)) continue;
    if (local.serverId) {
      const server = serverById.get(local.serverId);
      if (!server) continue; // deleted in-game: dropped by the removal pass below
      const memberIds = serverMemberIds(server);
      if (server.name !== local.name || !sameMemberSet(local.slots, memberIds)) {
        local.name = server.name;
        local.slots = [0, 1, 2].map(i => memberIds[i] ?? null);
        result.changed = true;
      }
      continue;
    }

    // Compare names as the server stores them: it cuts them to 16 clusters,
    // so a longer local name never matched its own server team.
    const candidates = [...freeByName(nameKey(local.name)), ...freeByName(nameKey(env.sentName(local.id)))];
    const match = candidates.find(t => sameMemberSet(local.slots, serverMemberIds(t))) ?? candidates[0];
    if (match) {
      local.serverId = String(match.id);
      linkedServerIds.add(local.serverId);
      result.linkedLocalIds.push(local.id);

      const matchMemberIds = serverMemberIds(match);
      const divergedWhilePending = match.name !== petTeamName(local.name) || !sameMemberSet(local.slots, matchMemberIds);
      if (divergedWhilePending) {
        // The user kept editing (added another pet, renamed) while this
        // team's first create was still in flight. The server team it just
        // linked to only reflects that earlier snapshot, so push the real
        // current content as an update instead of reverting local state.
        const petIds = local.slots.filter((x): x is string => !!x);
        if (petIds.length) result.pushUpdates.push({ serverId: local.serverId, name: local.name.trim() || "Team", petIds });
      } else {
        // First link on a name match: the server's members are the source of truth.
        local.name = match.name;
        local.slots = [0, 1, 2].map(i => matchMemberIds[i] ?? null);
      }
      result.changed = true;
      continue;
    }

    // Left behind by the old name matching: this team's create landed, but
    // the server team was imported as a separate local copy while this one
    // stayed unlinked, so every reload created it again. Take the link back
    // from the copy (this id is the one the keybind is stored under) and
    // drop the copy, instead of creating yet another server team.
    const twin = teams.find(t =>
      t !== local && !folded.has(t) && !!t.serverId && serverById.has(t.serverId)
      && nameKey(t.name) === nameKey(local.name)
      && sameMemberSet(t.slots, local.slots.filter((x): x is string => !!x)));
    if (twin) {
      local.serverId = twin.serverId;
      local.name = twin.name;
      local.slots = twin.slots.slice();
      folded.add(twin);
      result.changed = true;
      continue;
    }

    result.needsCreate.push(local);
  }

  result.dropped = teams.filter(t => !folded.has(t) && !!t.serverId && !serverById.has(t.serverId));
  const kept = teams.filter(t => !folded.has(t) && (!t.serverId || serverById.has(t.serverId)));
  if (kept.length !== teams.length) result.changed = true;

  const usedLocalIds = new Set(kept.map(t => t.id));
  for (const server of serverTeams) {
    if (linkedServerIds.has(String(server.id))) continue;
    const memberIds = serverMemberIds(server);
    // This serverId may already have had a local team (transient drop): reuse
    // its id so the `pets.team.<id>` keybind survives.
    const knownLocalId = env.knownLocalId(String(server.id));
    const importedId = knownLocalId && !usedLocalIds.has(knownLocalId) ? knownLocalId : env.newId();
    usedLocalIds.add(importedId);
    kept.push({
      id: importedId,
      name: server.name,
      slots: [0, 1, 2].map(i => memberIds[i] ?? null),
      serverId: String(server.id),
    });
    linkedServerIds.add(String(server.id));
    result.changed = true;
  }

  result.teams = kept;
  return result;
}
