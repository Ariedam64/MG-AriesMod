// utils/playerIdentity.ts
// Résolution de l'identité joueur à partir du state du jeu.
//
// Le jeu a renommé ses champs d'identité deux fois. D'abord `databaseUserId` en
// `discordUserId`. Puis l'id de compte a pris la place de l'id de room dans
// `player.id`, et les userSlots sont passés à `userId`. On lit donc plusieurs
// noms, du plus récent au plus ancien : un déploiement en retard continue de
// marcher, et un prochain renommage se verra comme une identité nulle plutôt que
// comme des données attribuées au mauvais joueur.
//
// Deux pièges qui justifient le reste du fichier :
// - L'ancien id de room (`p_9rhRx2WevEjaSHXP`) vivait aussi dans `id`, et il
//   change à chaque join. On le reconnaît à son préfixe et on ne le prend jamais
//   pour un id de compte.
// - Sur un `userStyle`, `id` est un id de ligne numérique (`1760720`) et c'est
//   `userId` qui porte le compte. D'où l'ordre de lecture ci-dessous.
//
// Tout est pur ici (aucun accès atom/DOM/réseau) pour rester testable depuis
// node par scripts/checkPlayerIdentity.ts.

/**
 * Champs portant l'identité de compte, du plus fiable au plus ancien.
 * `userId` avant `id` : quand les deux coexistent, `id` est un id local à la
 * table (cosmétiques de chat), pas le compte.
 */
export const ACCOUNT_ID_KEYS = ["userId", "id", "discordUserId", "databaseUserId"] as const;

/** Champ accepté en plus sur un userSlot, hérité de l'ancien schéma. */
export const SLOT_ID_KEYS = [...ACCOUNT_ID_KEYS, "playerId"] as const;

const ROOM_ID_KEYS = ["id"] as const;

/** Préfixe des ids de room éphémères, jamais une identité de compte. */
const ROOM_ID_PREFIX = "p_";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function looksLikeRoomId(value: string): boolean {
  return value.startsWith(ROOM_ID_PREFIX);
}

/**
 * Premier champ non vide parmi `keys`, normalisé en string.
 * `skipRoomIds` ignore les valeurs en `p_…` et continue la liste, pour qu'un
 * state à l'ancien schéma retombe sur `discordUserId` au lieu de renvoyer un id
 * qui ne vaut que le temps de la partie.
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

/** Identité lue sur l'objet, puis sur son `.data` imbriqué. */
function readNested(
  source: unknown,
  keys: readonly string[],
  skipRoomIds = false,
): string | null {
  const direct = readFirstKey(source, keys, skipRoomIds);
  if (direct) return direct;
  return readFirstKey(asRecord(source)?.data, keys, skipRoomIds);
}

/** Id de compte stable d'un joueur. Ne retombe jamais sur l'id de room. */
export function readAccountId(source: unknown): string | null {
  return readNested(source, ACCOUNT_ID_KEYS, true);
}

/** Identité d'un userSlot, aujourd'hui `userId`, hier `discordUserId`. */
export function readSlotId(slot: unknown): string | null {
  return readNested(slot, SLOT_ID_KEYS, true);
}

/** Un slot porte-t-il un occupant, par opposition à un emplacement vide ? */
export function isOccupiedSlot(slot: unknown): boolean {
  const record = asRecord(slot);
  if (!record) return false;
  return readSlotId(record) !== null || asRecord(record.data) !== null;
}

/**
 * Notre id de compte. On lit d'abord le player atom ; s'il n'expose que son id
 * de room, on retrouve notre entrée dans la liste des joueurs pour y lire
 * l'identité. Ce second chemin évite de tout casser si le player atom change de
 * forme sans que la liste des joueurs bouge.
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
 * Le slot correspondant à un compte, ou null.
 *
 * Sans identité on renvoie null et l'appelant n'envoie rien. L'ancien code
 * retombait sur le premier slot occupé : quand l'identité est devenue nulle,
 * tout le monde dans une room s'est mis à remonter le jardin du slot 0 sous son
 * propre compte. Un heartbeat manquant vaut mieux que ça.
 */
export function selectSlotForAccount(
  slots: readonly unknown[],
  selection: SlotSelection = {},
): unknown | null {
  if (!Array.isArray(slots) || slots.length === 0) return null;

  const { slotIndex, accountId } = selection;

  // Index explicite : l'appelant vise un slot précis (aperçu de jardin, etc.).
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

/** Le joueur correspondant à un compte, ou null. Jamais `players[0]`. */
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
 * Identité d'un slot, id de room compris. Réservé à findSlotIndex : c'est le
 * seul appelant qui fournit explicitement un id de room et sait donc dans quel
 * espace de noms il compare. Partout ailleurs, readSlotId et son filtre.
 */
function readSlotIdOrRoomId(slot: unknown): string | null {
  return readNested(slot, SLOT_ID_KEYS);
}

/**
 * Index du slot d'un joueur, en acceptant soit l'id de compte soit l'id de
 * room. Les deux sont fournis séparément parce qu'un userSlot peut être clé par
 * l'un ou par l'autre selon le champ que le serveur remplit.
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
