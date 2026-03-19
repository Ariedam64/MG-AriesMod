// src/data/dynamic/logic/capture.ts

import type { CapturedDataKey } from "../types";
import { captureState, visitedObjects, originalObjectKeys } from "../state";
import { SIGNATURE_KEYS, MAX_SCAN_DEPTH } from "./constants";
import { restoreObjectHooks } from "./hooks";

const containsAllKeys = (objectKeys: string[], requiredKeys: readonly string[]) =>
  requiredKeys.every((key) => objectKeys.includes(key));

function setCapturedData(key: CapturedDataKey, value: Record<string, unknown>): void {
  if (captureState.data[key] != null) return;
  captureState.data[key] = value;

  try {
    window.dispatchEvent(new CustomEvent("gemini:data-updated", { detail: { key } }));
  } catch {
    /* ignore in non-browser contexts */
  }

  if (isAllDataCaptured()) {
    restoreObjectHooks();
  }
}

export function isAllDataCaptured(): boolean {
  return Object.values(captureState.data).every((v) => v != null);
}

function scanObjectForData(obj: unknown, depth: number): void {
  if (!obj || typeof obj !== "object" || visitedObjects.has(obj)) return;
  visitedObjects.add(obj);

  let keys: string[];
  try {
    keys = originalObjectKeys(obj);
  } catch {
    return;
  }
  if (!keys || keys.length === 0) return;

  const record = obj as Record<string, unknown>;
  let sample: unknown;

  if (!captureState.data.items && containsAllKeys(keys, SIGNATURE_KEYS.items)) {
    sample = record.WateringCan;
    if (sample && typeof sample === "object" && "coinPrice" in sample && "creditPrice" in sample) {
      setCapturedData("items", record);
    }
  }

  if (!captureState.data.decor && containsAllKeys(keys, SIGNATURE_KEYS.decor)) {
    sample = record.SmallRock;
    if (sample && typeof sample === "object" && "coinPrice" in sample && "creditPrice" in sample) {
      setCapturedData("decor", record);
    }
  }

  if (!captureState.data.mutations && containsAllKeys(keys, SIGNATURE_KEYS.mutations)) {
    sample = record.Gold;
    if (sample && typeof sample === "object" && "baseChance" in sample && "coinMultiplier" in sample) {
      setCapturedData("mutations", record);
    }
  }

  if (!captureState.data.eggs && containsAllKeys(keys, SIGNATURE_KEYS.eggs)) {
    sample = record.CommonEgg;
    if (sample && typeof sample === "object" && "faunaSpawnWeights" in sample && "secondsToHatch" in sample) {
      setCapturedData("eggs", record);
    }
  }

  if (!captureState.data.pets && containsAllKeys(keys, SIGNATURE_KEYS.pets)) {
    sample = record.Worm;
    if (sample && typeof sample === "object" && "coinsToFullyReplenishHunger" in sample && "diet" in sample && Array.isArray((sample as Record<string, unknown>).diet)) {
      setCapturedData("pets", record);
    }
  }

  if (!captureState.data.abilities && containsAllKeys(keys, SIGNATURE_KEYS.abilities)) {
    sample = record.ProduceScaleBoost;
    if (sample && typeof sample === "object" && "trigger" in sample && "baseParameters" in sample) {
      setCapturedData("abilities", record);
    }
  }

  if (!captureState.data.plants && containsAllKeys(keys, SIGNATURE_KEYS.plants)) {
    sample = record.Carrot;
    if (sample && typeof sample === "object" && "seed" in sample && "plant" in sample && "crop" in sample) {
      setCapturedData("plants", record);
    }
  }

  if (depth >= MAX_SCAN_DEPTH) return;

  for (const key of keys) {
    let child: unknown;
    try {
      child = record[key];
    } catch {
      continue;
    }
    if (child && typeof child === "object") {
      scanObjectForData(child, depth + 1);
    }
  }
}

export function tryCapture(target: unknown): void {
  try {
    scanObjectForData(target, 0);
  } catch {
    // Ignore capture errors
  }
}
