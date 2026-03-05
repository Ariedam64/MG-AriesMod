// src/data/dynamic/logic/scanning.ts

import { pageWindow } from "../../../utils/page-context";
import { captureState, originalObjectKeys } from "../state";
import { MAX_SCAN_ATTEMPTS, PULSE_SCAN_INTERVAL_MS } from "./constants";
import { isAllDataCaptured, tryCapture } from "./capture";

export function startPulseScanning(): void {
  if (captureState.scanInterval || isAllDataCaptured()) return;

  const runPulse = () => {
    if (isAllDataCaptured() || captureState.scanAttempts > MAX_SCAN_ATTEMPTS) {
      stopPulseScanning();
      return;
    }

    captureState.scanAttempts++;
    try {
      originalObjectKeys(pageWindow).forEach((key) => {
        try {
          tryCapture((pageWindow as Record<string, unknown>)[key]);
        } catch {
          // Ignore errors
        }
      });
    } catch {
      // Ignore errors
    }
  };

  runPulse();
  captureState.scanInterval = setInterval(runPulse, PULSE_SCAN_INTERVAL_MS);
}

export function stopPulseScanning(): void {
  if (captureState.scanInterval) {
    clearInterval(captureState.scanInterval);
    captureState.scanInterval = null;
  }
}
