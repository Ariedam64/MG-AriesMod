import { readAriesPath, writeAriesPath } from "../../platform/storage";

/**
 * Reads an on/off setting. Older builds stored some of these as `"1"`/`"0"`
 * or `1`/`0`, so those still read as the boolean they meant. A missing value
 * is off.
 */
export function readStoredFlag(path: string): boolean {
  try {
    const stored = readAriesPath<unknown>(path);
    if (typeof stored === "boolean") return stored;
    if (stored === "1" || stored === 1) return true;
    if (stored === "0" || stored === 0) return false;
    return !!stored;
  } catch {
    return false;
  }
}

export function writeStoredFlag(path: string, on: boolean): void {
  try {
    writeAriesPath(path, !!on);
  } catch {}
}
