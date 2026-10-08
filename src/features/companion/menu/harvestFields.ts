// The harvest popup's filter cards, and the result strip.
//
// Everything starts folded, and each card shows its setting in its header.
// All the criteria can be read at a glance and only the one to change gets
// opened. The summaries are also the counterpart of the unlabelled tiles: the
// sprites say what to pick, the header says what is picked, in words.

import { sectionLabel } from "../../../ui/kit/card";
import { collapsibleCard } from "../../../ui/kit/layout";
import { color } from "../../../ui/kit/theme";
import type { HarvestFilters } from "../chat/harvest";
import { listWords } from "../chat/harvest";
import { styled } from "./dom";
import { allTile, spriteTile, tileRow } from "./harvestChips";

type FilterCard = {
  root: HTMLElement;
  body: HTMLElement;
  /** The summary on the right of the title. `active`: the setting is no longer the default. */
  setSummary(text: string, active: boolean): void;
};

/** A folded card, title on the left, current state on the right. */
export function filterCard(title: string): FilterCard {
  const summary = styled("div", {
    marginLeft: "auto",
    fontSize: "11px",
    color: color.textDim,
    textAlign: "right",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "60%",
  });

  const header = styled("div", { display: "flex", alignItems: "center", gap: "8px", width: "100%" });
  header.append(sectionLabel(title), summary);

  const { root, body } = collapsibleCard({ header, collapsed: true, onToggle: () => {} });
  Object.assign(root.style, { padding: "9px 11px", gap: "9px", flex: "0 0 auto" });

  return {
    root,
    body,
    setSummary(text, active) {
      summary.textContent = text;
      summary.style.color = active ? color.accent : color.textDim;
    },
  };
}

/** A field line inside a card: a label, a control. */
export function fieldRow(label: string, control: HTMLElement): HTMLElement {
  const row = styled("div", { display: "flex", alignItems: "center", gap: "10px", justifyContent: "space-between" });
  row.append(styled("div", { fontSize: "11.5px", color: color.text }, label), control);
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

/** The coloured box at the bottom of a popup: a headline, then whatever the popup puts under it. */
export function resultBox(): { root: HTMLElement; headline: HTMLElement } {
  const root = styled("div", {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "11px 12px",
    borderRadius: "12px",
    background: color.accentSoft,
    border: `1px solid ${color.border}`,
    flex: "0 0 auto",
  });
  const headline = styled("div", { fontSize: "13px", fontWeight: "600", color: color.accent });
  root.append(headline);
  return { root, headline };
}

/** A sprite and its count, side by side. */
export function countedIcon(icon: HTMLElement, label: string, count: number): HTMLElement {
  const pair = styled("div", { display: "flex", alignItems: "center", gap: "3px" });
  pair.title = label;
  pair.append(icon, styled("span", { fontSize: "11px", color: color.textDim }, String(count)));
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
  const sprites = styled("div", { display: "flex", alignItems: "flex-end", gap: "10px", flexWrap: "wrap" });
  root.append(sprites);

  return {
    root,
    update(total, entries, hidden) {
      headline.textContent = total === 0 ? "Nothing to pick" : `${total} crop${total === 1 ? "" : "s"}`;
      sprites.replaceChildren(...entries.map((entry) => countedIcon(entry.icon, entry.label, entry.count)));
      sprites.style.display = entries.length === 0 ? "none" : "flex";
      if (hidden > 0) {
        sprites.append(styled("span", { fontSize: "11px", color: color.textDim, alignSelf: "center" }, `+${hidden} more`));
      }
    },
  };
}

/** The note under the strip: what the Locker sets aside. */
export function lockedNote(): { root: HTMLElement; update(lockedOut: number): void } {
  const root = styled("div", { fontSize: "11px", lineHeight: "1.5", color: color.textDim });

  return {
    root,
    update(lockedOut) {
      if (lockedOut === 0) {
        root.textContent = "Your Locker decides what I leave alone.";
        root.style.color = color.textDim;
        return;
      }
      root.textContent = `Leaving ${lockedOut} locked crop${lockedOut === 1 ? "" : "s"} alone.`;
      root.style.color = color.warn;
    },
  };
}
