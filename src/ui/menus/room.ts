// src/ui/menus/room.ts
// Menu HUD – joueurs dans la room actuelle. Style moderne calqué sur le Community Hub.

import { PlayersService, type Player } from "../../services/players";
import { toastSimple } from "../toast";
import { formatPrice } from "../../utils/format";
import {
  isActivityLogModalOpenAsync,
  isInventoryPanelOpen,
  isJournalModalOpen,
  isStatsModalOpenAsync,
  waitActivityLogModalClosed,
  waitInventoryPanelClosed,
  waitJournalModalClosed,
  waitStatsModalClosed,
} from "../../services/fakeModal";
import { pageWindow } from "../../utils/page-context";

/* ─────────────────────────────────────────────────────────────────────────────
 * Constants & helpers
 * ───────────────────────────────────────────────────────────────────────────*/

const STYLE_ID = "qws-room-menu-css";
const TEAL = "#5eead4";
const TEAL_DIM = "rgba(94,234,212,0.12)";
const TEAL_MID = "rgba(94,234,212,0.22)";
const TEAL_BORDER = "rgba(94,234,212,0.3)";
const TEAL_BORDER_HI = "rgba(94,234,212,0.55)";
const BORDER = "rgba(255,255,255,0.08)";
const BORDER_HI = "rgba(255,255,255,0.16)";
const CARD_BG = "rgba(255,255,255,0.03)";
const CARD_BG_HI = "rgba(255,255,255,0.06)";
const TEXT = "#e7eef7";
const TEXT_DIM = "rgba(226,232,240,0.45)";
const GREEN = "#10b981";

/**
 * Le jeu ne publie plus la position des joueurs dans `stateAtom`
 * (`userSlots[].data.position` a disparu, seuls les pets ont encore un `motion`).
 * Tant qu'on n'a pas retrouvé la nouvelle source, tout ce qui dépend de la
 * position d'un autre joueur est désactivé. Repasser à `true` pour réactiver.
 */
const PLAYER_POSITION_AVAILABLE = false;
const PLAYER_POSITION_UNAVAILABLE_HINT =
  "Temporarily unavailable: the game no longer exposes player positions.";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
.qws-rm-scroll::-webkit-scrollbar { width: 6px; }
.qws-rm-scroll::-webkit-scrollbar-track { background: transparent; }
.qws-rm-scroll::-webkit-scrollbar-thumb { background: ${TEAL_DIM}; border-radius: 3px; }
.qws-rm-scroll::-webkit-scrollbar-thumb:hover { background: rgba(94,234,212,0.35); }
.qws-rm-scroll { scrollbar-width: thin; scrollbar-color: ${TEAL_DIM} transparent; }
@keyframes qws-rm-spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
`;
  document.head.appendChild(st);
}

const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) => Object.assign(el.style, s);

/* ─────────────────────────────────────────────────────────────────────────────
 * Reusable UI atoms
 * ───────────────────────────────────────────────────────────────────────────*/

function sectionLabel(text: string): HTMLElement {
  const el = document.createElement("div");
  css(el, {
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    color: TEXT_DIM,
    textTransform: "uppercase",
    paddingBottom: "6px",
  });
  el.textContent = text;
  return el;
}

function avatar(player: Player, size: number): HTMLElement {
  const el = document.createElement("div");
  css(el, {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "50%",
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${Math.floor(size * 0.38)}px`,
    fontWeight: "700",
    color: TEAL,
    overflow: "hidden",
  });
  if (player.discordAvatarUrl) {
    css(el, {
      backgroundImage: `url(${player.discordAvatarUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      border: `2px solid ${TEAL_BORDER}`,
    });
  } else {
    css(el, {
      background: "linear-gradient(135deg, rgba(94,234,212,0.22), rgba(59,130,246,0.22))",
      border: `2px solid rgba(94,234,212,0.2)`,
    });
    el.textContent = (player.name || "?").charAt(0).toUpperCase();
  }
  return el;
}

function statusPill(online: boolean): HTMLElement {
  const wrap = document.createElement("div");
  css(wrap, {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    color: online ? GREEN : TEXT_DIM,
  });
  const dot = document.createElement("span");
  css(dot, {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: online ? GREEN : "rgba(226,232,240,0.3)",
    flexShrink: "0",
  });
  wrap.append(dot, document.createTextNode(online ? "Online" : "Offline"));
  return wrap;
}

/** Teal primary button (teleport actions) */
function primaryBtn(label: string, iconSvg: string, onClick: () => Promise<void>): HTMLElement {
  const btn = document.createElement("button");
  css(btn, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    padding: "10px 14px",
    border: `1px solid ${TEAL_BORDER}`,
    borderRadius: "10px",
    background: TEAL_DIM,
    color: TEAL,
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 120ms ease",
    flex: "1",
    whiteSpace: "nowrap",
  });
  const icon = document.createElement("span");
  icon.innerHTML = iconSvg;
  css(icon, { display: "flex", alignItems: "center", flexShrink: "0" });
  btn.append(icon, document.createTextNode(label));

  btn.onmouseenter = () => css(btn, { background: TEAL_MID, borderColor: TEAL_BORDER_HI });
  btn.onmouseleave = () => css(btn, { background: TEAL_DIM, borderColor: TEAL_BORDER });
  btn.onclick = async () => {
    css(btn, { opacity: "0.6", pointerEvents: "none" });
    try { await onClick(); } finally { css(btn, { opacity: "1", pointerEvents: "auto" }); }
  };
  return btn;
}

/** Toggle button (follow actions) */
function toggleBtn(label: string, iconSvg: string, active: boolean, onToggle: (next: boolean) => Promise<void>): HTMLElement {
  let isActive = active;
  const btn = document.createElement("button");

  const applyState = () => {
    css(btn, {
      border: `1px solid ${isActive ? TEAL_BORDER_HI : BORDER}`,
      background: isActive ? TEAL_MID : CARD_BG,
      color: isActive ? TEAL : TEXT,
    });
  };

  css(btn, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    padding: "10px 14px",
    borderRadius: "10px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 120ms ease",
    flex: "1",
    whiteSpace: "nowrap",
  });

  const icon = document.createElement("span");
  icon.innerHTML = iconSvg;
  css(icon, { display: "flex", alignItems: "center", flexShrink: "0" });
  btn.append(icon, document.createTextNode(label));
  applyState();

  btn.onmouseenter = () => {
    if (!isActive) css(btn, { background: CARD_BG_HI, borderColor: TEAL_BORDER });
  };
  btn.onmouseleave = applyState;
  btn.onclick = async () => {
    css(btn, { opacity: "0.6", pointerEvents: "none" });
    try {
      const next = !isActive;
      await onToggle(next);
      isActive = next;
      applyState();
    } finally {
      css(btn, { opacity: "1", pointerEvents: "auto" });
    }
  };

  (btn as any).__setActive = (v: boolean) => { isActive = v; applyState(); };
  return btn;
}

/**
 * Grise un bouton et remplace son action par un toast explicatif.
 * On garde le bouton cliquable (plutôt que `disabled`) pour que l'utilisateur
 * comprenne pourquoi l'action ne marche pas au lieu de croire à un bug.
 */
function markUnavailable(btn: HTMLElement, hint: string): HTMLElement {
  btn.title = hint;
  css(btn, {
    opacity: "0.45",
    cursor: "not-allowed",
    filter: "grayscale(1)",
    border: `1px solid ${BORDER}`,
    background: CARD_BG,
    color: TEXT_DIM,
  });
  btn.onmouseenter = null;
  btn.onmouseleave = null;
  btn.onclick = () => { void toastSimple("Unavailable", hint, "info"); };
  return btn;
}

/** Neutral secondary button (inspect / editor) */
function secondaryBtn(label: string, iconSvg: string, onClick: () => Promise<void>): HTMLElement {
  const btn = document.createElement("button");
  css(btn, {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "9px 12px",
    border: `1px solid ${BORDER}`,
    borderRadius: "10px",
    background: CARD_BG,
    color: TEXT,
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 120ms ease",
    width: "100%",
    textAlign: "left",
  });
  const icon = document.createElement("span");
  icon.innerHTML = iconSvg;
  css(icon, { display: "flex", alignItems: "center", flexShrink: "0", opacity: "0.7" });
  btn.append(icon, document.createTextNode(label));

  btn.onmouseenter = () => css(btn, { background: CARD_BG_HI, borderColor: BORDER_HI });
  btn.onmouseleave = () => css(btn, { background: CARD_BG, borderColor: BORDER });
  btn.onclick = async () => {
    css(btn, { opacity: "0.6", pointerEvents: "none" });
    try { await onClick(); } finally { css(btn, { opacity: "1", pointerEvents: "auto" }); }
  };
  return btn;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Icons
 * ───────────────────────────────────────────────────────────────────────────*/
const ICO = (d: string) =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const ICONS = {
  teleport:   ICO(`<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>`),
  garden:     ICO(`<polygon points="12 3 20 15 4 15"/><polygon points="12 9 21 21 3 21"/><rect x="10" y="21" width="4" height="3" rx="1"/>`),
  inventory:  ICO(`<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/>`),
  journal:    ICO(`<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`),
  stats:      ICO(`<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`),
  actLog:     ICO(`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`),
  save:       ICO(`<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13"/><polyline points="7 3 7 8 15 8"/>`),
  user:       ICO(`<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`),
  follow:     ICO(`<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>`),
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Main render
 * ───────────────────────────────────────────────────────────────────────────*/

export async function renderRoomMenu(root: HTMLElement) {
  ensureStyles();

  // Override .w-body padding so we control our own layout edge-to-edge
  css(root, { padding: "0", overflow: "hidden" });

  // ── Split wrapper ──────────────────────────────────────────────────────────
  const wrap = document.createElement("div");
  css(wrap, {
    display: "flex",
    flexDirection: "row",
    minHeight: "400px",
    height: "100%",
    background: "linear-gradient(160deg, rgba(15,20,30,0.95) 0%, rgba(10,14,20,0.95) 60%, rgba(8,12,18,0.96) 100%)",
  });

  // ── Left pane ──────────────────────────────────────────────────────────────
  const leftPane = document.createElement("div");
  leftPane.className = "qws-rm-scroll";
  css(leftPane, {
    width: "200px",
    flexShrink: "0",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    overflowY: "auto",
    padding: "14px 8px 14px 12px",
    borderRight: `1px solid ${BORDER}`,
  });

  // ── Right pane ─────────────────────────────────────────────────────────────
  const rightPane = document.createElement("div");
  rightPane.className = "qws-rm-scroll";
  css(rightPane, {
    flex: "1",
    overflowY: "auto",
    padding: "14px 14px 14px 16px",
    minWidth: "0",
  });

  wrap.append(leftPane, rightPane);
  root.appendChild(wrap);

  // ── Window hide/show helpers (for modal passthrough) ───────────────────────
  const getWin = () => root.closest(".qws-win") as HTMLElement | null;
  const hideWin = () => { const w = getWin(); if (w) w.style.display = "none"; };
  const showWin = () => { const w = getWin(); if (w) w.style.display = ""; };

  // ── State ──────────────────────────────────────────────────────────────────
  let players: Player[] = [];
  let selectedId: string | null = null;

  // ── Right panel ────────────────────────────────────────────────────────────
  function renderRightPanel(playerId: string | null) {
    rightPane.innerHTML = "";

    const player = playerId ? (players.find(p => p.id === playerId) ?? null) : null;

    if (!player) {
      const hint = document.createElement("div");
      css(hint, {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: "10px",
        color: TEXT_DIM,
        fontSize: "12px",
        paddingTop: "60px",
      });
      const iconWrap = document.createElement("div");
      iconWrap.innerHTML = ICONS.user.replace("13", "28").replace("13", "28");
      css(iconWrap, { opacity: "0.35" });
      hint.append(iconWrap, document.createTextNode("Select a player"));
      rightPane.appendChild(hint);
      return;
    }

    const content = document.createElement("div");
    css(content, { display: "flex", flexDirection: "column", gap: "18px" });

    /* ── Profile ── */
    const profileCard = document.createElement("div");
    css(profileCard, {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "14px",
      background: CARD_BG,
      borderRadius: "12px",
      border: `1px solid ${BORDER}`,
    });

    const av = avatar(player, 46);

    const infoBlock = document.createElement("div");
    css(infoBlock, { display: "flex", flexDirection: "column", gap: "4px", minWidth: "0", flex: "1" });

    const nameEl = document.createElement("div");
    css(nameEl, {
      fontSize: "15px",
      fontWeight: "700",
      color: TEXT,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    nameEl.textContent = player.name || player.id;

    infoBlock.append(nameEl, statusPill(player.isConnected ?? false));
    profileCard.append(av, infoBlock);
    content.appendChild(profileCard);

    /* ── Teleport ── */
    const teleSection = document.createElement("div");
    teleSection.appendChild(sectionLabel("Teleport"));
    const teleRow = document.createElement("div");
    css(teleRow, { display: "flex", gap: "8px" });
    const toPlayerBtn = primaryBtn("To player", ICONS.teleport, () =>
      PlayersService.teleportToPlayer(player.id),
    );
    if (!PLAYER_POSITION_AVAILABLE) markUnavailable(toPlayerBtn, PLAYER_POSITION_UNAVAILABLE_HINT);

    teleRow.append(
      toPlayerBtn,
      // "To garden" ne dépend pas de la position live : il passe par mapAtom.spawnTiles.
      primaryBtn("To garden", ICONS.garden, () => PlayersService.teleportToGarden(player.id)),
    );
    teleSection.appendChild(teleRow);
    content.appendChild(teleSection);

    /* ── Follow ── */
    const followSection = document.createElement("div");
    followSection.appendChild(sectionLabel("Follow"));
    const followRow = document.createElement("div");
    css(followRow, { display: "flex", gap: "8px" });

    const followPlayerBtn = toggleBtn(
      "Follow player",
      ICONS.follow,
      PLAYER_POSITION_AVAILABLE && PlayersService.isFollowing(player.id),
      async (next) => {
        if (next) {
          await PlayersService.startFollowing(player.id);
          await toastSimple("Follow", `Following ${player.name || player.id}.`, "success");
        } else {
          PlayersService.stopFollowing();
          await toastSimple("Follow", "Stopped following.", "info");
        }
      },
    );

    if (!PLAYER_POSITION_AVAILABLE) {
      markUnavailable(followPlayerBtn, PLAYER_POSITION_UNAVAILABLE_HINT);
    }

    followRow.append(followPlayerBtn);
    followSection.appendChild(followRow);
    content.appendChild(followSection);

    /* ── Inspect ── */
    const inspectSection = document.createElement("div");
    inspectSection.appendChild(sectionLabel("Inspect"));
    const inspectGrid = document.createElement("div");
    css(inspectGrid, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" });

    inspectGrid.append(
      secondaryBtn("Inventory", ICONS.inventory, async () => {
        hideWin();
        try {
          await PlayersService.openInventoryPreview(player.id, player.name);
          if (await isInventoryPanelOpen()) await waitInventoryPanelClosed();
        } finally { showWin(); }
      }),
      secondaryBtn("Journal", ICONS.journal, async () => {
        hideWin();
        try {
          await PlayersService.openJournalLog(player.id, player.name);
          if (await isJournalModalOpen()) await waitJournalModalClosed();
        } finally { showWin(); }
      }),
      secondaryBtn("Stats", ICONS.stats, async () => {
        hideWin();
        try {
          await PlayersService.openStatsModal(player.id, player.name);
          if (await isStatsModalOpenAsync()) await waitStatsModalClosed();
        } finally { showWin(); }
      }),
      secondaryBtn("Activity log", ICONS.actLog, async () => {
        hideWin();
        try {
          await PlayersService.openActivityLogModal(player.id, player.name);
          if (await isActivityLogModalOpenAsync()) await waitActivityLogModalClosed();
        } finally { showWin(); }
      }),
    );
    inspectSection.appendChild(inspectGrid);
    content.appendChild(inspectSection);

    /* ── Editor ── */
    const editorSection = document.createElement("div");
    editorSection.appendChild(sectionLabel("Editor"));
    editorSection.appendChild(
      secondaryBtn("Save player garden", ICONS.save, async () => {
        const fn =
          (window as any).qwsEditorSaveGardenForPlayer ??
          (pageWindow as any)?.qwsEditorSaveGardenForPlayer;
        if (typeof fn !== "function") {
          await toastSimple("Save garden", "Editor save unavailable.", "error");
          return;
        }
        const saved = await fn(player.id, `${player.name || player.id}'s garden`);
        if (!saved) await toastSimple("Save garden", "Save failed (no garden state).", "error");
        else await toastSimple(`Saved "${saved.name}".`, "success");
      }),
    );
    content.appendChild(editorSection);

    /* ── Crop values ── */
    const valSection = document.createElement("div");
    valSection.appendChild(sectionLabel("Crop values"));

    const valRow = document.createElement("div");
    css(valRow, { display: "flex", gap: "8px" });

    const makeValCard = (label: string) => {
      const card = document.createElement("div");
      css(card, {
        flex: "1",
        padding: "11px 14px",
        background: CARD_BG,
        borderRadius: "10px",
        border: `1px solid ${BORDER}`,
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      });
      const lbl = document.createElement("div");
      css(lbl, { fontSize: "10px", color: TEXT_DIM, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" });
      lbl.textContent = label;
      const val = document.createElement("div");
      css(val, { fontSize: "15px", fontWeight: "700", color: "#FFD84D" });
      val.textContent = "…";
      card.append(lbl, val);
      return { card, val };
    };

    const { card: invCard, val: invVal }    = makeValCard("Inventory");
    const { card: gardenCard, val: gardenVal } = makeValCard("Garden");
    valRow.append(invCard, gardenCard);
    valSection.appendChild(valRow);
    content.appendChild(valSection);

    rightPane.appendChild(content);

    /* Fetch values in background */
    void (async () => {
      try { invVal.textContent = formatPrice(Math.round(await PlayersService.getInventoryValue(player.id))) ?? "—"; }
      catch { invVal.textContent = "—"; }
      try { gardenVal.textContent = formatPrice(Math.round(await PlayersService.getGardenValue(player.id))) ?? "—"; }
      catch { gardenVal.textContent = "—"; }
    })();
  }

  /* ── Player card ─────────────────────────────────────────────────────────*/
  function createPlayerCard(player: Player): HTMLElement {
    const isSelected = selectedId === player.id;

    const card = document.createElement("div");
    css(card, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "9px 10px",
      borderRadius: "10px",
      border: isSelected ? `1px solid ${TEAL_BORDER}` : `1px solid ${BORDER}`,
      background: isSelected ? TEAL_DIM : "rgba(255,255,255,0.02)",
      cursor: "pointer",
      transition: "all 120ms ease",
    });

    if (!isSelected) {
      card.onmouseenter = () => css(card, { background: CARD_BG_HI, borderColor: "rgba(94,234,212,0.18)" });
      card.onmouseleave = () => css(card, { background: "rgba(255,255,255,0.02)", borderColor: BORDER });
    }

    card.onclick = () => {
      selectedId = player.id;
      renderPlayerList();
      renderRightPanel(player.id);
    };

    const av = avatar(player, 32);

    const info = document.createElement("div");
    css(info, { flex: "1", minWidth: "0" });

    const nameEl = document.createElement("div");
    css(nameEl, {
      fontSize: "12px",
      fontWeight: "600",
      color: TEXT,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    nameEl.textContent = player.name || player.id;

    const st = document.createElement("div");
    css(st, {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      marginTop: "2px",
      fontSize: "10px",
      color: player.isConnected ? GREEN : TEXT_DIM,
    });
    const dot = document.createElement("span");
    css(dot, { width: "5px", height: "5px", borderRadius: "50%", background: player.isConnected ? GREEN : "rgba(226,232,240,0.3)", flexShrink: "0" });
    st.append(dot, document.createTextNode(player.isConnected ? "Online" : "Offline"));

    info.append(nameEl, st);
    card.append(av, info);
    return card;
  }

  /* ── Left panel render ───────────────────────────────────────────────────*/
  function renderPlayerList() {
    leftPane.innerHTML = "";

    /* Header */
    const header = document.createElement("div");
    css(header, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "6px",
    });

    const countEl = document.createElement("div");
    css(countEl, { fontSize: "10px", fontWeight: "700", letterSpacing: "0.07em", color: TEXT_DIM, textTransform: "uppercase" });
    countEl.textContent = `${players.length} player${players.length !== 1 ? "s" : ""}`;
    header.appendChild(countEl);
    leftPane.appendChild(header);

    if (players.length === 0) {
      const empty = document.createElement("div");
      css(empty, { paddingTop: "16px", textAlign: "center", color: TEXT_DIM, fontSize: "12px" });
      empty.textContent = "No players in room";
      leftPane.appendChild(empty);
      return;
    }

    for (const p of players) {
      leftPane.appendChild(createPlayerCard(p));
    }
  }

  /* ── Data refresh ────────────────────────────────────────────────────────*/
  let lastSig = "";
  function buildSig(ps: Player[]) {
    return ps.map(p => `${p.id}|${p.name ?? ""}|${p.isConnected ? 1 : 0}`).join(";");
  }

  async function refresh(keepSelection = true) {
    const prevSel = selectedId;
    const next = await PlayersService.list();
    const s = buildSig(next);
    if (s === lastSig) return;
    lastSig = s;
    players = next;

    const sel =
      keepSelection && prevSel && players.some(p => p.id === prevSel)
        ? prevSel
        : (players[0]?.id ?? null);

    selectedId = sel;
    renderPlayerList();
    renderRightPanel(sel);
  }

  await PlayersService.onChange(() => { void refresh(true); });
  await refresh(true);
}
