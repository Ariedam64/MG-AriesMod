import type { CaptureState } from "./types";
import { pageWindow } from "../../platform/pageContext";

// Kept on the page window so a second copy of the script shares the same data
// instead of fetching it again.
const STATE_GLOBAL_KEY = "__MG_DATA_STATE__";

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
    colorPollingTimer: null,
    colorPollAttempts: 0,
  };
}

export const captureState: CaptureState = (pageWindow[STATE_GLOBAL_KEY] as CaptureState | undefined) ?? createInitialState();
pageWindow[STATE_GLOBAL_KEY] = captureState;
