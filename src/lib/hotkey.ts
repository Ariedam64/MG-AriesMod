// Keyboard shortcuts as data: matching events, the storage string, the label.

export type Hotkey = {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  code: string;
  key?: string;
};

const MODIFIER_CODES = new Set([
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight",
]);

const MODIFIER_PAIRS = [
  ["AltLeft", "AltRight"],
  ["ControlLeft", "ControlRight"],
  ["ShiftLeft", "ShiftRight"],
  ["MetaLeft", "MetaRight"],
];

/** Same key, treating the left and right copies of a modifier as one. */
export function codesMatch(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  return MODIFIER_PAIRS.some((pair) => pair.includes(expected) && pair.includes(actual));
}

function isMac(): boolean {
  return navigator.platform?.toLowerCase().includes("mac") || /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** The hotkey a keydown describes, or null for a lone modifier unless those are allowed. */
export function eventToHotkey(e: KeyboardEvent, allowModifierOnly = false): Hotkey | null {
  const isModifier = MODIFIER_CODES.has(e.code) || ["Shift", "Control", "Alt", "Meta"].includes(e.key);
  if (isModifier && !allowModifierOnly) return null;
  return { code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
}

export function matchHotkey(e: KeyboardEvent, h: Hotkey | null | undefined): boolean {
  if (!h) return false;
  if (!!h.ctrl !== e.ctrlKey) return false;
  if (!!h.shift !== e.shiftKey) return false;
  if (!!h.alt !== e.altKey) return false;
  if (!!h.meta !== e.metaKey) return false;
  return codesMatch(h.code, e.code);
}

/** Canonical storage string: "Ctrl+Shift+Alt+Meta+KeyK". */
export function hotkeyToString(hk: Hotkey | null): string {
  if (!hk) return "";
  const parts: string[] = [];
  if (hk.ctrl) parts.push("Ctrl");
  if (hk.shift) parts.push("Shift");
  if (hk.alt) parts.push("Alt");
  if (hk.meta) parts.push("Meta");
  if (hk.code) parts.push(hk.code);
  return parts.join("+");
}

export function stringToHotkey(s: string | null | undefined): Hotkey | null {
  if (!s) return null;
  const parts = s.split("+").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const hk: Hotkey = { code: canonicalizeCode(parts.pop() || "") };
  for (const p of parts) {
    const mod = p.toLowerCase();
    if (mod === "ctrl" || mod === "control") hk.ctrl = true;
    else if (mod === "shift") hk.shift = true;
    else if (mod === "alt") hk.alt = true;
    else if (mod === "meta" || mod === "cmd" || mod === "command") hk.meta = true;
  }
  return hk.code ? hk : null;
}

const CANONICAL_CODES: Record<string, string> = {
  space: "Space", enter: "Enter", escape: "Escape", tab: "Tab", backspace: "Backspace", delete: "Delete",
  insert: "Insert", home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown",
  arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
  bracketleft: "BracketLeft", bracketright: "BracketRight", backslash: "Backslash", slash: "Slash",
  minus: "Minus", equal: "Equal", semicolon: "Semicolon", quote: "Quote", backquote: "Backquote",
  comma: "Comma", period: "Period", dot: "Period", capslock: "CapsLock", numlock: "NumLock",
  scrolllock: "ScrollLock", pause: "Pause", contextmenu: "ContextMenu", printscreen: "PrintScreen",
  metaleft: "MetaLeft", metaright: "MetaRight", altleft: "AltLeft", altright: "AltRight",
  controlleft: "ControlLeft", controlright: "ControlRight", shiftleft: "ShiftLeft", shiftright: "ShiftRight",
};

const capitalize = (word: string) => (word ? word[0].toUpperCase() + word.slice(1) : "");

/** Repairs the case of a hand-written or older stored code ("keyk" becomes "KeyK"). */
function canonicalizeCode(rawCode: string): string {
  const trimmed = rawCode.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();

  const letter = lower.match(/^key([a-z])$/);
  if (letter) return `Key${letter[1].toUpperCase()}`;
  const digit = lower.match(/^digit([0-9])$/);
  if (digit) return `Digit${digit[1]}`;
  const numpadDigit = lower.match(/^numpad([0-9])$/);
  if (numpadDigit) return `Numpad${numpadDigit[1]}`;
  if (lower.startsWith("numpad")) {
    const suffix = lower.slice(6);
    return suffix ? `Numpad${CANONICAL_CODES[suffix] ?? capitalize(suffix)}` : "Numpad";
  }
  const fKey = lower.match(/^f([0-9]{1,2})$/);
  if (fKey) return `F${fKey[1]}`;
  const arrow = lower.match(/^arrow([a-z]+)$/);
  if (arrow) return `Arrow${CANONICAL_CODES[arrow[1]] ?? capitalize(arrow[1])}`;
  return CANONICAL_CODES[lower] ?? capitalize(trimmed);
}

function prettyCode(code: string): string {
  if (code === "AltLeft" || code === "AltRight") return "Alt";
  if (code === "ControlLeft" || code === "ControlRight") return "Ctrl";
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "MetaLeft" || code === "MetaRight") return isMac() ? "⌘" : "Meta";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Numpad " + code.slice(6);
  const arrows: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  return arrows[code] ?? code;
}

/** The label a player reads: "Ctrl + Shift + K", or "⌃⇧K" on a Mac. */
export function hotkeyToPretty(h: Hotkey): string {
  const mac = isMac();
  const mods: string[] = [];
  if (h.ctrl) mods.push(mac ? "⌃" : "Ctrl");
  if (h.alt) mods.push(mac ? "⌥" : "Alt");
  if (h.shift) mods.push(mac ? "⇧" : "Shift");
  if (h.meta) mods.push(mac ? "⌘" : "Meta");
  // A modifier bound on its own (Alt alone) already appears among the modifiers.
  const modifierAlone =
    (h.alt && (h.code === "AltLeft" || h.code === "AltRight")) ||
    (h.ctrl && (h.code === "ControlLeft" || h.code === "ControlRight")) ||
    (h.shift && (h.code === "ShiftLeft" || h.code === "ShiftRight")) ||
    (h.meta && (h.code === "MetaLeft" || h.code === "MetaRight"));
  const parts = mods.slice();
  if (!modifierAlone || parts.length === 0) parts.push(prettyCode(h.code));
  return parts.join(mac ? "" : " + ");
}
