// The Room menu: the players in the current room on the left, and what can be
// done with the selected one on the right.

import { toastSimple } from "../../ui/toast";
import { formatPrice } from "../../lib/format";
import { fakeActivityLog, fakeInventory, fakeJournal, fakeStats } from "../../game/fakeModal";
import { pageWindow } from "../../platform/pageContext";
import { pill } from "../../ui/kit/badges";
import { button } from "../../ui/kit/button";
import { card, plainCard, sectionLabel } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { settingRow } from "../../ui/kit/layout";
import { VTabs, type VTabItem } from "../../ui/kit/vtabs";
import { gardenValue, inventoryValue, listPlayers, onPlayersChange, teleportToGarden } from "./players";
import { openActivityLog, openInventoryPreview, openJournal, openStats } from "./inspect";
import type { Player } from "./roomState";
import { ensureRoomStyles } from "./styles";

/**
 * The game no longer publishes player positions in `stateAtom`
 * (`userSlots[].data.position` is gone, only pets still carry a `motion`), so
 * teleporting to a player and following one cannot work. Both buttons stay
 * visible and explain why on click, rather than looking broken.
 */
const PLAYER_POSITION_UNAVAILABLE_HINT = "Temporarily unavailable: the game no longer exposes player positions.";

const svg = (paths: string, size: number) =>
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
  users: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  follow: `<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>`,
};

type IconName = keyof typeof ICON_PATHS;

function icon(name: IconName, size = 14): HTMLElement {
  const el = h("span", "qws-room-icon");
  el.innerHTML = svg(ICON_PATHS[name], size);
  return el;
}

/** The Discord picture, or the name's initial, with a dot for being online. */
function avatar(player: Player, large = false): HTMLElement {
  const el = h("div", large ? "qws-room-avatar is-large" : "qws-room-avatar");
  if (player.discordAvatarUrl) el.style.backgroundImage = `url(${player.discordAvatarUrl})`;
  else el.textContent = (player.name || "?").charAt(0).toUpperCase();
  const dot = h("span", player.isConnected ? "qws-room-avatar__dot is-online" : "qws-room-avatar__dot");
  dot.title = player.isConnected ? "Online" : "Offline";
  el.appendChild(dot);
  return el;
}

/** Greyed out, but still clickable so the player learns why it does nothing. */
function unavailableButton(label: string, iconName: IconName): HTMLElement {
  const btn = button(label, {
    icon: icon(iconName),
    size: "sm",
    tooltip: PLAYER_POSITION_UNAVAILABLE_HINT,
    onClick: () => void toastSimple("Unavailable", PLAYER_POSITION_UNAVAILABLE_HINT, "info"),
  });
  btn.classList.add("qws-room-off");
  return btn;
}

function valueTile(label: string): { tile: HTMLElement; amount: HTMLElement } {
  const tile = h("div", "qws-room-value");
  const amount = h("div", "qws-room-value__amount", "…");
  tile.append(h("div", "qws-room-value__label", label), amount);
  return { tile, amount };
}

function emptyState(iconName: IconName, title: string, hint: string): HTMLElement {
  const el = h("div", "qws-room-empty");
  el.append(icon(iconName, 32), h("div", "qws-room-empty__title", title), h("div", undefined, hint));
  return el;
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

/** Who the player is, the one-click trip to their garden, and what their crops are worth. */
function renderHero(player: Player): HTMLElement {
  const hero = plainCard();
  hero.classList.add("qws-room-hero");

  const who = h("div", "qws-room-hero__who");
  who.append(
    h("div", "qws-room-hero__name", player.name || player.id),
    player.isConnected ? pill("Online", "ok") : pill("Offline"),
  );

  // Teleporting to a garden does not need live positions: it uses the map's spawn tiles.
  const visit = button("Visit garden", {
    icon: icon("garden"),
    variant: "primary",
    lockWhilePending: true,
    onClick: () => teleportToGarden(player.id),
  });

  const top = h("div", "qws-room-hero__top");
  top.append(avatar(player, true), who, visit);

  const inventory = valueTile("Inventory value");
  const garden = valueTile("Garden value");
  const values = h("div", "qws-room-values");
  values.append(inventory.tile, garden.tile);

  void (async () => {
    try {
      inventory.amount.textContent = formatPrice(Math.round(await inventoryValue(player.id))) ?? "-";
    } catch {
      inventory.amount.textContent = "-";
    }
    try {
      garden.amount.textContent = formatPrice(Math.round(await gardenValue(player.id))) ?? "-";
    } catch {
      garden.amount.textContent = "-";
    }
  })();

  hero.append(top, values);
  return hero;
}

function renderPlayerDetail(root: HTMLElement, player: Player): HTMLElement {
  const inspectButton = (label: string, iconName: IconName, onClick: () => Promise<void>) =>
    button(label, { icon: icon(iconName), onClick, lockWhilePending: true, fullWidth: true });

  const inspect = card("Look inside", { subtitle: "Opens in the game's own window." });
  const grid = h("div", "qws-room-inspect");
  grid.append(
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
  inspect.body.appendChild(grid);

  const save = button("Save", {
    icon: icon("save"),
    size: "sm",
    lockWhilePending: true,
    onClick: () => saveGardenWithEditor(player),
  });
  const travel = h("div", "qmm-flex");
  travel.append(unavailableButton("To player", "teleport"), unavailableButton("Follow", "follow"));

  const more = card("More");
  more.body.append(
    settingRow("Save garden", "Keeps a copy in the Editor.", save).row,
    settingRow("Go to player", "Paused while the game hides where players are.", travel).row,
  );

  const content = h("div", "qws-room-player");
  content.append(renderHero(player), inspect.root, more.root);
  return content;
}

function renderPlayerEntry(player: Player, btn: HTMLButtonElement): void {
  const text = h("div", "qws-room-entry");
  text.append(
    h("div", "qws-room-entry__name", player.name || player.id),
    h("div", "qws-room-entry__status", player.isConnected ? "Online" : "Offline"),
  );
  btn.title = player.name || player.id;
  btn.append(avatar(player), text);
}

export async function renderRoomMenu(root: HTMLElement) {
  ensureRoomStyles();
  // The window body's padding would frame the split panes; they draw their own.
  root.classList.add("qws-room-body");

  const side = h("div", "qws-room-side");
  const detail = h("div", "qws-room-detail qmm-scroll");
  const split = h("div", "qws-room-split");
  split.append(side, detail);
  const wrap = h("div", "qws-room");
  wrap.appendChild(split);
  root.appendChild(wrap);

  let players: Player[] = [];
  const playerById = (id: string | null) => (id ? players.find((p) => p.id === id) ?? null : null);

  const showDetail = (id: string | null) => {
    const player = playerById(id);
    detail.replaceChildren(
      player
        ? renderPlayerDetail(root, player)
        : players.length
          ? emptyState("user", "No player selected", "Pick someone in the list.")
          : emptyState("users", "Nobody here yet", "Players show up here as they join the room."),
    );
  };

  const count = h("span", "qmm-tag", "0");
  const head = h("div", "qws-room-side__head");
  head.append(sectionLabel("Players"), count);

  const tabs = new VTabs({
    emptyText: "No one yet.",
    fillAvailableHeight: true,
    onSelect: (id) => showDetail(id),
    renderItem: (item: VTabItem, btn) => {
      const player = playerById(item.id);
      if (player) renderPlayerEntry(player, btn);
    },
  });
  side.append(head, tabs.root);
  // An empty room never changes the signature below, so draw the empty state now.
  tabs.setItems([]);
  showDetail(null);

  let lastSignature = "";
  async function refresh() {
    const next = await listPlayers();
    const signature = next.map((p) => `${p.id}|${p.name ?? ""}|${p.isConnected ? 1 : 0}`).join(";");
    if (signature === lastSignature) return;
    lastSignature = signature;
    players = next;

    count.textContent = String(players.length);
    count.title = `${players.length} player${players.length !== 1 ? "s" : ""} in this room`;
    tabs.setItems(players.map((p) => ({ id: p.id, title: p.name || p.id })));
    const selected = tabs.getSelected();
    if (!selected && players.length) tabs.select(players[0].id);
    else showDetail(selected?.id ?? null);
  }

  await onPlayersChange(() => void refresh());
  await refresh();
}
