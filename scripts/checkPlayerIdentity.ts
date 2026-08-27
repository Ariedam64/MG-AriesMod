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
// An account with no Discord link: `id` is all it has.
const WEB_ACCOUNT = "u_3f2a91c4";

console.log("readAccountId");
// Current shape: the account id sits in `player.id`.
check("current id field", readAccountId({ id: MY_ACCOUNT }), MY_ACCOUNT);
check("userId field", readAccountId({ userId: MY_ACCOUNT }), MY_ACCOUNT);
check("discord field", readAccountId({ discordUserId: MY_ACCOUNT }), MY_ACCOUNT);
check("oldest field", readAccountId({ databaseUserId: MY_ACCOUNT }), MY_ACCOUNT);
// On a chat userStyle both keys exist and `id` is a numeric row id, not a user.
check("userId wins over id", readAccountId({ id: 1760720, userId: MY_ACCOUNT }), MY_ACCOUNT);
check("id wins over discord", readAccountId({ id: MY_ACCOUNT, discordUserId: "0" }), MY_ACCOUNT);
check("nested in data", readAccountId({ data: { discordUserId: MY_ACCOUNT } }), MY_ACCOUNT);
check("numeric coerced", readAccountId({ discordUserId: 12345 }), "12345");
// The whole point: an ephemeral room id is not an account id.
check("room id refused", readAccountId({ id: MY_ROOM_ID }), null);
// Old shape: `id` is a room id, so the read has to fall through to Discord.
check("room id falls through", readAccountId({ id: MY_ROOM_ID, discordUserId: MY_ACCOUNT }), MY_ACCOUNT);
check("playerId refused", readAccountId({ playerId: MY_ROOM_ID }), null);
check("empty string refused", readAccountId({ discordUserId: "" }), null);
check("null source", readAccountId(null), null);
check("string source", readAccountId("nope"), null);

console.log("readSlotId");
// Current shape: slots are keyed by `userId`.
check("slot userId", readSlotId({ userId: MY_ACCOUNT }), MY_ACCOUNT);
check("slot discord field", readSlotId({ discordUserId: MY_ACCOUNT }), MY_ACCOUNT);
check("slot oldest field", readSlotId({ databaseUserId: MY_ACCOUNT }), MY_ACCOUNT);
check("slot playerId alias", readSlotId({ playerId: MY_ACCOUNT }), MY_ACCOUNT);
check("slot nested data", readSlotId({ data: { discordUserId: MY_ACCOUNT } }), MY_ACCOUNT);
check("slot room id refused", readSlotId({ playerId: MY_ROOM_ID }), null);
check("empty slot", readSlotId({}), null);

console.log("isOccupiedSlot");
check("has identity", isOccupiedSlot({ discordUserId: MY_ACCOUNT }), true);
check("has data only", isOccupiedSlot({ data: { garden: {} } }), true);
check("bare object", isOccupiedSlot({}), false);
check("null slot", isOccupiedSlot(null), false);

console.log("resolveMyAccountId");
// Old shape: `id` is the room id and the account lives in discordUserId.
const roster = [
  { id: OTHER_ROOM_ID, name: "Someone", discordUserId: OTHER_ACCOUNT },
  { id: MY_ROOM_ID, name: "Romann", discordUserId: MY_ACCOUNT },
];
// Current shape: `id` is the account id, and it is the only id there is.
const currentRoster = [
  { id: OTHER_ACCOUNT, name: "Someone", discordUserId: OTHER_ACCOUNT },
  { id: MY_ACCOUNT, name: "Romann", discordUserId: MY_ACCOUNT },
];
check("current shape atom", resolveMyAccountId({ id: MY_ACCOUNT }, currentRoster), MY_ACCOUNT);
check("current picks me not first", resolveMyAccountId({ id: MY_ACCOUNT }, currentRoster) === OTHER_ACCOUNT, false);
// Web account: no discordUserId anywhere, which used to resolve to null.
check("no discord link", resolveMyAccountId({ id: WEB_ACCOUNT }, [{ id: WEB_ACCOUNT, name: "Web" }]), WEB_ACCOUNT);
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

// The shape the game ships today: userSlots keyed by userId.
const myUserIdSlot = { userId: MY_ACCOUNT, data: { garden: "mine" } };
const currentSlots = [{ userId: OTHER_ACCOUNT, data: { garden: "theirs" } }, myUserIdSlot];

check("matches userId slot", selectSlotForAccount(currentSlots, { accountId: MY_ACCOUNT }), myUserIdSlot);
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
check("finds me by id", findPlayerByAccountId(currentRoster, MY_ACCOUNT), currentRoster[1]);
check("no match returns null", findPlayerByAccountId(roster, "404"), null);
// Used to return players[0], which put someone else's name on my leaderboard row.
check("null id returns null", findPlayerByAccountId(roster, null), null);

console.log("findSlotIndex");
// Pet hutch slot lookup: a slot may be keyed by account id or by room id.
// This is the one caller that passes a room id on purpose, so unlike readSlotId
// it must still match `p_…` values instead of filtering them out.
const indexSlots = [{ playerId: OTHER_ROOM_ID }, { discordUserId: MY_ACCOUNT }];
check("by account id", findSlotIndex(indexSlots, { accountId: MY_ACCOUNT }), 1);
check("by room id", findSlotIndex(indexSlots, { roomId: OTHER_ROOM_ID }), 0);
// Current shape: the slot is keyed by userId and there is no room id left.
check("by userId slot", findSlotIndex([{ userId: OTHER_ACCOUNT }, { userId: MY_ACCOUNT }], { accountId: MY_ACCOUNT }), 1);
// Both identifiers refer to the same person in practice, so slot order decides.
check("first matching slot in order", findSlotIndex(indexSlots, { accountId: MY_ACCOUNT, roomId: OTHER_ROOM_ID }), 0);
check("no identifiers", findSlotIndex(indexSlots, {}), null);
check("nulls only", findSlotIndex(indexSlots, { accountId: null, roomId: null }), null);
check("no match", findSlotIndex(indexSlots, { accountId: "404" }), null);
check("empty slots", findSlotIndex([], { accountId: MY_ACCOUNT }), null);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
