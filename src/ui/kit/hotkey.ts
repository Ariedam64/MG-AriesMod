// A button that records the next keypress as a shortcut.

import { beginKeybindCapture, endKeybindCapture } from "../../lib/keyboard";
import { eventToHotkey, hotkeyToPretty, type Hotkey } from "../../lib/hotkey";
import { h } from "./dom";

export type HotkeyButtonElement = HTMLButtonElement & {
  refreshHotkey: (hk: Hotkey | null) => void;
};

export type HotkeyButtonOptions = {
  emptyLabel?: string;
  listeningLabel?: string;
  /** Backspace, Delete or a right click clears the binding. */
  clearable?: boolean;
  /** Accepts a lone modifier (Alt on its own) as the shortcut. */
  allowModifierOnly?: boolean;
};

/** Only one hotkey button listens to the keyboard at a time. */
let activeRecorder: (() => void) | null = null;
/** Safety net: a forgotten recording stops on its own. */
const RECORDING_TIMEOUT_MS = 8000;

export function hotkeyButton(
  initial: Hotkey | null,
  onChange?: (hk: Hotkey | null) => void,
  opts: HotkeyButtonOptions = {},
): HotkeyButtonElement {
  const emptyLabel = opts.emptyLabel ?? "None";
  const listeningLabel = opts.listeningLabel ?? "Press a key…";
  const clearable = opts.clearable ?? true;
  let hk: Hotkey | null = initial ?? null;
  let recording = false;
  let recordingTimeout: number | null = null;

  const btn = h("button", "qmm-hotkey") as HotkeyButtonElement;
  btn.type = "button";
  btn.setAttribute("aria-live", "polite");

  const render = () => {
    btn.classList.toggle("is-recording", recording);
    btn.classList.toggle("is-empty", !hk);
    btn.classList.toggle("is-assigned", !recording && !!hk);
    if (recording) {
      btn.textContent = listeningLabel;
      btn.title = "Listening… press a key (Esc to cancel, Backspace to clear)";
    } else if (!hk) {
      btn.textContent = emptyLabel;
      btn.title = "No key assigned";
    } else {
      btn.textContent = hotkeyToPretty(hk);
      btn.title = "Click to rebind • Right-click to clear";
    }
  };

  const setHotkey = (value: Hotkey | null) => {
    hk = value ? { ...value } : null;
  };
  const commit = (value: Hotkey | null) => {
    setHotkey(value);
    onChange?.(hk);
  };

  btn.refreshHotkey = (value) => {
    setHotkey(value);
    render();
  };

  // Recording must always end: on a click elsewhere, when the window loses
  // focus, when the menu closes, or on the timeout. A listener left armed used
  // to capture the next key pressed anywhere (often Alt+X to open the menu) and
  // rebind this action to it, overwriting the existing shortcut.
  const stopRecording = () => {
    if (!recording) return;
    recording = false;
    if (activeRecorder === stopRecording) activeRecorder = null;
    window.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("blur", onWindowBlur);
    if (recordingTimeout !== null) clearTimeout(recordingTimeout);
    recordingTimeout = null;
    endKeybindCapture();
    render();
  };

  const startRecording = () => {
    if (recording) return;
    activeRecorder?.();
    recording = true;
    activeRecorder = stopRecording;
    beginKeybindCapture();
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    // Not capturing: only the window's own blur reaches here. Element blurs,
    // like the one btn.focus() below causes, would cancel the recording at once.
    window.addEventListener("blur", onWindowBlur);
    recordingTimeout = window.setTimeout(stopRecording, RECORDING_TIMEOUT_MS);
    render();
  };

  const onPointerDown = (e: Event) => {
    if (e.target instanceof Node && btn.contains(e.target)) return;
    stopRecording();
  };

  const onWindowBlur = (e: Event) => {
    if (e.target === window) stopRecording();
  };

  function onKeyDown(e: KeyboardEvent): void {
    if (!recording) return;
    // The button left the DOM (menu closed or re-rendered) while listening:
    // give up rather than bind the key to an action nobody can see.
    if (!btn.isConnected) {
      stopRecording();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape") {
      stopRecording();
      return;
    }
    if ((e.key === "Backspace" || e.key === "Delete") && clearable) {
      commit(null);
      stopRecording();
      return;
    }
    // A lone modifier waits for the real key unless modifiers may stand alone.
    const next = eventToHotkey(e, opts.allowModifierOnly ?? false);
    if (!next) return;
    commit(next);
    stopRecording();
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (recording) {
      stopRecording();
      return;
    }
    startRecording();
    btn.focus();
  });

  if (clearable) {
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!hk) return;
      commit(null);
      render();
    });
  }

  render();
  return btn;
}
