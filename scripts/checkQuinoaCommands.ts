// scripts/checkQuinoaCommands.ts
//
// Verifies the client-to-server protocol for the Quinoa scope: which messages
// go inside the `QuinoaCommand` envelope, and how the `commandSequence` stream
// stays gapless on a socket both the game and the mod write to.
//
// The bug this guards against: the mod and the game number commands into the
// same socket, but the game's counter is module-local to its bundle and cannot
// know about the commands we inject. Every mod command shifts the game's next
// number by one, and a sequence the server does not expect takes the command
// with it — silently.
//
// Run with: npm run check:commands

import {
  buildQuinoaMessage,
  consumeOwnRequestId,
  hasInjectedCommands,
  observeGameCommandSequence,
  resetCommandSequence,
  seedCommandSequence,
  takeCommandSequenceForGame,
} from "../src/core/quinoaCommands";

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

/** Mirrors installQuinoaCommandSendInterceptor in src/hooks/ws-hook.ts. */
function sendFromGame(envelope: any): any {
  if (consumeOwnRequestId(envelope.requestId)) return envelope;
  if (!hasInjectedCommands()) {
    observeGameCommandSequence(envelope.commandSequence);
    return envelope;
  }
  return { ...envelope, commandSequence: takeCommandSequenceForGame() };
}

const gameEnvelope = (commandSequence: number, type: string) => ({
  scopePath: ["Room", "Quinoa"],
  type: "QuinoaCommand",
  requestId: `game-${commandSequence}`,
  commandSequence,
  command: { type },
});

/* ------------------------- envelope vs legacy flat ------------------------ */

resetCommandSequence();
seedCommandSequence(40);

const harvest = buildQuinoaMessage({ type: "HarvestCrop", slot: 3, slotsIndex: 2 });
check("HarvestCrop travels in the envelope", { ...harvest, requestId: "<id>" }, {
  scopePath: ["Room", "Quinoa"],
  type: "QuinoaCommand",
  requestId: "<id>",
  commandSequence: 41,
  command: { type: "HarvestCrop", slot: 3, slotsIndex: 2 },
});
check("requestId is a uuid", /^[0-9a-f-]{20,}$/.test(String(harvest.requestId)), true);

check(
  "PlayerPosition stays flat (movement channel, never a command)",
  buildQuinoaMessage({ type: "PlayerPosition", position: { x: 1, y: 2 } }),
  { scopePath: ["Room", "Quinoa"], type: "PlayerPosition", position: { x: 1, y: 2 } }
);

check(
  "Teleport stays flat (the client has not migrated it)",
  buildQuinoaMessage({ type: "Teleport", position: { x: 1, y: 2 } }),
  { scopePath: ["Room", "Quinoa"], type: "Teleport", position: { x: 1, y: 2 } }
);

check(
  "a type the client never sends is not wrapped",
  buildQuinoaMessage({ type: "PetPositions", petPositions: {} }),
  { scopePath: ["Room", "Quinoa"], type: "PetPositions", petPositions: {} }
);

check(
  "an explicit Quinoa scopePath is honoured, not duplicated into the command",
  {
    ...buildQuinoaMessage({
      scopePath: ["Room", "Quinoa"],
      type: "PutItemInStorage",
      itemId: "a",
      storageId: "FeedingTrough",
      toStorageIndex: 0,
    }),
    requestId: "<id>",
  },
  {
    scopePath: ["Room", "Quinoa"],
    type: "QuinoaCommand",
    requestId: "<id>",
    commandSequence: 42,
    command: {
      type: "PutItemInStorage",
      itemId: "a",
      storageId: "FeedingTrough",
      toStorageIndex: 0,
    },
  }
);

check(
  "Room-scoped messages are never wrapped",
  buildQuinoaMessage({ scopePath: ["Room"], type: "SellAllCrops" }),
  { scopePath: ["Room"], type: "SellAllCrops" }
);

/* ------------------------------ sequence stream --------------------------- */

// While the mod stays silent the game owns the numbering: the bytes on the wire
// must be exactly what vanilla would have sent.
resetCommandSequence();
seedCommandSequence(10);
check("game command passes through untouched", sendFromGame(gameEnvelope(11, "PlantSeed")).commandSequence, 11);
check("and the next one too", sendFromGame(gameEnvelope(12, "WaterPlant")).commandSequence, 12);

// From the first injected command on, the game's numbers are one behind and get
// rewritten so the socket keeps one gapless, strictly increasing stream.
const modSell = buildQuinoaMessage({ type: "SellAllCrops" });
check("the mod takes the next free number", modSell.commandSequence, 13);
check("our own envelope is not renumbered again", sendFromGame(modSell).commandSequence, 13);
check("the game's stale 13 becomes 14", sendFromGame(gameEnvelope(13, "HarvestCrop")).commandSequence, 14);
check("its stale 14 becomes 15", sendFromGame(gameEnvelope(14, "HarvestCrop")).commandSequence, 15);

const modPickup = buildQuinoaMessage({ type: "PickupPet", petId: "p" });
check("a second mod command keeps counting", modPickup.commandSequence, 16);
check("still not renumbered", sendFromGame(modPickup).commandSequence, 16);
check("the game's stale 15 becomes 17", sendFromGame(gameEnvelope(15, "HarvestCrop")).commandSequence, 17);

// A reconnect re-seeds from Welcome and hands numbering back to the game.
seedCommandSequence(100);
check("Welcome re-seeds", sendFromGame(gameEnvelope(101, "PlantSeed")).commandSequence, 101);
check("and the mod follows from there", buildQuinoaMessage({ type: "SellAllCrops" }).commandSequence, 102);

// Missing the Welcome (socket opened before the hook) is survivable: watching
// the game's own commands is enough to align.
resetCommandSequence();
sendFromGame(gameEnvelope(77, "PlantSeed"));
check("seeded by observation alone", buildQuinoaMessage({ type: "SellAllCrops" }).commandSequence, 78);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
