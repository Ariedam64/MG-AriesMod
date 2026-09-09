// src/ui/menus/companion/hatch-modal.ts
// Faire éclore, et dire ce qu'on veut garder.
//
// Les critères ne décident pas de ce qui éclot — on ouvre ce qui est mûr, sans
// condition. Ils décident de ce qui survit quand le sac déborde, et c'est pour
// ça qu'ils se règlent ici, avant, plutôt qu'au moment où il faudra trancher
// vite.
//
// Un critère laissé vide ne veut pas dire « tout » mais « rien » : sans aucun
// critère, il ne proposera aucune vente. C'est volontairement l'inverse de la
// popup de récolte, parce qu'ici l'erreur ne se rattrape pas.
//
// La popup n'ouvre rien et ne vend rien. Elle produit une *demande*, que le
// chat transforme en question à confirmer (cf. `chat/proposals.ts`).

import type { HarvestRequest } from "../../../services/companion/chat";
import { hatchProvider } from "../../../services/companion/chat/hatchFlow";
import {
  DEFAULT_KEEP_RULES,
  describeHatchRequest,
  hasAnyRule,
  toSell,
  type KeepRules,
} from "../../../services/companion/chat/hatch";
import { EMPTY_HATCH_SCOPE, readHatchScope, type HatchScope } from "../../../services/companion/chat/hatchRead";
import { loadCompanionSettings, patchCompanionSettings } from "../../../services/companion/state";
import { BORDER, TEAL, TEXT, TEXT_DIM, WARN, button, css, numberField, toggle } from "../panel-ui";
import { mutationIconEl, spriteTile, tileRow } from "./harvest-chips";
import { fieldRow, filterCard } from "./harvest-fields";
import { abilityIcon, petSpeciesIcon } from "./hatch-chips";
import { openModal } from "./modal";
import { settingsNotice } from "./settings-notice";
import { openHatchSettingsModal } from "./hatch-settings-modal";

/** Les œufs mûrissent pendant qu'on règle les critères. */
const REFRESH_MS = 4000;
const TILE_ICON_PX = 26;
const MIN_STR = 1;
const MAX_STR = 100;
const DEFAULT_STR = 95;

export function openHatchModal(host: HTMLElement, onAsk: (request: HarvestRequest) => void): void {
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

  const modal = openModal({
    host,
    title: "Hatching",
    widthPx: 470,
    onClose: () => clearInterval(timer),
  });

  const speciesCard = filterCard("", "Keep species");
  const mutationCard = filterCard("", "Keep mutations");
  const abilityCard = filterCard("", "Keep abilities");
  const strengthCard = filterCard("", "Keep by strength");

  /* --------------------------- Règles persistées --------------------------- */

  /**
   * Les critères sont enregistrés à chaque geste.
   *
   * C'est un réglage, pas une demande : il resservira à la couvée suivante et
   * à la vente qui la suit. Ce qu'il ne fait pas, c'est déclencher quoi que ce
   * soit — aucune vente ne part sans un oui qui la vise.
   */
  function commit(next: KeepRules): void {
    rules = next;
    patchCompanionSettings({ hatchKeepRules: next });
    render();
  }

  /** Bascule une valeur dans une liste de critères. Vide = ce critère ne garde rien. */
  function toggled(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
  }

  /* ------------------------------- Contenus -------------------------------- */

  /** Rangée de vignettes sans entrée « tout » : ici, rien coché veut dire rien gardé. */
  function chipRow(
    values: string[],
    selected: string[],
    counts: Map<string, number>,
    labelFor: (value: string) => string,
    iconFor: (value: string) => HTMLElement,
    onPick: (value: string) => void
  ): HTMLElement {
    const row = tileRow();
    for (const value of values) {
      const owned = counts.get(value) ?? 0;
      row.append(
        spriteTile({
          icon: iconFor(value),
          // Le chiffre seul n'apprend rien : l'infobulle dit ce qu'il compte.
          title: `${labelFor(value)}: ${owned === 0 ? "none" : owned} in your bag`,
          count: owned,
          selected: selected.includes(value),
          onClick: () => onPick(value),
        })
      );
    }
    return row;
  }

  /**
   * Les valeurs proposées : celles qu'on observe, plus celles déjà cochées.
   *
   * Un critère enregistré doit rester visible même quand plus rien ne le porte
   * — sinon une couvée sans œuf en terre, ou un sac vidé, ferait disparaître la
   * case sans laquelle on ne peut plus le décocher. Ce sont des réglages du
   * joueur : ils ne s'effacent pas parce que le jeu a changé d'humeur.
   */
  function offered(available: string[], picked: string[]): string[] {
    const all = new Set([...available, ...picked]);
    return [...all].sort((a, b) => a.localeCompare(b));
  }

  /** Combien d'animaux du sac portent chaque valeur : de quoi juger un critère. */
  function tallyPets(of: (pet: HatchScope["pets"][number]) => string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const pet of scope.pets) {
      for (const value of of(pet)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
  }

  function renderSpecies(): void {
    const values = offered(scope.possibleSpecies, rules.species);
    speciesCard.root.style.display = values.length > 0 ? "flex" : "none";
    if (values.length === 0) return;

    const counts = tallyPets((pet) => [pet.species]);
    speciesCard.body.replaceChildren(
      chipRow(
        values,
        rules.species,
        counts,
        (name) => name,
        (name) => cachedIcon(`species:${name}`, () => petSpeciesIcon(name, TILE_ICON_PX)),
        (name) => commit({ ...rules, species: toggled(rules.species, name) })
      )
    );
    speciesCard.setSummary(summarize(rules.species.length), rules.species.length > 0);
  }

  function renderMutations(): void {
    // Le jeu n'expose pas de catalogue de mutations d'animaux : on ne propose
    // que celles qu'on a sous les yeux. Sans aucune, la carte disparaît —
    // « flex » et non « », sinon la carte retombe en bloc et son en-tête, qui
    // est un bouton, cesse de prendre toute la largeur.
    const values = offered(scope.presentMutations, rules.mutations);
    mutationCard.root.style.display = values.length > 0 ? "flex" : "none";
    if (values.length === 0) return;

    const counts = tallyPets((pet) => pet.mutations);
    mutationCard.body.replaceChildren(
      chipRow(
        values,
        rules.mutations,
        counts,
        (name) => name,
        (name) => cachedIcon(`mutation:${name}`, () => mutationIconEl(name, TILE_ICON_PX)),
        (name) => commit({ ...rules, mutations: toggled(rules.mutations, name) })
      )
    );
    mutationCard.setSummary(summarize(rules.mutations.length), rules.mutations.length > 0);
  }

  function renderAbilities(): void {
    const values = offered(scope.possibleAbilities.map((entry) => entry.id), rules.abilities);
    abilityCard.root.style.display = values.length > 0 ? "flex" : "none";
    if (values.length === 0) return;

    const names = new Map(scope.possibleAbilities.map((entry) => [entry.id, entry.name]));
    const counts = tallyPets((pet) => pet.abilities);
    abilityCard.body.replaceChildren(
      chipRow(
        values,
        rules.abilities,
        counts,
        (id) => names.get(id) ?? id,
        (id) => cachedIcon(`ability:${id}`, () => abilityIcon(id, TILE_ICON_PX)),
        (id) => commit({ ...rules, abilities: toggled(rules.abilities, id) })
      )
    );
    abilityCard.setSummary(summarize(rules.abilities.length), rules.abilities.length > 0);
  }

  const strengthField = numberField(MIN_STR, MAX_STR, 1, DEFAULT_STR);
  strengthField.addEventListener("change", () => {
    const value = Math.max(MIN_STR, Math.min(MAX_STR, Math.round(Number(strengthField.value) || DEFAULT_STR)));
    strengthField.value = String(value);
    commit({ ...rules, minMaxStr: value });
  });

  const strengthToggle = toggle(rules.minMaxStr !== null, (on) => {
    commit({ ...rules, minMaxStr: on ? Number(strengthField.value) || DEFAULT_STR : null });
  });

  {
    const control = document.createElement("div");
    css(control, { display: "flex", alignItems: "center", gap: "10px" });
    control.append(strengthField, strengthToggle);
    strengthCard.body.append(fieldRow("Keep max STR from", control));
  }

  function summarize(count: number): string {
    return count === 0 ? "None" : `${count} picked`;
  }

  /* -------------------------------- Bandeau -------------------------------- */

  const strip = document.createElement("div");
  css(strip, {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    padding: "11px 12px",
    borderRadius: "12px",
    background: "rgba(94,234,212,0.07)",
    border: `1px solid ${BORDER}`,
    flex: "0 0 auto",
  });

  const ready = document.createElement("div");
  css(ready, { fontSize: "13px", fontWeight: "600", color: TEAL });

  const bag = document.createElement("div");
  css(bag, { fontSize: "11.5px", lineHeight: "1.5", color: TEXT });

  const note = document.createElement("div");
  css(note, { fontSize: "11px", lineHeight: "1.5", color: TEXT_DIM });

  strip.append(ready, bag, note);

  /* --------------------------------- Pied ---------------------------------- */

  const resetButton = button("Reset", "neutral", () => commit({ ...DEFAULT_KEEP_RULES }));

  const askButton = button("Ask to hatch", "accent", () => {
    onAsk({
      kind: "hatch",
      label: describeHatchRequest(scope.readySlots.length),
      // Rappelé à la confirmation : c'est ce qui détecte qu'un œuf a éclos ou
      // mûri entre-temps.
      provider: hatchProvider(),
      rules,
    });
    modal.close();
  });
  css(askButton, { marginLeft: "auto" });

  const legend = document.createElement("div");
  css(legend, { fontSize: "11px", lineHeight: "1.5", color: TEXT_DIM });
  legend.textContent = "Numbers are how many you already have.";

  const notice = settingsNotice(
    "hatch",
    "Hatching is not set up. I will use the team you have on.",
    () => {
      modal.close();
      openHatchSettingsModal(host);
    }
  );

  modal.body.append(
    notice.root,
    speciesCard.root,
    mutationCard.root,
    abilityCard.root,
    strengthCard.root,
    legend,
    strip
  );
  modal.footer.append(resetButton, askButton);

  /* --------------------------------- Rendu --------------------------------- */

  function render(): void {
    if (!modal.isOpen()) return;

    renderSpecies();
    renderMutations();
    renderAbilities();

    strengthField.disabled = rules.minMaxStr === null;
    if (rules.minMaxStr !== null) strengthField.value = String(rules.minMaxStr);
    css(strengthField, { opacity: rules.minMaxStr === null ? "0.45" : "1" });
    strengthCard.setSummary(
      rules.minMaxStr === null ? "Off" : `${rules.minMaxStr} and up`,
      rules.minMaxStr !== null
    );

    const waiting = scope.totalEggs - scope.readySlots.length;
    ready.textContent =
      scope.readySlots.length === 0
        ? "No egg is ready"
        : `${scope.readySlots.length} egg${scope.readySlots.length === 1 ? "" : "s"} ready`;

    const sellable = toSell(scope.pets, rules);
    const kept = scope.pets.length - sellable.length;
    bag.textContent = `${scope.inventoryCount}/${scope.capacity} slots. Of ${scope.pets.length} pets, I keep ${kept} and sell ${sellable.length}.`;

    if (!hasAnyRule(rules)) {
      note.textContent =
        "Nothing set to keep, so I will not offer to sell. Favourites and your active team are always safe.";
      css(note, { color: WARN });
    } else {
      note.textContent = `Favourites and your active team are never sold.${waiting > 0 ? ` ${waiting} still growing.` : ""}`;
      css(note, { color: TEXT_DIM });
    }

    askButton.disabled = scope.readySlots.length === 0;
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
