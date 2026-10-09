// Choosing what to harvest, opened from the actions menu.
//
// Three criteria (species, mutation, size), folded at first and each summed up
// in its header. The only thing always in view is the result strip: whatever
// filter is being set, what it keeps should show.
//
// Crops the Locker protects stay out. It is not one more criterion but a rule
// set elsewhere on purpose, and contradicting it silently would be the worst
// choice. The strip says how many are left that way.
//
// The popup harvests nothing. It makes a *request*, which the chat turns into
// a question to confirm: automation is not allowed (see `chat/proposals.ts`).

import { pill } from "../../../ui/kit/badges";
import { button } from "../../../ui/kit/button";
import { settingRow } from "../../../ui/kit/layout";
import { slider } from "../../../ui/kit/sliders";
import type { ChatRequest } from "../chat";
import { harvestRequest } from "../chat/commands/harvest";
import { readHarvestable, type HarvestScope } from "../chat/gardenRead";
import {
  DEFAULT_FILTERS,
  describeFilters,
  filterRows,
  groupVariants,
  mutationsPresent,
  speciesPresent,
  tally,
  type HarvestFilters,
  type HarvestRow,
  type MutationMode,
} from "../chat/harvest";
import { openCompanionModal, part } from "./dom";
import { choiceControl, mutationIconEl, speciesIcon, variantIcon } from "./harvestChips";
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
} from "./harvestFields";
import { openHarvestSettingsModal } from "./harvestSettingsModal";
import { settingsNotice } from "./settingsNotice";
import { openSettingsModal } from "./settingsModal";

/** The garden moves on its own: crops ripen while the player chooses. */
const REFRESH_MS = 4000;
const PREVIEW_ICON_PX = 30;
const TILE_ICON_PX = 26;
/** Past this, the strip would become an unreadable frieze. */
const MAX_PREVIEW_VARIANTS = 10;

export function openHarvestModal(host: HTMLElement, onAsk: (request: ChatRequest) => void): void {
  let scope: HarvestScope = { rows: [], lockedOut: 0 };
  let filters: HarvestFilters = { ...DEFAULT_FILTERS };
  /** Thumbnails already built, reused from one pass to the next so they do not flicker. */
  const iconCache = new Map<string, HTMLElement>();

  const cachedIcon = (key: string, make: () => HTMLElement): HTMLElement => {
    let known = iconCache.get(key);
    if (!known) {
      known = make();
      iconCache.set(key, known);
    }
    return known;
  };

  const setFilters = (patch: Partial<HarvestFilters>): void => {
    filters = { ...filters, ...patch };
    render();
  };

  const modal = openCompanionModal({
    host,
    title: "What should I harvest?",
    widthPx: 460,
    onClose: () => clearInterval(timer),
  });

  const speciesCard = filterCard("Species");
  const mutationCard = filterCard("Mutations");
  const sizeCard = filterCard("Size");
  const preview = resultStrip();
  const note = lockedNote();

  /* ------------------------------- card content ----------------------------- */

  /** A filter's scope is everything but the filter itself. */
  function scopedTo(without: "species" | "mutations"): HarvestRow[] {
    const others: HarvestFilters = without === "species" ? { ...filters, species: null } : { ...filters, mutations: [] };
    return filterRows(scope.rows, others);
  }

  function renderSpecies(): void {
    const available = scopedTo("species");
    speciesCard.body.replaceChildren(
      selectionRow({
        values: speciesPresent(available),
        counts: tally(available, (row) => [row.species]),
        selected: filters.species,
        iconFor: (name) => cachedIcon(`species:${name}`, () => speciesIcon(name, TILE_ICON_PX)),
        onPick: (name) => setFilters({ species: toggleIn(filters.species, name) }),
        onClear: () => setFilters({ species: null }),
        allLabel: "All",
      }),
    );
    speciesCard.setSummary(summarizeSpecies(filters), filters.species !== null);
  }

  const modeControl = choiceControl<MutationMode>(
    [
      { value: "any", label: "Any", title: "Has at least one" },
      { value: "all", label: "All", title: "Has every one" },
      { value: "none", label: "None", title: "Has none of them" },
    ],
    filters.mutationMode,
    (value) => setFilters({ mutationMode: value }),
  );
  const mutationTiles = part("div", "");
  mutationCard.body.append(fieldRow("Match", [modeControl]), mutationTiles);

  function renderMutations(): void {
    // The mutations offered are those the kept species carry: offering a
    // Frozen no Aloe carries promises an empty selection. A ticked mutation
    // that leaves the scope is unticked, or it would filter silently from a
    // box no longer in view.
    const available = scopedTo("mutations");
    const mutations = mutationsPresent(available);
    const kept = filters.mutations.filter((name) => mutations.includes(name));
    if (kept.length !== filters.mutations.length) filters = { ...filters, mutations: kept };

    mutationCard.root.hidden = mutations.length === 0;
    if (mutations.length === 0) return;

    if (modeControl.get() !== filters.mutationMode) modeControl.set(filters.mutationMode);
    mutationTiles.replaceChildren(
      selectionRow({
        values: mutations,
        counts: tally(available, (row) => row.mutations),
        selected: filters.mutations.length === 0 ? null : filters.mutations,
        iconFor: (name) => cachedIcon(`mutation:${name}`, () => mutationIconEl(name, TILE_ICON_PX)),
        onPick: (name) => setFilters({ mutations: toggleIn(filters.mutations, name) ?? [] }),
        onClear: () => setFilters({ mutations: [] }),
        allLabel: "Any",
      }),
    );
    mutationCard.setSummary(summarizeMutations(filters), filters.mutations.length > 0);
  }

  const sizeValue = pill("");
  const sizeSlider = slider(50, 100, 5, filters.minSizePct, { fill: true });
  sizeSlider.addEventListener("input", () => setFilters({ minSizePct: Number(sizeSlider.value) }));
  // The slider needs the whole width: its label precedes it on the same line.
  sizeCard.body.append(fieldRow("Minimum size", [sizeSlider, sizeValue], true));

  /* --------------------------------- scope ---------------------------------- */

  /**
   * Preserved crops: the first sort, and the one the others depend on.
   *
   * On top and outside the cards, because it does not sit at their level:
   * species, mutations and sizes describe what is wanted IN a set, this one
   * decides which set. Their lists and counts are worked out on it, so leaving
   * the preserved out also removes their species and mutations from the choices.
   *
   * The only criterion whose default closes rather than opens. Preserving is
   * paid per crop, so picking one by mistake costs something, while leaving
   * one behind only costs a second pass.
   */
  const preservedControl = choiceControl<"skip" | "include">(
    [
      { value: "skip", label: "Leave them", title: "They stay in the ground" },
      { value: "include", label: "Pick them too", title: "Treated like any other crop" },
    ],
    filters.includePreserved ? "include" : "skip",
    (value) => setFilters({ includePreserved: value === "include" }),
  );
  const preserved = settingRow("Preserved crops", null, preservedControl);
  const preservedLabel = preserved.row.querySelector(".qmm-setting-row__title") as HTMLElement;

  function renderPreserved(): void {
    const ripe = scope.rows.filter((row) => row.ready && row.preserved).length;
    // The count reads in the label: without it, a gap between what is ripe
    // and what he offers would have no explanation on screen.
    const label = ripe === 0 ? "Preserved crops" : `Preserved crops (${ripe} ripe)`;
    if (preservedLabel.textContent !== label) preservedLabel.textContent = label;
    const wanted = filters.includePreserved ? "include" : "skip";
    if (preservedControl.get() !== wanted) preservedControl.set(wanted);
  }

  /* --------------------------------- footer --------------------------------- */

  const resetButton = button("Reset", {
    size: "sm",
    onClick: () => {
      filters = { ...DEFAULT_FILTERS };
      render();
    },
  });

  const askButton = button("Ask to pick these", {
    size: "sm",
    variant: "primary",
    onClick: () => {
      // The provider runs again at confirmation, Locker included, then applies
      // the filters: that is how a garden that changed meanwhile is noticed.
      const chosen = filters;
      onAsk(
        harvestRequest(describeFilters(chosen), async () => {
          const fresh = await readHarvestable();
          return { rows: filterRows(fresh.rows, chosen), lockedOut: fresh.lockedOut };
        }),
      );
      modal.close();
    },
  });
  askButton.classList.add("qws-cmp-foot-end");

  const notice = settingsNotice("harvest", "Harvest is not set up. I will pick with the team you have on.", () => {
    modal.close();
    openHarvestSettingsModal(host, () => openSettingsModal(host));
  });

  // What the Locker sets aside reads with the result it shapes.
  preview.root.append(note.root);
  modal.body.append(notice, preserved.row, speciesCard.root, mutationCard.root, sizeCard.root, preview.root);
  modal.footer.append(resetButton, askButton);

  /* --------------------------------- render --------------------------------- */

  function render(): void {
    if (!modal.isOpen()) return;

    // The scope first: it decides what the others hold.
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
      variants.length - shown.length,
    );

    note.update(scope.lockedOut);
    askButton.setEnabled(selected.length > 0);
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
}
