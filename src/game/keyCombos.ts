/** Key combos as strings ("KeyE", "Shift+Space", "Ctrl+KeyQ") and the events they describe. */

export type Combo = string;

export interface ComboSpec {
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/** A remap target: modifiers left undefined follow the original event. */
export interface RemapSpec {
  code?: string;
  key?: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

const MODIFIER_ORDER = ["ctrl", "shift", "alt", "meta"];

const KEYCODE_TABLE: Record<string, number> = {
  KeyA:65,KeyB:66,KeyC:67,KeyD:68,KeyE:69,KeyF:70,KeyG:71,KeyH:72,KeyI:73,KeyJ:74,KeyK:75,KeyL:76,KeyM:77,
  KeyN:78,KeyO:79,KeyP:80,KeyQ:81,KeyR:82,KeyS:83,KeyT:84,KeyU:85,KeyV:86,KeyW:87,KeyX:88,KeyY:89,KeyZ:90,
  Digit0:48,Digit1:49,Digit2:50,Digit3:51,Digit4:52,Digit5:53,Digit6:54,Digit7:55,Digit8:56,Digit9:57,
  Space:32, Enter:13, Escape:27, Tab:9, Backspace:8, Delete:46, Insert:45,
  ArrowLeft:37, ArrowUp:38, ArrowRight:39, ArrowDown:40,
};

/** The `key` a physical `code` produces. */
export const codeToKey = (code?: string, shift = false): string => {
  if (!code) return "";
  if (/^Key[A-Z]$/.test(code)) return shift ? code.slice(3).toUpperCase() : code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code === "Space") return " ";
  return code;
};

/** The legacy keyCode for a code or key, for games that still read it. */
export const keyCodeOf = (code: string, key: string): number =>
  KEYCODE_TABLE[code] ?? (key && key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);

export const isEditableTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  const ce = el.getAttribute && el.getAttribute("contenteditable");
  return !!(ce && ce !== "false");
};

function modifierOf(part: string): "ctrl" | "shift" | "alt" | "meta" | null {
  const p = part.toLowerCase();
  if (p === "ctrl" || p === "control") return "ctrl";
  if (p === "shift") return "shift";
  if (p === "alt") return "alt";
  if (p === "meta" || p === "cmd" || p === "command" || p === "win") return "meta";
  return null;
}

/** The combo's code and modifiers. */
export function parseComboSpec(c: Combo): ComboSpec {
  const spec: ComboSpec = { code: "", ctrl: false, shift: false, alt: false, meta: false };
  for (const part of String(c).split("+").map((s) => s.trim()).filter(Boolean)) {
    const mod = modifierOf(part);
    if (mod) spec[mod] = true;
    else spec.code = part;
  }
  return spec;
}

/** The same as `parseComboSpec`, as a remap target with its `key` filled in. */
export function parseCombo(c: Combo): RemapSpec {
  const parsed = parseComboSpec(c);
  const spec: RemapSpec = {};
  for (const mod of MODIFIER_ORDER as Array<keyof RemapSpec>) {
    if (parsed[mod as keyof ComboSpec]) (spec as any)[mod] = true;
  }
  if (parsed.code) {
    spec.code = parsed.code;
    spec.key = codeToKey(parsed.code, !!spec.shift);
  }
  return spec;
}

function joinModifiers(mods: string[], code: string): string {
  mods.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  return (mods.length ? mods.join("+") + "+" : "") + code;
}

/** A combo in canonical form ("ctrl+shift+KeyQ"), so two spellings compare equal. */
export function normalizeCombo(c: Combo): string {
  const mods: string[] = [];
  let code = "";
  for (const part of String(c).split("+").map((s) => s.trim()).filter(Boolean)) {
    const mod = modifierOf(part);
    if (mod) mods.push(mod);
    else code = part;
  }
  return joinModifiers(mods, code);
}

/** The canonical combo of a keyboard event. */
export function eventToCombo(e: KeyboardEvent): string {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("ctrl");
  if (e.shiftKey) mods.push("shift");
  if (e.altKey) mods.push("alt");
  if (e.metaKey) mods.push("meta");
  return joinModifiers(mods, e.code || "");
}

/** A spec back to a readable combo ("Ctrl+Shift+KeyQ"). */
export function formatCombo(c: { code?: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }): Combo {
  const mods: string[] = [];
  if (c.ctrl) mods.push("Ctrl");
  if (c.shift) mods.push("Shift");
  if (c.alt) mods.push("Alt");
  if (c.meta) mods.push("Meta");
  return (mods.length ? mods.join("+") + "+" : "") + (c.code || "");
}
