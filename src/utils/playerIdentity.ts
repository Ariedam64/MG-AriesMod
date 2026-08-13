// utils/playerIdentity.ts
// Résolution de l'identité joueur à partir du state du jeu.
//
// Le jeu a renommé `databaseUserId` en `discordUserId`. Les deux noms ont
// coexisté un moment, donc on accepte l'un ou l'autre : un déploiement plus
// ancien continue de marcher, et un futur renommage se verra comme une identité
// nulle plutôt que comme des données attribuées au mauvais joueur.
//
// Tout est pur ici (aucun accès atom/DOM/réseau) pour rester testable depuis
// node par scripts/checkPlayerIdentity.ts.

/** Champs portant l'identité de compte stable (l'id Discord). */
export const ACCOUNT_ID_KEYS = ["discordUserId", "databaseUserId"] as const;

/**
 * Champs acceptés en plus sur un userSlot. `id` en est volontairement absent :
 * `player.id` est un id de room éphémère (`p_9rhRx2WevEjaSHXP`), pas un id de
 * compte (`128202956574162945`). Confondre les deux espaces de noms fait
 * remonter des identités qui changent à chaque join.
 */
export const SLOT_ID_KEYS = [...ACCOUNT_ID_KEYS, "userId", "playerId"] as const;

const ROOM_ID_KEYS = ["id"] as const;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

/** Premier champ non vide parmi `keys`, normalisé en string. */
function readFirstKey(source: unknown, keys: readonly string[]): string | null {
  const record = asRecord(source);
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** Identité lue sur l'objet, puis sur son `.data` imbriqué. */
function readNested(source: unknown, keys: readonly string[]): string | null {
  const direct = readFirstKey(source, keys);
  if (direct) return direct;
  return readFirstKey(asRecord(source)?.data, keys);
}

/** Id de compte stable d'un joueur. Ne retombe jamais sur l'id de room. */
export function readAccountId(source: unknown): string | null {
  return readNested(source, ACCOUNT_ID_KEYS);
}

/** Identité d'un userSlot, qui peut être clé par compte ou par playerId. */
export function readSlotId(slot: unknown): string | null {
  return readNested(slot, SLOT_ID_KEYS);
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
    const slotId = readSlotId(slots[index]);
    if (slotId != null && wanted.includes(slotId)) return index;
  }
  return null;
}
