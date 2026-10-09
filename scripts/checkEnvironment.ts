// Since build 1396 the Discord activity runs the game in a same-origin child
// frame of a host page, both on discordsays.com. The game frame's referrer is
// therefore the host page, not discord.com, and a check that only looked at the
// referrer reported "web" inside Discord. That sent version-update links
// through window.open instead of GM_openInTab and labelled Discord players as
// Web in the Settings infos tab.
//
// Run with: npm run check:environment

import { checkEqual, done } from "./_check";
import { detectEnvironment, isDiscordActivityContext } from "../src/platform/environment";

type Page = { href: string; referrer: string; framed: boolean };

function visit(page: Page): void {
  const url = new URL(page.href);
  const g = globalThis as any;
  const self = {};
  g.location = { hostname: url.hostname, origin: url.origin, search: url.search, href: url.href };
  g.document = { referrer: page.referrer };
  Object.defineProperty(g, "navigator", {
    configurable: true,
    value: { userAgent: "Mozilla/5.0 (Windows NT 10.0)" },
  });
  g.window = { location: g.location, self, top: page.framed ? {} : self };
}

const DISCORD_GAME_FRAME = "https://1227719606223765687.discordsays.com/?mc_shell_frame=1";

visit({ href: DISCORD_GAME_FRAME, referrer: "https://1227719606223765687.discordsays.com/", framed: true });
checkEqual("game frame under the Discord host page is an activity", isDiscordActivityContext(), true);
checkEqual("game frame under the Discord host page is the discord surface", detectEnvironment().surface, "discord");

visit({ href: DISCORD_GAME_FRAME, referrer: "https://discord.com/channels/1/2", framed: true });
checkEqual("game frame embedded straight in discord.com is the discord surface", detectEnvironment().surface, "discord");

visit({ href: "https://magicgarden.gg/r/ABCD", referrer: "", framed: false });
checkEqual("the website is not an activity", isDiscordActivityContext(), false);
checkEqual("the website is the web surface", detectEnvironment().surface, "web");

visit({ href: "https://magicgarden.gg/r/ABCD", referrer: "https://example.com/", framed: true });
checkEqual("the website framed by another site is still the web surface", detectEnvironment().surface, "web");

done();
