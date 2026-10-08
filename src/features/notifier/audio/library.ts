import { readAriesPath, writeAriesPath } from "../../../platform/storage";
import { DEFAULT_SOUND_MP3_BASE64 } from "./defaultSound";

/**
 * The player's sound library: name to data URL, kept in storage. The built-in
 * "Default" sound is always there, first, and is never stored or removed.
 */

const LIBRARY_PATH = "audio.library";

const BUILTIN_SOUND_NAME = "Default";

// The MIME type may carry parameters: a sound re-encoded by MediaRecorder is
// "data:audio/webm;codecs=opus;base64,...".
const DATA_URL_RE = /^data:audio\/[a-z0-9.+-]+(?:;[a-z0-9.+-]+=[^;,]*)*;base64,/i;

export const looksLikeDataUrl = (s: string): boolean => DATA_URL_RE.test(s.trim());

/** A data URL from a data URL or bare base64. */
export function toDataUrl(dataOrBase64: string, mime = "audio/mpeg"): string {
  const s = (dataOrBase64 || "").trim();
  if (!s) return "";
  return looksLikeDataUrl(s) ? s : `data:${mime};base64,${s}`;
}

export class SoundLibrary {
  private readonly sounds = new Map<string, string>();
  private readonly builtinDataUrl = toDataUrl(DEFAULT_SOUND_MP3_BASE64);

  constructor() {
    this.sounds.set(BUILTIN_SOUND_NAME, this.builtinDataUrl);
  }

  load(): void {
    const stored = readAriesPath<unknown>(LIBRARY_PATH);
    if (!Array.isArray(stored)) return;
    this.sounds.clear();
    this.sounds.set(BUILTIN_SOUND_NAME, this.builtinDataUrl);
    for (const entry of stored) {
      const name = String(entry?.name || "").trim();
      const data = String(entry?.data || "").trim();
      if (!name || !data || name === BUILTIN_SOUND_NAME) continue;
      this.sounds.set(name, toDataUrl(data));
    }
  }

  private save(): void {
    const entries: Array<{ name: string; data: string }> = [];
    for (const [name, data] of this.sounds) {
      if (name !== BUILTIN_SOUND_NAME) entries.push({ name, data });
    }
    writeAriesPath(LIBRARY_PATH, entries);
  }

  names(): string[] {
    return Array.from(this.sounds.keys());
  }

  has(name: string): boolean {
    return this.sounds.has(name);
  }

  get(name: string): string | undefined {
    return this.sounds.get(name);
  }

  isBuiltin(name: string): boolean {
    return name === BUILTIN_SOUND_NAME;
  }

  /** Adds or replaces a sound. */
  add(name: string, dataUrl: string): void {
    this.sounds.set(name, dataUrl);
    this.save();
  }

  /** Removes a sound; the built-in one stays. Returns whether anything was removed. */
  remove(name: string): boolean {
    if (this.isBuiltin(name) || !this.sounds.delete(name)) return false;
    this.save();
    return true;
  }

  /** A name not taken yet, from a file name: "Ding", then "Ding (2)"... */
  uniqueName(raw: string): string {
    const base = String(raw || "Sound").replace(/\.[a-z0-9]+$/i, "").trim() || "Sound";
    if (!this.sounds.has(base)) return base;
    let i = 2;
    while (this.sounds.has(`${base} (${i})`)) i++;
    return `${base} (${i})`;
  }
}
