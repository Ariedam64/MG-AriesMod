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

import { buildMoveItemCommand } from "../src/utils/moveItemMessage";
import { buildQuinoaMessage, isQuinoaCommandType, seedCommandSequence } from "../src/core/quinoaCommands";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
}

check(
  "storing a seed is a MoveItem from the inventory",
  buildMoveItemCommand({ from: "inventory", to: "SeedSilo", itemId: "OrangeTulip" }),
  { type: "MoveItem", from: "inventory", to: "SeedSilo", itemId: "OrangeTulip" },
);
check(
  "beforeItemId is passed through, as in the game's own drag and drop",
  buildMoveItemCommand({ from: "inventory", to: "SeedSilo", itemId: "OrangeTulip", beforeItemId: "PricklyPear" }),
  { type: "MoveItem", from: "inventory", to: "SeedSilo", itemId: "OrangeTulip", beforeItemId: "PricklyPear" },
);
check(
  "withdrawing part of a stack carries the quantity",
  buildMoveItemCommand({ from: "SeedSilo", to: "inventory", itemId: "Carrot", quantity: 25 }),
  { type: "MoveItem", from: "SeedSilo", to: "inventory", itemId: "Carrot", quantity: 25 },
);
check(
  "a fractional quantity is floored",
  buildMoveItemCommand({ from: "SeedSilo", to: "inventory", itemId: "Carrot", quantity: 2.7 })?.quantity,
  2,
);
check(
  "a nonsense quantity is left out, which moves the whole stack",
  buildMoveItemCommand({ from: "SeedSilo", to: "inventory", itemId: "Carrot", quantity: NaN }),
  { type: "MoveItem", from: "SeedSilo", to: "inventory", itemId: "Carrot" },
);
check(
  "a swap names the storage item it evicts",
  buildMoveItemCommand({ from: "inventory", to: "PetHutch", itemId: "pet-a", evictionItemId: "pet-b" }),
  { type: "MoveItem", from: "inventory", to: "PetHutch", itemId: "pet-a", evictionItemId: "pet-b" },
);
check(
  "an item placed before itself is dropped, the server refuses it",
  buildMoveItemCommand({ from: "inventory", to: "inventory", itemId: "Carrot", beforeItemId: "Carrot" }),
  { type: "MoveItem", from: "inventory", to: "inventory", itemId: "Carrot" },
);
check(
  "storage to storage is refused here, the server only moves through the inventory",
  buildMoveItemCommand({ from: "SeedSilo", to: "ToolShack", itemId: "Carrot" }),
  null,
);
check(
  "an empty item id is refused",
  buildMoveItemCommand({ from: "inventory", to: "SeedSilo", itemId: "" }),
  null,
);

check("MoveItem travels in the command envelope", isQuinoaCommandType("MoveItem"), true);
for (const gone of [
  "PutItemInStorage",
  "RetrieveItemFromStorage",
  "SwapItemWithStorage",
  "MoveInventoryItem",
  "MoveStorageItem",
]) {
  check(`${gone} is no longer treated as a live command`, isQuinoaCommandType(gone), false);
}

seedCommandSequence(9);
const wire = buildQuinoaMessage(
  buildMoveItemCommand({ from: "inventory", to: "SeedSilo", itemId: "OrangeTulip", beforeItemId: "PricklyPear" })!,
);
check(
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

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall move item message checks passed");
