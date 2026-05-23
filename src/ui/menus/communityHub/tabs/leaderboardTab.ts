import {
  getCachedLeaderboard,
  updateLeaderboardCache,
  fetchLeaderboardCoins,
  fetchLeaderboardEggsHatched,
  fetchLeaderboardPetJournal,
  onWelcome,
  getCachedMyProfile,
  setCachedTotalPets,
} from "../../../../ariesModAPI";
import type { LeaderboardRow, LeaderboardData } from "../../../../ariesModAPI";
import { style, ensureSharedStyles, createKeyBlocker, createPlayerBadges } from "../shared";
import { formatPrice } from "../../../../utils/format";
import { viewJournalById } from "./playerViewActions";

type LeaderboardCategory = "coins" | "eggsHatched" | "petJournal";

const PET_JOURNAL_CATEGORY: LeaderboardCategory = "petJournal";

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
        searchBar.value = "";
        renderLeaderboard();
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

  tabsContainer.append(coinsTab, eggsTab, petJournalTab);

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

  // Search with debounce
  const performSearch = async () => {
    const query = searchBar.value.trim();

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

    const cachedData = getCachedLeaderboard();
    let rows: LeaderboardRow[] = [];
    let myRank: LeaderboardRow | null = null;

    if (searchResults !== undefined) {
      // Search results
      rows = searchResults;
    } else {
      // Cached top 15
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

    // Show footer with "Your rank" if not in top 15
    if (myRank && searchResults === undefined) {
      const myProfile = getCachedMyProfile();
      const myPlayerId = myProfile?.playerId;
      const isInTop15 = rows.some((r) => r.playerId === myPlayerId);

      if (!isInTop15) {
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

  root.append(tabsContainer, controlsContainer, errorBanner, leaderboardList, footer);

  return {
    id: "leaderboard" as const,
    root,
    show: () => style(root, { display: "flex" }),
    hide: () => style(root, { display: "none" }),
    destroy: () => {
      keyBlocker.detach();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (errorBannerTimer) clearTimeout(errorBannerTimer);
      unsubWelcome();
      root.remove();
    },
  };
}
