// src/data/dynamic/state.ts

import type { CaptureState } from "./types";
import { pageWindow } from "../../utils/page-context";

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
      enums: null,
    },
    fetchStarted: false,
    fetchComplete: false,
    colorPollingTimer: null,
    colorPollAttempts: 0,
  };
}

const STATE_GLOBAL_KEY = "__MG_DATA_STATE__";

const globals = pageWindow as unknown as Record<string, unknown>;

export const captureState: CaptureState =
  (globals[STATE_GLOBAL_KEY] as CaptureState | undefined) ?? createInitialState();
globals[STATE_GLOBAL_KEY] = captureState;
