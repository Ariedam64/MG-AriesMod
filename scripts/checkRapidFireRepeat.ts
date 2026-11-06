// Rapid fire on Action must send taps the game accepts (BR-34).
//
// Holding Action with Rapid fire on taps Space at 10 Hz: a keydown, then a
// keyup 20 ms later. Since build 1897 the game's global hotkey handler runs
// the action only for a keydown that is not a repeat and while the key is not
// already held:
//
//   s&&!this.isKeyPressed&&!i.repeat&&(..., this.isKeyPressed=!0, ..., s())
//
// and its keyup clears isKeyPressed. Every synthetic tap went out with
// `repeat: true`, so the game dropped them all: only the physical press
// placed an item, then nothing while the key stayed down. The fake game below
// applies the same rule on the canvas the taps land on.
//
// Run with: npm run check:rapidfirerepeat
import "./_keyboardDom";
import { check, checkEqual, run } from "./_check";
import { installGameKeybindsOnce } from "../src/features/keybinds/gameRemap";
import { setKeybindHoldDetection } from "../src/features/keybinds/keybinds";
import { sleep } from "../src/lib/async";

/** Three ticks of the 10 Hz loop after the first, with room to spare. */
const HOLD_MS = 350;

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

/** What the synthetic keys looked like, in order. */
const seen: Array<{ type: string; repeat: boolean }> = [];

// The game's rule from build 1897, applied to what reaches the canvas.
let isKeyPressed = false;
let actions = 0;
canvas.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.code !== "Space") return;
  seen.push({ type: "keydown", repeat: !!event.repeat });
  if (!isKeyPressed && !event.repeat) {
    isKeyPressed = true;
    actions++;
  }
});
canvas.addEventListener("keyup", (event: KeyboardEvent) => {
  if (event.code !== "Space") return;
  seen.push({ type: "keyup", repeat: !!event.repeat });
  isKeyPressed = false;
});

function physical(type: "keydown" | "keyup"): void {
  const event = {
    type, code: "Space", key: " ", target: canvas, repeat: false,
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {},
  };
  window.dispatchEvent(event as unknown as Event);
}

run(async () => {
  setKeybindHoldDetection("game.action", true);
  installGameKeybindsOnce();

  physical("keydown");
  await sleep(HOLD_MS);
  physical("keyup");
  await sleep(50);

  const keydowns = seen.filter((e) => e.type === "keydown");
  check("holding Action sends several synthetic taps", keydowns.length >= 3, `${keydowns.length} synthetic keydowns in ${HOLD_MS} ms`);

  const repeated = keydowns.filter((e) => e.repeat).length;
  checkEqual("no synthetic tap keydown is marked as a repeat", repeated, 0);

  // Each tap is a full press: its keyup comes before the next keydown.
  let paired = true;
  seen.forEach((event, i) => {
    if (event.type === "keydown" && seen[i + 1]?.type !== "keyup") paired = false;
  });
  check("every synthetic keydown is followed by its keyup", paired, JSON.stringify(seen.map((e) => e.type)));

  check(
    "the game runs the action on every tap while Action is held",
    actions === keydowns.length && actions >= 3,
    `the game ran ${actions} actions for ${keydowns.length} synthetic taps (it ignores a keydown with repeat set)`,
  );
});
