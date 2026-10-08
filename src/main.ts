// src/main.ts
import "./game/sprites";
import { installPageWebSocketHook } from "./game/ws/socketHook";
import { startAutoReco } from "./features/autoReco/autoReco";
import { installEditorOutgoingRules } from "./features/editor/outgoingRules";
import { installInventoryReserve } from "./features/misc/inventoryReserve";
import { installLockerOutgoingRules } from "./features/locker/outgoingRules";
import { installStatsCounters } from "./features/stats/outgoingCounters";
import { mountHUD, initWatchers } from "./ui/hud";

import { renderDebugDataMenu } from "./features/debug/menu";
import { renderLockerMenu } from "./features/locker/menu";
import { renderCalculatorMenu } from "./features/calculator/menu";
import { renderPetsMenu } from "./features/pets/menu";
import { renderMiscMenu } from "./features/misc/menu";
import { renderSettingsMenu } from "./features/settings/menu";
import { renderNotifierMenu } from "./features/notifier/menu";
import { renderToolsMenu } from "./features/tools/menu";
import { renderEditorMenu } from "./features/editor/menu";
import { renderKeybindsMenu } from "./features/keybinds/menu";
import { renderRoomMenu } from "./features/room/menu";
import { renderSkinsMenu } from "./features/skins/menu";
import { renderCompanionMenu } from "./features/companion/menu";
import { initSkins } from "./features/skins/index";

import { PlayerService } from "./game/player";
import { createAntiAfkController } from "./features/antiAfk/antiAfk";
import { EditorService } from "./features/editor/editor";
import { installEditorPointerControls } from "./features/editor/pointerControls";
import { CompanionService } from "./features/companion";
import { startCompanion } from "./features/companion/start";
import { mountCompanionAsk } from "./features/companion/menu/askBanner";

import { detectGameVersion } from "./game/gameVersion";
import { MGData } from "./data/live";
import { shareGlobal } from "./platform/pageContext";

import { warmupSpriteCache } from "./ui/kit/sprites/iconCache";
import { showAutoRecoDisabledNoticeOnce } from "./features/autoReco/disabledNotice";
import { showRoomPrivacyNoticeOnce } from "./features/room/privacyNotice";
import { showChangelogNoticeOnce } from "./features/changelog/notice";
import { tos } from "./game/pixi/tileObjects";

// The standalone Community Hub owns the rest of the mod's API. Only the
// sign-in bridge and the collect-state heartbeat stay here.
import { initAuthBridgeIfNeeded } from "./platform/ariesApi/authBridge";
import { startPlayerStateReportingWhenGameReady } from "./platform/ariesApi/playerStateReport";



(async function () {
  "use strict";

  if (initAuthBridgeIfNeeded()) return;

  installPageWebSocketHook();
  startAutoReco();
  // Rules for one message type run in this order and the first drop wins: the
  // editor handles its own garden first, then the inventory reserve, then the
  // locker. Stats only count what all of them let through.
  installEditorOutgoingRules();
  installInventoryReserve();
  installLockerOutgoingRules();
  installStatsCounters();
  MGData.init();
  shareGlobal("MGData", MGData);
  detectGameVersion();

  try {warmupSpriteCache();} catch {}
    tos.init()

  EditorService.init();
  installEditorPointerControls();

  // Kick off at boot, not on first menu open: stored skins must already be on
  // screen when the player arrives. Resolves on its own once the sprite
  // catalog has the atlases ready.
  void initSkins();

  mountHUD({
    onRegister(register) {
      register('pets', '🐾 Pets', renderPetsMenu);
      register('locker', '🔒 Locker', renderLockerMenu);
      register('alerts',  '🔔 Alerts', renderNotifierMenu)
      register('calculator', '🤓 Calculator', renderCalculatorMenu);
      register('room', '🏠 Room', renderRoomMenu);
      register('editor', '📝 Editor', renderEditorMenu);
      register('skins', '🎨 Skins', renderSkinsMenu);
      register('misc', '🧩 Misc', renderMiscMenu);
      register('keybinds', '⌨️ Keybinds', renderKeybindsMenu);
      register('tools', '🛠️ Tools', renderToolsMenu);
      register('settings', '⚙️ Settings', renderSettingsMenu);
      register('companion', '🤖 Companion', renderCompanionMenu);
      register('debug-data', '🐞 Debug', renderDebugDataMenu);
    }
  });

  initWatchers()

  startCompanion();
  // The companion's questions also show at the top of the screen, menu closed.
  mountCompanionAsk();
  // For diagnosis from the console: window.Companion.start() / .listNpcs() / .say()
  shareGlobal("Companion", CompanionService);

  // One-time notice: auto-reconnect temporarily disabled at devs' request.
  showAutoRecoDisabledNoticeOnce();

  const antiAfk = createAntiAfkController({
    getPosition: () => PlayerService.getPosition(),
    pingPosition: (x, y) => PlayerService.pingPosition(x, y),
  });

  antiAfk.start();

  // The collect-state heartbeat stays in Arie's Mod: it claims ownership via
  // a page global and the standalone Community Hub stands down when both run.
  startPlayerStateReportingWhenGameReady();

  // One-time notice: rooms are public by default so other mod users can find
  // them, install MG Community Hub for a privacy toggle.
  showRoomPrivacyNoticeOnce();

  // One-time notice: release notes for the version just installed, resets
  // automatically on the next version bump.
  void showChangelogNoticeOnce();
})();
