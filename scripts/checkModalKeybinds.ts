// The building shortcuts open their game modal: a key set on "Daily quests"
// opens the game's `dailyQuests` modal, the one the quest booth opens.
import { installFakeDom } from "./_fakeDom";
installFakeDom();
import { check, checkEqual, done } from "./_check";
import { createFakeStore, installFakeGame, primitive } from "./_fakeJotai";
import { getKeybindSections, setKeybind } from "../src/features/keybinds/keybinds";
import { installModalToggleKeybinds } from "../src/features/keybinds/modalToggles";

const store = createFakeStore();
const modalState = primitive({ modal: null, openId: 0 }, "activeModalStateAtom");
installFakeGame(store, {
  "/game/activeModalStateAtom": modalState,
  "/game/inventoryModalIsActiveAtom": primitive(false, "inventoryModalIsActiveAtom"),
});

const quests = getKeybindSections().flatMap((section) => section.actions).find((action) => action.id === "game.daily-quests");
check("there is a Daily quests shortcut", !!quests);
checkEqual("it shows the game's quest icon", quests?.icon, "sprite/ui/QuestIcon");
checkEqual("it has no key until the player sets one", quests?.defaultHotkey ?? null, null);

setKeybind("game.daily-quests", { code: "KeyQ" });
installModalToggleKeybinds();
const press = {
  type: "keydown", code: "KeyQ", key: "q", target: document.body, repeat: false,
  ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
  preventDefault() {}, stopPropagation() {},
};
window.dispatchEvent(press as unknown as Event);

setTimeout(() => {
  checkEqual("the key opens the daily quests modal", (store.get(modalState) as { modal: string | null }).modal, "dailyQuests");
  done();
}, 50);
