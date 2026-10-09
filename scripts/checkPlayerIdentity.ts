// scripts/checkPlayerIdentity.ts
//
// Verifies the identity resolution that collect-state depends on. The bug this
// guards against: the game renamed `databaseUserId` to `discordUserId`, our
// identity read went null, and slot selection fell back to the first occupied
// slot - so everyone in a room uploaded slot 0's garden under their own account.
//
// Run with: npm run check:identity

import { check, checkEqual, done } from "./_check";
import {
  readAccountId,
  readSlotId,
  isOccupiedSlot,
  resolveMyAccountId,
  selectSlotForAccount,
  findPlayerByAccountId,
  findSlotIndex,
} from "../src/game/playerIdentity";

// Ids taken from a real state dump so the two namespaces stay distinguishable.
const MY_ACCOUNT = "128202956574162945";
const MY_ROOM_ID = "p_9rhRx2WevEjaSHXP";
const OTHER_ACCOUNT = "987654321098765432";
const OTHER_ROOM_ID = "p_ZZZZZZZZZZZZZZZZ";
// An account with no Discord link: `id` is all it has.
const WEB_ACCOUNT = "u_3f2a91c4";

console.log("readAccountId");
// Current shape: the account id sits in `player.id`.
checkEqual("current id field", readAccountId({ id: MY_ACCOUNT }), MY_ACCOUNT);
checkEqual("userId field", readAccountId({ userId: MY_ACCOUNT }), MY_ACCOUNT);
checkEqual("discord field", readAccountId({ discordUserId: MY_ACCOUNT }), MY_ACCOUNT);
checkEqual("oldest field", readAccountId({ databaseUserId: MY_ACCOUNT }), MY_ACCOUNT);
// On a chat userStyle both keys exist and `id` is a numeric row id, not a user.
checkEqual("userId wins over id", readAccountId({ id: 1760720, userId: MY_ACCOUNT }), MY_ACCOUNT);
checkEqual("id wins over discord", readAccountId({ id: MY_ACCOUNT, discordUserId: "0" }), MY_ACCOUNT);
checkEqual("nested in data", readAccountId({ data: { discordUserId: MY_ACCOUNT } }), MY_ACCOUNT);
checkEqual("numeric coerced", readAccountId({ discordUserId: 12345 }), "12345");
// The whole point: an ephemeral room id is not an account id.
checkEqual("room id refused", readAccountId({ id: MY_ROOM_ID }), null);
// Old shape: `id` is a room id, so the read has to fall through to Discord.
checkEqual("room id falls through", readAccountId({ id: MY_ROOM_ID, discordUserId: MY_ACCOUNT }), MY_ACCOUNT);
checkEqual("playerId refused", readAccountId({ playerId: MY_ROOM_ID }), null);
checkEqual("empty string refused", readAccountId({ discordUserId: "" }), null);
checkEqual("null source", readAccountId(null), null);
checkEqual("string source", readAccountId("nope"), null);

console.log("readSlotId");
// Current shape: slots are keyed by `userId`.
checkEqual("slot userId", readSlotId({ userId: MY_ACCOUNT }), MY_ACCOUNT);
checkEqual("slot discord field", readSlotId({ discordUserId: MY_ACCOUNT }), MY_ACCOUNT);
checkEqual("slot oldest field", readSlotId({ databaseUserId: MY_ACCOUNT }), MY_ACCOUNT);
checkEqual("slot playerId alias", readSlotId({ playerId: MY_ACCOUNT }), MY_ACCOUNT);
checkEqual("slot nested data", readSlotId({ data: { discordUserId: MY_ACCOUNT } }), MY_ACCOUNT);
checkEqual("slot room id refused", readSlotId({ playerId: MY_ROOM_ID }), null);
checkEqual("empty slot", readSlotId({}), null);

console.log("isOccupiedSlot");
checkEqual("has identity", isOccupiedSlot({ discordUserId: MY_ACCOUNT }), true);
checkEqual("has data only", isOccupiedSlot({ data: { garden: {} } }), true);
checkEqual("bare object", isOccupiedSlot({}), false);
checkEqual("null slot", isOccupiedSlot(null), false);

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
checkEqual("current shape atom", resolveMyAccountId({ id: MY_ACCOUNT }, currentRoster), MY_ACCOUNT);
checkEqual("current picks me not first", resolveMyAccountId({ id: MY_ACCOUNT }, currentRoster) === OTHER_ACCOUNT, false);
// Web account: no discordUserId anywhere, which used to resolve to null.
checkEqual("no discord link", resolveMyAccountId({ id: WEB_ACCOUNT }, [{ id: WEB_ACCOUNT, name: "Web" }]), WEB_ACCOUNT);
checkEqual("direct on atom", resolveMyAccountId({ discordUserId: MY_ACCOUNT }, roster), MY_ACCOUNT);
checkEqual("old field on atom", resolveMyAccountId({ databaseUserId: MY_ACCOUNT }, roster), MY_ACCOUNT);
// The atom only carries a room id: cross-reference the roster rather than give up.
checkEqual("via roster lookup", resolveMyAccountId({ id: MY_ROOM_ID }, roster), MY_ACCOUNT);
checkEqual("picks me not first", resolveMyAccountId({ id: MY_ROOM_ID }, roster) === OTHER_ACCOUNT, false);
checkEqual("unknown room id", resolveMyAccountId({ id: "p_nobody" }, roster), null);
checkEqual("no roster", resolveMyAccountId({ id: MY_ROOM_ID }, []), null);
checkEqual("empty atom", resolveMyAccountId({}, roster), null);

console.log("selectSlotForAccount");
const mySlot = { discordUserId: MY_ACCOUNT, data: { garden: "mine" } };
const otherSlot = { discordUserId: OTHER_ACCOUNT, data: { garden: "theirs" } };
// Slot 0 is deliberately someone else's - that is the shape of the incident.
const slots = [otherSlot, mySlot];

// The shape the game ships today: userSlots keyed by userId.
const myUserIdSlot = { userId: MY_ACCOUNT, data: { garden: "mine" } };
const currentSlots = [{ userId: OTHER_ACCOUNT, data: { garden: "theirs" } }, myUserIdSlot];

check("matches userId slot", selectSlotForAccount(currentSlots, { accountId: MY_ACCOUNT }) === myUserIdSlot);
check("matches my slot", selectSlotForAccount(slots, { accountId: MY_ACCOUNT }) === mySlot);
check("matches their slot", selectSlotForAccount(slots, { accountId: OTHER_ACCOUNT }) === otherSlot);
checkEqual("legacy field slot", selectSlotForAccount([{ databaseUserId: MY_ACCOUNT }], { accountId: MY_ACCOUNT }) !== null, true);

// The regression guard. Every one of these used to return slot 0.
checkEqual("no identity refuses", selectSlotForAccount(slots, {}), null);
checkEqual("null identity refuses", selectSlotForAccount(slots, { accountId: null }), null);
checkEqual("empty identity refuses", selectSlotForAccount(slots, { accountId: "" }), null);
checkEqual("unknown identity refuses", selectSlotForAccount(slots, { accountId: "404" }), null);
// Even alone in a room we refuse: guessing is what caused the incident.
checkEqual("single slot still refuses", selectSlotForAccount([otherSlot], {}), null);

checkEqual("empty slots", selectSlotForAccount([], { accountId: MY_ACCOUNT }), null);
check("explicit index wins", selectSlotForAccount(slots, { slotIndex: 1 }) === mySlot);
checkEqual("index out of range falls through", selectSlotForAccount(slots, { slotIndex: 9 }), null);

console.log("findPlayerByAccountId");
check("finds me", findPlayerByAccountId(roster, MY_ACCOUNT) === roster[1]);
check("finds me by id", findPlayerByAccountId(currentRoster, MY_ACCOUNT) === currentRoster[1]);
checkEqual("no match returns null", findPlayerByAccountId(roster, "404"), null);
// Used to return players[0], which put someone else's name on my leaderboard row.
checkEqual("null id returns null", findPlayerByAccountId(roster, null), null);

console.log("findSlotIndex");
// Pet hutch slot lookup: a slot may be keyed by account id or by room id.
// This is the one caller that passes a room id on purpose, so unlike readSlotId
// it must still match `p_…` values instead of filtering them out.
const indexSlots = [{ playerId: OTHER_ROOM_ID }, { discordUserId: MY_ACCOUNT }];
checkEqual("by account id", findSlotIndex(indexSlots, { accountId: MY_ACCOUNT }), 1);
checkEqual("by room id", findSlotIndex(indexSlots, { roomId: OTHER_ROOM_ID }), 0);
// Current shape: the slot is keyed by userId and there is no room id left.
checkEqual("by userId slot", findSlotIndex([{ userId: OTHER_ACCOUNT }, { userId: MY_ACCOUNT }], { accountId: MY_ACCOUNT }), 1);
// Both identifiers refer to the same person in practice, so slot order decides.
checkEqual("first matching slot in order", findSlotIndex(indexSlots, { accountId: MY_ACCOUNT, roomId: OTHER_ROOM_ID }), 0);
checkEqual("no identifiers", findSlotIndex(indexSlots, {}), null);
checkEqual("nulls only", findSlotIndex(indexSlots, { accountId: null, roomId: null }), null);
checkEqual("no match", findSlotIndex(indexSlots, { accountId: "404" }), null);
checkEqual("empty slots", findSlotIndex([], { accountId: MY_ACCOUNT }), null);

done();
