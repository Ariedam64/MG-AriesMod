import { Menu } from "../../ui/kit/menu";
import { renderAudioPlayerTab } from "./audioTab";
import { renderJotaiTab } from "./jotaiTab";
import { renderLiveAtomsTab } from "./liveAtomsTab";
import { renderWSTab } from "./wsTab";
import { renderSpritesTab } from "./spritesTab";
import { ensureDebugStyles } from "./styles";

export async function renderDebugDataMenu(root: HTMLElement) {
  ensureDebugStyles();

  const ui = new Menu({ id: "debug-tools", compact: true });
  ui.mount(root);

  ui.addTab("jotai", "Jotai", renderJotaiTab);
  ui.addTab("atoms-live", "Live atoms", renderLiveAtomsTab);
  ui.addTab("sprite-assets", "Sprites", renderSpritesTab);
  ui.addTab("audio-player", "Audio", renderAudioPlayerTab);
  ui.addTab("websocket", "WebSocket", renderWSTab);
}
