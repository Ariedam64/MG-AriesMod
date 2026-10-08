// Ghost mode follows its setting, whether or not the Misc menu was opened.
//
// The controller was created by the Misc menu when its window was first
// built. With the setting saved as on, a reload left the switch showing on
// while the movement keys went to the game as usual, until the player happened
// to open the Misc window. The stop on close was wired to a cleanup that
// nothing ever called, so the menu was never what turned it off either.

import { installFakeDom } from "./_fakeDom";
import { readAriesPath, writeAriesPath } from "../src/platform/storage";

installFakeDom();
const g = globalThis as any;
const windowListeners = new Map<string, Set<unknown>>();
g.addEventListener = (type: string, fn: unknown) => {
  if (!windowListeners.has(type)) windowListeners.set(type, new Set());
  windowListeners.get(type)!.add(fn);
};
g.removeEventListener = (type: string, fn: unknown) => windowListeners.get(type)?.delete(fn);
const keydownListeners = () => windowListeners.get("keydown")?.size ?? 0;

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${String(got)}${ok ? "" : ` (expected ${String(want)})`}`);
};

(async () => {
  writeAriesPath("misc.ghostMode", true);
  const ghost: Record<string, any> = await import("../src/features/misc/ghost");
  const startGhostMode = ghost.startGhostMode as (() => void) | undefined;
  const setGhostEnabled = ghost.setGhostEnabled as ((on: boolean) => void) | undefined;
  check("ghost mode has a startup entry", typeof startGhostMode, "function");
  check("ghost mode has an on/off switch", typeof setGhostEnabled, "function");
  if (!startGhostMode || !setGhostEnabled) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
  }

  check("nothing is captured before startup", keydownListeners(), 0);
  startGhostMode();
  check("with the setting on, startup takes the movement keys", keydownListeners(), 1);

  setGhostEnabled(false);
  check("turning it off gives the keys back", keydownListeners(), 0);
  check("and saves the choice", readAriesPath("misc.ghostMode"), false);

  setGhostEnabled(true);
  setGhostEnabled(true);
  check("turning it on twice captures the keys once", keydownListeners(), 1);
  check("and saves the choice", readAriesPath("misc.ghostMode"), true);

  setGhostEnabled(false);
  startGhostMode();
  check("with the setting off, startup leaves the keys alone", keydownListeners(), 0);

  if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall ghost mode checks passed");
})();
