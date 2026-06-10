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

import { initGameVersion } from "./utils/gameVersion";
import { MGVersion } from "./utils/mgVersion";
import { MGData } from "./data/dynamic";
import { shareGlobal } from "./utils/page-context";

import { warmupSpriteCache } from "./ui/spriteIconCache";
import { showAutoRecoDisabledNoticeOnce } from "./ui/autoRecoDisabledNotice";
import { showCommunityHubMovedNoticeOnce } from "./ui/communityHubMovedNotice";
import { tos } from "./utils/tileObjectSystemApi";
import { installEmojiDataFetchInterceptor, isDiscordActivityContext } from "./utils/discordCsp";



// Import from the module directly (not the ariesModAPI barrel): the barrel
// re-exports the whole API layer (streams, heartbeat, endpoints) which would
// drag that dead code into the bundle. The standalone Community Hub owns it.
import { initAuthBridgeIfNeeded } from "./ariesModAPI/auth/bridge";



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
    move: (x, y) => PlayerService.move(x, y),
  });

  antiAfk.start();

  // Backend heartbeat + streams + Community Hub now live in the standalone
  // "MG Community Hub" userscript. Point existing users at it once.
  showCommunityHubMovedNoticeOnce();
})();
