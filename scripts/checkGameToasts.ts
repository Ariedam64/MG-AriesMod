// The mod's toasts reach the game's toast list, as build 1449 builds it.
//
// The toasts used to live in labelled atoms (`sendQuinoaToastAtom`,
// `quinoaToastsAtom`). Since 1441 they are a field of the current room:
// `currentRoomAtom` holds the room object, whose `toasts` is the atom the
// game's toast system reads. A toast is `{ id, title, description, variant,
// displayDurationMs, isClosable, isStackable }`; only "error" and "warning"
// are special variants, and `displayDurationMs` defaults to 10 s.
import { checkEqual, check, run } from "./_check";
import { createFakeStore, installFakeGame, primitive } from "./_fakeJotai";
import { toastSimple } from "../src/ui/toast";
import { editGameToasts } from "../src/game/toasts";

const store = createFakeStore();
const toastsAtom = primitive<any[]>([{ id: "quinoa-game-toast", title: "Game says hi", variant: "info" }]);
const room = { toasts: toastsAtom, npcLines: primitive({}) };
const currentRoomAtom = primitive(room, "currentRoomAtom");
installFakeGame(store, {
  "/client/src/games/Quinoa/engine/scopes/currentRoom.ts/currentRoomAtom": currentRoomAtom,
});

const toasts = () => store.get(toastsAtom) as any[];

run(async () => {
  await toastSimple("Sell all Pets", "Sale cancelled.", "warn", 2000);
  const ours = toasts().find((t) => t.title === "Sell all Pets");
  check("the toast reaches the room's toast list", !!ours);
  checkEqual("the game's own toast stays", toasts().some((t) => t.id === "quinoa-game-toast"), true);
  checkEqual("warn is the game's warning variant", ours?.variant, "warning");
  checkEqual("the duration is the game's displayDurationMs", ours?.displayDurationMs, 2000);
  checkEqual("it can be closed", ours?.isClosable, true);
  checkEqual("it stacks instead of replacing other toasts", ours?.isStackable, true);

  await toastSimple("Copied", undefined, "success");
  const ids = toasts().map((t) => t.id);
  checkEqual("every toast gets its own id", new Set(ids).size, ids.length);

  const edited = await editGameToasts((list) => list.filter((t) => t.id !== "quinoa-game-toast"));
  check("toasts can be edited in place", edited && !toasts().some((t) => t.id === "quinoa-game-toast"));
});
