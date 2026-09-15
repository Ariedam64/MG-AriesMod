// src/ui/menus/misc/deleter-section.ts
//
// The seed and decor bulk deleters differ only in labels, sprites and the
// controller behind them, so they share one section builder.
//
// The card shows the selection rather than describing it: three headline
// figures, then the picked categories as sprite chips. While a run is going
// those swap for a progress bar, so there is one thing on screen at a time and
// the card never reads as a wall of controls.

import { attachSpriteIcon } from "../../spriteIconCache";
import {
  BORDER, CARD_BG, TEAL, TEXT, TEXT_DIM, WARN,
  button, css, meter, sectionLabel, setButtonEnabled,
} from "../panel-ui";
import { iconBox } from "../panel-icons";
import { collapsibleCard } from "../panel-layout";

const NF_US = new Intl.NumberFormat("en-US");
const formatNum = (n: number) => NF_US.format(Math.max(0, Math.floor(n || 0)));

/** Per-delete slack the service spends outside its own delay. */
const EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS = 10;

/** Chips beyond this collapse into a "+N more" pill. */
const MAX_VISIBLE_CHIPS = 4;

const CHIP_SPRITE_PX = 22;

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

export interface DeleterSelectionItem {
  id?: string;
  label?: string;
  qty?: number;
  /** Units of this entry that have to come out of storage first. */
  fromStorage?: number;
}

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
  /** Prefix of the service's progress events, e.g. `qws:seeddeleter`. */
  eventPrefix: string;
  /** Delay used to estimate the run duration. */
  estimateDelayMs: number;
  /** Delay handed to the delete call. */
  runDelayMs: number;
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  /** Name of the entry currently being deleted, read off the progress event. */
  progressTarget: (detail: any) => string;
  getSelection: () => DeleterSelectionItem[];
  clearSelection: () => void;
  openSelector: () => Promise<void>;
  runDelete: (delayMs: number) => Promise<unknown> | undefined;
  isRunning: () => boolean;
  isPaused: () => boolean;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

/** One headline figure with its caption underneath. */
function statTile(): { root: HTMLElement; set: (value: string, caption: string, tone?: string) => void } {
  const root = document.createElement("div");
  css(root, {
    flex: "1 1 0", minWidth: "0", display: "flex", flexDirection: "column",
    alignItems: "center", gap: "2px", padding: "8px 4px",
    borderRadius: "10px", background: CARD_BG, border: `1px solid ${BORDER}`,
  });

  const value = document.createElement("div");
  css(value, { fontSize: "19px", fontWeight: "700", color: TEXT, lineHeight: "1.1" });

  const caption = document.createElement("div");
  css(caption, {
    fontSize: "9.5px", color: TEXT_DIM, textTransform: "uppercase",
    letterSpacing: "0.06em", whiteSpace: "nowrap",
  });

  root.append(value, caption);
  return {
    root,
    set: (nextValue, nextCaption, tone) => {
      value.textContent = nextValue;
      caption.textContent = nextCaption;
      css(value, { color: tone ?? TEXT });
    },
  };
}

export function createDeleterSection(config: DeleterSectionConfig): { root: HTMLElement; cleanup: () => void } {
  // A real game sprite in the header rather than an emoji, so the card reads
  // like the thing it acts on. `collapsibleCard` builds its own title from a
  // string, so the whole header is handed over instead.
  const header = document.createElement("div");
  css(header, { display: "flex", alignItems: "center", gap: "8px", minWidth: "0" });

  const headerText = document.createElement("div");
  css(headerText, { display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" });
  headerText.append(sectionLabel(config.title));

  const headerDesc = document.createElement("div");
  css(headerDesc, { fontSize: "11px", color: TEXT_DIM, lineHeight: "1.45" });
  headerDesc.textContent = config.description;
  headerText.append(headerDesc);

  header.append(iconBox(config.headerSprite, 22, "misc"), headerText);

  const section = collapsibleCard({
    header,
    collapsed: config.collapsed,
    onToggle: config.onToggleCollapsed,
  });

  /* ----- Headline figures ----- */
  const stats = document.createElement("div");
  css(stats, { display: "flex", gap: "6px", marginBottom: "8px" });

  const statGroups = statTile();
  const statUnits = statTile();
  const statStorage = statTile();
  stats.append(statGroups.root, statUnits.root, statStorage.root);

  /* ----- Selected categories ----- */
  const chips = document.createElement("div");
  css(chips, { display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" });

  /* ----- Estimate ----- */
  const estimate = document.createElement("div");
  css(estimate, { fontSize: "11px", color: TEXT_DIM, marginBottom: "10px", minHeight: "14px" });

  /* ----- Progress (running only) ----- */
  const progressWrap = document.createElement("div");
  css(progressWrap, { display: "none", flexDirection: "column", gap: "6px", marginBottom: "10px" });

  const bar = meter();
  const progressLine = document.createElement("div");
  css(progressLine, { display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px", color: TEXT });

  const progressTargetEl = document.createElement("div");
  css(progressTargetEl, { flex: "1", minWidth: "0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });

  const progressCount = document.createElement("div");
  css(progressCount, { color: TEXT_DIM, flex: "0 0 auto" });

  progressLine.append(progressTargetEl, progressCount);
  progressWrap.append(bar.root, progressLine);

  /* ----- Actions ----- */
  const actions = document.createElement("div");
  css(actions, { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" });

  const btnSelect = button(config.selectLabel, "accent", () => runSelect());
  const btnClear = button(config.clearLabel, "neutral", () => {
    try { config.clearSelection(); } catch {}
    updateSummary();
  });
  const spacer = document.createElement("div");
  css(spacer, { flex: "1 1 auto" });

  const btnDelete = button("Start deleting", "danger", () => runDelete());
  const btnPause = button("Pause", "neutral", () => { config.pause(); updateControls(); });
  const btnPlay = button("Resume", "neutral", () => { config.resume(); updateControls(); });
  const btnStop = button("Stop", "danger", () => { config.cancel(); updateControls(); });

  actions.append(btnSelect, btnClear, spacer, btnDelete, btnPause, btnPlay, btnStop);

  section.body.append(stats, chips, estimate, progressWrap, actions);

  /* ----- Progress state ----- */
  const progress = { target: "-", done: 0, total: 0 };

  function buildChip(item: DeleterSelectionItem): HTMLElement {
    const chip = document.createElement("div");
    css(chip, {
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 8px 3px 4px", borderRadius: "999px",
      border: `1px solid ${BORDER}`, background: CARD_BG,
      fontSize: "11px", color: TEXT, maxWidth: "100%",
    });

    const icon = document.createElement("span");
    css(icon, {
      width: `${CHIP_SPRITE_PX}px`, height: `${CHIP_SPRITE_PX}px`, flex: "0 0 auto",
      display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "13px",
    });
    icon.textContent = config.fallbackIcon;
    if (item.id) attachSpriteIcon(icon, config.spriteCategories, [item.id], CHIP_SPRITE_PX, "deleter-chip");

    const name = document.createElement("span");
    css(name, { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "130px" });
    name.textContent = item.label ?? item.id ?? "?";

    const qty = document.createElement("span");
    css(qty, { color: TEAL, fontWeight: "600", flex: "0 0 auto" });
    qty.textContent = formatNum(item.qty ?? 0);

    chip.append(icon, name, qty);
    return chip;
  }

  function overflowChip(count: number): HTMLElement {
    const chip = document.createElement("div");
    css(chip, {
      display: "inline-flex", alignItems: "center", padding: "3px 10px",
      borderRadius: "999px", border: `1px dashed ${BORDER}`,
      fontSize: "11px", color: TEXT_DIM,
    });
    chip.textContent = `+${count} more`;
    return chip;
  }

  function readSelection() {
    const selection = config.getSelection() || [];
    let totalQty = 0;
    let fromStorage = 0;
    for (const item of selection) {
      totalQty += Math.max(0, Math.floor(item?.qty || 0));
      fromStorage += Math.max(0, Math.floor(item?.fromStorage || 0));
    }
    return { selection, groupCount: selection.length, totalQty, fromStorage };
  }

  /* ----- Summary + estimate ----- */
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

    statGroups.set(formatNum(groupCount), config.groupNoun);
    statUnits.set(formatNum(totalQty), config.unitNoun);
    statStorage.set(formatNum(fromStorage), "from storage", fromStorage > 0 ? WARN : TEXT);

    chips.innerHTML = "";
    if (groupCount === 0) {
      const empty = document.createElement("div");
      css(empty, { fontSize: "11px", color: TEXT_DIM });
      empty.textContent = `Nothing picked yet. Choose from your inventory and your ${config.storageLabel}.`;
      chips.append(empty);
    } else {
      const sorted = [...selection].sort((a, b) => (b.qty ?? 0) - (a.qty ?? 0));
      for (const item of sorted.slice(0, MAX_VISIBLE_CHIPS)) chips.append(buildChip(item));
      if (sorted.length > MAX_VISIBLE_CHIPS) chips.append(overflowChip(sorted.length - MAX_VISIBLE_CHIPS));
    }

    const running = config.isRunning();
    const estimateMs = totalQty * (config.estimateDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
    const finishTimestamp = running
      ? estimatedFinish
      : estimateMs > 0
        ? Date.now() + estimateMs
        : null;

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
    const running = config.isRunning();
    const paused = config.isPaused();

    css(progressWrap, { display: running ? "flex" : "none" });
    css(stats, { display: running ? "none" : "flex" });
    css(chips, { display: running ? "none" : "flex" });

    btnPause.hidden = !running || paused;
    btnPlay.hidden = !running || !paused;
    btnStop.hidden = !running;
    btnDelete.hidden = running;

    if (running) {
      const ratio = progress.total > 0 ? progress.done / progress.total : 0;
      bar.set(ratio, paused ? "warn" : "accent");
      progressTargetEl.textContent = paused
        ? `Paused · ${progress.target || "-"}`
        : progress.target || "-";
      progressCount.textContent = `${formatNum(progress.done)} / ${formatNum(progress.total)}`;
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
    const { totalQty } = readSelection();
    const estimateMs = totalQty * (config.estimateDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
    estimatedFinish = estimateMs > 0 ? Date.now() + estimateMs : null;
    clearSummaryTimer();
    const pending = config.runDelete(config.runDelayMs);
    updateControls();
    updateSummary();
    if (pending) await pending;
    estimatedFinish = null;
    updateControls();
    updateSummary();
  }

  /* ----- Service events ----- */
  const onProgress = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    progress.target = config.progressTarget(detail);
    progress.done = detail?.done ?? 0;
    progress.total = detail?.total ?? 0;
    updateControls();
  };
  const onComplete = () => {
    progress.target = "-";
    progress.done = 0;
    progress.total = 0;
    updateControls();
    updateSummary();
  };
  const onPauseState = () => updateControls();

  const listeners: Array<[string, EventListener]> = [
    [`${config.eventPrefix}:progress`, onProgress],
    [`${config.eventPrefix}:done`, onComplete],
    [`${config.eventPrefix}:error`, onComplete],
    [`${config.eventPrefix}:paused`, onPauseState],
    [`${config.eventPrefix}:resumed`, onPauseState],
  ];
  for (const [type, handler] of listeners) window.addEventListener(type, handler);

  updateSummary();
  updateControls();

  return {
    root: section.root,
    cleanup: () => {
      clearSummaryTimer();
      for (const [type, handler] of listeners) window.removeEventListener(type, handler);
    },
  };
}
