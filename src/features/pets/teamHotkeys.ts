// Pet-team shortcuts: one per team, plus Previous and Next to cycle through
// the team list in order.
//
// The actions live in the Keybinds Pets section, so the menu lists them and
// the registry stores their keys under `pets.team.<team id>`. This module keeps
// that list in step with the teams and handles the keys.

import { stringToHotkey } from "../../lib/hotkey";
import { shouldIgnoreKeydown } from "../../lib/keyboard";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { PET_SECTION_ID, type KeybindId } from "../keybinds/catalog";
import { eventMatchesKeybind, getKeybind, setDynamicActions, setKeybind } from "../keybinds/keybinds";
import { PetsService, type PetTeam } from "./pets";

const PET_TEAM_PREV_ID: KeybindId = "pets.team.prev";
const PET_TEAM_NEXT_ID: KeybindId = "pets.team.next";
/** Where builds before the Keybinds menu kept team shortcuts, as `{ teamId: "Alt+Digit1" }`. */
const LEGACY_HOTKEYS_PATH = "pets.hotkeys";

type TeamRef = Pick<PetTeam, "id" | "name">;

/** Team ids in list order, as last handed to `setPetTeamKeybinds`. */
let teamIds: string[] = [];
let installed = false;

const teamActionId = (teamId: string): KeybindId => `pets.team.${teamId}`;

/** Moves a team's shortcut from the pre-menu storage into the registry, once. */
function migrateLegacyHotkey(teamId: string): void {
  const legacy = readAriesPath<Record<string, string>>(LEGACY_HOTKEYS_PATH) ?? {};
  if (!legacy[teamId]) return;
  const actionId = teamActionId(teamId);
  if (!getKeybind(actionId)) {
    const hk = stringToHotkey(legacy[teamId]);
    if (hk) setKeybind(actionId, hk);
  }
  const rest = { ...legacy };
  delete rest[teamId];
  writeAriesPath(LEGACY_HOTKEYS_PATH, rest);
}

/** Lists one "Use team" action per team in the Keybinds menu, in team order. */
export function setPetTeamKeybinds(teams: TeamRef[]): void {
  const seen = new Set<string>();
  const unique = teams.filter((team) => {
    const id = String(team?.id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  teamIds = unique.map((team) => String(team.id));
  setDynamicActions(
    PET_SECTION_ID,
    unique.map((team, index) => ({
      id: teamActionId(String(team.id)),
      label: `Use team: ${String(team.name ?? "").trim() || `Team ${index + 1}`}`,
      defaultHotkey: null,
    })),
  );
  for (const id of teamIds) migrateLegacyHotkey(id);
}

/**
 * The team one step away from the current one. "Current" is the team the
 * equipped pets form, or failing that the team last switched to, so cycling
 * still works after the player swaps a pet by hand.
 */
async function teamAfterStep(ids: string[], step: 1 | -1): Promise<string | null> {
  if (!ids.length) return null;
  let current: string | null = null;
  try { current = await PetsService.getActiveTeamId(); } catch {}
  if (!current || !ids.includes(current)) current = PetsService.getLastUsedTeamId();
  const index = current ? ids.indexOf(current) : -1;
  if (index < 0) return ids[0];
  return ids[(index + step + ids.length) % ids.length];
}

function onKeyDown(e: KeyboardEvent, useTeam: (teamId: string) => void): void {
  if (shouldIgnoreKeydown(e) || !teamIds.length) return;

  const ids = teamIds.slice();
  const step = eventMatchesKeybind(PET_TEAM_PREV_ID, e) ? -1 : eventMatchesKeybind(PET_TEAM_NEXT_ID, e) ? 1 : 0;
  const direct = step ? null : ids.find((id) => eventMatchesKeybind(teamActionId(id), e)) ?? null;
  if (!step && !direct) return;

  // Before anything async: once the handler awaits, the event has finished
  // dispatching and the game would already have seen the key.
  e.preventDefault();
  e.stopPropagation();

  if (direct) {
    useTeam(direct);
    return;
  }
  void teamAfterStep(ids, step as 1 | -1).then((target) => {
    if (target) useTeam(target);
  });
}

/** Keeps the team actions in step with the teams and starts listening for their keys. */
export function installPetTeamHotkeys(useTeam: (teamId: string) => void): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  PetsService.onTeamsChange((teams) => setPetTeamKeybinds(teams));
  window.addEventListener("keydown", (e) => onKeyDown(e, useTeam), true);
}
