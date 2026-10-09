// Checks that a section of the `aries_mod` blob survives a page reload.
//
// The original bug: reading the blob back goes through an allow-list of known
// sections. A section missing from that list was written to disk, then
// silently dropped on the next read. The settings held for the whole session
// thanks to the memory cache, and vanished on the first refresh. This test
// simulates exactly that moment: a blob already on disk, read by a module
// that has nothing cached yet.

type StubStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const stored = new Map<string, string>();
const storage: StubStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => void stored.set(key, value),
  removeItem: (key) => void stored.delete(key),
};

const globalAny = globalThis as unknown as Record<string, unknown>;
globalAny.window = globalAny;
globalAny.document = { addEventListener() {}, documentElement: {}, visibilityState: "visible" };
globalAny.addEventListener = () => {};
globalAny.localStorage = storage;

// The blob is in place BEFORE the first import: that is what a page that has
// just loaded sees.
stored.set(
  "aries_mod",
  JSON.stringify({
    version: 2,
    companion: { enabled: true, mode: "garden", feedThresholdPct: 25, npcId: "NPC_Vendor" },
    misc: { ghostMode: true },
    companionSession: { startedAt: 1000, lastSeenAt: 2000, announcedHours: 3 },
  })
);

import { readAriesPath } from "../src/platform/storage";
import {
  isUnreviewed,
  loadCompanionSettings,
  markReviewed,
  patchCompanionSettings,
} from "../src/features/companion/state";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};

console.log("--- companion persistence ---");
check("the section survives a reload", typeof readAriesPath("companion"), "object");
check("the enabled flag is read back", readAriesPath("companion.enabled"), true);
check("so is the mode", readAriesPath("companion.mode"), "garden");
check("and the feeding settings", readAriesPath("companion.feedThresholdPct"), 25);
check("and the borrowed NPC", readAriesPath("companion.npcId"), "NPC_Vendor");
// The sections already known must not have been damaged along the way.
check("the other sections are intact", readAriesPath("misc.ghostMode"), true);
// The companion session lives outside `companion`, which every settings save
// rewrites in full: without its own entry in the allow-list, "it's been 2 h"
// would start from zero on every F5.
check("the companion session survives a reload", readAriesPath("companionSession.startedAt"), 1000);
check("with the hours already announced", readAriesPath("companionSession.announcedHours"), 3);

console.log("\n--- companion settings, repaired on read ---");
{
  // The blob set above holds neither teams nor reviewed groups: exactly the
  // state of a player who updates the mod.
  const settings = loadCompanionSettings();

  check("the values present are kept", settings.mode, "garden");
  check("a missing team means \"leave it alone\"", settings.harvestTeamId, null);
  // A setting added later must turn itself on for whoever updates, or the
  // feature only exists for newcomers.
  check("a question card missing from the blob is on", settings.askOnScreen, true);
  check("no group has been reviewed", settings.reviewedSettings.length, 0);
  check("reactions are on for whoever updates", settings.reactions, true);
  // With no criterion, no sale will be offered: that is the default to fall
  // back on, never a made-up criterion.
  check("no keep criterion by default", settings.hatchKeepRules.species.length, 0);
  check("and no strength threshold", settings.hatchKeepRules.minMaxStr, null);

  // An empty team is not a team: it must not pass for a choice.
  patchCompanionSettings({ harvestTeamId: "" as unknown as string });
  check("an empty team falls back to null", loadCompanionSettings().harvestTeamId, null);

  patchCompanionSettings({ hatchTeamId: "team-hatch", hatchSellTeamId: "team-sell" });
  const withTeams = loadCompanionSettings();
  check("the three teams are distinct", `${withTeams.harvestTeamId}|${withTeams.hatchTeamId}|${withTeams.hatchSellTeamId}`, "null|team-hatch|team-sell");

  markReviewed("harvest");
  markReviewed("harvest");
  check("a reviewed group is noted only once", loadCompanionSettings().reviewedSettings.join(","), "harvest");
  check("it is no longer flagged", isUnreviewed("harvest"), false);
  check("the others still are", isUnreviewed("hatch"), true);

  patchCompanionSettings({ reactions: false });
  check("reactions can be turned off and stay off", loadCompanionSettings().reactions, false);
  check("saving the settings does not erase the session", readAriesPath("companionSession.startedAt"), 1000);

  patchCompanionSettings({ askOnScreen: false });
  check("but it can be turned off and stays off", loadCompanionSettings().askOnScreen, false);

  // An unknown value from a future version must not get in.
  patchCompanionSettings({ reviewedSettings: ["harvest", "nope"] as never });
  check("an unknown group is left out", loadCompanionSettings().reviewedSettings.join(","), "harvest");
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
