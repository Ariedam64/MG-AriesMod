// src/data/dynamic/state.ts

import type { CaptureState } from "./types";
import { pageWindow } from "../../utils/page-context";

const pageContext = pageWindow as Window & typeof globalThis;

export const NativeObject = pageContext.Object ?? Object;
export const originalObjectKeys = NativeObject.keys;
export const originalObjectValues = NativeObject.values;
export const originalObjectEntries = NativeObject.entries;

export const visitedObjects = new WeakSet<object>();

function createInitialState(): CaptureState {
  return {
    data: {
      items: null,
      decor: null,
      mutations: null,
      eggs: null,
      pets: null,
      abilities: null,
      plants: null,
      weather: null,
    },
    isHookInstalled: false,
    scanInterval: null,
    scanAttempts: 0,
    weatherPollingTimer: null,
    weatherPollAttempts: 0,
    colorPollingTimer: null,
    colorPollAttempts: 0,
  };
}

const STATE_GLOBAL_KEY = "__MG_DATA_STATE__";

export const captureState: CaptureState =
  (pageWindow as Record<string, unknown>)[STATE_GLOBAL_KEY] as CaptureState || createInitialState();

if (!(pageWindow as Record<string, unknown>)[STATE_GLOBAL_KEY]) {
  (pageWindow as Record<string, unknown>)[STATE_GLOBAL_KEY] = captureState;
}
