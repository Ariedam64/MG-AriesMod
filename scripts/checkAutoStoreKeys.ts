// Auto-store matches inventory and storage by item key. Since build 1449 a
// picked-up crystal is a tool item that carries its shard's toolId
// (`{ id, toolId: "RainWardShard", quantity: 1, remainingActiveSeconds }`), so
// keying it like a shard stack made the Tool Shack look like it still held
// shards after the player took them all out, and auto-store sent them back.
import { check, checkEqual, done } from "./_check";
import { storageKeyFromToolId } from "../src/features/autoStore/autoStore";

const shardStack = { toolId: "RainWardShard", itemType: "Tool", quantity: 5 };
const crystal = { id: "c-1", toolId: "RainWardShard", itemType: "Tool", quantity: 1, remainingActiveSeconds: 7200 };

checkEqual("a shard stack is keyed by its toolId", storageKeyFromToolId(shardStack), "RainWardShard");
checkEqual("a crystal is not a stack and has no auto-store key", storageKeyFromToolId(crystal), "");
check("a spent crystal is still a crystal", storageKeyFromToolId({ ...crystal, remainingActiveSeconds: 0 }) === "");
done();
