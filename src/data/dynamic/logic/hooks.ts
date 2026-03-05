// src/data/dynamic/logic/hooks.ts

import { captureState, NativeObject, originalObjectKeys, originalObjectValues, originalObjectEntries } from "../state";
import { tryCapture } from "./capture";

export function installObjectHooks(): void {
  if (captureState.isHookInstalled) return;

  if ((NativeObject as Record<string, unknown>).__MG_HOOKED__) {
    captureState.isHookInstalled = true;
    return;
  }
  (NativeObject as Record<string, unknown>).__MG_HOOKED__ = true;
  captureState.isHookInstalled = true;

  try {
    NativeObject.keys = function hookedKeys(target: object): string[] {
      tryCapture(target);
      return originalObjectKeys.apply(this, arguments as unknown as [object]);
    };

    if (originalObjectValues) {
      NativeObject.values = function hookedValues(target: object): unknown[] {
        tryCapture(target);
        return (originalObjectValues as Function).apply(this, arguments as unknown as [object]);
      };
    }

    if (originalObjectEntries) {
      NativeObject.entries = function hookedEntries(target: object): [string, unknown][] {
        tryCapture(target);
        return (originalObjectEntries as Function).apply(this, arguments as unknown as [object]);
      };
    }
  } catch {
    // Ignore hook installation errors
  }
}

export function restoreObjectHooks(): void {
  if (!captureState.isHookInstalled) return;
  try {
    NativeObject.keys = originalObjectKeys;
    if (originalObjectValues) NativeObject.values = originalObjectValues;
    if (originalObjectEntries) NativeObject.entries = originalObjectEntries;
  } catch {
    // Ignore restoration errors
  }
  captureState.isHookInstalled = false;
}
