// Ghost mode follows its setting, whether or not the Misc menu was opened.
//
// The controller was created by the Misc menu when its window was first
// built. With the setting saved as on, a reload left the switch showing on
// while the movement keys went to the game as usual, until the player happened
// to open the Misc window. The stop on close was wired to a cleanup that
// nothing ever called, so the menu was never what turned it off either.

import { checkEqual, done, run } from "./_check";
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

run(async () => {
  writeAriesPath("misc.ghostMode", true);
  const ghost: Record<string, any> = await import("../src/features/misc/ghost");
  const startGhostMode = ghost.startGhostMode as (() => void) | undefined;
  const setGhostEnabled = ghost.setGhostEnabled as ((on: boolean) => void) | undefined;
  checkEqual("ghost mode has a startup entry", typeof startGhostMode, "function");
  checkEqual("ghost mode has an on/off switch", typeof setGhostEnabled, "function");
  if (!startGhostMode || !setGhostEnabled) done();

  checkEqual("nothing is captured before startup", keydownListeners(), 0);
  startGhostMode();
  checkEqual("with the setting on, startup takes the movement keys", keydownListeners(), 1);

  setGhostEnabled(false);
  checkEqual("turning it off gives the keys back", keydownListeners(), 0);
  checkEqual("and saves the choice", readAriesPath("misc.ghostMode"), false);

  setGhostEnabled(true);
  setGhostEnabled(true);
  checkEqual("turning it on twice captures the keys once", keydownListeners(), 1);
  checkEqual("and saves the choice", readAriesPath("misc.ghostMode"), true);

  setGhostEnabled(false);
  startGhostMode();
  checkEqual("with the setting off, startup leaves the keys alone", keydownListeners(), 0);

});
