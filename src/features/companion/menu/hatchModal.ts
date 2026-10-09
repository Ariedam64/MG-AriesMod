// Hatching, and saying what to keep.
//
// The rules do not decide what hatches: what is ripe opens, no conditions.
// They decide what survives when the bag overflows, which is why they are set
// here, beforehand, rather than when a quick decision is needed.
//
// A rule left empty does not mean "everything" but "nothing": with no rule he
// offers no sale. The opposite of the harvest popup on purpose, since here a
// mistake cannot be undone.
//
// The popup opens and sells nothing. It makes a *request*, which the chat
// turns into a question to confirm (see `chat/proposals.ts`).

import { button } from "../../../ui/kit/button";
import { numberInput } from "../../../ui/kit/fields";
import { switchInput } from "../../../ui/kit/toggles";
import type { ChatRequest } from "../chat";
import { hatchRequest } from "../chat/commands/hatch";
import { DEFAULT_KEEP_RULES, describeHatchRequest, hasAnyRule, type KeepRules } from "../chat/hatch";
import { EMPTY_HATCH_SCOPE, readHatchScope, type HatchScope } from "../chat/hatchRead";
import { loadCompanionSettings, patchCompanionSettings } from "../state";
import { openCompanionModal, part } from "./dom";
import { labelledTile, mutationIconEl, spriteTile, tileRow } from "./harvestChips";
import { fieldRow, filterCard, resultBox } from "./harvestFields";
import { abilityIcon, petSpeciesIcon } from "./hatchChips";
import { openHatchSettingsModal } from "./hatchSettingsModal";
import { settingsNotice } from "./settingsNotice";
import { openSettingsModal } from "./settingsModal";

/** Eggs ripen while the rules are being set. */
const REFRESH_MS = 4000;
const TILE_ICON_PX = 26;
/** An ability's chip fits its named tile, tighter. */
const ABILITY_ICON_PX = 16;
/** Past this, the ability list scrolls rather than pushing the rest out. */
const ABILITY_LIST_MAX_PX = 190;
const MIN_STR = 1;
const MAX_STR = 100;
const DEFAULT_STR = 95;

/** Toggles a value in a rule list. Empty means that rule keeps nothing. */
function toggled(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

/**
 * The values offered: those seen, plus those already ticked.
 *
 * A saved rule must stay in view even when nothing carries it any more:
 * otherwise a hatch with no egg in the ground, or an emptied bag, would hide
 * the box needed to untick it. These are the player's settings.
 */
function offered(available: string[], picked: string[]): string[] {
  return [...new Set([...available, ...picked])].sort((a, b) => a.localeCompare(b));
}

const summarize = (count: number): string => (count === 0 ? "None" : `${count} picked`);

export function openHatchModal(host: HTMLElement, onAsk: (request: ChatRequest) => void): void {
  let scope: HatchScope = EMPTY_HATCH_SCOPE;
  let rules: KeepRules = { ...loadCompanionSettings().hatchKeepRules };
  const iconCache = new Map<string, HTMLElement>();

  const cachedIcon = (key: string, make: () => HTMLElement): HTMLElement => {
    let known = iconCache.get(key);
    if (!known) {
      known = make();
      iconCache.set(key, known);
    }
    return known;
  };

  const modal = openCompanionModal({
    host,
    title: "Hatching",
    widthPx: 470,
    onClose: () => clearInterval(timer),
  });

  const speciesCard = filterCard("Keep species");
  const mutationCard = filterCard("Keep mutations");
  const abilityCard = filterCard("Keep abilities");
  const strengthCard = filterCard("Keep by strength");

  /**
   * The rules are saved on every change.
   *
   * A setting, not a request: it serves the next hatch and the sale after it.
   * What it never does is trigger anything: no sale goes without a yes to it.
   */
  function commit(next: KeepRules): void {
    rules = next;
    patchCompanionSettings({ hatchKeepRules: next });
    render();
  }

  /**
   * A row of tiles with no "all" entry: here nothing ticked means nothing kept.
   *
   * No counts under the sprites. These rules describe what will be wanted,
   * not what is owned: a "0" under an ability being sought teaches nothing and
   * reads as unavailable.
   */
  function chipRow(
    values: string[],
    selected: string[],
    labelFor: (value: string) => string,
    iconFor: (value: string) => HTMLElement,
    onPick: (value: string) => void,
    named = false,
  ): HTMLElement {
    const row = tileRow();
    for (const value of values) {
      const shared = { icon: iconFor(value), selected: selected.includes(value), onClick: () => onPick(value) };
      row.append(named ? labelledTile({ ...shared, label: labelFor(value) }) : spriteTile({ ...shared, title: labelFor(value) }));
    }
    return row;
  }

  /** Keeps a long list to a bearable height: abilities come by the dozen. */
  function scrollable(row: HTMLElement): HTMLElement {
    const box = part("div", "qws-cmp-scroll qmm-scroll");
    box.style.maxHeight = `${ABILITY_LIST_MAX_PX}px`;
    box.append(row);
    return box;
  }

  /** Fills one rule card, or hides it when there is nothing to offer. */
  function renderCard(
    card: ReturnType<typeof filterCard>,
    values: string[],
    picked: string[],
    content: () => HTMLElement,
  ): void {
    card.root.hidden = values.length === 0;
    if (values.length === 0) return;
    card.body.replaceChildren(content());
    card.setSummary(summarize(picked.length), picked.length > 0);
  }

  function renderSpecies(): void {
    const values = offered(scope.possibleSpecies, rules.species);
    renderCard(speciesCard, values, rules.species, () =>
      chipRow(
        values,
        rules.species,
        (name) => name,
        (name) => cachedIcon(`species:${name}`, () => petSpeciesIcon(name, TILE_ICON_PX)),
        (name) => commit({ ...rules, species: toggled(rules.species, name) }),
      ),
    );
  }

  function renderMutations(): void {
    const values = offered(scope.presentMutations, rules.mutations);
    renderCard(mutationCard, values, rules.mutations, () =>
      chipRow(
        values,
        rules.mutations,
        (name) => name,
        (name) => cachedIcon(`mutation:${name}`, () => mutationIconEl(name, TILE_ICON_PX)),
        (name) => commit({ ...rules, mutations: toggled(rules.mutations, name) }),
      ),
    );
  }

  function renderAbilities(): void {
    const values = offered(
      scope.possibleAbilities.map((entry) => entry.id),
      rules.abilities,
    );
    const names = new Map(scope.possibleAbilities.map((entry) => [entry.id, entry.name]));
    // Named: a coloured square cannot be recognised, and there are dozens.
    renderCard(abilityCard, values, rules.abilities, () =>
      scrollable(
        chipRow(
          values,
          rules.abilities,
          (id) => names.get(id) ?? id,
          (id) => cachedIcon(`ability:${id}`, () => abilityIcon(id, ABILITY_ICON_PX)),
          (id) => commit({ ...rules, abilities: toggled(rules.abilities, id) }),
          true,
        ),
      ),
    );
  }

  const strengthField = numberInput(MIN_STR, MAX_STR, 1, DEFAULT_STR);
  strengthField.addEventListener("change", () => {
    const value = Math.max(MIN_STR, Math.min(MAX_STR, Math.round(Number(strengthField.value) || DEFAULT_STR)));
    strengthField.value = String(value);
    commit({ ...rules, minMaxStr: value });
  });

  const strengthToggle = switchInput(rules.minMaxStr !== null, (on) => {
    commit({ ...rules, minMaxStr: on ? Number(strengthField.value) || DEFAULT_STR : null });
  });

  strengthCard.body.append(fieldRow("Keep max STR from", [strengthField.wrap, strengthToggle]));

  /* --------------------------------- strip ---------------------------------- */

  const strip = resultBox();
  const note = part("div", "qws-cmp-hint");
  strip.root.append(note);

  /* --------------------------------- footer --------------------------------- */

  const resetButton = button("Reset", { size: "sm", onClick: () => commit({ ...DEFAULT_KEEP_RULES }) });

  const askButton = button("Ask to hatch", {
    size: "sm",
    variant: "primary",
    onClick: () => {
      // The eggs are read again at confirmation: that is what notices one that
      // hatched or ripened meanwhile.
      onAsk(hatchRequest(describeHatchRequest(scope.readySlots.length), rules));
      modal.close();
    },
  });
  askButton.classList.add("qws-cmp-foot-end");

  const notice = settingsNotice("hatch", "Hatching is not set up. I will use the team you have on.", () => {
    modal.close();
    openHatchSettingsModal(host, () => openSettingsModal(host));
  });

  modal.body.append(notice, speciesCard.root, mutationCard.root, abilityCard.root, strengthCard.root, strip.root);
  modal.footer.append(resetButton, askButton);

  /* --------------------------------- render --------------------------------- */

  function render(): void {
    if (!modal.isOpen()) return;

    renderSpecies();
    renderMutations();
    renderAbilities();

    strengthField.disabled = rules.minMaxStr === null;
    if (rules.minMaxStr !== null) strengthField.value = String(rules.minMaxStr);
    strengthField.wrap.classList.toggle("qws-cmp-dim", rules.minMaxStr === null);
    strengthCard.setSummary(rules.minMaxStr === null ? "Off" : `${rules.minMaxStr} and up`, rules.minMaxStr !== null);

    const ready = scope.readySlots.length;
    const waiting = scope.totalEggs - ready;
    strip.headline.textContent = ready === 0 ? "No egg is ready" : `${ready} egg${ready === 1 ? "" : "s"} ready`;

    const keepsNothing = !hasAnyRule(rules);
    note.classList.toggle("is-warn", keepsNothing);
    note.textContent = keepsNothing
      ? "Nothing set to keep, so I will not offer to sell. Favourites and your active team are always safe."
      : `Favourites and your active team are never sold.${waiting > 0 ? ` ${waiting} still growing.` : ""}`;

    askButton.setEnabled(ready > 0);
  }

  async function refresh(): Promise<void> {
    if (!modal.isOpen()) return;
    scope = await readHatchScope().catch(() => EMPTY_HATCH_SCOPE);
    if (!modal.isOpen()) return;
    render();
  }

  const timer = window.setInterval(() => void refresh(), REFRESH_MS);
  render();
  void refresh();
}
