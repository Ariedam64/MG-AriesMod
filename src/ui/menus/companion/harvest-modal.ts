// src/ui/menus/companion/harvest-modal.ts
// Sélection de récolte, ouverte depuis le menu des actions.
//
// Trois critères — espèce, mutation, taille — repliés au départ, chacun résumé
// dans son en-tête. Le seul élément toujours visible est le bandeau de
// résultat : quel que soit le filtre qu'on règle, on veut voir ce qu'il retient.
//
// Les crops que le Locker protège restent exclus. Ce n'est pas un critère de
// plus, c'est une consigne posée ailleurs et volontairement : la contredire en
// silence serait le pire des choix. Le bandeau dit combien sont ainsi laissés.
//
// La popup ne récolte rien. Elle produit une *demande*, que le chat transforme
// en question à confirmer : l'automatisation n'est pas autorisée sur le mod
// (cf. `chat/proposals.ts`).

import type { HarvestRequest } from "../../../services/companion/chat";
import { readHarvestable, type HarvestScope } from "../../../services/companion/chat/gardenRead";
import {
  DEFAULT_FILTERS,
  describeFilters,
  filterRows,
  groupVariants,
  mutationsOf,
  mutationsPresent,
  speciesPresent,
  tally,
  type HarvestFilters,
  type HarvestRow,
  type MutationMode,
} from "../../../services/companion/chat/harvest";
import { TEXT, button, css } from "../panel-ui";
import { mutationIconEl, segmented, speciesIcon, variantIcon } from "./harvest-chips";
import {
  fieldRow,
  filterCard,
  lockedNote,
  resultStrip,
  selectionRow,
  summarizeMutations,
  summarizeSize,
  summarizeSpecies,
  toggleIn,
} from "./harvest-fields";
import { openModal } from "./modal";
import { settingsNotice } from "./settings-notice";
import { openHarvestSettingsModal } from "./harvest-settings-modal";

/** Le jardin bouge tout seul : les crops mûrissent pendant qu'on choisit. */
const REFRESH_MS = 4000;
const PREVIEW_ICON_PX = 30;
const TILE_ICON_PX = 26;
/** Au-delà, le bandeau deviendrait une frise illisible. */
const MAX_PREVIEW_VARIANTS = 10;

export type HarvestModal = { close(): void };

export function openHarvestModal(host: HTMLElement, onAsk: (request: HarvestRequest) => void): HarvestModal {
  let scope: HarvestScope = { rows: [], lockedOut: 0 };
  let filters: HarvestFilters = { ...DEFAULT_FILTERS };
  /** Vignettes déjà montées, réutilisées d'une passe à l'autre pour ne pas clignoter. */
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
    title: "What should I harvest?",
    widthPx: 460,
    onClose: () => clearInterval(timer),
  });

  const speciesCard = filterCard("", "Species");
  const mutationCard = filterCard("", "Mutations");
  const sizeCard = filterCard("", "Size");
  const preview = resultStrip();
  const note = lockedNote();

  /* -------------------------- Contenu des cartes -------------------------- */

  /** Le périmètre d'un filtre, c'est tout sauf lui-même. */
  function scopedTo(without: "species" | "mutations"): HarvestRow[] {
    const scope2: HarvestFilters =
      without === "species" ? { ...filters, species: null } : { ...filters, mutations: [] };
    return filterRows(scope.rows, scope2);
  }

  function renderSpecies(): void {
    const available = scopedTo("species");
    speciesCard.body.innerHTML = "";
    speciesCard.body.append(
      selectionRow({
        values: speciesPresent(available),
        counts: tally(available, (row) => [row.species]),
        selected: filters.species,
        iconFor: (name) => cachedIcon(`species:${name}`, () => speciesIcon(name, TILE_ICON_PX)),
        onPick: (name) => {
          filters = { ...filters, species: toggleIn(filters.species, name) };
          render();
        },
        onClear: () => {
          filters = { ...filters, species: null };
          render();
        },
        allLabel: "All",
      })
    );
    speciesCard.setSummary(summarizeSpecies(filters), filters.species !== null);
  }

  function renderMutations(): void {
    // Les mutations proposées sont celles que portent les espèces retenues :
    // offrir un Frozen qu'aucune Aloe ne porte, c'est promettre une sélection
    // vide. Une mutation cochée qui sort du périmètre est décochée, sinon elle
    // filtrerait en silence depuis une case devenue invisible.
    const available = scopedTo("mutations");
    const mutations = mutationsPresent(available);
    const kept = filters.mutations.filter((name) => mutations.includes(name));
    if (kept.length !== filters.mutations.length) filters = { ...filters, mutations: kept };

    // « flex » et non « » : `card()` pose son display en style inline, donc le
    // vider ne rend pas la carte à la feuille de style, il la fait retomber en
    // bloc — et son en-tête, qui est un bouton, cesse alors de prendre toute la
    // largeur. La flèche venait se coller au titre au lieu de rester à droite.
    mutationCard.root.style.display = mutations.length === 0 ? "none" : "flex";
    if (mutations.length === 0) return;

    mutationCard.body.innerHTML = "";
    mutationCard.body.append(
      fieldRow(
        "Match",
        segmented<MutationMode>(
          [
            { value: "any", label: "Any", title: "Has at least one" },
            { value: "all", label: "All", title: "Has every one" },
            { value: "none", label: "None", title: "Has none of them" },
          ],
          filters.mutationMode,
          (value) => {
            filters = { ...filters, mutationMode: value };
            render();
          }
        )
      ),
      selectionRow({
        values: mutations,
        counts: tally(available, mutationsOf),
        selected: filters.mutations.length === 0 ? null : filters.mutations,
        iconFor: (name) => cachedIcon(`mutation:${name}`, () => mutationIconEl(name, TILE_ICON_PX)),
        onPick: (name) => {
          filters = { ...filters, mutations: toggleIn(filters.mutations, name) ?? [] };
          render();
        },
        onClear: () => {
          filters = { ...filters, mutations: [] };
          render();
        },
        allLabel: "Any",
      })
    );
    mutationCard.setSummary(summarizeMutations(filters), filters.mutations.length > 0);
  }

  const sizeValue = document.createElement("span");
  css(sizeValue, { fontSize: "11.5px", color: TEXT, minWidth: "38px", textAlign: "right" });

  const sizeSlider = document.createElement("input");
  sizeSlider.type = "range";
  sizeSlider.className = "qws-pnl-range";
  sizeSlider.min = "50";
  sizeSlider.max = "100";
  sizeSlider.step = "5";
  css(sizeSlider, { flex: "1" });
  sizeSlider.addEventListener("input", () => {
    filters = { ...filters, minSizePct: Number(sizeSlider.value) };
    render();
  });

  {
    // Le curseur a besoin de toute la largeur : son intitulé le précède sur la
    // même ligne plutôt que de lui voler une rangée.
    const control = document.createElement("div");
    css(control, { display: "flex", alignItems: "center", gap: "10px", flex: "1", minWidth: "0" });
    control.append(sizeSlider, sizeValue);
    const row = fieldRow("Minimum size", control);
    css(row, { gap: "14px" });
    sizeCard.body.append(row);
  }

  /* ------------------------------ Périmètre ------------------------------- */

  /**
   * Les crops préservés : le premier tri, et celui dont dépendent les autres.
   *
   * En tête et hors carte, parce qu'il ne se range pas au même niveau que les
   * autres. Espèces, mutations et tailles décrivent ce qu'on cherche DANS un
   * ensemble ; celui-ci décide de quel ensemble on parle. Leurs listes et leurs
   * effectifs se recalculent dessus — `scopedTo` part de `filters`, donc écarter
   * les préservés retire aussi leurs espèces et leurs mutations des choix.
   *
   * Seul critère dont le défaut ferme au lieu d'ouvrir. Préserver se paie au
   * crop, donc en récolter un par erreur coûte quelque chose, alors qu'en
   * laisser un de côté ne coûte qu'un second passage.
   */
  const preservedRow = document.createElement("div");
  css(preservedRow, { display: "flex", flexDirection: "column", gap: "6px", flex: "0 0 auto" });

  const preservedLabel = document.createElement("div");
  css(preservedLabel, { fontSize: "11.5px", fontWeight: "600", color: TEXT });
  preservedRow.append(preservedLabel);

  const preservedControl = document.createElement("div");
  preservedRow.append(preservedControl);

  function renderPreserved(): void {
    const ripe = scope.rows.filter((row) => row.ready && row.preserved).length;
    // Le compte se lit dans l'intitulé : sans lui, un écart entre ce qui est
    // mûr et ce qu'il propose n'aurait aucune explication à l'écran.
    preservedLabel.textContent = ripe === 0 ? "Preserved crops" : `Preserved crops (${ripe} ripe)`;

    preservedControl.replaceChildren(
      segmented<"skip" | "include">(
        [
          { value: "skip", label: "Leave them", title: "They stay in the ground" },
          { value: "include", label: "Pick them too", title: "Treated like any other crop" },
        ],
        filters.includePreserved ? "include" : "skip",
        (value) => {
          filters = { ...filters, includePreserved: value === "include" };
          render();
        }
      )
    );
  }

  /* --------------------------------- Pied --------------------------------- */

  const resetButton = button("Reset", "neutral", () => {
    filters = { ...DEFAULT_FILTERS };
    render();
  });

  const askButton = button("Ask to pick these", "accent", () => {
    onAsk({
      kind: "harvest",
      label: describeFilters(filters),
      // Le fournisseur est rappelé à la confirmation : c'est ce qui permet de
      // détecter que le jardin a changé entre-temps. Il refait le même chemin,
      // protection du Locker comprise, puis applique les critères.
      provider: async () => {
        const fresh = await readHarvestable();
        return { rows: filterRows(fresh.rows, filters), lockedOut: fresh.lockedOut };
      },
    });
    modal.close();
  });
  css(askButton, { marginLeft: "auto" });

  const notice = settingsNotice(
    "harvest",
    "Harvest is not set up. I will pick with the team you have on.",
    () => {
      modal.close();
      openHarvestSettingsModal(host);
    }
  );

  modal.body.append(
    notice.root,
    preservedRow,
    speciesCard.root,
    mutationCard.root,
    sizeCard.root,
    preview.root,
    note.root
  );
  modal.footer.append(resetButton, askButton);

  /* --------------------------------- Rendu -------------------------------- */

  function render(): void {
    if (!modal.isOpen()) return;

    // Le périmètre d'abord : c'est lui qui décide du contenu des autres.
    renderPreserved();
    renderSpecies();
    renderMutations();

    sizeSlider.value = String(filters.minSizePct);
    sizeValue.textContent = `${filters.minSizePct}%`;
    sizeCard.setSummary(summarizeSize(filters), filters.minSizePct > DEFAULT_FILTERS.minSizePct);

    const selected = filterRows(scope.rows, filters);
    const variants = groupVariants(selected);
    const shown = variants.slice(0, MAX_PREVIEW_VARIANTS);
    preview.update(
      selected.length,
      shown.map((variant) => {
        const key = `${variant.species}|${variant.mutations.join(",")}`;
        return {
          icon: cachedIcon(`variant:${key}`, () => variantIcon(variant.species, variant.mutations, PREVIEW_ICON_PX)),
          label: variant.mutations.length ? `${variant.species}: ${variant.mutations.join(", ")}` : variant.species,
          count: variant.count,
        };
      }),
      variants.length - shown.length
    );

    note.update(scope.lockedOut);
    askButton.disabled = selected.length === 0;
  }

  async function refresh(): Promise<void> {
    if (!modal.isOpen()) return;
    scope = await readHarvestable().catch(() => ({ rows: [], lockedOut: 0 }));
    if (!modal.isOpen()) return;
    render();
  }

  const timer = window.setInterval(() => void refresh(), REFRESH_MS);
  render();
  void refresh();

  return { close: modal.close };
}
