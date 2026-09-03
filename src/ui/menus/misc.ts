// src/ui/menus/misc.ts
//
// Same visual language as the Editor / Keybinds / Skins panels: one scrolling
// column of collapsible section cards built from `panel-ui`.
//
// The Menu instance stays for `setWindowVisible`, which the seed/decor selector
// flows need to hide the HUD while the player picks items in-game.

import { Menu } from "../menu";
import { MiscService, DEFAULT_SEED_DELETE_DELAY_MS, DEFAULT_DECOR_DELETE_DELAY_MS } from "../../services/misc";
import { Atoms } from "../../store/atoms";
import { getAriesStorage, updateAriesStorage } from "../../utils/localStorage";
import { createDeleterSection } from "./misc/deleter-section";
import {
  TEXT,
  TEXT_DIM,
  css,
  ensurePanelStyles,
  numberField,
  pill,
  range,
  toggle,
} from "./panel-ui";
import { collapsibleCard, settingRow } from "./panel-layout";

const PANEL_WIDTH_PX = 620;

const AUTO_RECO_MAX_SECONDS = 300;
const AUTO_RECO_STEP_SECONDS = 30;
const MOVE_DELAY_MIN_MS = 10;
const MOVE_DELAY_MAX_MS = 1000;
const MOVE_DELAY_DEFAULT_MS = 50;

const formatShortDuration = (seconds: number): string => {
  if (seconds <= 0) return "Instant";
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
};

/** Collapsed sections persist so the menu reopens the way it was left. */
function isSectionCollapsed(sectionId: string): boolean {
  return getAriesStorage().misc?.collapsed?.[sectionId] === true;
}

function setSectionCollapsed(sectionId: string, collapsed: boolean): void {
  updateAriesStorage(current => {
    const misc = (current.misc ??= {});
    const map = (misc.collapsed ??= {});
    if (collapsed) map[sectionId] = true;
    else delete map[sectionId];
  });
}

/** Section card wired to the persisted collapse state. */
function section(id: string, icon: string, title: string, description: string) {
  return collapsibleCard({
    icon,
    title,
    description,
    collapsed: isSectionCollapsed(id),
    onToggle: collapsed => setSectionCollapsed(id, collapsed),
  });
}

function panelHeader(): HTMLElement {
  const head = document.createElement("div");
  css(head, { display: "flex", flexDirection: "column", gap: "4px", flexShrink: "0", padding: "2px 2px 0" });

  const title = document.createElement("div");
  css(title, { fontSize: "15px", fontWeight: "700", color: TEXT });
  title.textContent = "⚙️ Misc controls";

  const subtitle = document.createElement("div");
  css(subtitle, { fontSize: "11px", color: TEXT_DIM, lineHeight: "1.45" });
  subtitle.textContent = "Utility toggles and bulk tools.";

  head.append(title, subtitle);
  return head;
}

/* ===== Section: Auto reconnect ===== */
function buildAutoRecoSection(): HTMLElement {
  const card = section(
    "autoReco",
    "🔌",
    "Auto reconnect",
    "Reconnect automatically when the session is kicked.",
  );

  const featureDisabled = MiscService.AUTO_RECO_TEMPORARILY_DISABLED;
  const initialSeconds = Math.round(MiscService.getAutoRecoDelayMs() / 1000);

  const hint = document.createElement("div");
  css(hint, { fontSize: "10px", color: TEXT_DIM, lineHeight: "1.45", padding: "0 2px" });

  const slider = range(0, AUTO_RECO_MAX_SECONDS, AUTO_RECO_STEP_SECONDS, initialSeconds);
  css(slider, { width: "150px" });
  const sliderValue = pill(formatShortDuration(initialSeconds));
  css(sliderValue, { minWidth: "64px", textAlign: "center" });

  const enabledToggle = toggle(featureDisabled ? false : MiscService.readAutoRecoEnabled(false), on => {
    MiscService.writeAutoRecoEnabled(on);
    syncEnabled(on);
  });

  function syncEnabled(on: boolean): void {
    slider.disabled = featureDisabled || !on;
    hint.textContent = on
      ? "Automatically log back in if this account is disconnected because it was opened in another session."
      : "Auto reconnect on session conflict is turned off.";
  }

  if (featureDisabled) {
    const input = enabledToggle.querySelector("input") as HTMLInputElement | null;
    if (input) input.disabled = true;
    css(enabledToggle, { opacity: "0.4", pointerEvents: "none" });
    slider.disabled = true;
    hint.textContent =
      "Auto reconnect has been temporarily disabled at the request of the game developers. It will most likely come back later.";
  } else {
    syncEnabled(MiscService.readAutoRecoEnabled(false));
  }

  const clampSeconds = (value: number) =>
    Math.max(0, Math.min(AUTO_RECO_MAX_SECONDS, Math.round(value / AUTO_RECO_STEP_SECONDS) * AUTO_RECO_STEP_SECONDS));

  const applySeconds = (raw: number, persist: boolean) => {
    const seconds = clampSeconds(raw);
    slider.value = String(seconds);
    sliderValue.textContent = formatShortDuration(seconds);
    if (persist) MiscService.setAutoRecoDelayMs(seconds * 1000);
  };
  slider.addEventListener("input", () => applySeconds(Number(slider.value), false));
  slider.addEventListener("change", () => applySeconds(Number(slider.value), true));

  const delayControl = document.createElement("div");
  css(delayControl, { display: "flex", alignItems: "center", gap: "10px" });
  delayControl.append(slider, sliderValue);

  card.body.append(
    settingRow("Enabled", "Attempts to log back in after a session conflict.", enabledToggle).row,
    settingRow("Delay", "Wait time before reconnecting.", delayControl).row,
    hint,
  );
  return card.root;
}

/* ===== Section: Player controls ===== */
function buildPlayerSection(): { root: HTMLElement; cleanup: () => void } {
  const card = section(
    "player",
    "👻",
    "Player controls",
    "Movement helpers for walking and testing.",
  );

  const ghost = MiscService.createGhostController();

  const ghostToggle = toggle(MiscService.readGhostEnabled(false), on => {
    MiscService.writeGhostEnabled(on);
    if (on) ghost.start();
    else ghost.stop();
  });
  if (MiscService.readGhostEnabled(false)) ghost.start();

  const delayInput = numberField(
    MOVE_DELAY_MIN_MS,
    MOVE_DELAY_MAX_MS,
    5,
    MiscService.getGhostDelayMs(),
  );
  delayInput.addEventListener("change", () => {
    const value = Math.max(
      MOVE_DELAY_MIN_MS,
      Math.min(MOVE_DELAY_MAX_MS, Math.floor(Number(delayInput.value) || MOVE_DELAY_DEFAULT_MS)),
    );
    delayInput.value = String(value);
    ghost.setSpeed?.(value);
    MiscService.setGhostDelayMs(value);
  });

  card.body.append(
    settingRow("Ghost mode", "Ignores collisions while you move.", ghostToggle).row,
    settingRow("Move delay (ms)", "Lower values feel faster.", delayInput).row,
  );

  return {
    root: card.root,
    cleanup: () => { try { ghost.stop(); } catch {} },
  };
}

/* ===== Section: Inventory guard ===== */
function buildInventoryGuardSection(): HTMLElement {
  const card = section(
    "inventoryGuard",
    "🎒",
    "Inventory guard",
    "Keep a slot open for swaps and bulk actions.",
  );

  const guardToggle = toggle(MiscService.readInventorySlotReserveEnabled(false), on =>
    MiscService.writeInventorySlotReserveEnabled(on),
  );

  card.body.append(
    settingRow(
      "Keep 1 slot free",
      "Blocks actions that would add a new inventory entry at 99/100.",
      guardToggle,
      { icon: "sprite/ui/InventoryBag", iconTag: "misc" },
    ).row,
  );
  return card.root;
}

/* ===== Section: Storage auto-store ===== */
function buildStorageSection(): HTMLElement {
  const card = section(
    "storage",
    "📦",
    "Storage auto-store",
    "Move items into storage when a matching stack already exists.",
  );

  const rows: Array<{
    title: string;
    hint: string;
    icon: string;
    read: () => boolean;
    write: (on: boolean) => void;
  }> = [
    {
      title: "Seed Silo",
      hint: "Auto-store seeds when the species already exists in the silo.",
      icon: "sprite/decor/SeedSilo",
      read: () => MiscService.readAutoStoreSeedSiloEnabled(false),
      write: on => MiscService.setAutoStoreSeedSiloEnabled(on),
    },
    {
      title: "Decor Shed",
      hint: "Auto-store decor when the item already exists in the shed.",
      icon: "sprite/decor/DecorShed",
      read: () => MiscService.readAutoStoreDecorShedEnabled(false),
      write: on => MiscService.setAutoStoreDecorShedEnabled(on),
    },
    {
      title: "Tool Shack",
      hint: "Auto-store tools when the item already exists in the shack.",
      icon: "sprite/decor/ToolShack",
      read: () => MiscService.readAutoStoreToolShackEnabled(false),
      write: on => MiscService.setAutoStoreToolShackEnabled(on),
    },
  ];

  for (const entry of rows) {
    const control = toggle(entry.read(), on => entry.write(on));
    card.body.appendChild(
      settingRow(entry.title, entry.hint, control, { icon: entry.icon, iconTag: "misc" }).row,
    );
  }
  return card.root;
}

/* ---------------- entry ---------------- */

export async function renderMiscMenu(container: HTMLElement) {
  ensurePanelStyles();

  const ui = new Menu({ id: "misc", compact: true });
  ui.mount(container);

  // `.qmm-views` already *is* the panel: same gradient, same rounded border,
  // same padding, and its own scroller. Nesting a second identical panel inside
  // it would stack two scroll containers, so style it directly instead.
  const root = (ui.root.querySelector(".qmm-views") as HTMLElement) ?? ui.root;
  root.innerHTML = "";
  root.classList.add("qws-pnl-root", "qws-pnl-scroll");
  css(root, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    width: `${PANEL_WIDTH_PX}px`,
    maxWidth: "100%",
    // A definite height, not 100%: the HUD window is itself a scroller and has
    // no fixed height, so `height:100%` would collapse onto the content and
    // hand the scrollbar back to the whole window.
    height: "min(70vh, 600px)",
    overflowY: "auto",
    boxSizing: "border-box",
  });

  /** Clearing the stale selected-item index keeps the in-game picker in sync. */
  const resetSelectedItemIndex = async () => {
    try {
      await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null);
    } catch {}
  };

  const player = buildPlayerSection();

  const seedDeleter = createDeleterSection({
    headerIcon: "🌱",
    title: "Seed deleter",
    description: "Bulk delete seeds from inventory.",
    rowIcon: "sprite/ui/SeedIcon",
    groupNoun: "species",
    unitNoun: "seeds",
    selectLabel: "Select seeds",
    eventPrefix: "qws:seeddeleter",
    estimateDelayMs: DEFAULT_SEED_DELETE_DELAY_MS,
    runDelayMs: DEFAULT_SEED_DELETE_DELAY_MS,
    collapsed: isSectionCollapsed("seedDeleter"),
    onToggleCollapsed: collapsed => setSectionCollapsed("seedDeleter", collapsed),
    progressTarget: detail => String(detail?.species ?? "-"),
    getSelection: () => MiscService.getCurrentSeedSelection?.() || [],
    clearSelection: () => MiscService.clearSeedSelection?.(),
    openSelector: async () => {
      await resetSelectedItemIndex();
      await MiscService.openSeedSelectorFlow(ui.setWindowVisible.bind(ui));
    },
    runDelete: delayMs => MiscService.deleteSelectedSeeds({ delayMs }),
    isRunning: () => MiscService.isSeedDeletionRunning(),
    isPaused: () => MiscService.isSeedDeletionPaused(),
    pause: () => MiscService.pauseSeedDeletion(),
    resume: () => MiscService.resumeSeedDeletion(),
    cancel: () => MiscService.cancelSeedDeletion(),
  });

  const decorDeleter = createDeleterSection({
    headerIcon: "🪴",
    title: "Decor deleter",
    description: "Bulk delete decor from inventory.",
    rowIcon: "sprite/ui/DecorIcon",
    groupNoun: "decor",
    unitNoun: "items",
    selectLabel: "Select decor",
    eventPrefix: "qws:decordeleter",
    // Decor deletes cost roughly two round-trips each, so the estimate doubles
    // the delay the service is actually given.
    estimateDelayMs: DEFAULT_DECOR_DELETE_DELAY_MS * 2,
    runDelayMs: DEFAULT_DECOR_DELETE_DELAY_MS,
    collapsed: isSectionCollapsed("decorDeleter"),
    onToggleCollapsed: collapsed => setSectionCollapsed("decorDeleter", collapsed),
    progressTarget: detail => String(detail?.decorId ?? "-"),
    getSelection: () => MiscService.getCurrentDecorSelection?.() || [],
    clearSelection: () => MiscService.clearDecorSelection?.(),
    openSelector: async () => {
      await resetSelectedItemIndex();
      await MiscService.openDecorSelectorFlow(ui.setWindowVisible.bind(ui));
    },
    runDelete: delayMs => MiscService.deleteSelectedDecor?.({ delayMs }),
    isRunning: () => MiscService.isDecorDeletionRunning(),
    isPaused: () => MiscService.isDecorDeletionPaused(),
    pause: () => MiscService.pauseDecorDeletion(),
    resume: () => MiscService.resumeDecorDeletion(),
    cancel: () => MiscService.cancelDecorDeletion(),
  });

  root.append(
    panelHeader(),
    buildAutoRecoSection(),
    player.root,
    buildInventoryGuardSection(),
    buildStorageSection(),
    seedDeleter.root,
    decorDeleter.root,
  );

  (root as any).__cleanup__ = () => {
    try { player.cleanup(); } catch {}
    try { seedDeleter.cleanup(); } catch {}
    try { decorDeleter.cleanup(); } catch {}
  };
}
