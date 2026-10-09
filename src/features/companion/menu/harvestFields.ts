// The harvest popup's filter cards, and the result strip.
//
// Everything starts folded, and each card shows its setting in its header.
// All the criteria can be read at a glance and only the one to change gets
// opened. The summaries are also the counterpart of the unlabelled tiles: the
// sprites say what to pick, the header says what is picked, in words.

import { sectionLabel } from "../../../ui/kit/card";
import { collapsibleCard } from "../../../ui/kit/layout";
import type { HarvestFilters } from "../chat/harvest";
import { listWords } from "../chat/harvest";
import { part } from "./dom";
import { allTile, spriteTile, tileRow } from "./harvestChips";

type FilterCard = {
  root: HTMLElement;
  body: HTMLElement;
  /** The summary on the right of the title. `active`: the setting is no longer the default. */
  setSummary(text: string, active: boolean): void;
};

/** A folded card, title on the left, current state on the right. */
export function filterCard(title: string): FilterCard {
  const summary = part("div", "qws-cmp-filter__summary");
  const header = part("div", "qws-cmp-filter__head");
  header.append(sectionLabel(title), summary);

  const { root, body } = collapsibleCard({ header, collapsed: true, onToggle: () => {} });
  root.classList.add("qws-cmp-filter");

  return {
    root,
    body,
    setSummary(text, active) {
      summary.textContent = text;
      summary.classList.toggle("is-active", active);
    },
  };
}

/** A field line inside a card: a label, its controls. `grow` lets them take the rest of the line. */
export function fieldRow(label: string, controls: HTMLElement[], grow = false): HTMLElement {
  const row = part("div", "qws-cmp-field");
  const holder = part("div", grow ? "qws-cmp-field__control is-grow" : "qws-cmp-field__control");
  holder.append(...controls);
  row.append(part("div", "qws-cmp-field__label", label), holder);
  return row;
}

/* ---------------------------- tile selection ----------------------------- */

/** Toggles a value in a multiple filter; empty means `null`, which means "all". */
export function toggleIn(current: string[] | null, value: string): string[] | null {
  const next = new Set(current ?? []);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next.size === 0 ? null : [...next];
}

type SelectionRowOptions = {
  values: string[];
  counts: Map<string, number>;
  /** `null`: no filter, so the "all" entry is active. */
  selected: string[] | null;
  iconFor(value: string): HTMLElement;
  onPick(value: string): void;
  onClear(): void;
  allLabel: string;
};

/** A grid of tiles led by its "all" entry. */
export function selectionRow(options: SelectionRowOptions): HTMLElement {
  const row = tileRow();
  row.append(allTile(options.allLabel, options.selected === null, options.onClear));
  for (const value of options.values) {
    row.append(
      spriteTile({
        icon: options.iconFor(value),
        title: value,
        count: options.counts.get(value) ?? 0,
        selected: options.selected?.includes(value) ?? false,
        onClick: () => options.onPick(value),
      }),
    );
  }
  return row;
}

/* -------------------------------- summaries ------------------------------- */

/** "Carrot and Tomato", or "4 kinds" past three. */
function nameList(values: string[], fallback: string): string {
  if (values.length === 0) return fallback;
  if (values.length > 3) return `${values.length} kinds`;
  return listWords(values);
}

export function summarizeSpecies(filters: HarvestFilters): string {
  return nameList(filters.species ?? [], "All");
}

export function summarizeMutations(filters: HarvestFilters): string {
  if (filters.mutations.length === 0) return "Any";
  const list = nameList(filters.mutations, "Any");
  if (filters.mutationMode === "none") return `Without ${list}`;
  if (filters.mutationMode === "all") return `All of ${list}`;
  return list;
}

export function summarizeSize(filters: HarvestFilters): string {
  return filters.minSizePct > 50 ? `${filters.minSizePct}% and up` : "Any size";
}

/* --------------------------------- strips --------------------------------- */

/** The tinted box at the bottom of a popup: a headline, then whatever the popup puts under it. */
export function resultBox(): { root: HTMLElement; headline: HTMLElement } {
  const root = part("div", "qws-cmp-result");
  const headline = part("div", "qws-cmp-result__head");
  root.append(headline);
  return { root, headline };
}

/** A sprite and its count, side by side. */
export function countedIcon(icon: HTMLElement, label: string, count: number): HTMLElement {
  const pair = part("div", "qws-cmp-count");
  pair.title = label;
  pair.append(icon, part("span", "", String(count)));
  return pair;
}

type PreviewEntry = { icon: HTMLElement; label: string; count: number };

type ResultStrip = {
  root: HTMLElement;
  /** `entries` holds one ready thumbnail per variant, with its count. */
  update(total: number, entries: PreviewEntry[], hidden: number): void;
};

/**
 * What the companion is about to harvest, as thumbnails.
 *
 * One per look really present, mutations included. It replaces a line by line
 * list: nobody wants a hundred entries, they want to recognise what will be picked.
 */
export function resultStrip(): ResultStrip {
  const { root, headline } = resultBox();
  const sprites = part("div", "qws-cmp-result__icons");
  root.append(sprites);

  return {
    root,
    update(total, entries, hidden) {
      headline.textContent = total === 0 ? "Nothing to pick" : `${total} crop${total === 1 ? "" : "s"}`;
      sprites.replaceChildren(...entries.map((entry) => countedIcon(entry.icon, entry.label, entry.count)));
      sprites.hidden = entries.length === 0;
      if (hidden > 0) sprites.append(part("span", "qws-cmp-more", `+${hidden} more`));
    },
  };
}

/** The note under the strip: what the Locker sets aside. */
export function lockedNote(): { root: HTMLElement; update(lockedOut: number): void } {
  const root = part("div", "qws-cmp-hint");

  return {
    root,
    update(lockedOut) {
      root.classList.toggle("is-warn", lockedOut > 0);
      root.textContent =
        lockedOut === 0
          ? "Your Locker decides what I leave alone."
          : `Leaving ${lockedOut} locked crop${lockedOut === 1 ? "" : "s"} alone.`;
    },
  };
}
