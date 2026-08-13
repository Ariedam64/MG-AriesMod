// scripts/checkPlayerIdentity.ts
//
// Verifies the identity resolution that collect-state depends on. The bug this
// guards against: the game renamed `databaseUserId` to `discordUserId`, our
// identity read went null, and slot selection fell back to the first occupied
// slot - so everyone in a room uploaded slot 0's garden under their own account.
//
// Run with: npm run check:identity

import {
  readAccountId,
  readSlotId,
  isOccupiedSlot,
  resolveMyAccountId,
  selectSlotForAccount,
  findPlayerByAccountId,
  findSlotIndex,
} from "../src/utils/playerIdentity";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

// Ids taken from a real state dump so the two namespaces stay distinguishable.
const MY_ACCOUNT = "128202956574162945";
const MY_ROOM_ID = "p_9rhRx2WevEjaSHXP";
const OTHER_ACCOUNT = "987654321098765432";
const OTHER_ROOM_ID = "p_ZZZZZZZZZZZZZZZZ";

console.log("readAccountId");
check("new field", readAccountId({ discordUserId: MY_ACCOUNT }), MY_ACCOUNT);
check("old field", readAccountId({ databaseUserId: MY_ACCOUNT }), MY_ACCOUNT);
check("new wins over old", readAccountId({ discordUserId: MY_ACCOUNT, databaseUserId: "0" }), MY_ACCOUNT);
check("nested in data", readAccountId({ data: { discordUserId: MY_ACCOUNT } }), MY_ACCOUNT);
check("numeric coerced", readAccountId({ discordUserId: 12345 }), "12345");
// The whole point: a room id is not an account id.
check("room id refused", readAccountId({ id: MY_ROOM_ID }), null);
check("playerId refused", readAccountId({ playerId: MY_ROOM_ID }), null);
check("empty string refused", readAccountId({ discordUserId: "" }), null);
check("null source", readAccountId(null), null);
check("string source", readAccountId("nope"), null);

console.log("readSlotId");
check("slot new field", readSlotId({ discordUserId: MY_ACCOUNT }), MY_ACCOUNT);
check("slot old field", readSlotId({ databaseUserId: MY_ACCOUNT }), MY_ACCOUNT);
check("slot userId alias", readSlotId({ userId: MY_ACCOUNT }), MY_ACCOUNT);
check("slot playerId alias", readSlotId({ playerId: MY_ACCOUNT }), MY_ACCOUNT);
check("slot nested data", readSlotId({ data: { discordUserId: MY_ACCOUNT } }), MY_ACCOUNT);
check("empty slot", readSlotId({}), null);

console.log("isOccupiedSlot");
check("has identity", isOccupiedSlot({ discordUserId: MY_ACCOUNT }), true);
check("has data only", isOccupiedSlot({ data: { garden: {} } }), true);
check("bare object", isOccupiedSlot({}), false);
check("null slot", isOccupiedSlot(null), false);

console.log("resolveMyAccountId");
const roster = [
  { id: OTHER_ROOM_ID, name: "Someone", discordUserId: OTHER_ACCOUNT },
  { id: MY_ROOM_ID, name: "Romann", discordUserId: MY_ACCOUNT },
];
check("direct on atom", resolveMyAccountId({ discordUserId: MY_ACCOUNT }, roster), MY_ACCOUNT);
check("old field on atom", resolveMyAccountId({ databaseUserId: MY_ACCOUNT }, roster), MY_ACCOUNT);
// The atom only carries a room id: cross-reference the roster rather than give up.
check("via roster lookup", resolveMyAccountId({ id: MY_ROOM_ID }, roster), MY_ACCOUNT);
check("picks me not first", resolveMyAccountId({ id: MY_ROOM_ID }, roster) === OTHER_ACCOUNT, false);
check("unknown room id", resolveMyAccountId({ id: "p_nobody" }, roster), null);
check("no roster", resolveMyAccountId({ id: MY_ROOM_ID }, []), null);
check("empty atom", resolveMyAccountId({}, roster), null);

console.log("selectSlotForAccount");
const mySlot = { discordUserId: MY_ACCOUNT, data: { garden: "mine" } };
const otherSlot = { discordUserId: OTHER_ACCOUNT, data: { garden: "theirs" } };
// Slot 0 is deliberately someone else's - that is the shape of the incident.
const slots = [otherSlot, mySlot];

check("matches my slot", selectSlotForAccount(slots, { accountId: MY_ACCOUNT }), mySlot);
check("matches their slot", selectSlotForAccount(slots, { accountId: OTHER_ACCOUNT }), otherSlot);
check("legacy field slot", selectSlotForAccount([{ databaseUserId: MY_ACCOUNT }], { accountId: MY_ACCOUNT }) !== null, true);

// The regression guard. Every one of these used to return slot 0.
check("no identity refuses", selectSlotForAccount(slots, {}), null);
check("null identity refuses", selectSlotForAccount(slots, { accountId: null }), null);
check("empty identity refuses", selectSlotForAccount(slots, { accountId: "" }), null);
check("unknown identity refuses", selectSlotForAccount(slots, { accountId: "404" }), null);
// Even alone in a room we refuse: guessing is what caused the incident.
check("single slot still refuses", selectSlotForAccount([otherSlot], {}), null);

check("empty slots", selectSlotForAccount([], { accountId: MY_ACCOUNT }), null);
check("explicit index wins", selectSlotForAccount(slots, { slotIndex: 1 }), mySlot);
check("index out of range falls through", selectSlotForAccount(slots, { slotIndex: 9 }), null);

console.log("findPlayerByAccountId");
check("finds me", findPlayerByAccountId(roster, MY_ACCOUNT), roster[1]);
check("no match returns null", findPlayerByAccountId(roster, "404"), null);
// Used to return players[0], which put someone else's name on my leaderboard row.
check("null id returns null", findPlayerByAccountId(roster, null), null);

console.log("findSlotIndex");
// Pet hutch slot lookup: a slot may be keyed by account id or by room id.
const indexSlots = [{ playerId: OTHER_ROOM_ID }, { discordUserId: MY_ACCOUNT }];
check("by account id", findSlotIndex(indexSlots, { accountId: MY_ACCOUNT }), 1);
check("by room id", findSlotIndex(indexSlots, { roomId: OTHER_ROOM_ID }), 0);
// Both identifiers refer to the same person in practice, so slot order decides.
check("first matching slot in order", findSlotIndex(indexSlots, { accountId: MY_ACCOUNT, roomId: OTHER_ROOM_ID }), 0);
check("no identifiers", findSlotIndex(indexSlots, {}), null);
check("nulls only", findSlotIndex(indexSlots, { accountId: null, roomId: null }), null);
check("no match", findSlotIndex(indexSlots, { accountId: "404" }), null);
check("empty slots", findSlotIndex([], { accountId: MY_ACCOUNT }), null);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
