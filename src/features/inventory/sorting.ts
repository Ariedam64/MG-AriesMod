// Inventory sorting: adds a sort bar to the game's inventory modal, keeps the
// item cards in the chosen order with their coin values, and keeps the pet
// hutch's strength lines in step.
//
// Everything is driven by DOM mutations: the game redraws the inventory with
// React, so the bar is re-attached, the options recomputed and the cards
// reordered whenever the grid, its filters or its list change. The watch on
// the whole page runs at most once a frame; the grid's own observer, scoped
// to the grid, reacts to every change.

import { debounce } from "../../lib/async";
import { onSubtreeChange } from "../../lib/dom";
import { Subscriptions } from "../../lib/emitter";
import { createDomSorter } from "./domSorter";
import { filterContextKey, getActiveFilters, getSearchQuery, onShownItemTypesChange, shownItemTypes } from "./filters";
import {
  GRID_SELECTOR,
  clearNoiseText,
  domOrderChanged,
  domOrderOf,
  getDomEntries,
  getItemsContainer,
  isVisible,
} from "./inventoryDom";
import { PET_HUTCH_ROOT_SELECTOR, updatePetHutchSections } from "./petHutch";
import { loadShowValues, loadSortDirection, loadSortKey, saveShowValues, saveSort } from "./settings";
import { ensureSortBar, renderSortOptions, type SortBar } from "./sortBar";
import { DEFAULT_DIRECTION, computeSortOptions, isSortDirection, type SortDirection, type SortKey } from "./sortOptions";
import { followInventoryValues, onInventoryItemsChange, onPlayersInRoomChange } from "./value";

const GRID_ATTRIBUTES = ["data-checked", "style", "class", "hidden", "aria-hidden"];

function attachInventorySorting(): () => void {
  const sortCards = createDomSorter();
  const subs = new Subscriptions();

  let showValues = loadShowValues() ?? true;
  let grid: Element | null = null;
  let bar: SortBar | null = null;
  let lastAppliedSortKey: SortKey | null = null;
  let lastAppliedDirection: SortDirection | null = null;
  /** Card order right after the last sort, to notice the game redrawing the list. */
  let lastSortedOrder: HTMLElement[] | null = null;
  let lastContextKey: string | null = null;
  let lastRenderedEntryCount: number | null = null;
  /** Listeners that live while a grid is up. */
  let gridListeners: Subscriptions | null = null;

  const resolveGrid = (): Element | null => {
    if (grid && document.contains(grid)) return grid;
    const next = document.querySelector(GRID_SELECTOR);
    if (next !== grid) setGrid(next);
    return grid && document.contains(grid) ? grid : null;
  };

  const sortGrid = (target: Element, sortKey: SortKey, direction: SortDirection) =>
    sortCards(target, sortKey, direction, showValues).then(() => {
      const container = getItemsContainer(target);
      lastSortedOrder = container ? domOrderOf(getDomEntries(container)) : null;
    });

  const sortWithBar = () => {
    const target = resolveGrid();
    if (!target || !bar) return;
    void sortGrid(target, bar.sortSelect.value as SortKey, bar.directionSelect.value as SortDirection);
  };

  // The game rewrites the text under the list as it changes; it is cleared every time.
  let noiseContainer: HTMLElement | null = null;
  const noiseObserver = new MutationObserver(() => {
    if (noiseContainer) clearNoiseText(noiseContainer);
  });
  const observeNoise = (container: HTMLElement | null) => {
    if (noiseContainer === container) return;
    noiseObserver.disconnect();
    noiseContainer = container;
    if (!container) return;
    noiseObserver.observe(container, { subtree: true, childList: true, characterData: true });
    clearNoiseText(container);
  };

  const gridObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) =>
      m.type === "attributes" ? GRID_ATTRIBUTES.includes(m.attributeName || "") : m.type === "childList",
    );
    if (relevant) refresh();
  });

  function setGrid(next: Element | null): void {
    if (grid === next) return;
    gridObserver.disconnect();
    grid = next;
    lastAppliedSortKey = null;
    lastSortedOrder = null;
    lastContextKey = null;
    lastRenderedEntryCount = null;
    if (!grid) {
      gridListeners?.dispose();
      gridListeners = null;
      observeNoise(null);
      return;
    }
    gridObserver.observe(grid, { subtree: true, childList: true, attributes: true, attributeFilter: GRID_ATTRIBUTES });
  }

  const handlers = {
    onSortChange(sortKey: SortKey, direction: SortDirection) {
      lastAppliedSortKey = sortKey;
      lastAppliedDirection = direction;
      saveSort(sortKey, direction);
      const target = resolveGrid();
      if (target) void sortGrid(target, sortKey, direction);
    },
    onShowValuesChange(visible: boolean) {
      showValues = visible;
      saveShowValues(visible);
      sortWithBar();
    },
  };

  const refreshSummary = () => {
    const target = resolveGrid();
    if (target && bar) void bar.summary.update(getActiveFilters(target), getSearchQuery(target));
  };

  /** The sort direction to show: the last one picked, else the saved one, else the key's default. */
  function pickDirection(current: SortBar, sortKey: SortKey): SortDirection {
    const fallback = DEFAULT_DIRECTION[sortKey] ?? "asc";
    const saved = loadSortDirection();
    const preferred = (isSortDirection(current.lastDirection) && current.lastDirection) || saved || fallback;
    current.directionSelect.value = preferred;
    if (!isSortDirection(current.directionSelect.value)) current.directionSelect.value = fallback;
    return current.directionSelect.value as SortDirection;
  }

  function update(): void {
    const target = resolveGrid();
    if (!target || !isVisible(target)) return;
    void followInventoryValues();

    const current = ensureSortBar(target, handlers);
    if (!current) return;
    bar = current;
    if (!gridListeners) {
      // The total follows the items and the friend bonus, the cards the
      // friend bonus, the sort options the item types a filter shows.
      gridListeners = new Subscriptions();
      gridListeners.add(onInventoryItemsChange(refreshSummary));
      gridListeners.add(
        onPlayersInRoomChange(() => {
          refreshSummary();
          sortWithBar();
        }),
      );
      gridListeners.add(
        onShownItemTypesChange((contextKey) => {
          if (contextKey === lastContextKey) setTimeout(refresh, 0);
        }),
      );
    }
    current.showValues.checked = showValues;

    const filters = getActiveFilters(target);
    const search = getSearchQuery(target);
    const container = getItemsContainer(target);
    observeNoise(container);
    const entries = container ? getDomEntries(container) : [];
    const domChanged = domOrderChanged(lastSortedOrder, entries);
    lastContextKey = filterContextKey(filters, search);
    void current.summary.update(filters, search);

    const options = computeSortOptions(filters, shownItemTypes(filters, search));
    const offered = (key: string | null) => (key && options.some((o) => o.value === key) ? key : null);
    if (lastRenderedEntryCount !== entries.length || !current.sortSelect.options.length) {
      renderSortOptions(current.sortSelect, options, offered(current.lastSortKey) || offered(loadSortKey()));
      lastRenderedEntryCount = entries.length;
    }
    const sortKey = current.sortSelect.value as SortKey;
    current.lastSortKey = sortKey;
    const direction = pickDirection(current, sortKey);
    current.lastDirection = direction;

    if (sortKey !== lastAppliedSortKey || direction !== lastAppliedDirection || domChanged) {
      lastAppliedSortKey = sortKey;
      lastAppliedDirection = direction;
      saveSort(sortKey, direction);
      void sortGrid(target, sortKey, direction);
    } else {
      lastSortedOrder = domOrderOf(entries);
    }
  }

  const refresh = debounce(update, 120);

  // Pet hutch: lists are hidden for their first update so the game's own
  // strength text does not flash, then refreshed as the DOM changes.
  let lastHutchRoot: HTMLElement | null = null;
  let hutchNeedsInit = true;
  const refreshPetHutch = debounce(() => void updatePetHutchSections(), 120);
  const maybeInitPetHutch = () => {
    const root = document.querySelector<HTMLElement>(PET_HUTCH_ROOT_SELECTOR);
    if (root !== lastHutchRoot) {
      lastHutchRoot = root;
      hutchNeedsInit = true;
    }
    if (!root || !hutchNeedsInit) return;
    void updatePetHutchSections(true).then((applied) => {
      if (applied) hutchNeedsInit = false;
    });
  };

  const onPageChange = () => {
    const current = grid && document.contains(grid) ? grid : null;
    if (grid && !current) setGrid(null);
    const next = document.querySelector(GRID_SELECTOR);
    if (next !== current) {
      setGrid(next);
      if (next) update();
    }
    maybeInitPetHutch();
    refreshPetHutch();
  };

  const onGridInput = (event: Event) => {
    const target = event.target as Element | null;
    const within = target?.closest(GRID_SELECTOR);
    if (within && within === resolveGrid()) setTimeout(refresh, 0);
  };

  const stopPageWatch = onSubtreeChange(document.body || document.documentElement, onPageChange);
  setGrid(document.querySelector(GRID_SELECTOR));
  document.addEventListener("change", onGridInput, true);
  document.addEventListener("input", onGridInput, true);
  update();
  maybeInitPetHutch();
  refreshPetHutch();

  subs.add(() => {
    gridObserver.disconnect();
    stopPageWatch();
    noiseObserver.disconnect();
    refresh.cancel();
    refreshPetHutch.cancel();
    document.removeEventListener("change", onGridInput, true);
    document.removeEventListener("input", onGridInput, true);
    gridListeners?.dispose();
    bar?.wrap.remove();
  });
  return () => subs.dispose();
}

/**
 * Starts the inventory sort once the page has loaded and the inventory or the
 * pet hutch first shows. Returns a function that undoes it.
 */
export function startInventorySortingObserver(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let stop: (() => void) | null = null;
  let stopWaiting: (() => void) | null = null;

  const attachIfReady = (): boolean => {
    if (stop) return true;
    if (!document.querySelector(GRID_SELECTOR) && !document.querySelector(PET_HUTCH_ROOT_SELECTOR)) return false;
    stop = attachInventorySorting();
    return true;
  };

  const start = () => {
    if (attachIfReady()) return;
    const target = document.body || document.documentElement;
    if (!target) return;
    stopWaiting = onSubtreeChange(target, () => {
      if (attachIfReady()) {
        stopWaiting?.();
        stopWaiting = null;
      }
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  return () => {
    document.removeEventListener("DOMContentLoaded", start);
    stopWaiting?.();
    stop?.();
  };
}
