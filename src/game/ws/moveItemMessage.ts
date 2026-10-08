// Since v1422 every item move is one message, MoveItem. It replaced
// PutItemInStorage, RetrieveItemFromStorage, SwapItemWithStorage,
// MoveInventoryItem and MoveStorageItem, none of which the server accepts any
// more.
//
// Shape, from the client's schema and its own planner:
//   from, to        "inventory" or a storage id ("SeedSilo", "PetHutch"...).
//                   One side must be the inventory, unless both are the same
//                   place (a reorder). Storage to storage is refused.
//   itemId          the item's key: species for a seed, toolId for a tool,
//                   eggId, decorId, and the uuid for pets, produce and plants.
//   quantity        optional, an integer >= 1. Left out, the whole stack moves.
//   beforeItemId    optional, the key of the item to land in front of. Left
//                   out, the item goes to the end.
//   evictionItemId  optional, an item on the destination side sent back the
//                   other way, which is how a swap is done now.

export const INVENTORY = "inventory";

type MoveItemPlace = typeof INVENTORY | string;

export interface MoveItemParams {
  from: MoveItemPlace;
  to: MoveItemPlace;
  itemId: string;
  quantity?: number;
  beforeItemId?: string;
  evictionItemId?: string;
}

export interface MoveItemCommand {
  type: "MoveItem";
  from: string;
  to: string;
  itemId: string;
  quantity?: number;
  beforeItemId?: string;
  evictionItemId?: string;
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/**
 * Builds the command, or returns null for a move the server would refuse
 * anyway, so callers do not send something that is dropped without a word.
 */
export function buildMoveItemCommand(params: MoveItemParams): MoveItemCommand | null {
  const { from, to, itemId } = params;
  if (!nonEmpty(from) || !nonEmpty(to) || !nonEmpty(itemId)) return null;
  if (from !== to && from !== INVENTORY && to !== INVENTORY) return null;

  const command: MoveItemCommand = { type: "MoveItem", from, to, itemId };

  const quantity = Math.floor(Number(params.quantity));
  if (params.quantity !== undefined && Number.isFinite(quantity) && quantity >= 1) {
    command.quantity = quantity;
  }
  if (nonEmpty(params.beforeItemId) && params.beforeItemId !== itemId) {
    command.beforeItemId = params.beforeItemId;
  }
  if (nonEmpty(params.evictionItemId) && params.evictionItemId !== itemId) {
    command.evictionItemId = params.evictionItemId;
  }
  return command;
}
