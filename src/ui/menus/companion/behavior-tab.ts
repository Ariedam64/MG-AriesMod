// src/ui/menus/companion/behavior-tab.ts
// Onglet Behavior : activation, comportement, et apparence empruntée.
//
// Volontairement dépouillé. Les valeurs de déplacement (cadence, distances,
// temporisations) sont des constantes de `movement.ts` : elles sont calées sur
// le moteur de rendu du jeu, pas sur des préférences, et les exposer inviterait
// à casser la marche sans comprendre pourquoi.

import { CompanionService } from "../../../services/companion";
import type { CompanionMode } from "../../../services/companion/anchors";
import { TEXT_DIM, css, selectField, toggle } from "../panel-ui";
import { collapsibleCard, settingRow } from "../panel-layout";

const STATUS_REFRESH_MS = 1000;

const MODE_LABELS: Array<[CompanionMode, string]> = [
  ["follow", "Follow me"],
  ["garden", "Stay in my garden"],
];

export function renderBehaviorTab(view: HTMLElement): void {
  view.innerHTML = "";
  const settings = CompanionService.getSettings();
  let disposed = false;

  const card = collapsibleCard({
    icon: "🧭",
    title: "Behavior",
    description: "Is he out, and where he stays.",
    collapsed: false,
    onToggle: () => {},
  });

  const enableToggle = toggle(settings.enabled, (on) => {
    void CompanionService.applySettings({ enabled: on }).then(refresh).catch(() => {});
  });

  const modeSelect = selectField(MODE_LABELS.map(([value, label]) => [value, label]));
  modeSelect.value = settings.mode;
  modeSelect.addEventListener("change", () => {
    void CompanionService.applySettings({ mode: modeSelect.value as CompanionMode })
      .then(refresh)
      .catch(() => {});
  });

  const npcSelect = selectField([["", "Loading…"]]);
  npcSelect.disabled = true;
  npcSelect.addEventListener("change", () => {
    void CompanionService.applySettings({ npcId: npcSelect.value || null })
      .then(refresh)
      .catch(() => {});
  });

  void CompanionService.listNpcs()
    .then((roster) => {
      if (disposed) return;
      npcSelect.innerHTML = "";
      if (roster.length === 0) {
        npcSelect.append(new Option("No NPC detected", ""));
        return;
      }
      npcSelect.append(new Option("Automatic (an absent NPC)", ""));
      for (const npc of roster) {
        // On signale les PNJ présents : les détourner les déplace à l'écran.
        npcSelect.append(new Option(npc.present ? `${npc.name} (in game)` : npc.name, npc.playerId));
      }
      npcSelect.value = CompanionService.getNpcId() ?? settings.npcId ?? "";
      npcSelect.disabled = false;
    })
    .catch(() => {
      if (disposed) return;
      npcSelect.innerHTML = "";
      npcSelect.append(new Option("Unavailable", ""));
    });

  const status = document.createElement("div");
  css(status, { fontSize: "12px", color: TEXT_DIM, padding: "2px 2px 0" });

  function refresh(): void {
    if (disposed) return;
    if (!CompanionService.isRunning()) {
      status.textContent = "Inactive.";
      return;
    }
    const npcId = CompanionService.getNpcId();
    const name = npcId ? npcId.replace(/^NPC_/, "") : "?";
    const wanted = CompanionService.getSettings().mode;
    const actual = CompanionService.getEffectiveMode();
    // Un repli silencieux serait incompréhensible : on le dit.
    const fallback =
      actual && actual !== wanted ? " (no garden found, following you)" : "";
    status.textContent = `Active as ${name}${fallback}. Only you can see it.`;
  }

  card.body.append(
    settingRow("Enable", "Brings him out next to you.", enableToggle).row,
    settingRow("Mode", "Follows you, or stays on your plot.", modeSelect).row,
    settingRow("Borrowed NPC", 'Whose look it takes. "In game" means already spawned.', npcSelect).row,
    status
  );

  refresh();
  const timer = window.setInterval(refresh, STATUS_REFRESH_MS);

  view.append(card.root);
  (view as unknown as { __cleanup__?: () => void }).__cleanup__ = () => {
    disposed = true;
    clearInterval(timer);
  };
}
