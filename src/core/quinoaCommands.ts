// src/core/quinoaCommands.ts
//
// Client-to-server protocol for the Quinoa scope.
//
// The game devs are migrating every gameplay action from the flat
// `{ scopePath, type, ...params }` form to a command envelope:
//
//   { scopePath, type: "QuinoaCommand", requestId, commandSequence, command }
//
// The envelope feeds the server's prediction/rollback system. The flat form is
// still honoured today but is going away, at which point anything the mod sends
// flat would silently stop working.
//
// Everything here mirrors the live client (magicgarden.gg bundle 1029) message
// for message: the types it wraps, we wrap; the types it still sends flat, we
// send flat. That is what keeps us correct in both directions — when the devs
// move one of the flat ones into the envelope, it moves here too.

export const QUINOA_SCOPE: readonly string[] = ["Room", "Quinoa"];
export const COMMAND_ENVELOPE_TYPE = "QuinoaCommand";

/**
 * Quinoa messages the live client wraps in the command envelope.
 *
 * An allowlist rather than "everything except the flat ones" on purpose: a type
 * the client never sends (an old mod-only message, a typo) must keep going out
 * flat instead of being wrapped into an envelope the server would reject as a
 * malformed command.
 */
const COMMAND_TYPES: ReadonlySet<string> = new Set([
  // Garden / crops
  "PlantSeed",
  "PlantGardenPlant",
  "WaterPlant",
  "HarvestCrop",
  "PotPlant",
  "Preserve",
  "DisplayCrop",
  "PickupDisplayedCrop",
  "RemoveGardenObject",
  "MutationPotion",
  "CropCleanser",
  "SellAllCrops",
  // Decor
  "PlaceDecor",
  "PickupDecor",
  // Eggs / pets
  "GrowEgg",
  "HatchEgg",
  "PlacePet",
  "PickupPet",
  "FeedPet",
  "SellPet",
  "NamePet",
  "SwapPet",
  "SwapPetFromStorage",
  "MovePetSlot",
  "RidePet",
  "DismountPet",
  "DawnCapture",
  "Thundercharge",
  "ReplenishPotion",
  "XPPotion",
  "EquipPetCosmetic",
  // Pet teams
  "SavePetTeam",
  "ApplyPetTeam",
  "DeletePetTeam",
  "MovePetTeam",
  "SetPetTeamEmblem",
  // Inventory / storage
  "MoveInventoryItem",
  "ToggleLockItem",
  "PutItemInStorage",
  "RetrieveItemFromStorage",
  "MoveStorageItem",
  "SwapItemWithStorage",
  "LogItems",
  // Shop / misc
  "PurchaseShopItem",
  "Wish",
]);

/**
 * Quinoa messages the live client still writes flat.
 *
 * `Ping` and `PlayerPosition` never were commands — the first answers `Pong`,
 * the second feeds the `QuinoaMovementSnapshot`/`Batch` channel — so wrapping
 * one would break it in the other direction. The rest simply have not been
 * migrated yet. Listed for documentation; the allowlist above is what decides.
 */
export const FLAT_TYPES: ReadonlySet<string> = new Set([
  "Ping",
  "PlayerPosition",
  "Teleport",
  "SetSelectedItem",
  "PickupObject",
  "DropObject",
  "ThrowSnowball",
  "CheckWeatherStatus",
  "CheckFriendBonus",
  "RequestPetGreet",
  "QuinoaTutorialSkipped",
  "UpgradePetHutch",
  "UpgradeSeedSilo",
  "UpgradeDecorShed",
]);

export function isQuinoaCommandType(type: unknown): boolean {
  return typeof type === "string" && COMMAND_TYPES.has(type);
}

export function isQuinoaScope(scopePath: unknown): boolean {
  return (
    Array.isArray(scopePath) &&
    scopePath.length === QUINOA_SCOPE.length &&
    scopePath.every((part, index) => part === QUINOA_SCOPE[index])
  );
}

/* ============================ Sequence numbering =========================== */
//
// The server numbers commands per connection: `Welcome.executedCommandSequence`
// is the last one it ran, and the next command must be that plus one. The game
// keeps its own counter (module-local, not reachable from the page) and we
// share its socket, so both of us number into the same stream.
//
// Rules that keep the stream contiguous:
//   - We seed from every Welcome, exactly like the game does.
//   - While the mod has sent nothing, the game owns the numbering: we only
//     watch its commands go by and follow along. Vanilla behaviour, byte for
//     byte.
//   - The moment the mod injects a command, its own counter runs ahead of the
//     game's. From then on we renumber the game's outgoing commands too, so the
//     socket keeps seeing one gapless, strictly increasing sequence.

const FIRST_COMMAND_SEQUENCE = 1;

/** Bounded: a request id is normally consumed by the very next `send`, but the
 * worker fallback path may never reach our send hook. */
const MAX_TRACKED_REQUEST_IDS = 64;

let nextCommandSequence = FIRST_COMMAND_SEQUENCE;
let modCommandsSent = 0;
const ownRequestIds = new Set<string>();

/** Called for every incoming `Welcome`. Re-seeds, which is what makes
 * reconnects work without any special handling. */
export function seedCommandSequence(executedCommandSequence: unknown): void {
  const executed = Number(executedCommandSequence);
  if (!Number.isFinite(executed) || executed < 0) return;
  nextCommandSequence = executed + 1;
  modCommandsSent = 0;
  ownRequestIds.clear();
}

/** Back to the pre-Welcome state, for a fresh connection. */
export function resetCommandSequence(): void {
  nextCommandSequence = FIRST_COMMAND_SEQUENCE;
  modCommandsSent = 0;
  ownRequestIds.clear();
}

/** True once the mod has injected a command, i.e. once our counter has run
 * ahead of the game's and the game's own numbers need rewriting. */
export function hasInjectedCommands(): boolean {
  return modCommandsSent > 0;
}

/** Consumes the number for a command the mod is sending right now. */
export function takeCommandSequenceForMod(): number {
  modCommandsSent += 1;
  return nextCommandSequence++;
}

/** Consumes the number for a game command we are renumbering. */
export function takeCommandSequenceForGame(): number {
  return nextCommandSequence++;
}

/** Follows the game's numbering while it is still the only sender. */
export function observeGameCommandSequence(commandSequence: unknown): void {
  const value = Number(commandSequence);
  if (!Number.isFinite(value)) return;
  if (value >= nextCommandSequence) nextCommandSequence = value + 1;
}

function rememberOwnRequestId(requestId: string): void {
  if (ownRequestIds.size >= MAX_TRACKED_REQUEST_IDS) {
    const oldest = ownRequestIds.values().next();
    if (!oldest.done) ownRequestIds.delete(oldest.value);
  }
  ownRequestIds.add(requestId);
}

/** True when this envelope is one we built (and already numbered). */
export function consumeOwnRequestId(requestId: unknown): boolean {
  if (typeof requestId !== "string") return false;
  return ownRequestIds.delete(requestId);
}

function randomRequestId(): string {
  try {
    const uuid = (globalThis.crypto as Crypto | undefined)?.randomUUID?.();
    if (uuid) return uuid;
  } catch {}
  // Older WebViews (Discord activity on some devices) have no randomUUID.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

/* ============================== Message building =========================== */

export type QuinoaMessage = Record<string, unknown> & { type: string };

/**
 * Turns a mod payload into the message that actually goes on the wire: the
 * command envelope for gameplay actions, the flat form for everything else.
 *
 * `payload.scopePath` is honoured when present (the feeding-trough helpers pass
 * it explicitly); anything outside the Quinoa scope is never wrapped.
 */
export function buildQuinoaMessage(payload: Record<string, any>): QuinoaMessage {
  const { scopePath: rawScopePath, ...command } = payload;
  const scopePath = rawScopePath ?? QUINOA_SCOPE;

  if (!isQuinoaScope(scopePath) || !isQuinoaCommandType(command.type)) {
    return { scopePath, ...command } as QuinoaMessage;
  }

  const requestId = randomRequestId();
  rememberOwnRequestId(requestId);

  return {
    scopePath,
    type: COMMAND_ENVELOPE_TYPE,
    requestId,
    commandSequence: takeCommandSequenceForMod(),
    command,
  } as QuinoaMessage;
}
