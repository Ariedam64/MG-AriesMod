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
  type KeepRules,
} from "../../../services/companion/chat/hatch";
import { EMPTY_HATCH_SCOPE, readHatchScope, type HatchScope } from "../../../services/companion/chat/hatchRead";
import { loadCompanionSettings, patchCompanionSettings } from "../../../services/companion/state";
import { BORDER, TEAL, TEXT_DIM, WARN, button, css, numberField, toggle } from "../panel-ui";
import { labelledTile, mutationIconEl, spriteTile, tileRow } from "./harvest-chips";
import { fieldRow, filterCard } from "./harvest-fields";
import { abilityIcon, petSpeciesIcon } from "./hatch-chips";
import { openModal } from "./modal";
import { settingsNotice } from "./settings-notice";
import { openHatchSettingsModal } from "./hatch-settings-modal";

/** Les œufs mûrissent pendant qu'on règle les critères. */
const REFRESH_MS = 4000;
const TILE_ICON_PX = 26;
/** La pastille d'une capacité tient dans sa vignette nommée, plus serrée. */
const ABILITY_ICON_PX = 16;
/** Au-delà, la liste des capacités défile plutôt que de pousser le reste dehors. */
const ABILITY_LIST_MAX_PX = 190;
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

  /**
   * Rangée de vignettes sans entrée « tout » : ici, rien coché veut dire rien gardé.
   *
   * Aucun effectif sous les sprites. Ces critères décrivent ce qu'on voudra
   * garder, pas ce qu'on possède : afficher « 0 » sous une capacité qu'on
   * cherche justement à obtenir n'apprend rien et se lit comme une indisponibilité.
   */
  function chipRow(
    values: string[],
    selected: string[],
    labelFor: (value: string) => string,
    iconFor: (value: string) => HTMLElement,
    onPick: (value: string) => void,
    named = false
  ): HTMLElement {
    const row = tileRow();
    for (const value of values) {
      const shared = { icon: iconFor(value), selected: selected.includes(value), onClick: () => onPick(value) };
      row.append(
        named
          ? labelledTile({ ...shared, label: labelFor(value) })
          : spriteTile({ ...shared, title: labelFor(value) })
      );
    }
    return row;
  }

  /**
   * Enferme une longue liste dans une hauteur tenable.
   *
   * Les capacités se comptent par dizaines : déroulées d'un bloc, elles
   * repoussent le bandeau et le bouton hors de la fenêtre.
   */
  function scrollable(row: HTMLElement): HTMLElement {
    const box = document.createElement("div");
    css(box, { maxHeight: `${ABILITY_LIST_MAX_PX}px`, overflowY: "auto", overscrollBehavior: "contain" });
    box.append(row);
    return box;
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

  function renderSpecies(): void {
    const values = offered(scope.possibleSpecies, rules.species);
    // « flex » et non « », sinon la carte retombe en bloc et son en-tête, qui
    // est un bouton, cesse de prendre toute la largeur.
    speciesCard.root.style.display = values.length > 0 ? "flex" : "none";
    if (values.length === 0) return;

    speciesCard.body.replaceChildren(
      chipRow(
        values,
        rules.species,
        (name) => name,
        (name) => cachedIcon(`species:${name}`, () => petSpeciesIcon(name, TILE_ICON_PX)),
        (name) => commit({ ...rules, species: toggled(rules.species, name) })
      )
    );
    speciesCard.setSummary(summarize(rules.species.length), rules.species.length > 0);
  }

  function renderMutations(): void {
    const values = offered(scope.presentMutations, rules.mutations);
    mutationCard.root.style.display = values.length > 0 ? "flex" : "none";
    if (values.length === 0) return;

    mutationCard.body.replaceChildren(
      chipRow(
        values,
        rules.mutations,
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
    // Nommées : un carré de couleur ne se reconnaît pas, et il y en a des dizaines.
    abilityCard.body.replaceChildren(
      scrollable(
        chipRow(
          values,
          rules.abilities,
          (id) => names.get(id) ?? id,
          (id) => cachedIcon(`ability:${id}`, () => abilityIcon(id, ABILITY_ICON_PX)),
          (id) => commit({ ...rules, abilities: toggled(rules.abilities, id) }),
          true
        )
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

  const note = document.createElement("div");
  css(note, { fontSize: "11px", lineHeight: "1.5", color: TEXT_DIM });

  strip.append(ready, note);

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
