// The settings a bug report may carry: on/off switches and small choices that
// change how the mod behaves. A whitelist, never the `aries_mod` blob: that
// holds saved gardens, sound files and histories (megabytes), and the API key
// lives in GM storage, which nothing here reads.

import { readAriesPath } from "../../platform/storage";

export const REPORTED_SETTINGS: readonly string[] = [
  "misc.ghostMode",
  "misc.ghostDelayMs",
  "misc.autoRecoEnabled",
  "misc.autoRecoDelayMs",
  "misc.keepInventorySlotFree",
  "misc.autoStoreSeedSiloEnabled",
  "misc.autoStoreDecorShedEnabled",
  "misc.autoStoreToolShackEnabled",
  "misc.showCropPrice",
  "misc.showDebugMenu",
  "pets.instantFeedWidget.enabled",
  "pets.teamSync",
  "notifier.floatingBell.enabled",
  "notifications.soundEnabled",
  "skins.enabled",
  "editor.enabled",
  "inventory.showValues",
  "inventory.sortKey",
  "inventory.sortDirection",
  "ui.appearance.theme",
  "ui.appearance.scale",
  "hud.hidden",
  "hud.dockFolded",
];

/** Longest string value carried: a setting longer than this is not a switch. */
const MAX_STRING = 40;

/**
 * The whitelisted settings the player changed, path to value. Only booleans,
 * numbers and short strings: an unset path is left out (it means the
 * default), and so is anything shaped like data rather than a switch.
 */
export function readReportedSettings(): Record<string, boolean | number | string> {
  const out: Record<string, boolean | number | string> = {};
  for (const path of REPORTED_SETTINGS) {
    let value: unknown;
    try {
      value = readAriesPath<unknown>(path);
    } catch {
      continue;
    }
    if (typeof value === "boolean") out[path] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[path] = value;
    else if (typeof value === "string" && value.length <= MAX_STRING) out[path] = value;
  }
  return out;
}
