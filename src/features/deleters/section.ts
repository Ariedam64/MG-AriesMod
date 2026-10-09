// The seed and decor bulk deleters differ only in labels, sprites and the
// controller behind them, so they share one section builder.
//
// The card shows one state at a time. With nothing picked, an empty state and
// the button to pick. With a selection, its totals, the picked kinds as sprite
// chips, how long it will take, and the button to start. While a run is going,
// a progress bar and the buttons to pause or stop it.

import { formatInteger } from "../../lib/format";
import { meter, pill } from "../../ui/kit/badges";
import { button, setButtonEnabled } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import { iconBox } from "../../ui/kit/icons";
import { collapsibleCard } from "../../ui/kit/layout";
import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import type { DeleterController, DeleterEvent } from "./run";
import { ensureDeleterStyles } from "./styles";

/** Per-delete slack the run spends outside its own delay. */
const EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS = 10;

/** Chips beyond this collapse into a "+N more" chip. */
const MAX_VISIBLE_CHIPS = 4;

const CHIP_SPRITE_PX = 22;
const EMPTY_SPRITE_PX = 30;

/** `850 ms`, `4.2 s`, `37 s`, `3 min 5 s`: precise for short runs, rounded for long ones. */
const formatDurationShort = (ms: number): string => {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  if (seconds < 90) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
};

const formatFinishTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** A noun in its two forms, so a count reads as a phrase: `1 seed`, `3 seeds`. */
type Noun = { one: string; many: string };

const counted = (count: number, noun: Noun) => `${formatInteger(count)} ${count === 1 ? noun.one : noun.many}`;

export interface DeleterSectionConfig {
  /** Game sprite shown in the empty state, e.g. `sprite/ui/SeedIcon`. */
  sprite: string;
  title: string;
  description: string;
  /** What a picked kind is called, e.g. species. */
  groupNoun: Noun;
  /** What one deleted unit is called, e.g. seed. */
  unitNoun: Noun;
  /** Where the non-inventory half lives, e.g. "Seed Silo". */
  storageLabel: string;
  selectLabel: string;
  clearLabel: string;
  /** Sprite categories for the chips, e.g. `["seed"]`. */
  spriteCategories: string[];
  fallbackIcon: string;
  /** Delay used to estimate the run duration. */
  estimateDelayMs: number;
  /** Delay handed to the run. */
  runDelayMs: number;
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  controller: DeleterController;
  /** Opens the picker and resolves once it is gone. */
  openSelector: () => Promise<void>;
}

export function createDeleterSection(config: DeleterSectionConfig): HTMLElement {
  ensureDeleterStyles();
  const { controller } = config;

  const section = collapsibleCard({
    title: config.title,
    description: config.description,
    collapsed: config.collapsed,
    onToggle: config.onToggleCollapsed,
  });
  section.root.classList.add("qws-del-section");

  /* ----- Nothing picked ----- */
  const emptyText = h("div", "qws-del-empty__text");
  emptyText.append(
    h("div", "qws-del-empty__title", "Nothing picked yet"),
    h("div", "qws-del-empty__hint", `Choose from your inventory and your ${config.storageLabel}.`),
  );
  const empty = h("div", "qws-del-empty");
  empty.append(iconBox(config.sprite, EMPTY_SPRITE_PX, "misc"), emptyText);

  /* ----- Selection ----- */
  const totalValue = h("span", "qws-del-totals__value");
  const totalGroups = h("span", "qws-del-totals__groups");
  const fromStoragePill = pill("", "warn");
  const totals = h("div", "qws-del-totals");
  totals.append(totalValue, totalGroups, fromStoragePill);

  const chips = h("div", "qws-del-chips");
  const estimate = h("div", "qws-del-estimate");
  const selectionWrap = h("div", "qws-del-selection");
  selectionWrap.append(totals, chips, estimate);

  /* ----- Progress, shown while running ----- */
  const bar = meter();
  const progressTargetEl = h("div", "qws-del-progress__target");
  const progressCount = h("div", "qws-del-progress__count");
  const progressLine = h("div", "qws-del-progress__line");
  progressLine.append(progressTargetEl, progressCount);
  const progressWrap = h("div", "qws-del-progress");
  progressWrap.append(progressLine, bar.root);

  /* ----- Actions ----- */
  const btnSelect = button(config.selectLabel, {
    size: "sm",
    lockWhilePending: true,
    onClick: () => runSelect(),
  });
  const btnClear = button(config.clearLabel, {
    variant: "ghost",
    size: "sm",
    onClick: () => {
      controller.clearSelection();
      updateSummary();
    },
  });
  const btnDelete = button("Start deleting", {
    variant: "danger",
    size: "sm",
    lockWhilePending: true,
    onClick: () => runDelete(),
  });
  const btnPause = button("Pause", { size: "sm", onClick: () => { controller.pause(); updateControls(); } });
  const btnPlay = button("Resume", { variant: "primary", size: "sm", onClick: () => { controller.resume(); updateControls(); } });
  const btnStop = button("Stop", { variant: "danger", size: "sm", onClick: () => { controller.cancel(); updateControls(); } });

  const actions = h("div", "qws-del-actions");
  actions.append(btnSelect, btnClear, h("div", "qws-del-spacer"), btnDelete, btnPause, btnPlay, btnStop);

  section.body.append(empty, selectionWrap, progressWrap, actions);

  /* ----- Progress state ----- */
  const progress = { target: "-", done: 0, total: 0 };

  function buildChip(item: { id: string; label: string; qty: number }): HTMLElement {
    const icon = h("span", "qws-del-chip__icon", config.fallbackIcon);
    attachSpriteIcon(icon, config.spriteCategories, [item.id], CHIP_SPRITE_PX, "deleter-chip");

    const chip = h("div", "qws-del-chip");
    chip.title = item.label || item.id;
    chip.append(
      icon,
      h("span", "qws-del-chip__name", item.label || item.id || "?"),
      h("span", "qws-del-chip__qty", formatInteger(item.qty)),
    );
    return chip;
  }

  function readSelection() {
    const selection = controller.getSelection();
    let totalQty = 0;
    let fromStorage = 0;
    for (const item of selection) {
      totalQty += Math.max(0, Math.floor(item.qty || 0));
      fromStorage += Math.max(0, Math.floor(item.fromStorage || 0));
    }
    return { selection, groupCount: selection.length, totalQty, fromStorage };
  }

  const estimateMsFor = (totalQty: number) =>
    totalQty * (config.estimateDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);

  /* ----- Summary and estimate ----- */
  let estimatedFinish: number | null = null;
  let summaryTimer: number | null = null;

  const clearSummaryTimer = () => {
    if (summaryTimer !== null) {
      clearTimeout(summaryTimer);
      summaryTimer = null;
    }
  };

  function updateSummary(): void {
    const { selection, groupCount, totalQty, fromStorage } = readSelection();
    const running = controller.isRunning();
    const hasSelection = groupCount > 0 && totalQty > 0;

    totalValue.textContent = counted(totalQty, config.unitNoun);
    totalGroups.textContent = counted(groupCount, config.groupNoun);
    fromStoragePill.textContent = `${formatInteger(fromStorage)} from the ${config.storageLabel}`;
    fromStoragePill.hidden = fromStorage <= 0;

    chips.replaceChildren();
    const sorted = [...selection].sort((a, b) => b.qty - a.qty);
    for (const item of sorted.slice(0, MAX_VISIBLE_CHIPS)) chips.append(buildChip(item));
    if (sorted.length > MAX_VISIBLE_CHIPS) {
      chips.append(h("div", "qws-del-chip qws-del-chip--more", `+${sorted.length - MAX_VISIBLE_CHIPS} more`));
    }

    const estimateMs = estimateMsFor(totalQty);
    const finishTimestamp = running ? estimatedFinish : estimateMs > 0 ? Date.now() + estimateMs : null;
    estimate.textContent = totalQty <= 0
      ? ""
      : finishTimestamp
        ? `About ${formatDurationShort(estimateMs)}, done around ${formatFinishTime(finishTimestamp)}`
        : `About ${formatDurationShort(estimateMs)}`;

    // Picking is the one thing to do on an empty card; once there is a
    // selection, starting the run is.
    btnSelect.classList.toggle("qmm-btn--primary", !hasSelection);
    setButtonEnabled(btnDelete, hasSelection && !running);
    setButtonEnabled(btnClear, hasSelection && !running);
    setButtonEnabled(btnSelect, !running);
    syncVisibility();

    // The countdown only means something while idle: once running, the finish
    // time is pinned and the progress events drive the card instead.
    clearSummaryTimer();
    if (!running && totalQty > 0) {
      summaryTimer = window.setTimeout(() => updateSummary(), 1000);
    }
  }

  /**
   * One state on screen at a time. Idle, the empty state or the selection,
   * with the buttons that act on it; running, the progress and the buttons
   * that steer the run.
   */
  function syncVisibility(): void {
    const running = controller.isRunning();
    const paused = controller.isPaused();
    const groupCount = controller.getSelection().length;
    const hasSelection = readSelection().totalQty > 0;
    section.root.classList.toggle("is-running", running);
    empty.hidden = running || groupCount > 0;
    selectionWrap.hidden = running || groupCount === 0;
    progressWrap.hidden = !running;
    btnSelect.hidden = running;
    btnClear.hidden = running || groupCount === 0;
    btnDelete.hidden = running || !hasSelection;
    btnPause.hidden = !running || paused;
    btnPlay.hidden = !running || !paused;
    btnStop.hidden = !running;
  }

  function updateControls(): void {
    const running = controller.isRunning();
    const paused = controller.isPaused();

    syncVisibility();

    if (running) {
      const ratio = progress.total > 0 ? progress.done / progress.total : 0;
      bar.set(ratio, paused ? "warn" : "accent");
      progressTargetEl.textContent = paused ? `Paused, ${progress.target || "-"}` : progress.target || "-";
      progressCount.textContent = `${formatInteger(progress.done)} / ${formatInteger(progress.total)}`;
    }

    setButtonEnabled(btnPause, running && !paused);
    setButtonEnabled(btnPlay, running && paused);
    setButtonEnabled(btnStop, running);
  }

  async function runSelect(): Promise<void> {
    await config.openSelector();
    updateSummary();
    updateControls();
  }

  async function runDelete(): Promise<void> {
    const estimateMs = estimateMsFor(readSelection().totalQty);
    estimatedFinish = estimateMs > 0 ? Date.now() + estimateMs : null;
    clearSummaryTimer();
    const pending = controller.run(config.runDelayMs);
    updateControls();
    updateSummary();
    await pending;
    estimatedFinish = null;
    updateControls();
    updateSummary();
  }

  /* ----- Run events ----- */
  const onEvent = (event: DeleterEvent) => {
    switch (event.type) {
      case "progress":
        progress.target = event.label || "-";
        progress.done = event.done;
        progress.total = event.total;
        updateControls();
        break;
      case "finished":
        progress.target = "-";
        progress.done = 0;
        progress.total = 0;
        updateControls();
        updateSummary();
        break;
      case "paused":
      case "resumed":
        updateControls();
        break;
    }
  };
  controller.events.on(onEvent);

  updateSummary();
  updateControls();

  return section.root;
}
