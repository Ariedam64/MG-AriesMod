// src/data/dynamic/logic/accessors.ts

import type { DataKey, DataBag } from "../types";
import { captureState } from "../state";

const DEFAULT_WAIT_TIMEOUT_MS = 5000;
const WAIT_POLL_INTERVAL_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getData<K extends DataKey>(key: K): DataBag[K] {
  return captureState.data[key];
}

export function getAllData(): DataBag {
  return { ...captureState.data };
}

export function hasData(key: DataKey): boolean {
  return captureState.data[key] != null;
}

export async function waitForData(
  key: DataKey,
  timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
  intervalMs: number = WAIT_POLL_INTERVAL_MS
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = captureState.data[key];
    if (value != null) return value;
    await sleep(intervalMs);
  }
  throw new Error(`MGData.waitFor: timeout waiting for "${key}"`);
}

export async function waitForAnyData(
  timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
  intervalMs: number = WAIT_POLL_INTERVAL_MS
): Promise<DataBag> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (Object.values(captureState.data).some((v) => v != null)) {
      return { ...captureState.data };
    }
    await sleep(intervalMs);
  }
  throw new Error("MGData.waitForAnyData: timeout");
}
