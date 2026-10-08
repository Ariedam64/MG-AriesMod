// The Misc menu: one scrolling column of collapsible section cards, the same
// layout as the Editor, Keybinds and Skins panels.
//
// The deleters pick what to destroy through their own popup (`deleters/picker`),
// which lists the inventory and the matching storage.

import { getAriesStorage, updateAriesStorage } from "../../platform/storage";
import { pill } from "../../ui/kit/badges";
import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import { numberInput } from "../../ui/kit/fields";
import { collapsibleCard, settingRow } from "../../ui/kit/layout";
import { Menu } from "../../ui/kit/menu";
import { slider } from "../../ui/kit/sliders";
import { color } from "../../ui/kit/theme";
import { switchInput } from "../../ui/kit/toggles";
import {
  AUTO_RECO_TEMPORARILY_DISABLED,
  readAutoRecoDelayMs,
  readAutoRecoEnabled,
  writeAutoRecoDelayMs,
  writeAutoRecoEnabled,
} from "../autoReco/settings";
import { autoStores } from "../autoStore/stores";
import { readShowCropPrice, writeShowCropPrice } from "../cropPrice/setting";
import { DECOR_DELETE_DELAY_MS, SEED_DELETE_DELAY_MS, decorDeleter, seedDeleter } from "../deleters/deleters";
import { openDeleterPicker } from "../deleters/picker";
import type { DeleterController } from "../deleters/run";
import { createDeleterSection } from "../deleters/section";
import { getDecorEntries, getSeedEntries, type DeleterEntry } from "../deleters/sources";
import { createGhostController, readGhostDelayMs, readGhostEnabled, writeGhostEnabled } from "./ghost";
import { openGardenView } from "./gardenView";
import { readInventorySlotReserveEnabled, writeInventorySlotReserveEnabled } from "./inventoryReserve";

const PANEL_WIDTH_PX = 620;

const AUTO_RECO_MAX_SECONDS = 300;
const AUTO_RECO_STEP_SECONDS = 30;
const MOVE_DELAY_MIN_MS = 10;
const MOVE_DELAY_MAX_MS = 1000;
const MOVE_DELAY_DEFAULT_MS = 50;

/** `Instant`, `45 s`, `2 min`, `2 min 30 s`: the auto reconnect delay. */
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
  const title = h("div", undefined, "⚙️ Misc controls");
  Object.assign(title.style, { fontSize: "15px", fontWeight: "700", color: color.text });

  const subtitle = h("div", undefined, "Utility toggles and bulk tools.");
  Object.assign(subtitle.style, { fontSize: "11px", color: color.textDim, lineHeight: "1.45" });

  const head = h("div");
  Object.assign(head.style, { display: "flex", flexDirection: "column", gap: "4px", flexShrink: "0", padding: "2px 2px 0" });
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

  const featureDisabled = AUTO_RECO_TEMPORARILY_DISABLED;
  const initialSeconds = Math.round(readAutoRecoDelayMs() / 1000);

  const hint = h("div");
  Object.assign(hint.style, { fontSize: "10px", color: color.textDim, lineHeight: "1.45", padding: "0 2px" });

  const delaySlider = slider(0, AUTO_RECO_MAX_SECONDS, AUTO_RECO_STEP_SECONDS, initialSeconds, { fill: true });
  delaySlider.style.width = "150px";
  const delayValue = pill(formatShortDuration(initialSeconds));
  Object.assign(delayValue.style, { minWidth: "64px", justifyContent: "center" });

  const enabledToggle = switchInput(featureDisabled ? false : readAutoRecoEnabled(), on => {
    writeAutoRecoEnabled(on);
    syncEnabled(on);
  });

  function syncEnabled(on: boolean): void {
    delaySlider.disabled = featureDisabled || !on;
    hint.textContent = on
      ? "Automatically log back in if this account is disconnected because it was opened in another session."
      : "Auto reconnect on session conflict is turned off.";
  }

  if (featureDisabled) {
    enabledToggle.disabled = true;
    Object.assign(enabledToggle.style, { opacity: "0.4", pointerEvents: "none" });
    delaySlider.disabled = true;
    hint.textContent =
      "Auto reconnect has been temporarily disabled at the request of the game developers. It will most likely come back later.";
  } else {
    syncEnabled(readAutoRecoEnabled());
  }

  const snapSeconds = (value: number) =>
    Math.max(0, Math.min(AUTO_RECO_MAX_SECONDS, Math.round(value / AUTO_RECO_STEP_SECONDS) * AUTO_RECO_STEP_SECONDS));

  const applySeconds = (raw: number, persist: boolean) => {
    const seconds = snapSeconds(raw);
    delaySlider.value = String(seconds);
    delayValue.textContent = formatShortDuration(seconds);
    if (persist) writeAutoRecoDelayMs(seconds * 1000);
  };
  delaySlider.addEventListener("input", () => applySeconds(Number(delaySlider.value), false));
  delaySlider.addEventListener("change", () => applySeconds(Number(delaySlider.value), true));

  const delayControl = h("div");
  Object.assign(delayControl.style, { display: "flex", alignItems: "center", gap: "10px" });
  delayControl.append(delaySlider, delayValue);

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

  // Ghost mode starts when this menu is first built, not at boot.
  const ghost = createGhostController();
  const ghostToggle = switchInput(readGhostEnabled(), on => {
    writeGhostEnabled(on);
    if (on) ghost.start();
    else ghost.stop();
  });
  if (readGhostEnabled()) ghost.start();

  const delayInput = numberInput(MOVE_DELAY_MIN_MS, MOVE_DELAY_MAX_MS, 5, readGhostDelayMs());
  delayInput.addEventListener("change", () => {
    const value = Math.max(
      MOVE_DELAY_MIN_MS,
      Math.min(MOVE_DELAY_MAX_MS, Math.floor(Number(delayInput.value) || MOVE_DELAY_DEFAULT_MS)),
    );
    delayInput.value = String(value);
    ghost.setSpeed(value);
  });

  card.body.append(
    settingRow("Ghost mode", "Ignores collisions while you move.", ghostToggle).row,
    settingRow("Move delay (ms)", "Lower values feel faster.", delayInput.wrap).row,
  );

  return {
    root: card.root,
    cleanup: () => ghost.stop(),
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

  const guardToggle = switchInput(readInventorySlotReserveEnabled(), writeInventorySlotReserveEnabled);

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

/* ===== Section: Display ===== */
function buildDisplaySection(modalHost: () => HTMLElement): HTMLElement {
  const card = section(
    "display",
    "💰",
    "Display",
    "What the mod adds on top of the game's own screens.",
  );

  // Applies at once: both price displays subscribe to the setting.
  const priceToggle = switchInput(readShowCropPrice(), writeShowCropPrice);

  const gardenViewButton = button("Open", {
    variant: "primary",
    size: "sm",
    onClick: () => openGardenView(modalHost()),
  });

  card.body.append(
    settingRow("Crop price", "Shows a crop's sell price in its tooltip.", priceToggle).row,
    settingRow(
      "Garden view",
      "Your whole garden as a flat grid, so no plant hides behind another.",
      gardenViewButton,
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

  const rows = [
    {
      title: "Seed Silo",
      hint: "Auto-store seeds when the species already exists in the silo.",
      icon: "sprite/decor/SeedSilo",
      store: autoStores.seedSilo,
    },
    {
      title: "Decor Shed",
      hint: "Auto-store decor when the item already exists in the shed.",
      icon: "sprite/decor/DecorShed",
      store: autoStores.decorShed,
    },
    {
      title: "Tool Shack",
      hint: "Auto-store tools when the item already exists in the shack.",
      icon: "sprite/decor/ToolShack",
      store: autoStores.toolShack,
    },
  ];

  for (const entry of rows) {
    const control = switchInput(entry.store.isEnabled(), on => entry.store.setEnabled(on));
    card.body.appendChild(
      settingRow(entry.title, entry.hint, control, { icon: entry.icon, iconTag: "misc" }).row,
    );
  }
  return card.root;
}

/* ---------------- entry ---------------- */

export async function renderMiscMenu(container: HTMLElement) {
  const ui = new Menu({ id: "misc", compact: true });
  ui.mount(container);

  // `.qmm-views` already is the panel: same gradient, same rounded border,
  // same padding, and its own scroller. Nesting a second identical panel inside
  // it would stack two scroll containers, so style it directly instead.
  const root = (ui.root.querySelector(".qmm-views") as HTMLElement) ?? ui.root;
  root.replaceChildren();
  root.classList.add("qmm-scroll");
  Object.assign(root.style, {
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

  const player = buildPlayerSection();

  /** HUD window the popup anchors to, so it stacks above this menu. */
  const modalHost = (): HTMLElement =>
    (ui.root.closest(".qws-win") as HTMLElement | null) ?? ui.root;

  /**
   * Opens the picker and resolves once it is gone, confirmed or cancelled,
   * so the section refreshes its summary either way.
   */
  const pickFor = (
    controller: DeleterController,
    opts: {
      title: string;
      unitNoun: string;
      storageNoun: string;
      spriteCategories: string[];
      fallbackIcon: string;
      loadEntries: () => Promise<DeleterEntry[]>;
    },
  ): Promise<void> =>
    new Promise<void>((resolve) => {
      let loaded: DeleterEntry[] = [];
      openDeleterPicker({
        ...opts,
        host: modalHost(),
        initial: new Map(controller.getSelection().map((entry) => [entry.id, entry.qty])),
        loadEntries: async () => {
          loaded = await opts.loadEntries();
          return loaded;
        },
        onConfirm: (picked) => {
          controller.setSelection(
            Array.from(picked, ([id, qty]) => {
              const entry = loaded.find((candidate) => candidate.id === id);
              return {
                id,
                qty,
                label: entry?.label ?? id,
                fromStorage: Math.max(0, qty - (entry?.invQty ?? 0)),
              };
            }),
          );
        },
        onClose: () => resolve(),
      });
    });

  const seedDeleterSection = createDeleterSection({
    headerSprite: "sprite/ui/SeedIcon",
    title: "Seed deleter",
    description: "Bulk delete seeds from your inventory and Seed Silo.",
    spriteCategories: ["seed"],
    fallbackIcon: "🌱",
    groupNoun: "species",
    unitNoun: "seeds",
    selectLabel: "Choose seeds",
    clearLabel: "Clear selected seeds",
    storageLabel: "Seed Silo",
    estimateDelayMs: SEED_DELETE_DELAY_MS,
    runDelayMs: SEED_DELETE_DELAY_MS,
    collapsed: isSectionCollapsed("seedDeleter"),
    onToggleCollapsed: collapsed => setSectionCollapsed("seedDeleter", collapsed),
    controller: seedDeleter,
    openSelector: () => pickFor(seedDeleter, {
      title: "Select seeds",
      unitNoun: "seeds",
      storageNoun: "silo",
      spriteCategories: ["seed"],
      fallbackIcon: "🌱",
      loadEntries: getSeedEntries,
    }),
  });

  const decorDeleterSection = createDeleterSection({
    headerSprite: "sprite/ui/DecorIcon",
    title: "Decor deleter",
    description: "Bulk delete decor from your inventory and Decor Shed.",
    spriteCategories: ["decor"],
    fallbackIcon: "🪴",
    groupNoun: "decor",
    unitNoun: "items",
    selectLabel: "Choose decor",
    clearLabel: "Clear selected decor",
    storageLabel: "Decor Shed",
    // Decor deletes cost roughly two round-trips each, so the estimate doubles
    // the delay the run is actually given.
    estimateDelayMs: DECOR_DELETE_DELAY_MS * 2,
    runDelayMs: DECOR_DELETE_DELAY_MS,
    collapsed: isSectionCollapsed("decorDeleter"),
    onToggleCollapsed: collapsed => setSectionCollapsed("decorDeleter", collapsed),
    controller: decorDeleter,
    openSelector: () => pickFor(decorDeleter, {
      title: "Select decor",
      unitNoun: "decor",
      storageNoun: "shed",
      spriteCategories: ["decor"],
      fallbackIcon: "🪴",
      loadEntries: getDecorEntries,
    }),
  });

  root.append(
    panelHeader(),
    buildAutoRecoSection(),
    player.root,
    buildDisplaySection(modalHost),
    buildInventoryGuardSection(),
    buildStorageSection(),
    seedDeleterSection.root,
    decorDeleterSection.root,
  );

  (root as any).__cleanup__ = () => {
    try { player.cleanup(); } catch {}
    try { seedDeleterSection.cleanup(); } catch {}
    try { decorDeleterSection.cleanup(); } catch {}
  };
}
