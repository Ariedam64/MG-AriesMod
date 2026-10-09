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
// with it, silently.
//
// Run with: npm run check:commands

import { checkEqual, done } from "./_check";
import {
  buildQuinoaMessage,
  resetCommandSequence,
  seedCommandSequence,
} from "../src/game/ws/commands";
import { processOutgoingFrame } from "../src/game/ws/socketHook";

/** Runs an envelope the game wrote through the real socket send hook. */
function sendFromGame(envelope: any): any {
  const frame = processOutgoingFrame(JSON.stringify(envelope));
  return typeof frame === "string" ? JSON.parse(frame) : frame;
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
checkEqual("HarvestCrop travels in the envelope", { ...harvest, requestId: "<id>" }, {
  scopePath: ["Room", "Quinoa"],
  type: "QuinoaCommand",
  requestId: "<id>",
  commandSequence: 41,
  command: { type: "HarvestCrop", slot: 3, slotsIndex: 2 },
});
checkEqual("requestId is a uuid", /^[0-9a-f-]{20,}$/.test(String(harvest.requestId)), true);

checkEqual(
  "PlayerPosition stays flat (movement channel, never a command)",
  buildQuinoaMessage({ type: "PlayerPosition", position: { x: 1, y: 2 } }),
  { scopePath: ["Room", "Quinoa"], type: "PlayerPosition", position: { x: 1, y: 2 } }
);

checkEqual(
  "Teleport stays flat (the client has not migrated it)",
  buildQuinoaMessage({ type: "Teleport", position: { x: 1, y: 2 } }),
  { scopePath: ["Room", "Quinoa"], type: "Teleport", position: { x: 1, y: 2 } }
);

checkEqual(
  "a type the client never sends is not wrapped",
  buildQuinoaMessage({ type: "PetPositions", petPositions: {} }),
  { scopePath: ["Room", "Quinoa"], type: "PetPositions", petPositions: {} }
);

checkEqual(
  "an explicit Quinoa scopePath is honoured, not duplicated into the command",
  {
    ...buildQuinoaMessage({
      scopePath: ["Room", "Quinoa"],
      type: "MoveItem",
      from: "inventory",
      to: "FeedingTrough",
      itemId: "a",
    }),
    requestId: "<id>",
  },
  {
    scopePath: ["Room", "Quinoa"],
    type: "QuinoaCommand",
    requestId: "<id>",
    commandSequence: 42,
    command: {
      type: "MoveItem",
      from: "inventory",
      to: "FeedingTrough",
      itemId: "a",
    },
  }
);

checkEqual(
  "Room-scoped messages are never wrapped",
  buildQuinoaMessage({ scopePath: ["Room"], type: "SellAllCrops" }),
  { scopePath: ["Room"], type: "SellAllCrops" }
);

/* ------------------------------ sequence stream --------------------------- */

// While the mod stays silent the game owns the numbering: the bytes on the wire
// must be exactly what vanilla would have sent.
resetCommandSequence();
seedCommandSequence(10);
checkEqual("game command passes through untouched", sendFromGame(gameEnvelope(11, "PlantSeed")).commandSequence, 11);
checkEqual("and the next one too", sendFromGame(gameEnvelope(12, "WaterPlant")).commandSequence, 12);

// From the first injected command on, the game's numbers are one behind and get
// rewritten so the socket keeps one gapless, strictly increasing stream.
const modSell = buildQuinoaMessage({ type: "SellAllCrops" });
checkEqual("the mod takes the next free number", modSell.commandSequence, 13);
checkEqual("our own envelope is not renumbered again", sendFromGame(modSell).commandSequence, 13);
checkEqual("the game's stale 13 becomes 14", sendFromGame(gameEnvelope(13, "HarvestCrop")).commandSequence, 14);
checkEqual("its stale 14 becomes 15", sendFromGame(gameEnvelope(14, "HarvestCrop")).commandSequence, 15);

const modPickup = buildQuinoaMessage({ type: "PickupPet", petId: "p" });
checkEqual("a second mod command keeps counting", modPickup.commandSequence, 16);
checkEqual("still not renumbered", sendFromGame(modPickup).commandSequence, 16);
checkEqual("the game's stale 15 becomes 17", sendFromGame(gameEnvelope(15, "HarvestCrop")).commandSequence, 17);

// The game numbers a command even when it never reaches the socket: an outgoing
// rule dropped it, or the game was not connected. Since build 1449 the game
// keeps a fence on that number (a HatchEgg fence blocks hatching) until the
// server has executed a number at least as high, so a game command must never
// go out below the number the game gave it, or its fence is never lifted.
resetCommandSequence();
seedCommandSequence(200);
checkEqual("the mod injects at 201", buildQuinoaMessage({ type: "SellPet", itemId: "p" }).commandSequence, 201);
checkEqual("a game command is never sent below its own number", sendFromGame(gameEnvelope(203, "HatchEgg")).commandSequence, 203);
checkEqual("and the stream carries on above it", buildQuinoaMessage({ type: "SellPet", itemId: "q" }).commandSequence, 204);

// A reconnect re-seeds from Welcome and hands numbering back to the game.
seedCommandSequence(100);
checkEqual("Welcome re-seeds", sendFromGame(gameEnvelope(101, "PlantSeed")).commandSequence, 101);
checkEqual("and the mod follows from there", buildQuinoaMessage({ type: "SellAllCrops" }).commandSequence, 102);

// Missing the Welcome (socket opened before the hook) is survivable: watching
// the game's own commands is enough to align.
resetCommandSequence();
sendFromGame(gameEnvelope(77, "PlantSeed"));
checkEqual("seeded by observation alone", buildQuinoaMessage({ type: "SellAllCrops" }).commandSequence, 78);

done();
