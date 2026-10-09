// The Keybinds menu: one card per section, one row per shortcut, and the
// remove, restore and Rapid fire controls still reach the registry.
import { installFakeDom } from "./_fakeDom";
installFakeDom();
import { check, checkEqual, done } from "./_check";
import { renderKeybindsMenu } from "../src/features/keybinds/menu";
import { getKeybind, getKeybindHoldDetection, getKeybindSections } from "../src/features/keybinds/keybinds";
import { readAriesPath } from "../src/platform/storage";

const event = (type: string) => ({ type, preventDefault() {}, stopPropagation() {} }) as unknown as Event;

const container = document.createElement("div");
renderKeybindsMenu(container);

const sections = getKeybindSections();
const cards = container.querySelectorAll(".qmm-collapse");
checkEqual("one card per section", cards.length, sections.length);
const rowCount = sections.reduce((n, s) => n + s.actions.length, 0);
checkEqual("one row per shortcut", container.querySelectorAll(".qws-kb-row").length, rowCount);

const card = (id: string) => container.querySelector(`.qmm-collapse[data-section="${id}"]`);
const rowOf = (sectionId: string, label: string) =>
  Array.from(card(sectionId)?.querySelectorAll(".qws-kb-row") ?? [])
    .find((row) => row.querySelector(".qmm-setting-row__title")?.textContent === label) ?? null;

const action = rowOf("game", "Action");
check("a core Game key cannot be removed", !!action && !action.querySelector(".qws-kb-act--clear"));
check("a core Game key can be restored", !!action?.querySelector(".qws-kb-act--reset"));
checkEqual(
  "the Game section is split into groups",
  Array.from(card("game")?.querySelectorAll(".qws-kb-group") ?? [], (el) => el.textContent),
  ["Actions", "Open directly", "Movement"],
);

const hold = action?.querySelector(".qws-kb-hold")?.querySelector(".qmm-switch") as unknown as HTMLInputElement | null;
check("Rapid fire sits on the Action row", !!hold);
if (hold) {
  hold.checked = true;
  hold.dispatchEvent(event("change"));
}
check("its switch turns it on", getKeybindHoldDetection("game.action"));

const toggle = rowOf("gui", "Show or hide menus");
const clear = toggle?.querySelector(".qws-kb-act--clear") as unknown as HTMLButtonElement | null;
const reset = toggle?.querySelector(".qws-kb-act--reset") as unknown as HTMLButtonElement | null;
check("a bound key at its default offers remove but not restore", !!clear && !clear.disabled && !!reset?.disabled);
clear?.click();
checkEqual("remove unbinds it", getKeybind("gui.toggle"), null);
check("then restore is offered and remove is not", !!clear?.disabled && !reset?.disabled);
reset?.click();
checkEqual("restore brings the default back", getKeybind("gui.toggle"), { alt: true, code: "KeyX" });

check("the Pets card says when there is no team yet", !!card("pets")?.querySelector(".qws-kb-empty"));

const head = card("shops")?.querySelector<HTMLElement>(".qmm-collapse__head");
head?.click();
checkEqual("a folded section is remembered", readAriesPath("keybinds.collapsed"), { shops: true });
done();
