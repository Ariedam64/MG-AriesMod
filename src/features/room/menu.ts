// The Room menu: the players in the current room on the left, and what can be
// done with the selected one on the right.

import { toastSimple } from "../../ui/toast";
import { formatPrice } from "../../lib/format";
import { fakeActivityLog, fakeInventory, fakeJournal, fakeStats } from "../../game/fakeModal";
import { pageWindow } from "../../platform/pageContext";
import { button } from "../../ui/kit/button";
import { plainCard, sectionLabel } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { color } from "../../ui/kit/theme";
import { VTabs, type VTabItem } from "../../ui/kit/vtabs";
import { gardenValue, inventoryValue, listPlayers, onPlayersChange, teleportToGarden } from "./players";
import { openActivityLog, openInventoryPreview, openJournal, openStats } from "./inspect";
import type { Player } from "./roomState";

/**
 * The game no longer publishes player positions in `stateAtom`
 * (`userSlots[].data.position` is gone, only pets still carry a `motion`), so
 * teleporting to a player and following one cannot work. Both buttons stay
 * visible and explain why on click, rather than looking broken.
 */
const PLAYER_POSITION_UNAVAILABLE_HINT = "Temporarily unavailable: the game no longer exposes player positions.";

const svg = (paths: string, size = 13) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const ICON_PATHS = {
  teleport: `<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>`,
  garden: `<polygon points="12 3 20 15 4 15"/><polygon points="12 9 21 21 3 21"/><rect x="10" y="21" width="4" height="3" rx="1"/>`,
  inventory: `<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/>`,
  journal: `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`,
  stats: `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`,
  actLog: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`,
  save: `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13"/><polyline points="7 3 7 8 15 8"/>`,
  user: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  follow: `<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>`,
};

type IconName = keyof typeof ICON_PATHS;

function icon(name: IconName, size = 13): HTMLElement {
  const el = h("span");
  el.style.display = "inline-flex";
  el.innerHTML = svg(ICON_PATHS[name], size);
  return el;
}

function avatar(player: Player, size: number): HTMLElement {
  const el = h("div");
  Object.assign(el.style, {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "50%",
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${Math.floor(size * 0.38)}px`,
    fontWeight: "700",
    color: color.accent,
    overflow: "hidden",
    border: `2px solid ${color.accentBorder}`,
  });
  if (player.discordAvatarUrl) {
    Object.assign(el.style, {
      backgroundImage: `url(${player.discordAvatarUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    });
  } else {
    el.style.background = color.accentHover;
    el.textContent = (player.name || "?").charAt(0).toUpperCase();
  }
  return el;
}

function onlineStatus(online: boolean, fontSize: number): HTMLElement {
  const wrap = h("div");
  Object.assign(wrap.style, {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: `${fontSize}px`,
    color: online ? color.accent : color.textDim,
  });
  const dot = h("span");
  Object.assign(dot.style, {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: online ? color.accent : color.textDim,
    flexShrink: "0",
  });
  wrap.append(dot, document.createTextNode(online ? "Online" : "Offline"));
  return wrap;
}

function nameLine(text: string, fontSize: number, weight: number): HTMLElement {
  const el = h("div", undefined, text);
  Object.assign(el.style, {
    fontSize: `${fontSize}px`,
    fontWeight: String(weight),
    color: color.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  return el;
}

/** A titled group of controls. */
function section(title: string, ...content: HTMLElement[]): HTMLElement {
  const el = h("div");
  Object.assign(el.style, { display: "flex", flexDirection: "column", gap: "6px" });
  el.append(sectionLabel(title), ...content);
  return el;
}

function row(...children: HTMLElement[]): HTMLElement {
  const el = h("div");
  Object.assign(el.style, { display: "flex", gap: "8px" });
  for (const child of children) child.style.flex = "1";
  el.append(...children);
  return el;
}

/** Greyed out, but still clickable so the player learns why it does nothing. */
function unavailableButton(label: string, iconName: IconName): HTMLElement {
  const btn = button(label, {
    icon: icon(iconName),
    tooltip: PLAYER_POSITION_UNAVAILABLE_HINT,
    onClick: () => void toastSimple("Unavailable", PLAYER_POSITION_UNAVAILABLE_HINT, "info"),
  });
  Object.assign(btn.style, { opacity: "0.45", filter: "grayscale(1)", cursor: "not-allowed" });
  return btn;
}

function inspectButton(label: string, iconName: IconName, onClick: () => Promise<void>): HTMLElement {
  const btn = button(label, { icon: icon(iconName), onClick, lockWhilePending: true, fullWidth: true });
  btn.style.justifyContent = "flex-start";
  return btn;
}

function valueCard(label: string): { card: HTMLElement; value: HTMLElement } {
  const card = plainCard();
  Object.assign(card.style, { flex: "1", gap: "4px", padding: "11px 14px" });
  const value = h("div", undefined, "…");
  Object.assign(value.style, { fontSize: "15px", fontWeight: "700", color: color.goldInk });
  card.append(sectionLabel(label), value);
  return { card, value };
}

function emptyDetail(): HTMLElement {
  const hint = h("div");
  Object.assign(hint.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    paddingTop: "60px",
    color: color.textDim,
    fontSize: "12px",
  });
  const glyph = icon("user", 28);
  glyph.style.opacity = "0.35";
  hint.append(glyph, document.createTextNode("Select a player"));
  return hint;
}

/** Runs a modal opener with the HUD window hidden until the modal closes. */
async function withWindowHidden(
  root: HTMLElement,
  open: () => Promise<void>,
  modal: { isOpen(): Promise<boolean>; waitClosed(): Promise<unknown> },
): Promise<void> {
  const win = root.closest<HTMLElement>(".qws-win");
  if (win) win.style.display = "none";
  try {
    await open();
    if (await modal.isOpen()) await modal.waitClosed();
  } finally {
    if (win) win.style.display = "";
  }
}

async function saveGardenWithEditor(player: Player): Promise<void> {
  const fn = (window as any).qwsEditorSaveGardenForPlayer ?? (pageWindow as any)?.qwsEditorSaveGardenForPlayer;
  if (typeof fn !== "function") {
    await toastSimple("Save garden", "Editor save unavailable.", "error");
    return;
  }
  const saved = await fn(player.id, `${player.name || player.id}'s garden`);
  if (!saved) await toastSimple("Save garden", "Save failed (no garden state).", "error");
  else await toastSimple("Save garden", `Saved "${saved.name}".`, "success");
}

function renderPlayerDetail(root: HTMLElement, player: Player): HTMLElement {
  const content = h("div");
  Object.assign(content.style, { display: "flex", flexDirection: "column", gap: "18px" });

  const profile = plainCard();
  Object.assign(profile.style, { flexDirection: "row", alignItems: "center", gap: "12px", padding: "14px" });
  const info = h("div");
  Object.assign(info.style, { display: "flex", flexDirection: "column", gap: "4px", minWidth: "0", flex: "1" });
  info.append(nameLine(player.name || player.id, 15, 700), onlineStatus(player.isConnected ?? false, 11));
  profile.append(avatar(player, 46), info);

  const teleport = row(
    unavailableButton("To player", "teleport"),
    // Teleporting to a garden does not need live positions: it uses the map's spawn tiles.
    button("To garden", {
      icon: icon("garden"),
      variant: "primary",
      lockWhilePending: true,
      onClick: () => teleportToGarden(player.id),
    }),
  );

  const inspectGrid = h("div");
  Object.assign(inspectGrid.style, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" });
  inspectGrid.append(
    inspectButton("Inventory", "inventory", () =>
      withWindowHidden(root, () => openInventoryPreview(player.id, player.name), fakeInventory),
    ),
    inspectButton("Journal", "journal", () =>
      withWindowHidden(root, () => openJournal(player.id, player.name), fakeJournal),
    ),
    inspectButton("Stats", "stats", () => withWindowHidden(root, () => openStats(player.id, player.name), fakeStats)),
    inspectButton("Activity log", "actLog", () =>
      withWindowHidden(root, () => openActivityLog(player.id, player.name), fakeActivityLog),
    ),
  );

  const inventory = valueCard("Inventory");
  const garden = valueCard("Garden");

  content.append(
    profile,
    section("Teleport", teleport),
    section("Follow", row(unavailableButton("Follow player", "follow"))),
    section("Inspect", inspectGrid),
    section("Editor", inspectButton("Save player garden", "save", () => saveGardenWithEditor(player))),
    section("Crop values", row(inventory.card, garden.card)),
  );

  void (async () => {
    try {
      inventory.value.textContent = formatPrice(Math.round(await inventoryValue(player.id))) ?? "-";
    } catch {
      inventory.value.textContent = "-";
    }
    try {
      garden.value.textContent = formatPrice(Math.round(await gardenValue(player.id))) ?? "-";
    } catch {
      garden.value.textContent = "-";
    }
  })();

  return content;
}

function renderPlayerTab(player: Player, btn: HTMLButtonElement): void {
  const info = h("div");
  Object.assign(info.style, { display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" });
  info.append(nameLine(player.name || player.id, 12, 600), onlineStatus(!!player.isConnected, 10));
  btn.append(avatar(player, 28), info, h("span"));
}

export async function renderRoomMenu(root: HTMLElement) {
  // The window body's padding would frame the split panes; they draw their own.
  Object.assign(root.style, { padding: "0", overflow: "hidden" });

  const wrap = h("div");
  Object.assign(wrap.style, {
    display: "flex",
    minHeight: "400px",
    height: "100%",
    background: "var(--qmm-gradient-panel)",
  });

  const listPane = h("div", "qmm-scroll");
  Object.assign(listPane.style, {
    width: "200px",
    flexShrink: "0",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    overflowY: "auto",
    padding: "14px 8px 14px 12px",
    borderRight: `1px solid ${color.border}`,
  });

  const detailPane = h("div", "qmm-scroll");
  Object.assign(detailPane.style, { flex: "1", overflowY: "auto", padding: "14px 14px 14px 16px", minWidth: "0" });

  wrap.append(listPane, detailPane);
  root.appendChild(wrap);

  let players: Player[] = [];
  const playerById = (id: string | null) => (id ? players.find((p) => p.id === id) ?? null : null);

  const showDetail = (id: string | null) => {
    const player = playerById(id);
    detailPane.replaceChildren(player ? renderPlayerDetail(root, player) : emptyDetail());
  };

  const count = sectionLabel("0 players");
  const tabs = new VTabs({
    emptyText: "No players in room",
    fillAvailableHeight: true,
    onSelect: (id) => showDetail(id),
    renderItem: (item: VTabItem, btn) => {
      const player = playerById(item.id);
      if (player) renderPlayerTab(player, btn);
    },
  });
  listPane.append(count, tabs.root);

  let lastSignature = "";
  async function refresh() {
    const next = await listPlayers();
    const signature = next.map((p) => `${p.id}|${p.name ?? ""}|${p.isConnected ? 1 : 0}`).join(";");
    if (signature === lastSignature) return;
    lastSignature = signature;
    players = next;

    count.textContent = `${players.length} player${players.length !== 1 ? "s" : ""}`;
    tabs.setItems(players.map((p) => ({ id: p.id, title: p.name || p.id })));
    const selected = tabs.getSelected();
    if (!selected && players.length) tabs.select(players[0].id);
    else showDetail(selected?.id ?? null);
  }

  await onPlayersChange(() => void refresh());
  await refresh();
}
