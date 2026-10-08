import { clamp } from "../../lib/math";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { readStoredFlag, writeStoredFlag } from "../misc/storedFlag";

/**
 * Reconnecting after a session conflict is switched off at the request of the
 * game developers. The code and the player's settings stay so it can come
 * back: set this to false to restore the toggle and the reconnect.
 */
export const AUTO_RECO_TEMPORARILY_DISABLED = true;

const PATH_ENABLED = "misc.autoRecoEnabled";
const PATH_DELAY = "misc.autoRecoDelayMs";
const MAX_DELAY_MS = 5 * 60_000;
const DEFAULT_DELAY_MS = 60_000;

export const readAutoRecoEnabled = (): boolean => readStoredFlag(PATH_ENABLED);
export const writeAutoRecoEnabled = (on: boolean): void => writeStoredFlag(PATH_ENABLED, on);

const normalizeDelay = (ms: number): number =>
  clamp(Number.isFinite(ms) ? Math.floor(ms) : DEFAULT_DELAY_MS, 0, MAX_DELAY_MS);

/** How long to wait before reconnecting, in milliseconds. */
export function readAutoRecoDelayMs(): number {
  try {
    const raw = Number(readAriesPath<unknown>(PATH_DELAY));
    if (Number.isFinite(raw)) return normalizeDelay(raw);
  } catch {}
  return DEFAULT_DELAY_MS;
}

export function writeAutoRecoDelayMs(ms: number): void {
  try {
    writeAriesPath(PATH_DELAY, normalizeDelay(ms));
  } catch {}
}
