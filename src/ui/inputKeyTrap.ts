// Stops keystrokes typed into the mod's own fields from reaching the game's
// shortcuts, so typing "w" in a field does not walk the player. Typing still
// works: the event is stopped, not prevented.
//
// "The mod's own" means any field inside a mod surface, not only a menu
// window: since the redesign kit modals, editor panels and popovers live
// outside the windows. The game's own fields (its chat) are left to the game.

/** Input types that take typed text. An input with no type is a text input. */
const TEXT_INPUT_TYPES = new Set(["", "text", "number", "search", "email", "password", "url", "tel"]);

/** Tag-based, so it holds for elements from any realm (a userscript sandbox has its own HTMLInputElement). */
function isTextField(el: unknown): boolean {
  const node = el as { tagName?: unknown; type?: unknown; isContentEditable?: unknown } | null;
  const tag = typeof node?.tagName === "string" ? node.tagName.toUpperCase() : "";
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return TEXT_INPUT_TYPES.has(String(node?.type ?? "").toLowerCase());
  return node?.isContentEditable === true;
}

/** Every mod surface carries a `qmm-` or `qws-` class (`qws2` for the oldest ones). */
const MOD_CLASS = /(^|\s)(qmm-|qws-|qws2)/;

function isInsideModSurface(el: unknown): boolean {
  for (let node = el as { className?: unknown; parentElement?: unknown } | null; node; node = node.parentElement as typeof node) {
    if (typeof node.className === "string" && MOD_CLASS.test(node.className)) return true;
  }
  return false;
}

const isModTextField = (el: unknown): boolean => isTextField(el) && isInsideModSurface(el);

let installed = false;

export function installInputKeyTrap(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const trap = (ev: KeyboardEvent) => {
    if (!isModTextField(ev.target) && !isModTextField(document.activeElement)) return;
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  };
  for (const type of ["keydown", "keypress", "keyup"] as const) window.addEventListener(type, trap, true);
}
