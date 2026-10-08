// Starts the features that run without their menu being open: keybinds, the
// shop bell, pet team sync and logs, and the overlays drawn on the game.
// The order matches what the mod has always done at this point of startup.

import { startActivityLogFilterPixi } from "./features/activityLog/filterBar";
import { startActivityLogHistoryWatcher } from "./features/activityLog/historyWatcher";
import { installCompanionKeybindsOnce } from "./features/companion/keybind";
import { startCropValueOverlayInPixi } from "./features/cropPrice/badge";
import { startCropValuesObserverFromGardenAtom } from "./features/cropPrice/domTooltip";
import { startHatchTracker } from "./features/hatch/tracker";
import { startInventorySortingObserver } from "./features/inventory/sorting";
import { installGameKeybindsOnce } from "./features/keybinds/gameRemap";
import { installModalToggleKeybinds } from "./features/keybinds/modalToggles";
import { startDecorPickupLockIndicator } from "./features/locker/decorPickupLockIndicator";
import { startEggHatchLockIndicator } from "./features/locker/eggHatchLockIndicator";
import { startLockerIndicatorInPixi } from "./features/locker/indicator";
import { startSellCropsLockWatcher } from "./features/locker/sellCropsLock";
import { renderOverlay } from "./features/notifier/overlay";
import { PetAlertService } from "./features/notifier/petAlerts";
import { startInstantFeedWidget } from "./features/pets/feedWidget";
import { PetsService } from "./features/pets/pets";
import { installPetTeamHotkeys } from "./features/pets/teamHotkeys";
import { startInjectSellAllPets } from "./features/sellAllPets/domButton";
import { installSellKeybindsOnce } from "./features/sellAllPets/keybind";
import { startSellAllPetsPixi } from "./features/sellAllPets/pixiButton";
import { installShopKeybindsOnce } from "./features/shops/shops";

export function startFeatures(): void {
  installShopKeybindsOnce();
  installSellKeybindsOnce();
  installModalToggleKeybinds();
  installGameKeybindsOnce();
  installCompanionKeybindsOnce();

  const mountShopBell = async () => {
    try {
      await renderOverlay();
    } catch (error) {
      console.error("[Aries] shop bell failed to mount:", error);
    }
  };
  if (document.head) void mountShopBell();
  else document.addEventListener("DOMContentLoaded", () => void mountShopBell(), { once: true });

  void (async () => {
    try { await PetAlertService.start(); } catch {}
    try {
      installPetTeamHotkeys((teamId) => {
        PetsService.useTeam(teamId).catch((error) => console.warn("[Pets] hotkey useTeam failed:", error));
      });
    } catch {}
    try { await PetsService.startPetTeamSync(); } catch {}
    try { await PetsService.startAbilityLogsWatcher(); } catch {}
    try { await startActivityLogHistoryWatcher(); } catch {}
    try { await startHatchTracker(); } catch {}
    startActivityLogFilterPixi();
    startCropValuesObserverFromGardenAtom();
    startCropValueOverlayInPixi();
    startSellCropsLockWatcher();
    startDecorPickupLockIndicator();
    startEggHatchLockIndicator();
    startLockerIndicatorInPixi();
    startInjectSellAllPets();
    startSellAllPetsPixi();
    startInstantFeedWidget();
    startInventorySortingObserver();
  })();
}
