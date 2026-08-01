// src/main.ts
import "./sprite";
import { installPageWebSocketHook } from "./hooks/ws-hook";
import { mountHUD, initWatchers } from "./ui/hud";

import { renderDebugDataMenu } from "./ui/menus/debug-data";
import { renderLockerMenu } from "./ui/menus/locker";
import { renderCalculatorMenu } from "./ui/menus/calculator";
import { renderPetsMenu } from "./ui/menus/pets";
import { renderMiscMenu } from "./ui/menus/misc";
import { renderSettingsMenu } from "./ui/menus/settings";
import { renderNotifierMenu } from "./ui/menus/notifier";
import { renderToolsMenu } from "./ui/menus/tools";
import { renderEditorMenu } from "./ui/menus/editor";
import { renderKeybindsMenu } from "./ui/menus/keybinds";
import { renderRoomMenu } from "./ui/menus/room";

import { PlayerService } from "./services/player";
import { createAntiAfkController } from "./utils/antiafk";
import { EditorService } from "./services/editor";
import { installEditorPointerControls } from "./services/editorPointerControls";

import { initGameVersion } from "./utils/gameVersion";
import { MGVersion } from "./utils/mgVersion";
import { MGData } from "./data/dynamic";
import { shareGlobal } from "./utils/page-context";

import { warmupSpriteCache } from "./ui/spriteIconCache";
import { showAutoRecoDisabledNoticeOnce } from "./ui/autoRecoDisabledNotice";
import { showRoomPrivacyNoticeOnce } from "./ui/roomPrivacyNotice";
import { showChangelogNoticeOnce } from "./ui/changelogNotice";
import { tos } from "./utils/tileObjectSystemApi";
import { installEmojiDataFetchInterceptor, isDiscordActivityContext } from "./utils/discordCsp";



// Import from the modules directly (not the ariesModAPI barrel): the barrel
// re-exports the whole API layer (streams, endpoints) which would drag that
// dead code into the bundle. The standalone Community Hub owns everything
// except the collect-state heartbeat, which stays here.
import { initAuthBridgeIfNeeded } from "./ariesModAPI/auth/bridge";
import { startPlayerStateReportingWhenGameReady } from "./ariesModAPI/endpoints/state";



(async function () {
  "use strict";

  if (initAuthBridgeIfNeeded()) return;

    if (isDiscordActivityContext()) {
    installEmojiDataFetchInterceptor();
  }

  installPageWebSocketHook();
  MGData.init();
  shareGlobal("MGData", MGData);
  initGameVersion();
  MGVersion.prefetch();

  try {warmupSpriteCache();} catch {}
    tos.init()

  EditorService.init();
  installEditorPointerControls();

  mountHUD({
    onRegister(register) {
      register('pets', '🐾 Pets', renderPetsMenu);
      register('locker', '🔒 Locker', renderLockerMenu);
      register('alerts',  '🔔 Alerts', renderNotifierMenu)
      register('calculator', '🤓 Calculator', renderCalculatorMenu);
      register('room', '🏠 Room', renderRoomMenu);
      register('editor', '📝 Editor', renderEditorMenu);
      register('misc', '🧩 Misc', renderMiscMenu);
      register('keybinds', '⌨️ Keybinds', renderKeybindsMenu);
      register('tools', '🛠️ Tools', renderToolsMenu);
      register('settings', '⚙️ Settings', renderSettingsMenu);
      register('debug-data', '🐞 Debug', renderDebugDataMenu);
    }
  });

  initWatchers()

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
