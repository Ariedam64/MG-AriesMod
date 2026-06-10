// src/store/bridge.ts
// Cross-mod jotai store sharing protocol.
//
// Problem: two userscripts (this mod + the standalone Community Hub) must NOT
// both run the "write-once" store capture (it temporarily patches atom.write
// on every atom in jotaiAtomCache — two concurrent patchers can corrupt each
// other).
//
// Protocol: the first mod that needs the store publishes a promise under
// pageWindow.__MG_STORE_BRIDGE__ and runs the capture; every other mod (and
// any future mod adopting the protocol) consumes that promise instead of
// capturing again. If a capture attempt resolves to a polyfill (failure),
// the bridge slot is released so the next caller can retry.

import { pageWindow } from "../utils/page-context";
import type { JotaiStore } from "./jotai";

export const STORE_BRIDGE_GLOBAL = "__MG_STORE_BRIDGE__";

type StoreBridge = {
  version: 1;
  owner: string;
  promise: Promise<JotaiStore>;
};

function getBridge(): StoreBridge | null {
  const bridge = (pageWindow as unknown as Record<string, unknown>)[STORE_BRIDGE_GLOBAL] as
    | StoreBridge
    | undefined;
  if (bridge && typeof bridge === "object" && typeof bridge.promise?.then === "function") {
    return bridge;
  }
  return null;
}

/**
 * Acquire the shared jotai store. `capture` is only invoked when no other mod
 * already published a (non-failed) capture on this page.
 */
export function acquireSharedStore(
  owner: string,
  capture: () => Promise<JotaiStore>,
): Promise<JotaiStore> {
  const existing = getBridge();
  if (existing) return existing.promise;

  const promise = capture().then((store) => {
    if (store.__polyfill) {
      // Failed capture: release the slot so any mod can retry later.
      const current = getBridge();
      if (current && current.promise === promise) {
        delete (pageWindow as unknown as Record<string, unknown>)[STORE_BRIDGE_GLOBAL];
      }
    }
    return store;
  });

  (pageWindow as unknown as Record<string, unknown>)[STORE_BRIDGE_GLOBAL] = {
    version: 1,
    owner,
    promise,
  } satisfies StoreBridge;

  return promise;
}
