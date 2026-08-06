import { Atoms } from "../store/atoms";
import { closeModal, openModal } from "./fakeModal";
import { eventMatchesKeybind, type KeybindId } from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";

const ACTION_ID: KeybindId = "game.weather-station";
const WEATHER_STATION_MODAL_ID = "weatherStation";

let weatherStationKeybindsInstalled = false;

async function toggleWeatherStationModal(): Promise<void> {
  try {
    const current = await Atoms.ui.activeModal.get();
    if (current === WEATHER_STATION_MODAL_ID) {
      await closeModal(WEATHER_STATION_MODAL_ID);
      return;
    }
    await openModal(WEATHER_STATION_MODAL_ID);
  } catch {
    // ignore failures
  }
}

export function installWeatherStationKeybindsOnce(): void {
  if (weatherStationKeybindsInstalled || typeof window === "undefined") return;
  weatherStationKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      if (!eventMatchesKeybind(ACTION_ID, event)) return;

      event.preventDefault();
      event.stopPropagation();
      void toggleWeatherStationModal();
    },
    true
  );
}
