// Typing in the mod's own fields never reaches the game's shortcuts, wherever
// the field sits: a menu window, but also a kit modal, an editor panel or a
// popover, which since the redesign live outside the windows. The game's own
// fields (its chat) are left alone.
import { installFakeDom } from "./_fakeDom";
installFakeDom();
import { check, done } from "./_check";
import { installInputKeyTrap } from "../src/ui/inputKeyTrap";

installInputKeyTrap();

function typeIn(field: HTMLElement): boolean {
  let stopped = false;
  const event = {
    type: "keydown", code: "KeyW", key: "w", target: field,
    stopPropagation() { stopped = true; }, stopImmediatePropagation() { stopped = true; }, preventDefault() {},
  };
  window.dispatchEvent(event as unknown as Event);
  return stopped;
}

function fieldIn(...classNames: string[]): HTMLInputElement {
  let parent: HTMLElement = document.body;
  for (const name of classNames) {
    const box = document.createElement("div");
    box.className = name;
    parent.appendChild(box);
    parent = box;
  }
  const input = document.createElement("input");
  input.type = "text";
  parent.appendChild(input);
  return input;
}

check("a field in a menu window keeps its keys", typeIn(fieldIn("qws-win", "w-body")));
check("a field in a kit modal keeps its keys", typeIn(fieldIn("qmm-modal-scrim", "qmm-modal")));
check("a field in an editor panel keeps its keys", typeIn(fieldIn("qws-ed-panel")));
const plain = fieldIn("qmm-rule-popover");
check("a field typed with no explicit type keeps its keys", typeIn(Object.assign(plain, { type: "" })));
check("the game's own chat field is left to the game", !typeIn(fieldIn("chakra-input-group")));
const button = document.createElement("button");
document.body.appendChild(button);
check("a key on a mod button still reaches the game", !typeIn(button));
done();
