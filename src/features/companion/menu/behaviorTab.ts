// The Behavior tab: on or off, where he stays, and whose look he borrows.
//
// Kept bare on purpose. Movement values (pace, distances, delays) are
// constants in `movement.ts`, tuned to the game's renderer rather than to
// preferences.

import { CompanionService } from "..";
import { checkFeedNow } from "../feedWatch";
import type { CompanionMode } from "../anchors";
import { select } from "../../../ui/kit/fields";
import { collapsibleCard, settingRow } from "../../../ui/kit/layout";
import { color } from "../../../ui/kit/theme";
import { switchInput } from "../../../ui/kit/toggles";
import { styled } from "./dom";

const STATUS_REFRESH_MS = 1000;

const MODE_LABELS: Array<[CompanionMode, string]> = [
  ["follow", "Follow me"],
  ["garden", "Stay in my garden"],
];

function selectWith(options: Array<[value: string, label: string]>): HTMLSelectElement {
  const el = select({ small: true });
  for (const [value, label] of options) el.append(new Option(label, value));
  return el;
}

export function renderBehaviorTab(view: HTMLElement): void {
  view.innerHTML = "";
  const settings = CompanionService.getSettings();

  const card = collapsibleCard({
    icon: "🧭",
    title: "Behavior",
    description: "Is he out, and where he stays.",
    collapsed: false,
    onToggle: () => {},
  });

  const enableToggle = switchInput(settings.enabled, (on) => {
    void CompanionService.applySettings({ enabled: on })
      .then(() => {
        // Switching him off must drop his question at once, not at the
        // watch's next poll.
        checkFeedNow();
        refresh();
      })
      .catch(() => {});
  });

  const modeSelect = selectWith(MODE_LABELS);
  modeSelect.value = settings.mode;
  modeSelect.addEventListener("change", () => {
    void CompanionService.applySettings({ mode: modeSelect.value as CompanionMode })
      .then(refresh)
      .catch(() => {});
  });

  const npcSelect = selectWith([["", "Loading…"]]);
  npcSelect.disabled = true;
  npcSelect.addEventListener("change", () => {
    void CompanionService.applySettings({ npcId: npcSelect.value || null })
      .then(refresh)
      .catch(() => {});
  });

  void CompanionService.listNpcs()
    .then((roster) => {
      npcSelect.innerHTML = "";
      if (roster.length === 0) {
        npcSelect.append(new Option("No NPC detected", ""));
        return;
      }
      npcSelect.append(new Option("Automatic (an absent NPC)", ""));
      for (const npc of roster) {
        // NPCs already out are marked: borrowing them moves them on screen.
        npcSelect.append(new Option(npc.present ? `${npc.name} (in game)` : npc.name, npc.playerId));
      }
      npcSelect.value = CompanionService.getNpcId() ?? settings.npcId ?? "";
      npcSelect.disabled = false;
    })
    .catch(() => {
      npcSelect.innerHTML = "";
      npcSelect.append(new Option("Unavailable", ""));
    });

  const status = styled("div", { fontSize: "12px", color: color.textDim, padding: "2px 2px 0" });

  function refresh(): void {
    if (!CompanionService.isRunning()) {
      status.textContent = "Inactive.";
      return;
    }
    const npcId = CompanionService.getNpcId();
    const name = npcId ? npcId.replace(/^NPC_/, "") : "?";
    const wanted = CompanionService.getSettings().mode;
    const actual = CompanionService.getEffectiveMode();
    // A silent fallback would make no sense to the player: it is said.
    const fallback = actual && actual !== wanted ? " (no garden found, following you)" : "";
    status.textContent = `Active as ${name}${fallback}. Only you can see it.`;
  }

  const askToggle = switchInput(settings.askOnScreen, (on) => {
    void CompanionService.applySettings({ askOnScreen: on });
  });

  const reactionsToggle = switchInput(settings.reactions, (on) => {
    void CompanionService.applySettings({ reactions: on });
  });

  card.body.append(
    settingRow("Enable", "Brings him out next to you.", enableToggle).row,
    settingRow("Mode", "Follows you, or stays on your plot.", modeSelect).row,
    settingRow("Borrowed NPC", 'Whose look it takes. "In game" means already spawned.', npcSelect).row,
    settingRow("Ask on screen", "Shows his questions at the top, portrait and all.", askToggle).row,
    settingRow("Reactions", "Comments on weather, sales, milestones and how long you've played.", reactionsToggle).row,
    status,
  );

  refresh();
  window.setInterval(refresh, STATUS_REFRESH_MS);

  view.append(card.root);
}
