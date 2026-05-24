import {
  getCachedLeaderboard,
  updateLeaderboardCache,
  fetchLeaderboardCoins,
  fetchLeaderboardEggsHatched,
  fetchLeaderboardPetJournal,
  fetchLeaderboardItems,
  onWelcome,
  getCachedMyProfile,
  setCachedTotalPets,
} from "../../../../ariesModAPI";
import type {
  LeaderboardRow,
  LeaderboardData,
  ItemLeaderboardType,
} from "../../../../ariesModAPI";
import { style, ensureSharedStyles, createKeyBlocker, createPlayerBadges } from "../shared";
import { formatPrice } from "../../../../utils/format";
import { viewJournalById } from "./playerViewActions";
import {
  plantCatalog,
  eggCatalog,
  toolCatalog,
  decorCatalog,
} from "../../../../data";
import { attachSpriteIcon } from "../../../spriteIconCache";

type LeaderboardCategory = "coins" | "eggsHatched" | "petJournal" | "items";

const PET_JOURNAL_CATEGORY: LeaderboardCategory = "petJournal";
const ITEMS_CATEGORY: LeaderboardCategory = "items";

type SelectableItemType = Exclude<ItemLeaderboardType, "Produce">;
const ITEM_TYPES: readonly SelectableItemType[] = ["Seed", "Egg", "Tool", "Decor"] as const;
const ITEM_TYPE_LABELS: Record<SelectableItemType, string> = {
  Seed: "Seeds",
  Egg: "Eggs",
  Tool: "Tools",
  Decor: "Decors",
};

const ITEMS_LIMIT = 50;

interface ItemOption {
  id: string;
  name: string;
  spriteCats: string[];
}

interface ItemsCacheEntry {
  rows: LeaderboardRow[];
  myRank: LeaderboardRow | null;
}

const itemsCacheKey = (type: ItemLeaderboardType, id: string) => `${type}:${id}`;

/** Build the list of selectable items for a given leaderboard type, pulled from MGData catalogs. */
function getItemListForType(type: SelectableItemType): ItemOption[] {
  const out: ItemOption[] = [];
  switch (type) {
    case "Seed": {
      const cat = plantCatalog as Record<string, any>;
      for (const id of Object.keys(cat)) {
        const e = cat[id];
        if (!e || typeof e !== "object") continue;
        const name = (e.seed && typeof e.seed === "object" && typeof e.seed.name === "string" && e.seed.name)
          || (typeof e.name === "string" ? e.name : id);
        out.push({ id, name, spriteCats: ["seed"] });
      }
      break;
    }
    case "Egg": {
      const cat = eggCatalog as Record<string, any>;
      for (const id of Object.keys(cat)) {
        const e = cat[id];
        if (!e || typeof e !== "object") continue;
        const name = typeof e.name === "string" && e.name ? e.name : id;
        out.push({ id, name, spriteCats: ["pet"] });
      }
      break;
    }
    case "Tool": {
      const cat = toolCatalog as Record<string, any>;
      for (const id of Object.keys(cat)) {
        const e = cat[id];
        if (!e || typeof e !== "object") continue;
        // The dynamic items catalog contains non-tools too; filter on `type` when present.
        if (e.type != null && String(e.type).toLowerCase() !== "tool") continue;
        const name = typeof e.name === "string" && e.name ? e.name : id;
        out.push({ id, name, spriteCats: ["item"] });
      }
      break;
    }
    case "Decor": {
      const cat = decorCatalog as Record<string, any>;
      for (const id of Object.keys(cat)) {
        const e = cat[id];
        if (!e || typeof e !== "object") continue;
        const name = typeof e.name === "string" && e.name ? e.name : id;
        out.push({ id, name, spriteCats: ["decor"] });
      }
      break;
    }
  }
  // Keep MGData's natural order (rarity-grouped) instead of alphabetical.
  return out;
}

function formatLeaderboardValue(value: number, category: LeaderboardCategory): string {
  if (category === PET_JOURNAL_CATEGORY) {
    const safe = Number.isFinite(value) ? value : 0;
    return `${safe.toFixed(2)}%`;
  }
  return formatPrice(value) ?? String(value);
}

export function createLeaderboardTab() {
  ensureSharedStyles();

  const root = document.createElement("div");
  style(root, {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    gap: "12px",
  });

  // State
  let activeCategory: LeaderboardCategory = "coins";
  let isLoading = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Items leaderboard state
  let activeItemType: SelectableItemType = "Seed";
  let activeItemId: string | null = null;
  const itemsCache = new Map<string, ItemsCacheEntry>();

  // Category tabs container
  const tabsContainer = document.createElement("div");
  style(tabsContainer, {
    display: "flex",
    gap: "6px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    paddingBottom: "8px",
  });

  const coinsTab = createCategoryTab("Coins", "coins");
  const eggsTab = createCategoryTab("Eggs Hatched", "eggsHatched");
  const petJournalTab = createCategoryTab("Pet Journal", "petJournal");
  const itemsTab = createCategoryTab("Items", "items");

  function createCategoryTab(label: string, category: LeaderboardCategory): HTMLElement {
    const tab = document.createElement("button");
    tab.textContent = label;
    style(tab, {
      flex: "1",
      padding: "8px 16px",
      border: "none",
      borderRadius: "8px",
      background: "transparent",
      color: "rgba(226,232,240,0.6)",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 120ms ease",
    });

    const updateTabStyle = () => {
      if (activeCategory === category) {
        style(tab, {
          background: "rgba(94,234,212,0.15)",
          color: "#5eead4",
        });
      } else {
        style(tab, {
          background: "transparent",
          color: "rgba(226,232,240,0.6)",
        });
      }
    };

    tab.onmouseenter = () => {
      if (activeCategory !== category) {
        style(tab, { background: "rgba(255,255,255,0.05)" });
      }
    };

    tab.onmouseleave = () => {
      updateTabStyle();
    };

    tab.onclick = () => {
      if (activeCategory !== category) {
        activeCategory = category;
        updateTabStyle();
        updateCategoryTab(coinsTab, "coins");
        updateCategoryTab(eggsTab, "eggsHatched");
        updateCategoryTab(petJournalTab, "petJournal");
        updateCategoryTab(itemsTab, "items");
        searchBar.value = "";
        updateItemsToolbarVisibility();
        if (activeCategory === "items") {
          ensureItemsSelection();
          renderItemPickerButton();
          loadItemsForCurrentSelection();
        } else {
          renderLeaderboard();
        }
      }
    };

    updateTabStyle();
    return tab;
  }

  function updateCategoryTab(tab: HTMLElement, category: LeaderboardCategory) {
    if (activeCategory === category) {
      style(tab, {
        background: "rgba(94,234,212,0.15)",
        color: "#5eead4",
      });
    } else {
      style(tab, {
        background: "transparent",
        color: "rgba(226,232,240,0.6)",
      });
    }
  }

  tabsContainer.append(coinsTab, eggsTab, petJournalTab, itemsTab);

  // ─── Items sub-toolbar (type pills + searchable item picker, single row) ────
  const itemsToolbar = document.createElement("div");
  style(itemsToolbar, {
    display: "none",
    flexDirection: "row",
    alignItems: "center",
    gap: "8px",
  });

  const typePillsRow = document.createElement("div");
  style(typePillsRow, {
    display: "flex",
    gap: "6px",
    flexShrink: "0",
  });

  const typePillByType = new Map<SelectableItemType, HTMLButtonElement>();
  const updateTypePillStyles = () => {
    for (const [type, pill] of typePillByType) {
      const isActive = activeItemType === type;
      style(pill, {
        background: isActive ? "rgba(94,234,212,0.15)" : "rgba(255,255,255,0.04)",
        color: isActive ? "#5eead4" : "rgba(226,232,240,0.7)",
        borderColor: isActive ? "rgba(94,234,212,0.35)" : "rgba(255,255,255,0.08)",
      });
    }
  };

  for (const type of ITEM_TYPES) {
    const pill = document.createElement("button");
    pill.textContent = ITEM_TYPE_LABELS[type];
    style(pill, {
      padding: "6px 12px",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "999px",
      background: "rgba(255,255,255,0.04)",
      color: "rgba(226,232,240,0.7)",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 120ms ease",
    });
    pill.onmouseenter = () => {
      if (activeItemType !== type) {
        style(pill, { background: "rgba(255,255,255,0.08)" });
      }
    };
    pill.onmouseleave = () => updateTypePillStyles();
    pill.onclick = () => {
      if (activeItemType === type) return;
      activeItemType = type;
      activeItemId = null;
      ensureItemsSelection();
      updateTypePillStyles();
      renderItemPickerButton();
      closeItemPicker();
      loadItemsForCurrentSelection();
    };
    typePillByType.set(type, pill);
    typePillsRow.appendChild(pill);
  }
  updateTypePillStyles();

  // Item picker (button + popover)
  const pickerWrapper = document.createElement("div");
  style(pickerWrapper, {
    position: "relative",
    display: "flex",
    alignItems: "stretch",
    flex: "1",
    minWidth: "0",
  });

  const pickerButton = document.createElement("button");
  style(pickerButton, {
    flex: "1",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "border-color 150ms ease",
    textAlign: "left",
  });
  pickerButton.onmouseenter = () => style(pickerButton, { borderColor: "rgba(94,234,212,0.35)" });
  pickerButton.onmouseleave = () => style(pickerButton, { borderColor: "rgba(255,255,255,0.12)" });

  const pickerIcon = document.createElement("div");
  style(pickerIcon, {
    width: "28px",
    height: "28px",
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
  });

  const pickerLabel = document.createElement("div");
  style(pickerLabel, {
    flex: "1",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });

  const pickerChevron = document.createElement("span");
  pickerChevron.textContent = "▾";
  style(pickerChevron, {
    color: "rgba(226,232,240,0.5)",
    fontSize: "12px",
    flexShrink: "0",
  });

  pickerButton.append(pickerIcon, pickerLabel, pickerChevron);

  // Popover — anchored to the right edge of the picker, extends leftward so
  // item names stay readable even when the picker is narrow next to the pills.
  const pickerPopover = document.createElement("div");
  style(pickerPopover, {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: "0",
    width: "260px",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "260px",
    display: "none",
    flexDirection: "column",
    background: "rgba(15,23,42,0.98)",
    border: "1px solid rgba(94,234,212,0.25)",
    borderRadius: "10px",
    boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
    zIndex: "10",
    overflow: "hidden",
  });

  const pickerSearchInput = document.createElement("input");
  pickerSearchInput.type = "text";
  pickerSearchInput.placeholder = "Search item...";
  style(pickerSearchInput, {
    padding: "8px 10px",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#e7eef7",
    fontSize: "12px",
    outline: "none",
  });
  const pickerKeyBlocker = createKeyBlocker(() => document.activeElement === pickerSearchInput);
  pickerKeyBlocker.attach();

  const pickerOptionsList = document.createElement("div");
  pickerOptionsList.className = "qws-ch-scrollable";
  style(pickerOptionsList, {
    flex: "1",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
  });

  pickerPopover.append(pickerSearchInput, pickerOptionsList);
  pickerWrapper.append(pickerButton, pickerPopover);

  let isPickerOpen = false;
  const openItemPicker = () => {
    if (isPickerOpen) return;
    isPickerOpen = true;
    style(pickerPopover, { display: "flex" });
    pickerSearchInput.value = "";
    renderPickerOptions("");
    requestAnimationFrame(() => pickerSearchInput.focus());
  };
  const closeItemPicker = () => {
    if (!isPickerOpen) return;
    isPickerOpen = false;
    style(pickerPopover, { display: "none" });
  };

  pickerButton.onclick = (ev) => {
    ev.stopPropagation();
    if (isPickerOpen) closeItemPicker();
    else openItemPicker();
  };
  pickerSearchInput.oninput = () => renderPickerOptions(pickerSearchInput.value.trim());
  // Click outside closes
  const outsideClickHandler = (ev: MouseEvent) => {
    if (!isPickerOpen) return;
    const target = ev.target as Node | null;
    if (target && !pickerWrapper.contains(target)) closeItemPicker();
  };
  document.addEventListener("click", outsideClickHandler, true);

  function renderPickerOptions(filter: string): void {
    pickerOptionsList.innerHTML = "";
    const items = getItemListForType(activeItemType);
    const needle = filter.toLowerCase();
    const filtered = needle
      ? items.filter((it) => it.name.toLowerCase().includes(needle) || it.id.toLowerCase().includes(needle))
      : items;

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      style(empty, {
        padding: "12px",
        textAlign: "center",
        color: "rgba(226,232,240,0.5)",
        fontSize: "12px",
      });
      empty.textContent = items.length === 0 ? "No items available (data loading...)" : "No matches";
      pickerOptionsList.appendChild(empty);
      return;
    }

    for (const it of filtered) {
      const row = document.createElement("button");
      const isSelected = it.id === activeItemId;
      style(row, {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "6px 10px",
        border: "none",
        background: isSelected ? "rgba(94,234,212,0.12)" : "transparent",
        color: "#e7eef7",
        cursor: "pointer",
        textAlign: "left",
        fontSize: "12px",
        transition: "background 100ms ease",
      });
      row.onmouseenter = () => {
        if (it.id !== activeItemId) style(row, { background: "rgba(255,255,255,0.05)" });
      };
      row.onmouseleave = () => {
        if (it.id !== activeItemId) style(row, { background: "transparent" });
      };

      const iconBox = document.createElement("div");
      style(iconBox, {
        width: "24px",
        height: "24px",
        flexShrink: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "5px",
        background: "rgba(255,255,255,0.06)",
      });
      attachSpriteIcon(iconBox, it.spriteCats, [it.id], 22, "items-picker");

      const nameSpan = document.createElement("div");
      nameSpan.textContent = it.name;
      style(nameSpan, {
        flex: "1",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });

      row.append(iconBox, nameSpan);
      row.onclick = () => {
        if (activeItemId === it.id) {
          closeItemPicker();
          return;
        }
        activeItemId = it.id;
        renderItemPickerButton();
        closeItemPicker();
        loadItemsForCurrentSelection();
      };
      pickerOptionsList.appendChild(row);
    }
  }

  function renderItemPickerButton(): void {
    const items = getItemListForType(activeItemType);
    const selected = items.find((it) => it.id === activeItemId) || null;
    pickerIcon.innerHTML = "";
    if (selected) {
      attachSpriteIcon(pickerIcon, selected.spriteCats, [selected.id], 24, "items-current");
      pickerLabel.textContent = selected.name;
      style(pickerLabel, { color: "#e7eef7" });
    } else {
      pickerLabel.textContent = items.length === 0 ? "No items available" : "Select an item...";
      style(pickerLabel, { color: "rgba(226,232,240,0.5)" });
    }
  }

  function ensureItemsSelection(): void {
    const items = getItemListForType(activeItemType);
    if (!items.length) {
      activeItemId = null;
      return;
    }
    if (!activeItemId || !items.some((it) => it.id === activeItemId)) {
      activeItemId = items[0].id;
    }
  }

  function updateItemsToolbarVisibility(): void {
    style(itemsToolbar, { display: activeCategory === ITEMS_CATEGORY ? "flex" : "none" });
  }

  itemsToolbar.append(typePillsRow, pickerWrapper);

  // Search bar + refresh button container
  const controlsContainer = document.createElement("div");
  style(controlsContainer, {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  });

  const searchBar = document.createElement("input");
  searchBar.type = "text";
  searchBar.placeholder = "Search player...";
  style(searchBar, {
    flex: "1",
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    fontSize: "13px",
    outline: "none",
    transition: "border-color 150ms ease",
  });

  // Block game inputs when search bar is focused
  const keyBlocker = createKeyBlocker(() => document.activeElement === searchBar);
  keyBlocker.attach();

  searchBar.onfocus = () => style(searchBar, { borderColor: "rgba(94,234,212,0.35)" });
  searchBar.onblur = () => style(searchBar, { borderColor: "rgba(255,255,255,0.12)" });

  // Refresh button
  const refreshButton = document.createElement("button");
  refreshButton.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  `;
  style(refreshButton, {
    padding: "10px 16px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    background: "rgba(94,234,212,0.12)",
    color: "#5eead4",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 120ms ease",
  });

  refreshButton.onmouseenter = () => {
    style(refreshButton, {
      background: "rgba(94,234,212,0.2)",
      borderColor: "rgba(94,234,212,0.35)",
    });
  };

  refreshButton.onmouseleave = () => {
    style(refreshButton, {
      background: "rgba(94,234,212,0.12)",
      borderColor: "rgba(255,255,255,0.12)",
    });
  };

  refreshButton.onclick = async () => {
    await performRefresh();
  };

  controlsContainer.append(searchBar, refreshButton);

  // Error/toast banner — used for click-modal errors (private journal, not found, etc.)
  const errorBanner = document.createElement("div");
  style(errorBanner, {
    display: "none",
    padding: "10px 12px",
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#fca5a5",
  });
  let errorBannerTimer: ReturnType<typeof setTimeout> | null = null;
  const showErrorBanner = (message: string) => {
    if (errorBannerTimer) clearTimeout(errorBannerTimer);
    errorBanner.textContent = message;
    errorBanner.style.display = "block";
    errorBannerTimer = setTimeout(() => {
      errorBanner.style.display = "none";
    }, 4000);
  };

  // Leaderboard list container
  const leaderboardList = document.createElement("div");
  leaderboardList.className = "qws-ch-scrollable";
  style(leaderboardList, {
    flex: "1",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    paddingRight: "8px",
  });

  // Footer for "Your rank" (only shown if not in top 15)
  const footer = document.createElement("div");
  style(footer, {
    padding: "12px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    fontSize: "12px",
    color: "rgba(226,232,240,0.7)",
    display: "none",
  });

  // Refresh the active category from API
  const performRefresh = async () => {
    if (isLoading) return;

    if (activeCategory === ITEMS_CATEGORY) {
      itemsCache.delete(itemsCacheKey(activeItemType, activeItemId ?? ""));
      await loadItemsForCurrentSelection({ force: true });
      return;
    }

    isLoading = true;
    renderLeaderboard(); // Show loading state

    const query = searchBar.value.trim();
    const myPlayerId = getCachedMyProfile()?.playerId;

    try {
      let rows: LeaderboardRow[] = [];
      let myRank: LeaderboardRow | null = null;

      if (activeCategory === "coins") {
        const result = await fetchLeaderboardCoins({
          query: query || undefined,
          limit: 15,
          myPlayerId,
        });
        rows = result.rows;
        myRank = result.myRank;
      } else if (activeCategory === "eggsHatched") {
        const result = await fetchLeaderboardEggsHatched({
          query: query || undefined,
          limit: 15,
          myPlayerId,
        });
        rows = result.rows;
        myRank = result.myRank;
      } else {
        const result = await fetchLeaderboardPetJournal({
          query: query || undefined,
          limit: 15,
          myPlayerId,
        });
        rows = result.rows;
        myRank = result.myRank;
        setCachedTotalPets(result.totalPets);
      }

      // Update cache with new data (including refreshed myRank)
      const cachedData = getCachedLeaderboard();
      if (cachedData) {
        const updatedData: LeaderboardData = {
          coins:
            activeCategory === "coins"
              ? { top: rows, myRank: myRank ?? cachedData.coins.myRank }
              : cachedData.coins,
          eggsHatched:
            activeCategory === "eggsHatched"
              ? { top: rows, myRank: myRank ?? cachedData.eggsHatched.myRank }
              : cachedData.eggsHatched,
          petJournal:
            activeCategory === "petJournal"
              ? { top: rows, myRank: myRank ?? cachedData.petJournal.myRank }
              : cachedData.petJournal,
        };
        updateLeaderboardCache(updatedData);
      }

      isLoading = false;
      renderLeaderboard();
    } catch (error) {
      console.error("[Leaderboard] Refresh failed:", error);
      isLoading = false;
      renderLeaderboard();
    }
  };

  // ─── Items leaderboard loader ───────────────────────────────────────────────
  // Fires when the items tab activates, the type/item changes, or the user types
  // in the player search bar (so query is applied server-side).
  async function loadItemsForCurrentSelection(opts?: { force?: boolean }): Promise<void> {
    if (activeCategory !== ITEMS_CATEGORY) return;
    ensureItemsSelection();
    if (!activeItemId) {
      // MGData not ready yet — show waiting state and retry shortly.
      renderLeaderboard();
      scheduleItemsDataRetry();
      return;
    }
    const query = searchBar.value.trim();
    const cacheKey = itemsCacheKey(activeItemType, activeItemId);
    const useCache = !opts?.force && !query;

    if (useCache) {
      const cached = itemsCache.get(cacheKey);
      if (cached) {
        renderLeaderboard();
        return;
      }
    }

    if (isLoading) return;
    isLoading = true;
    renderLeaderboard();

    const myPlayerId = getCachedMyProfile()?.playerId;
    const requestedType = activeItemType;
    const requestedId = activeItemId;
    try {
      const result = await fetchLeaderboardItems({
        type: requestedType,
        id: requestedId,
        query: query || undefined,
        limit: ITEMS_LIMIT,
        myPlayerId,
      });
      // Only commit if user hasn't switched selection meanwhile (and search hasn't changed).
      if (
        activeCategory === ITEMS_CATEGORY &&
        activeItemType === requestedType &&
        activeItemId === requestedId &&
        searchBar.value.trim() === query
      ) {
        if (!query) {
          itemsCache.set(cacheKey, { rows: result.rows, myRank: result.myRank });
        }
        isLoading = false;
        // For a player-search query, render the search-result rows directly; the
        // cached entry (if any) is preserved for the unfiltered view.
        if (query) {
          renderLeaderboard(result.rows);
        } else {
          renderLeaderboard();
        }
      } else {
        isLoading = false;
      }
    } catch (error) {
      console.error("[Leaderboard] Items load failed:", error);
      isLoading = false;
      renderLeaderboard();
    }
  }

  // MGData catalogs populate async; if the picker has no options at activation
  // time, poll a few times so the user doesn't have to manually re-click.
  let itemsRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let itemsRetryAttempts = 0;
  function scheduleItemsDataRetry(): void {
    if (itemsRetryTimer) return;
    if (itemsRetryAttempts >= 20) return; // ~10s cap
    itemsRetryTimer = setTimeout(() => {
      itemsRetryTimer = null;
      itemsRetryAttempts += 1;
      if (activeCategory !== ITEMS_CATEGORY) return;
      const items = getItemListForType(activeItemType);
      if (items.length) {
        ensureItemsSelection();
        renderItemPickerButton();
        loadItemsForCurrentSelection();
      } else {
        scheduleItemsDataRetry();
      }
    }, 500);
  }

  // Search with debounce
  const performSearch = async () => {
    const query = searchBar.value.trim();

    if (activeCategory === ITEMS_CATEGORY) {
      // For the items category, the query is part of the same request — re-fetch.
      await loadItemsForCurrentSelection();
      return;
    }

    if (!query) {
      // Empty search → show cached top 15
      renderLeaderboard();
      return;
    }

    if (isLoading) return;
    isLoading = true;
    renderLeaderboard(); // Show loading state

    try {
      let rows: LeaderboardRow[] = [];
      if (activeCategory === "coins") {
        const result = await fetchLeaderboardCoins({ query, limit: 15 });
        rows = result.rows;
      } else if (activeCategory === "eggsHatched") {
        const result = await fetchLeaderboardEggsHatched({ query, limit: 15 });
        rows = result.rows;
      } else {
        const result = await fetchLeaderboardPetJournal({ query, limit: 15 });
        rows = result.rows;
        setCachedTotalPets(result.totalPets);
      }

      isLoading = false;
      renderLeaderboard(rows);
    } catch (error) {
      console.error("[Leaderboard] Search failed:", error);
      isLoading = false;
      renderLeaderboard([]);
    }
  };

  // Auto-search with 300ms debounce
  searchBar.oninput = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performSearch(), 300);
  };

  // Render leaderboard
  const renderLeaderboard = (searchResults?: LeaderboardRow[]) => {
    leaderboardList.innerHTML = "";
    footer.style.display = "none";

    if (isLoading) {
      const loading = document.createElement("div");
      style(loading, {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: "12px",
        color: "rgba(226,232,240,0.5)",
        fontSize: "13px",
      });
      loading.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(94,234,212,0.5)" stroke-width="2" stroke-dasharray="15 5" fill="none"/>
        </svg>
        <div>Loading...</div>
      `;
      leaderboardList.appendChild(loading);
      return;
    }

    let rows: LeaderboardRow[] = [];
    let myRank: LeaderboardRow | null = null;

    if (activeCategory === ITEMS_CATEGORY) {
      if (searchResults !== undefined) {
        rows = searchResults;
      } else if (activeItemId) {
        const cached = itemsCache.get(itemsCacheKey(activeItemType, activeItemId));
        rows = cached?.rows ?? [];
        myRank = cached?.myRank ?? null;
      } else {
        // Waiting for MGData
        const waiting = document.createElement("div");
        style(waiting, {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "rgba(226,232,240,0.5)",
          fontSize: "13px",
        });
        waiting.textContent = "Waiting for game data...";
        leaderboardList.appendChild(waiting);
        return;
      }
    } else if (searchResults !== undefined) {
      // Search results
      rows = searchResults;
    } else {
      // Cached top 15
      const cachedData = getCachedLeaderboard();
      if (cachedData) {
        const categoryData =
          activeCategory === "coins"
            ? cachedData.coins
            : activeCategory === "eggsHatched"
              ? cachedData.eggsHatched
              : cachedData.petJournal;
        rows = categoryData.top || [];
        myRank = categoryData.myRank;
      }
    }

    if (rows.length === 0) {
      const empty = document.createElement("div");
      style(empty, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "rgba(226,232,240,0.5)",
        fontSize: "13px",
      });
      empty.textContent = "No players ranked yet";
      leaderboardList.appendChild(empty);
      return;
    }

    for (const row of rows) {
      leaderboardList.appendChild(createLeaderboardRow(row, activeCategory));
    }

    // Show footer with "Your rank" if not in top N
    if (myRank && searchResults === undefined) {
      const myProfile = getCachedMyProfile();
      const myPlayerId = myProfile?.playerId;
      const isInTop = rows.some((r) => r.playerId === myPlayerId);

      if (!isInTop) {
        footer.innerHTML = "";
        footer.appendChild(createLeaderboardRow(myRank, activeCategory, true));
        footer.style.display = "block";
      }
    }
  };

  // Open a player's pet journal modal. Uses the same in-game journal modal as the
  // "Journal" button in the player detail view, but fetches the data on demand.
  let isOpeningJournal = false;
  const openJournalForRow = async (row: LeaderboardRow, card: HTMLElement) => {
    if (isOpeningJournal) return;
    if (!row.playerId || row.playerId === "null") return;
    isOpeningJournal = true;
    const originalCursor = card.style.cursor;
    card.style.cursor = "wait";
    card.style.opacity = "0.7";
    try {
      const result = await viewJournalById(row.playerId);
      if (!result.ok) {
        const playerName = row.playerName || "This player";
        if (result.reason === "private") {
          showErrorBanner(`${playerName} has hidden their journal.`);
        } else if (result.reason === "not_found") {
          showErrorBanner(`${playerName}'s journal is not available.`);
        } else {
          showErrorBanner("Could not open the journal. Please try again.");
        }
      }
    } finally {
      isOpeningJournal = false;
      card.style.cursor = originalCursor;
      card.style.opacity = "1";
    }
  };

  // Create a leaderboard row
  function createLeaderboardRow(
    row: LeaderboardRow,
    category: LeaderboardCategory,
    isMyRank = false,
  ): HTMLElement {
    const card = document.createElement("div");
    const isAnonymous = row.playerId === "null" || row.playerName === "anonymous";
    const isClickable = category === PET_JOURNAL_CATEGORY && !isAnonymous && !!row.playerId;
    style(card, {
      padding: "10px 12px",
      background: isMyRank ? "rgba(94,234,212,0.08)" : "rgba(255,255,255,0.02)",
      borderRadius: "10px",
      border: isMyRank
        ? "1px solid rgba(94,234,212,0.25)"
        : "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      transition: "all 120ms ease",
      cursor: isClickable ? "pointer" : "default",
    });

    if (!isMyRank) {
      card.onmouseenter = () => {
        style(card, {
          background: isClickable ? "rgba(94,234,212,0.08)" : "rgba(255,255,255,0.05)",
          borderColor: "rgba(94,234,212,0.15)",
        });
      };
      card.onmouseleave = () => {
        style(card, {
          background: "rgba(255,255,255,0.02)",
          borderColor: "rgba(255,255,255,0.06)",
        });
      };
    }

    if (isClickable) {
      card.onclick = () => {
        void openJournalForRow(row, card);
      };
    }

    // RankChange indicator (left) - only show if not 0 or null
    const rankChange = row.rankChange;
    let rankChangeIndicator: HTMLElement | null = null;

    if (rankChange !== null && rankChange !== 0) {
      rankChangeIndicator = document.createElement("div");
      style(rankChangeIndicator, {
        display: "flex",
        alignItems: "center",
        gap: "2px",
        fontSize: "13px",
        fontWeight: "700",
        marginRight: "4px",
        marginTop: "2px",
        flexShrink: "0",
        lineHeight: "1",
      });

      if (rankChange > 0) {
        // Upward arrow SVG (green)
        rankChangeIndicator.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; transform: translateY(-2px);">
            <path d="M8 3L8 13M8 3L4 7M8 3L12 7" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span style="color: #10b981; line-height: 1;">${rankChange}</span>
        `;
      } else {
        // Downward arrow SVG (red)
        rankChangeIndicator.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; transform: translateY(-2px);">
            <path d="M8 13L8 3M8 13L12 9M8 13L4 9" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span style="color: #ef4444; line-height: 1;">${Math.abs(rankChange)}</span>
        `;
      }
    }

    // Rank badge
    const rankBadge = document.createElement("div");
    style(rankBadge, {
      fontSize: "15px",
      fontWeight: "700",
      color:
        row.rank === 1
          ? "#fbbf24"
          : row.rank === 2
            ? "#d1d5db"
            : row.rank === 3
              ? "#d97706"
              : "#5eead4",
      flexShrink: "0",
      marginTop: "2px",
    });
    rankBadge.textContent = `#${row.rank}`;

    // Avatar
    const avatar = document.createElement("div");
    style(avatar, {
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      background: isAnonymous
        ? "linear-gradient(135deg, #64748b, #475569)"
        : row.avatarUrl
          ? `url(${row.avatarUrl}) center/cover`
          : "linear-gradient(135deg, rgba(94,234,212,0.3), rgba(59,130,246,0.3))",
      border: "2px solid rgba(255,255,255,0.1)",
      flexShrink: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    });

    // Add anonymous icon if player is anonymous
    if (isAnonymous) {
      avatar.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      `;
    }

    // Name + badges group (flex: 1, stays together)
    const nameGroup = document.createElement("div");
    style(nameGroup, {
      flex: "1",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      minWidth: "0",
    });

    const name = document.createElement("div");
    style(name, {
      fontSize: "13px",
      fontWeight: "600",
      color: isAnonymous ? "rgba(226,232,240,0.4)" : "#e7eef7",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    name.textContent = isAnonymous ? "Anonymous" : row.playerName || "Unknown";

    const badges = isAnonymous ? null : createPlayerBadges(row.badges, true);

    nameGroup.append(name, ...(badges ? [badges] : []));

    // Total (right)
    const total = document.createElement("div");
    style(total, {
      fontSize: "13px",
      fontWeight: "700",
      color: "#5eead4",
      flexShrink: "0",
    });
    total.textContent = formatLeaderboardValue(row.total, category);

    if (rankChangeIndicator) {
      card.append(rankChangeIndicator, rankBadge, avatar, nameGroup, total);
    } else {
      card.append(rankBadge, avatar, nameGroup, total);
    }
    return card;
  }

  // Initial render
  renderLeaderboard();

  // Listen for welcome event to populate cache
  const unsubWelcome = onWelcome((data) => {
    if (data.leaderboard) {
      const leaderboardData: LeaderboardData = {
        coins: data.leaderboard.coins || { top: [], myRank: null },
        eggsHatched: data.leaderboard.eggsHatched || { top: [], myRank: null },
        petJournal: data.leaderboard.petJournal || { top: [], myRank: null },
      };
      updateLeaderboardCache(leaderboardData);
      const welcomeTotalPets = data.leaderboard.petJournal?.meta?.totalPets;
      if (typeof welcomeTotalPets === "number") {
        setCachedTotalPets(welcomeTotalPets);
      }
      renderLeaderboard();
    }
  });

  root.append(tabsContainer, itemsToolbar, controlsContainer, errorBanner, leaderboardList, footer);

  return {
    id: "leaderboard" as const,
    root,
    show: () => style(root, { display: "flex" }),
    hide: () => style(root, { display: "none" }),
    destroy: () => {
      keyBlocker.detach();
      pickerKeyBlocker.detach();
      document.removeEventListener("click", outsideClickHandler, true);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (errorBannerTimer) clearTimeout(errorBannerTimer);
      if (itemsRetryTimer) clearTimeout(itemsRetryTimer);
      unsubWelcome();
      root.remove();
    },
  };
}
