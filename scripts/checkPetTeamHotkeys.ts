// A pet-team shortcut must keep its key away from the game.
//
// The keydown handler awaited the active team lookup before it matched the
// shortcut, and only then called preventDefault and stopPropagation. By then
// the event had finished dispatching, so both calls did nothing: a team bound
// to a key the game also uses (a digit, a letter) switched the team and ran
// the game's own action as well.
//
// The shortcut labels had a second problem: the formatter's arrows, Mac
// command sign and unbound placeholder were saved twice-encoded, so the HUD
// showed "â†‘" for an arrow key.
//
// Run with: npm run check:petteamhotkeys

import { checkEqual, done } from "./_check";
import { getKeybindLabel, setKeybind } from "../src/features/keybinds/keybinds";
import { installPetTeamHotkeys, setPetTeamKeybinds } from "../src/features/pets/teamHotkeys";

type KeyHandler = (e: KeyboardEvent) => void;
const handlers: KeyHandler[] = [];
(globalThis as { addEventListener: unknown }).addEventListener = (type: string, fn: KeyHandler) => {
  if (type === "keydown") handlers.push(fn);
};

function press(code: string): { prevented: boolean; stopped: boolean } {
  const state = { prevented: false, stopped: false };
  const event = {
    code,
    key: code,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    target: null,
    preventDefault: () => { state.prevented = true; },
    stopPropagation: () => { state.stopped = true; },
    stopImmediatePropagation: () => { state.stopped = true; },
  } as unknown as KeyboardEvent;
  for (const handler of handlers) handler(event);
  return state;
}

const used: string[] = [];
installPetTeamHotkeys((teamId) => { used.push(teamId); });
setPetTeamKeybinds([{ id: "alpha", name: "Alpha" }, { id: "beta", name: "Beta" }]);
setKeybind("pets.team.beta", { code: "Digit2" });

const bound = press("Digit2");
checkEqual("the bound key is kept from the game at once", bound.prevented, true);
checkEqual("and stops there", bound.stopped, true);

const unbound = press("Digit7");
checkEqual("an unbound key goes through untouched", unbound.prevented, false);

setKeybind("pets.team.alpha", { code: "ArrowUp" });
checkEqual("an arrow key reads as an arrow", getKeybindLabel("pets.team.alpha"), "↑");
setKeybind("pets.team.alpha", null);
checkEqual("an unbound action reads as None", getKeybindLabel("pets.team.alpha"), "None");

setTimeout(() => {
  checkEqual("the bound team is used", used.join(","), "beta");
  done();
}, 200);
