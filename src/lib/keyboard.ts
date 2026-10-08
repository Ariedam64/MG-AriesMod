// src/utils/keyboard.ts

/**
 * True while a hotkey button is listening for the next keypress (rebinding).
 * Kept here (a leaf module) so every keydown consumer can check it without
 * importing the UI layer.
 */
let keybindCaptureCount = 0;

export function isKeybindCaptureActive(): boolean {
  return keybindCaptureCount > 0;
}

export function beginKeybindCapture(): void {
  keybindCaptureCount++;
}

export function endKeybindCapture(): void {
  keybindCaptureCount = Math.max(0, keybindCaptureCount - 1);
}

/**
 * Determines whether a keyboard event should be ignored because the user is typing
 * inside an editable element, or because they are currently recording a new keybind
 * (in that case the keypress belongs to the rebinding UI, not to any action).
 */
export function shouldIgnoreKeydown(e: KeyboardEvent): boolean {
  if (isKeybindCaptureActive()) return true;
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}
