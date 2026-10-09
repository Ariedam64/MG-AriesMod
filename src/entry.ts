// The bundle's entry point. On Discord, the host page around the game frame
// also gets the script (see platform/discordFrame.ts); there the mod must not
// start at all, not even the side effects of its imports. `require` keeps the
// load synchronous: in every other frame the mod starts exactly as before, at
// document-start.

import { isDiscordHostFrame } from "./platform/discordFrame";

declare const require: (path: string) => unknown;

if (!isDiscordHostFrame(location)) {
  require("./main");
}
