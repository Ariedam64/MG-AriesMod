// The game's inventory modal as the sort sees it: the grid, the item list and
// one entry per item card. The class names are the game's emotion hashes, so
// they move with game updates.

import { alignStrengthText } from "./strengthBadge";

export const GRID_SELECTOR = "div.McGrid.css-1kv58ap";
export const FILTERS_BLOCK_SELECTOR = ".McGrid.css-o1vp12";
const ITEMS_CONTAINER_SELECTOR = ".McFlex.css-zo8r2v";
const ITEM_CARD_SELECTORS = [".css-vmnhaw", ".css-1avy1fz"];
const ITEM_CARD_SELECTOR = ITEM_CARD_SELECTORS.join(", ");
/** Text the game prints under the list that the sort makes wrong, cleared out. */
const NOISE_SELECTOR = ".McFlex.css-1tkifdd, .chakra-text.css-glp3xv, .chakra-text.css-repqgl, .chakra-text.css-ah6ymv";
const BASE_INDEX_DATASET_KEY = "tmInventoryBaseIndex";

export interface DomEntry {
  /** The list's direct child, the node that gets moved. */
  wrapper: HTMLElement;
  card: HTMLElement;
}

export function isVisible(el: Element | null): el is Element {
  if (!el || !document.contains(el)) return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  const cs = getComputedStyle(el as HTMLElement);
  if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
  return rect.width > 0 && rect.height > 0;
}

/** The item list. The current layout puts it outside the grid, so the document is searched too. */
export function getItemsContainer(grid: Element): HTMLElement | null {
  return grid.querySelector<HTMLElement>(ITEMS_CONTAINER_SELECTOR) || document.querySelector<HTMLElement>(ITEMS_CONTAINER_SELECTOR);
}

function cardOf(element: HTMLElement): HTMLElement | null {
  if (ITEM_CARD_SELECTORS.some((selector) => element.matches(selector))) return element;
  return element.querySelector<HTMLElement>(ITEM_CARD_SELECTOR);
}

export function clearNoiseText(container: Element): void {
  if (!(container instanceof HTMLElement)) return;
  for (const node of container.querySelectorAll<HTMLElement>(NOISE_SELECTOR)) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (text.textContent) text.textContent = "";
    }
  }
}

/** The list's item cards in DOM order, with their strength text kept aligned. */
export function getDomEntries(container: Element): DomEntry[] {
  clearNoiseText(container);
  const entries: DomEntry[] = [];
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const card = cardOf(child);
    if (!card) continue;
    alignStrengthText(card);
    entries.push({ wrapper: child, card });
  }
  return entries;
}

/** The order the cards were in, to tell whether the game redrew the list. */
export const domOrderOf = (entries: DomEntry[]): HTMLElement[] => entries.map((entry) => entry.wrapper);

export function domOrderChanged(previous: HTMLElement[] | null, entries: DomEntry[]): boolean {
  if (!previous || previous.length !== entries.length) return true;
  return entries.some((entry, i) => previous[i] !== entry.wrapper);
}

/** Tags each card with its position in the unsorted list. */
export function assignBaseIndexes(entries: DomEntry[]): void {
  entries.forEach((entry, index) => {
    entry.wrapper.dataset[BASE_INDEX_DATASET_KEY] = String(index);
    entry.card.dataset[BASE_INDEX_DATASET_KEY] = String(index);
  });
}

export function readBaseIndex(entry: DomEntry): number | null {
  const raw = entry.wrapper.dataset[BASE_INDEX_DATASET_KEY] ?? entry.card.dataset[BASE_INDEX_DATASET_KEY];
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** The card list that follows the paragraph reading `headerText`. */
export function findSectionByHeader(headerText: string): HTMLElement | null {
  const header = Array.from(document.querySelectorAll<HTMLElement>("p.chakra-text")).find(
    (el) => (el.textContent ?? "").trim() === headerText,
  );
  for (let current: HTMLElement | null = header ?? null; current && current !== document.body; current = current.parentElement) {
    const next = current.nextElementSibling as HTMLElement | null;
    if (next?.querySelector(ITEM_CARD_SELECTOR)) return next;
  }
  return null;
}
