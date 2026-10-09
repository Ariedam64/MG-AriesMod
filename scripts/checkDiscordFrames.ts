// scripts/checkDiscordFrames.ts
//
// Since v1396, when Discord launches the activity the server answers with a
// host page (`installDiscordFrameHost`) that never runs the game: it creates a
// same-origin child frame at the same URL plus `mc_shell_frame=1`, puts the
// game there, and relays the Embedded App SDK messages. Both pages are on
// discordsays.com, so a header matching `discordsays.com/*` made Tampermonkey
// inject the mod twice, and the host's copy ran with no game under it.
//
// This reads the real header from meta.userscript.js and applies it the way
// the userscript manager does: run where an @match or @include fits and no
// @exclude does.
//
// Run with: npm run check:discordframes

import { checkEqual, done } from "./_check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDiscordHostFrame } from "../src/platform/discordFrame";

const header = readFileSync(join(process.cwd(), "meta.userscript.js"), "utf8");

function rules(key: string): string[] {
  const out: string[] = [];
  for (const line of header.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^//\\s*@${key}\\s+(\\S.*?)\\s*$`));
    if (m) out.push(m[1]);
  }
  return out;
}

/** A /regex/ rule, or a glob where `*` is anything, as the manager reads them. */
function toRegExp(rule: string): RegExp {
  const regex = rule.match(/^\/(.*)\/([a-z]*)$/);
  if (regex) return new RegExp(regex[1], regex[2]);
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

const includes = [...rules("match"), ...rules("include")].map(toRegExp);
const excludes = rules("exclude").map(toRegExp);
const runsOn = (url: string) => includes.some((r) => r.test(url)) && !excludes.some((r) => r.test(url));

// The frames from a real Discord web session on v1396.
const launch =
  "instance_id=i-1556169039422685184-pc-1412369893080305765&location_id=pc-1412369893080305765" +
  "&launch_id=1556169039422685184&referrer_id=undefined&custom_id=undefined&theme=darker" +
  "&channel_id=1412369893080305765&frame_id=bcf5b45d-5347-4972-b689-e6c64f73e4ac&platform=desktop";
const discordHost = `https://1227719606223765687.discordsays.com/?${launch}`;
const discordGame = `${discordHost}&mc_shell_frame=1`;

checkEqual("Discord: the frame running the game gets the mod", runsOn(discordGame), true);
checkEqual("Discord: the host frame around it does not", runsOn(discordHost), false);
checkEqual("Discord: a marker that only looks alike is not the game frame", runsOn(`${discordHost}&mc_shell_frame_x=1`), false);
checkEqual("Discord: the game frame of a host nested in a host gets it too", runsOn(`https://1227719606223765687.discordsays.com/r/abc?${launch}&mc_shell_frame=1`), true);
checkEqual("Discord: the top page is never touched", runsOn("https://discord.com/channels/@me/1412369893080305765"), false);

// The header alone is not enough: a personal loader header, or a manager that
// widens the rule, still injects into the host. The bundle then checks for
// itself before loading anything.
const at = (url: string) => {
  const u = new URL(url);
  return { hostname: u.hostname, search: u.search };
};
checkEqual("code: the Discord host frame is recognised", isDiscordHostFrame(at(discordHost)), true);
checkEqual("code: the Discord game frame is not the host", isDiscordHostFrame(at(discordGame)), false);
checkEqual("code: a look-alike marker does not make a game frame", isDiscordHostFrame(at(`${discordHost}&mc_shell_frame_x=1`)), true);
checkEqual("code: a web room is never a Discord host", isDiscordHostFrame(at("https://magicgarden.gg/r/ABCD")), false);

checkEqual("web: a magicgarden.gg room", runsOn("https://magicgarden.gg/r/ABCD"), true);
checkEqual("web: a magiccircle.gg room", runsOn("https://magiccircle.gg/r/ABCD"), true);
checkEqual("web: a starweaver.org room", runsOn("https://starweaver.org/r/ABCD"), true);
checkEqual("web: the API page for the auth bridge", runsOn("https://ariesmod-api.ariedam.fr/auth/callback"), true);

done();
