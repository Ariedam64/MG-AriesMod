// Mirrors the mod's pet teams onto the game's own pet-team system, both ways.
//
// The game has built-in pet teams (the SavePetTeam, ApplyPetTeam,
// DeletePetTeam and MovePetTeam room actions). Each local team keeps the id
// of the server team it matches in `serverId`, while its own `id` stays the
// key its shortcut is stored under. A change made in the mod is sent to the
// server; a change made in the game, or by another client, comes back through
// `stateUserSlots` and is copied onto the matching local team. When two teams
// first link by name, the server's members win (see `reconcilePetTeams`).

import { readAccountId, findSlotIndex } from "../../game/playerIdentity";
import { player as playerAtom, playerId, stateUserSlots } from "../../game/store/atoms";
import { sendToGame } from "../../game/ws/send";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { petTeamName, reconcilePetTeams, serverMemberIds, type PetTeam, type ServerPetTeam } from "./teamReconcile";
import { commitTeams, knownLocalId, newTeamId, rememberLocalId, teamsRef } from "./teamStore";

const SYNC_ENABLED_PATH = "pets.teamSync";
/**
 * How long a create waits for the server to echo it back. The native API
 * gives no acknowledgement, only that echo; if it never comes (the command
 * failed silently, the connection hiccuped) the team may try again.
 */
const PENDING_CREATE_TIMEOUT_MS = 8000;

/**
 * The player's opt-out, on by default. Off, the teams are purely local:
 * nothing is sent and nothing is read back. Existing links are kept frozen,
 * so turning the sync back on resumes where it left off, with the server
 * winning on any divergence as always.
 */
let syncEnabled = readAriesPath<boolean>(SYNC_ENABLED_PATH, true) !== false;

let serverTeams: ServerPetTeam[] = [];
let lastServerSignature = "";
let watcherStarted = false;
let reconciling = false;
let reconcileQueued = false;

/** Local teams with a create in flight, and its timeout. */
const pendingCreates = new Map<string, ReturnType<typeof setTimeout>>();
/**
 * The name a pending create was sent with. Linking matches local and server
 * teams by name, so a team renamed again before the server echoes the create
 * is also looked up under the name the server actually got, instead of being
 * imported as a duplicate.
 */
const pendingCreateNames = new Map<string, string>();
/**
 * Per local team, the name and members we already asked the server to create.
 * The native API returns no id, and retrying on every reconcile while the link
 * has not happened yet would create duplicate teams forever: a create is never
 * retried unless the team's content changed since.
 */
const lastCreateAttempt = new Map<string, string>();

export function isTeamSyncEnabled(): boolean {
  return syncEnabled;
}

/* ------------------------------ native commands ----------------------------- */

function send(message: Record<string, unknown>): void {
  if (!syncEnabled) return;
  try { sendToGame(message); } catch {}
}

/**
 * Saves a server team. The game never sends a null teamId: on a create it
 * makes the id itself and flags the message with `isCreate`.
 */
export function sendSavePetTeam(serverId: string | null, name: string, petIds: string[]): void {
  send({ type: "SavePetTeam", teamId: serverId ?? newTeamId(), isCreate: serverId === null, name: petTeamName(name), petIds });
}

export function sendDeletePetTeam(serverId: string): void {
  send({ type: "DeletePetTeam", teamId: serverId });
}

export function sendApplyPetTeam(serverId: string): void {
  send({ type: "ApplyPetTeam", teamId: serverId });
}

export function sendMovePetTeam(serverId: string, toIndex: number): void {
  send({ type: "MovePetTeam", movePetTeamId: serverId, toPetTeamIndex: toIndex });
}

/* ---------------------------------- creates --------------------------------- */

function clearPendingCreate(localId: string): void {
  const timer = pendingCreates.get(localId);
  if (timer) clearTimeout(timer);
  pendingCreates.delete(localId);
  pendingCreateNames.delete(localId);
}

const createSignature = (team: PetTeam): string =>
  `${team.name.trim().toLowerCase()}::${team.slots.filter((x): x is string => !!x).sort().join(",")}`;

/**
 * Creates the server team for a local team that has none yet. Waits for at
 * least one pet (the native API wants 1 to 3), and fires once per distinct
 * name and members.
 */
export function maybeCreateServerTeam(team: PetTeam): void {
  // Before touching the memos: with the sync off nothing is sent, and
  // recording an attempt would make the team look already tried later.
  if (!syncEnabled) return;

  // A create for this team is already in flight. Firing another before the
  // server echoes a real id would make a second team rather than update the
  // first: that is what produced the orphan 1, 2 and 3 pet duplicates.
  if (pendingCreates.has(team.id)) return;

  const petIds = team.slots.filter((x): x is string => !!x);
  const name = (team.name || "").trim();
  if (!name || !petIds.length) return;

  const signature = createSignature(team);
  if (lastCreateAttempt.get(team.id) === signature) return;

  lastCreateAttempt.set(team.id, signature);
  pendingCreateNames.set(team.id, name);
  pendingCreates.set(team.id, setTimeout(() => clearPendingCreate(team.id), PENDING_CREATE_TIMEOUT_MS));
  console.warn(`[Pets] Creating native pet team "${name}" (${petIds.length} pet(s)), once, never retried on its own.`);
  sendSavePetTeam(null, name, petIds);
}

/* -------------------------------- reconcile -------------------------------- */

function reconcile(): void {
  if (!syncEnabled) return;
  if (reconciling) {
    reconcileQueued = true;
    return;
  }
  reconciling = true;
  try {
    const result = reconcilePetTeams(teamsRef(), serverTeams, {
      sentName: (localId) => pendingCreateNames.get(localId),
      knownLocalId,
      newId: newTeamId,
    });
    for (const localId of result.linkedLocalIds) clearPendingCreate(localId);
    for (const update of result.pushUpdates) sendSavePetTeam(update.serverId, update.name, update.petIds);
    for (const team of result.needsCreate) maybeCreateServerTeam(team);
    for (const team of result.dropped) rememberLocalId(String(team.serverId), team.id);
    if (result.changed) commitTeams(result.teams);
  } finally {
    reconciling = false;
    if (reconcileQueued) {
      reconcileQueued = false;
      reconcile();
    }
  }
}

/** My index in `stateUserSlots`, matched by account id or room player id. */
export async function myUserSlotIndex(): Promise<number | null> {
  try {
    const slots = await stateUserSlots.get();
    const list: any[] = Array.isArray(slots) ? slots : [];
    if (!list.length) return null;
    let roomId: string | null = null;
    let accountId: string | null = null;
    try { roomId = (await playerId.get()) ?? null; } catch {}
    try { accountId = readAccountId(await playerAtom.get()); } catch {}
    if (!roomId && !accountId) return null;
    return findSlotIndex(list, { accountId, roomId });
  } catch {
    return null;
  }
}

/**
 * The server teams on my slot, or null when the slot cannot be read right now
 * (player id not resolved, slots not streamed in, a reconnect, no `petTeams`).
 * The difference matters: `[]` means the server really has no team and drops
 * every linked local team, while null leaves them alone. Treating both alike
 * used to wipe the local teams on a transient payload, import them again
 * under new ids, and orphan every team shortcut.
 */
async function readServerTeams(slots: unknown): Promise<ServerPetTeam[] | null> {
  try {
    const index = await myUserSlotIndex();
    if (index == null) return null;
    const mySlot = (Array.isArray(slots) ? slots : [])[index];
    if (!mySlot || typeof mySlot !== "object") return null;
    const teams = mySlot?.data?.petTeams;
    return Array.isArray(teams) ? teams : null;
  } catch {
    return null;
  }
}

function serverSignature(list: ServerPetTeam[]): string {
  try {
    return list.map((t) => `${t.id}:${t.name}:${serverMemberIds(t).slice().sort().join(",")}`).sort().join("|");
  } catch {
    return "";
  }
}

/** Keeps local teams linked to their server teams. Idempotent. */
export async function startPetTeamSync(): Promise<void> {
  if (watcherStarted) return;
  watcherStarted = true;

  const apply = async (slots: unknown) => {
    const next = await readServerTeams(slots);
    if (next === null) return;
    const signature = serverSignature(next);
    if (signature === lastServerSignature) return;
    lastServerSignature = signature;
    serverTeams = next;
    reconcile();
  };

  try { await apply(await stateUserSlots.get()); } catch {}
  try { await stateUserSlots.onChange((slots: unknown) => { void apply(slots); }); } catch {}
}

export function setTeamSyncEnabled(value: boolean): void {
  const next = !!value;
  if (next === syncEnabled) return;
  syncEnabled = next;
  writeAriesPath(SYNC_ENABLED_PATH, next);

  if (!next) {
    // Nothing will ever acknowledge these now.
    for (const localId of Array.from(pendingCreates.keys())) clearPendingCreate(localId);
    return;
  }

  // Teams edited while the sync was off never got a create attempt: forget
  // the memo so they are not taken for already tried.
  lastCreateAttempt.clear();
  reconcile();
}
