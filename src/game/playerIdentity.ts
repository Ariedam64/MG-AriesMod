// Works out who a player is from the game's state.
//
// The game renamed its identity fields twice. First `databaseUserId` became
// `discordUserId`. Then the account id took the room id's place in
// `player.id`, and the userSlots moved to `userId`. So several names are read,
// newest first: a late deployment keeps working, and the next rename shows up
// as a null identity rather than as data credited to the wrong player.
//
// Two traps explain the rest of the file:
// - The old room id (`p_9rhRx2WevEjaSHXP`) also lived in `id`, and it changes
//   on every join. It is recognised by its prefix and never taken for an
//   account id.
// - On a `userStyle`, `id` is a numeric row id (`1760720`) and `userId` carries
//   the account. Hence the reading order below.
//
// Everything here is pure (no atom, DOM or network access) so that
// scripts/checkPlayerIdentity.ts can test it from node.

/**
 * Fields carrying the account identity, most reliable first.
 * `userId` before `id`: when both exist, `id` is a table-local id (chat
 * cosmetics), not the account.
 */
const ACCOUNT_ID_KEYS = ["userId", "id", "discordUserId", "databaseUserId"] as const;

/** One more field accepted on a userSlot, left over from the old schema. */
const SLOT_ID_KEYS = [...ACCOUNT_ID_KEYS, "playerId"] as const;

const ROOM_ID_KEYS = ["id"] as const;

/** Prefix of the short-lived room ids, never an account identity. */
const ROOM_ID_PREFIX = "p_";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function looksLikeRoomId(value: string): boolean {
  return value.startsWith(ROOM_ID_PREFIX);
}

/**
 * The first non-empty field among `keys`, as a string.
 * `skipRoomIds` passes over `p_...` values and goes on down the list, so a
 * state in the old schema falls back to `discordUserId` instead of returning an
 * id that only lasts as long as the session.
 */
function readFirstKey(
  source: unknown,
  keys: readonly string[],
  skipRoomIds = false,
): string | null {
  const record = asRecord(source);
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      if (skipRoomIds && looksLikeRoomId(value)) continue;
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** The identity read on the object, then on its nested `.data`. */
function readNested(
  source: unknown,
  keys: readonly string[],
  skipRoomIds = false,
): string | null {
  const direct = readFirstKey(source, keys, skipRoomIds);
  if (direct) return direct;
  return readFirstKey(asRecord(source)?.data, keys, skipRoomIds);
}

/** A player's stable account id. Never falls back to the room id. */
export function readAccountId(source: unknown): string | null {
  return readNested(source, ACCOUNT_ID_KEYS, true);
}

/** A userSlot's identity: `userId` today, `discordUserId` before. */
export function readSlotId(slot: unknown): string | null {
  return readNested(slot, SLOT_ID_KEYS, true);
}

/** Whether a slot holds a player, as opposed to being empty. */
export function isOccupiedSlot(slot: unknown): boolean {
  const record = asRecord(slot);
  if (!record) return false;
  return readSlotId(record) !== null || asRecord(record.data) !== null;
}

/**
 * Our account id. The player atom is read first; if it only exposes its room
 * id, our entry in the player list is found and the identity read there. That
 * second path keeps things working if the player atom changes shape while the
 * player list does not.
 */
export function resolveMyAccountId(
  player: unknown,
  players: readonly unknown[] = [],
): string | null {
  const direct = readAccountId(player);
  if (direct) return direct;

  const myRoomId = readFirstKey(player, ROOM_ID_KEYS);
  if (!myRoomId) return null;

  for (const entry of players) {
    if (readFirstKey(entry, ROOM_ID_KEYS) === myRoomId) return readAccountId(entry);
  }
  return null;
}

export type SlotSelection = {
  slotIndex?: number;
  accountId?: string | null;
};

/**
 * The slot belonging to an account, or null.
 *
 * Without an identity this returns null and the caller sends nothing. The old
 * code fell back to the first occupied slot: when the identity went null,
 * everyone in a room started reporting slot 0's garden under their own
 * account. A missing heartbeat is better than that.
 */
export function selectSlotForAccount(
  slots: readonly unknown[],
  selection: SlotSelection = {},
): unknown | null {
  if (!Array.isArray(slots) || slots.length === 0) return null;

  const { slotIndex, accountId } = selection;

  // An explicit index: the caller wants that slot (garden preview and the like).
  if (typeof slotIndex === "number" && Number.isInteger(slotIndex)) {
    const candidate = asRecord(slots[slotIndex]);
    if (candidate) return candidate;
  }

  const normalized = accountId != null && accountId !== "" ? String(accountId) : null;
  if (!normalized) return null;

  for (const slot of slots) {
    if (readSlotId(slot) === normalized) return slot;
  }
  return null;
}

/** The player belonging to an account, or null. Never `players[0]`. */
export function findPlayerByAccountId(
  players: readonly unknown[],
  accountId: string | null,
): unknown | null {
  if (!accountId) return null;
  for (const player of players) {
    if (readAccountId(player) === accountId) return player;
  }
  return null;
}

/**
 * A slot's identity, room id included. Only for findSlotIndex: it is the one
 * caller that passes a room id explicitly and so knows which id space it
 * compares in. Everywhere else, readSlotId and its filter.
 */
function readSlotIdOrRoomId(slot: unknown): string | null {
  return readNested(slot, SLOT_ID_KEYS);
}

/**
 * The index of a player's slot, by account id or room id. Both are passed
 * separately because a userSlot can be keyed by either, depending on which
 * field the server fills.
 */
export function findSlotIndex(
  slots: readonly unknown[],
  identifiers: { accountId?: string | null; roomId?: string | null },
): number | null {
  if (!Array.isArray(slots) || slots.length === 0) return null;

  const wanted = [identifiers.accountId, identifiers.roomId].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (wanted.length === 0) return null;

  for (let index = 0; index < slots.length; index++) {
    const slotId = readSlotIdOrRoomId(slots[index]);
    if (slotId != null && wanted.includes(slotId)) return index;
  }
  return null;
}
