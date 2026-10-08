// The editor's side panels live outside the HUD windows, whose own key trap
// does not cover them, so their typed fields guard themselves.

/** Keeps the game's hotkeys from firing while the player types in `input`. */
export function blockGameKeys(input: HTMLInputElement): void {
  const stop = (ev: Event) => {
    ev.stopImmediatePropagation();
    ev.stopPropagation();
  };
  input.addEventListener("focus", () => {
    window.addEventListener("keydown", stop, true);
    window.addEventListener("keyup", stop, true);
  });
  input.addEventListener("blur", () => {
    window.removeEventListener("keydown", stop, true);
    window.removeEventListener("keyup", stop, true);
  });
  input.addEventListener("keydown", stop);
}

/** Strips everything but digits, a minus and a dot from a size field as the player types. */
export function keepSizeCharacters(input: HTMLInputElement): void {
  input.addEventListener("input", () => {
    const cleaned = input.value.replace(/[^0-9.-]/g, "");
    if (cleaned !== input.value) input.value = cleaned;
  });
}
