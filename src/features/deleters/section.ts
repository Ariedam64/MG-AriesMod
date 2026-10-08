// The seed and decor bulk deleters differ only in labels, sprites and the
// controller behind them, so they share one section builder.
//
// The card shows the selection rather than describing it: three headline
// figures, then the picked categories as sprite chips. While a run is going
// those swap for a progress bar, so there is one thing on screen at a time and
// the card never reads as a wall of controls.

import { formatInteger } from "../../lib/format";
import { meter } from "../../ui/kit/badges";
import { button, setButtonEnabled } from "../../ui/kit/button";
import { sectionLabel } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { iconBox } from "../../ui/kit/icons";
import { collapsibleCard } from "../../ui/kit/layout";
import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import type { DeleterController, DeleterEvent } from "./run";
import { ensureDeleterStyles } from "./styles";

/** Per-delete slack the run spends outside its own delay. */
const EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS = 10;

/** Chips beyond this collapse into a "+N more" pill. */
const MAX_VISIBLE_CHIPS = 4;

const CHIP_SPRITE_PX = 22;

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

export interface DeleterSectionConfig {
  /** Game sprite shown in the section header, e.g. `sprite/ui/SeedIcon`. */
  headerSprite: string;
  title: string;
  description: string;
  /** Plural noun for the group count, e.g. "species". */
  groupNoun: string;
  /** Plural noun for the unit count, e.g. "seeds". */
  unitNoun: string;
  /** Where the non-inventory half lives, e.g. "Seed Silo". */
  storageLabel: string;
  selectLabel: string;
  /** Says what gets cleared, e.g. "Clear selected seeds". */
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

/** One headline figure with its caption underneath. */
function statTile(): { root: HTMLElement; set: (value: string, caption: string, warn?: boolean) => void } {
  const root = h("div", "qws-del-stat");
  const value = h("div", "qws-del-stat__value");
  const caption = h("div", "qws-del-stat__caption");
  root.append(value, caption);
  return {
    root,
    set: (nextValue, nextCaption, warn = false) => {
      value.textContent = nextValue;
      value.classList.toggle("is-warn", warn);
      caption.textContent = nextCaption;
    },
  };
}

export function createDeleterSection(config: DeleterSectionConfig): HTMLElement {
  ensureDeleterStyles();
  const { controller } = config;

  // A real game sprite in the header rather than an emoji, so the card reads
  // like the thing it acts on. `collapsibleCard` builds its own title from a
  // string, so the whole header is handed over instead.
  const headerText = h("div", "qws-del-head__text");
  headerText.append(sectionLabel(config.title), h("div", "qws-del-head__desc", config.description));
  const header = h("div", "qws-del-head");
  header.append(iconBox(config.headerSprite, 22, "misc"), headerText);

  const section = collapsibleCard({
    header,
    collapsed: config.collapsed,
    onToggle: config.onToggleCollapsed,
  });
  section.root.classList.add("qws-del-section");

  /* ----- Headline figures ----- */
  const stats = h("div", "qws-del-stats");
  const statGroups = statTile();
  const statUnits = statTile();
  const statStorage = statTile();
  stats.append(statGroups.root, statUnits.root, statStorage.root);

  /* ----- Selected categories ----- */
  const chips = h("div", "qws-del-chips");

  /* ----- Estimate ----- */
  const estimate = h("div", "qws-del-estimate");

  /* ----- Progress, shown while running ----- */
  const bar = meter();
  const progressTargetEl = h("div", "qws-del-progress__target");
  const progressCount = h("div", "qws-del-progress__count");
  const progressLine = h("div", "qws-del-progress__line");
  progressLine.append(progressTargetEl, progressCount);
  const progressWrap = h("div", "qws-del-progress");
  progressWrap.append(bar.root, progressLine);

  /* ----- Actions ----- */
  const btnSelect = button(config.selectLabel, {
    variant: "primary",
    size: "sm",
    lockWhilePending: true,
    onClick: () => runSelect(),
  });
  const btnClear = button(config.clearLabel, {
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
  const btnPlay = button("Resume", { size: "sm", onClick: () => { controller.resume(); updateControls(); } });
  const btnStop = button("Stop", { variant: "danger", size: "sm", onClick: () => { controller.cancel(); updateControls(); } });

  const actions = h("div", "qws-del-actions");
  actions.append(btnSelect, btnClear, h("div", "qws-del-spacer"), btnDelete, btnPause, btnPlay, btnStop);

  section.body.append(stats, chips, estimate, progressWrap, actions);

  /* ----- Progress state ----- */
  const progress = { target: "-", done: 0, total: 0 };

  function buildChip(item: { id: string; label: string; qty: number }): HTMLElement {
    const icon = h("span", "qws-del-chip__icon", config.fallbackIcon);
    attachSpriteIcon(icon, config.spriteCategories, [item.id], CHIP_SPRITE_PX, "deleter-chip");

    const chip = h("div", "qws-del-chip");
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

    statGroups.set(formatInteger(groupCount), config.groupNoun);
    statUnits.set(formatInteger(totalQty), config.unitNoun);
    statStorage.set(formatInteger(fromStorage), "from storage", fromStorage > 0);

    chips.replaceChildren();
    if (groupCount === 0) {
      chips.append(
        h("div", "qws-del-hint", `Nothing picked yet. Choose from your inventory and your ${config.storageLabel}.`),
      );
    } else {
      const sorted = [...selection].sort((a, b) => b.qty - a.qty);
      for (const item of sorted.slice(0, MAX_VISIBLE_CHIPS)) chips.append(buildChip(item));
      if (sorted.length > MAX_VISIBLE_CHIPS) {
        chips.append(h("div", "qws-del-chip qws-del-chip--more", `+${sorted.length - MAX_VISIBLE_CHIPS} more`));
      }
    }

    const running = controller.isRunning();
    const estimateMs = estimateMsFor(totalQty);
    const finishTimestamp = running ? estimatedFinish : estimateMs > 0 ? Date.now() + estimateMs : null;

    estimate.textContent = totalQty <= 0
      ? ""
      : finishTimestamp
        ? `About ${formatDurationShort(estimateMs)} · done around ${formatFinishTime(finishTimestamp)}`
        : `About ${formatDurationShort(estimateMs)}`;

    const hasSelection = groupCount > 0 && totalQty > 0;
    setButtonEnabled(btnDelete, hasSelection && !running);
    setButtonEnabled(btnClear, hasSelection && !running);
    setButtonEnabled(btnSelect, !running);

    // The countdown only means something while idle: once running, the finish
    // time is pinned and the progress events drive the card instead.
    clearSummaryTimer();
    if (!running && totalQty > 0) {
      summaryTimer = window.setTimeout(() => updateSummary(), 1000);
    }
  }

  function updateControls(): void {
    const running = controller.isRunning();
    const paused = controller.isPaused();

    section.root.classList.toggle("is-running", running);
    btnPause.hidden = !running || paused;
    btnPlay.hidden = !running || !paused;
    btnStop.hidden = !running;
    btnDelete.hidden = running;

    if (running) {
      const ratio = progress.total > 0 ? progress.done / progress.total : 0;
      bar.set(ratio, paused ? "warn" : "accent");
      progressTargetEl.textContent = paused ? `Paused · ${progress.target || "-"}` : progress.target || "-";
      progressCount.textContent = `${formatInteger(progress.done)} / ${formatInteger(progress.total)}`;
      estimate.textContent = "";
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
