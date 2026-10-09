// The Behavior tab: on or off, whose look he borrows, where he stays, and
// when he speaks up.
//
// Kept bare on purpose. Movement values (pace, distances, delays) are
// constants in `movement.ts`, tuned to the game's renderer rather than to
// preferences.

import { CompanionService } from "..";
import { checkFeedNow } from "../feedWatch";
import type { CompanionMode } from "../anchors";
import { card } from "../../../ui/kit/card";
import { select } from "../../../ui/kit/fields";
import { settingRow } from "../../../ui/kit/layout";
import { refreshWhileVisible } from "../../../ui/kit/dom";
import { segmented } from "../../../ui/kit/segmented";
import { switchInput } from "../../../ui/kit/toggles";
import { part } from "./dom";
import { borrowedIdentity, portrait } from "./portrait";

const STATUS_REFRESH_MS = 1000;
const HERO_AVATAR_PX = 48;

const MODE_LABELS: Array<{ value: CompanionMode; label: string }> = [
  { value: "follow", label: "Follow me" },
  { value: "garden", label: "Stay in my garden" },
];

export function renderBehaviorTab(view: HTMLElement): void {
  view.innerHTML = "";
  const settings = CompanionService.getSettings();

  /* ---------------------------------- hero ---------------------------------- */

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
  enableToggle.setAttribute("aria-label", "Bring him out");

  const face = part("div", "qws-cmp-avatar-gap");
  const name = part("div", "qws-cmp-hero__name", "Companion");
  const status = part("div", "qws-cmp-hero__status");
  const text = part("div", "qws-cmp-hero__text");
  text.append(name, status);
  const top = part("div", "qws-cmp-hero__top");
  top.append(face, text, enableToggle);

  const npcSelect = select({ small: true });
  npcSelect.append(new Option("Loading…", ""));
  npcSelect.disabled = true;
  npcSelect.setAttribute("aria-label", "Borrowed NPC");
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

  const lookRow = part("div", "qws-cmp-hero__look-row");
  lookRow.append(part("span", "qws-cmp-label", "Look"), npcSelect);
  const look = part("div", "qws-cmp-hero__look");
  look.append(lookRow, part("div", "qws-cmp-hint", 'Whose look he borrows. "In game" means already out.'));

  const hero = part("div", "qmm-card qws-cmp-hero");
  hero.append(top, look);

  /* ------------------------------ where he stays ----------------------------- */

  const modeControl = segmented(
    MODE_LABELS,
    settings.mode,
    (mode) => {
      // The kit calls back on a click on the current choice too.
      if (mode === CompanionService.getSettings().mode) return;
      void CompanionService.applySettings({ mode }).then(refresh).catch(() => {});
    },
    { fullWidth: true, ariaLabel: "Where he stays" },
  );

  const placeCard = card("Where he stays", { subtitle: "Next to you, or on your own plot." });
  placeCard.body.append(modeControl);

  /* -------------------------------- speaking -------------------------------- */

  const askToggle = switchInput(settings.askOnScreen, (on) => {
    void CompanionService.applySettings({ askOnScreen: on });
  });

  const reactionsToggle = switchInput(settings.reactions, (on) => {
    void CompanionService.applySettings({ reactions: on });
  });

  const talkCard = card("Speaking up");
  talkCard.body.append(
    settingRow("Questions on screen", "Shows his questions at the top, portrait and all.", askToggle).row,
    settingRow("Reactions", "Weather, sales, milestones and how long you've played.", reactionsToggle).row,
  );

  /* --------------------------------- status --------------------------------- */

  let shownNpc: string | null | undefined;

  const showText = (el: HTMLElement, value: string) => {
    if (el.textContent !== value) el.textContent = value;
  };

  function refresh(): void {
    const running = CompanionService.isRunning();
    hero.classList.toggle("is-on", running);

    const identity = running ? borrowedIdentity() : { npcId: null, name: null };
    // Composing the portrait again on every beat would be waste.
    if (identity.npcId !== shownNpc) {
      shownNpc = identity.npcId;
      face.replaceChildren(portrait(identity, HERO_AVATAR_PX, true));
    }
    showText(name, identity.name ?? "Companion");

    if (!running) {
      showText(status, "Resting. Switch him on to bring him out.");
      return;
    }
    const wanted = CompanionService.getSettings().mode;
    const actual = CompanionService.getEffectiveMode();
    // A silent fallback would make no sense to the player: it is said.
    const fallback = actual && actual !== wanted ? " No garden found, so he follows you." : "";
    showText(status, `Out next to you. Only you can see him.${fallback}`);
  }

  refresh();
  refreshWhileVisible(status, refresh, STATUS_REFRESH_MS);

  const tab = part("div", "qws-cmp-tab");
  tab.append(hero, placeCard.root, talkCard.root);
  view.append(tab);
}
