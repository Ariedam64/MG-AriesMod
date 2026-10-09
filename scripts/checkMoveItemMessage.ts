// scripts/checkMoveItemMessage.ts
//
// Since v1422 the game has one message for every item move: MoveItem, with
// `from` and `to` each being "inventory" or a storage id. PutItemInStorage,
// RetrieveItemFromStorage, SwapItemWithStorage, MoveInventoryItem and
// MoveStorageItem are gone from the client, so every store and withdraw the mod
// made (auto-store, the deleters, the pet team switcher) was refused by the
// server without a word. This pins the shape the game itself sends.
//
// Run with: npm run check:moveitem

import { checkEqual, done } from "./_check";
import { buildMoveItemCommand } from "../src/game/ws/moveItemMessage";
import { buildQuinoaMessage, isQuinoaCommandType, seedCommandSequence } from "../src/game/ws/commands";

checkEqual(
  "storing a seed is a MoveItem from the inventory",
  buildMoveItemCommand({ from: "inventory", to: "SeedSilo", itemId: "OrangeTulip" }),
  { type: "MoveItem", from: "inventory", to: "SeedSilo", itemId: "OrangeTulip" },
);
checkEqual(
  "beforeItemId is passed through, as in the game's own drag and drop",
  buildMoveItemCommand({ from: "inventory", to: "SeedSilo", itemId: "OrangeTulip", beforeItemId: "PricklyPear" }),
  { type: "MoveItem", from: "inventory", to: "SeedSilo", itemId: "OrangeTulip", beforeItemId: "PricklyPear" },
);
checkEqual(
  "withdrawing part of a stack carries the quantity",
  buildMoveItemCommand({ from: "SeedSilo", to: "inventory", itemId: "Carrot", quantity: 25 }),
  { type: "MoveItem", from: "SeedSilo", to: "inventory", itemId: "Carrot", quantity: 25 },
);
checkEqual(
  "a fractional quantity is floored",
  buildMoveItemCommand({ from: "SeedSilo", to: "inventory", itemId: "Carrot", quantity: 2.7 })?.quantity,
  2,
);
checkEqual(
  "a nonsense quantity is left out, which moves the whole stack",
  buildMoveItemCommand({ from: "SeedSilo", to: "inventory", itemId: "Carrot", quantity: NaN }),
  { type: "MoveItem", from: "SeedSilo", to: "inventory", itemId: "Carrot" },
);
checkEqual(
  "a swap names the storage item it evicts",
  buildMoveItemCommand({ from: "inventory", to: "PetHutch", itemId: "pet-a", evictionItemId: "pet-b" }),
  { type: "MoveItem", from: "inventory", to: "PetHutch", itemId: "pet-a", evictionItemId: "pet-b" },
);
checkEqual(
  "an item placed before itself is dropped, the server refuses it",
  buildMoveItemCommand({ from: "inventory", to: "inventory", itemId: "Carrot", beforeItemId: "Carrot" }),
  { type: "MoveItem", from: "inventory", to: "inventory", itemId: "Carrot" },
);
checkEqual(
  "storage to storage is refused here, the server only moves through the inventory",
  buildMoveItemCommand({ from: "SeedSilo", to: "ToolShack", itemId: "Carrot" }),
  null,
);
checkEqual(
  "an empty item id is refused",
  buildMoveItemCommand({ from: "inventory", to: "SeedSilo", itemId: "" }),
  null,
);

checkEqual("MoveItem travels in the command envelope", isQuinoaCommandType("MoveItem"), true);
for (const gone of [
  "PutItemInStorage",
  "RetrieveItemFromStorage",
  "SwapItemWithStorage",
  "MoveInventoryItem",
  "MoveStorageItem",
]) {
  checkEqual(`${gone} is no longer treated as a live command`, isQuinoaCommandType(gone), false);
}

seedCommandSequence(9);
const wire = buildQuinoaMessage(
  buildMoveItemCommand({ from: "inventory", to: "SeedSilo", itemId: "OrangeTulip", beforeItemId: "PricklyPear" })!,
);
checkEqual(
  "on the wire it is the envelope around the command",
  { ...wire, requestId: "<id>" },
  {
    scopePath: ["Room", "Quinoa"],
    type: "QuinoaCommand",
    requestId: "<id>",
    commandSequence: 10,
    command: { type: "MoveItem", from: "inventory", to: "SeedSilo", itemId: "OrangeTulip", beforeItemId: "PricklyPear" },
  },
);

done();
