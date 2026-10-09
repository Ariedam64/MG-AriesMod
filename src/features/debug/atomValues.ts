// How the Live atoms tab copies and prints the values it records.

/** A deep copy, so a later mutation of the game's object cannot rewrite history. */
export function snapshot<T = any>(value: T): T {
  if (value == null) return value;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export function stringify(value: any): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); }
  catch { return String(value); }
}

/** One line of at most 140 characters. */
export function summarizeValue(value: any): string {
  const str = stringify(value).replace(/\s+/g, " ").trim();
  return str.length > 140 ? str.slice(0, 140) + "…" : str;
}
