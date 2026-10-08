// Since build 1396, launching the Discord activity serves a host page
// (`installDiscordFrameHost`) that never runs the game. It creates a
// same-origin child frame at the same URL plus `mc_shell_frame=1`, runs the
// game there, and relays the Embedded App SDK messages. Both pages are on
// discordsays.com, so a userscript matching that domain lands in both.
//
// The header already restricts Discord to the marked frame, but a personal
// loader header, or a manager that widens the rule, still injects into the
// host. The entry point checks this before loading anything.
//
// Kept free of imports so the entry point stays tiny and the node checks can
// load it.

/** The game's own marker, DISCORD_SHELL_FRAME_PARAM in its discordFrameHost.ts. */
const DISCORD_SHELL_FRAME_PARAM = "mc_shell_frame";

/** True in the Discord host page, the one frame on discordsays.com that never runs the game. */
export function isDiscordHostFrame(loc: { hostname: string; search: string }): boolean {
  if (!loc.hostname.endsWith("discordsays.com")) return false;
  return !new URLSearchParams(loc.search).has(DISCORD_SHELL_FRAME_PARAM);
}
