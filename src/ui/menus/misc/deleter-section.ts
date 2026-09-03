// src/ui/menus/misc/deleter-section.ts
//
// The seed and decor bulk deleters differ only in labels, service calls and
// event names, so they share one section builder.

import { button, css, pill, setButtonEnabled } from "../panel-ui";
import { collapsibleCard, settingRow } from "../panel-layout";

const NF_US = new Intl.NumberFormat("en-US");
const formatNum = (n: number) => NF_US.format(Math.max(0, Math.floor(n || 0)));

/** Per-delete slack the service spends outside its own delay. */
const EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS = 10;

const formatDurationShort = (ms: number): string => {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  return `${Math.round(seconds)} s`;
};

const formatFinishTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const buildEstimateSentence = (count: number, delayMs: number, finishTimestamp: number | null): string => {
  if (count <= 0 || delayMs <= 0) return "";
  const durationMs = count * (delayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
  const durationText = formatDurationShort(durationMs);
  if (!finishTimestamp) return ` · Estimated time ${durationText}`;
  return ` · Estimated time ${durationText} (${formatFinishTime(finishTimestamp)})`;
};

export interface DeleterSelectionItem {
  qty?: number;
}

export interface DeleterSectionConfig {
  /** Emoji shown in the section header. */
  headerIcon: string;
  title: string;
  description: string;
  /** Atlas frame key for the summary row, e.g. `sprite/ui/SeedIcon`. */
  rowIcon: string;
  /** Plural noun for the group count, e.g. "species". */
  groupNoun: string;
  /** Plural noun for the unit count, e.g. "seeds". */
  unitNoun: string;
  selectLabel: string;
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

export function createDeleterSection(config: DeleterSectionConfig): { root: HTMLElement; cleanup: () => void } {
  const section = collapsibleCard({
    icon: config.headerIcon,
    title: config.title,
    description: config.description,
    collapsed: config.collapsed,
    onToggle: config.onToggleCollapsed,
  });

  /* ----- Selection summary ----- */
  const summary = pill(`0 ${config.groupNoun} · 0 ${config.unitNoun}`);
  const summaryRow = settingRow(
    "Selected",
    `Review the current selection before deleting.`,
    summary,
    { icon: config.rowIcon, iconTag: "misc" },
  );

  /* ----- Actions ----- */
  const actions = document.createElement("div");
  css(actions, { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" });

  const btnSelect = button(config.selectLabel, "accent", () => runSelect());
  const btnDelete = button("Delete", "danger", () => runDelete());
  const btnClear = button("Clear", "neutral", () => {
    try { config.clearSelection(); } catch {}
    updateSummary();
  });
  actions.append(btnSelect, btnDelete, btnClear);
  const actionsRow = settingRow("Actions", "Pick, clear, or delete the selection.", actions);

  /* ----- Run controls ----- */
  const status = pill("Idle");

  const controls = document.createElement("div");
  css(controls, { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" });

  const btnPause = button("Pause", "neutral", () => { config.pause(); updateControls(); });
  const btnPlay = button("Play", "neutral", () => { config.resume(); updateControls(); });
  const btnStop = button("Stop", "danger", () => { config.cancel(); updateControls(); });
  controls.append(btnPause, btnPlay, btnStop, status);

  const statusRow = settingRow("Status", "Pause or stop the current delete flow.", controls);

  /* ----- Progress state ----- */
  const progress = { target: "-", done: 0, total: 0 };

  const describeStatus = (): string => {
    if (!config.isRunning()) return "Idle";
    const base = `${progress.target || "-"} (${progress.done}/${progress.total})`;
    return config.isPaused() ? `Paused · ${base}` : base;
  };

  function updateControls(): void {
    const running = config.isRunning();
    const paused = config.isPaused();
    setButtonEnabled(btnPause, running && !paused);
    setButtonEnabled(btnPlay, running && paused);
    setButtonEnabled(btnStop, running);
    status.textContent = describeStatus();
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

  const readSelection = () => {
    const selection = config.getSelection() || [];
    let totalQty = 0;
    for (const item of selection) totalQty += Math.max(0, Math.floor(item?.qty || 0));
    return { groupCount: selection.length, totalQty };
  };

  function updateSummary(): void {
    const { groupCount, totalQty } = readSelection();
    const estimateMs = totalQty * (config.estimateDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
    const running = config.isRunning();
    const finishTimestamp = running
      ? estimatedFinish
      : estimateMs > 0
        ? Date.now() + estimateMs
        : null;
    const estimateText = buildEstimateSentence(totalQty, config.estimateDelayMs, finishTimestamp);
    summary.textContent =
      `${groupCount} ${config.groupNoun} · ${formatNum(totalQty)} ${config.unitNoun}${estimateText}`;

    const hasSelection = groupCount > 0 && totalQty > 0;
    setButtonEnabled(btnDelete, hasSelection);
    setButtonEnabled(btnClear, hasSelection);

    // The countdown is only meaningful while idle: once running, the finish
    // time is pinned and the progress events drive the UI instead.
    clearSummaryTimer();
    if (!running && totalQty > 0) {
      summaryTimer = window.setTimeout(() => updateSummary(), 1000);
    }
  }

  async function runSelect(): Promise<void> {
    await config.openSelector();
    updateSummary();
  }

  async function runDelete(): Promise<void> {
    const { totalQty } = readSelection();
    const estimateMs = totalQty * (config.estimateDelayMs + EXTRA_ESTIMATE_BUFFER_PER_DELETE_MS);
    estimatedFinish = estimateMs > 0 ? Date.now() + estimateMs : null;
    clearSummaryTimer();
    const pending = config.runDelete(config.runDelayMs);
    updateSummary();
    if (pending) await pending;
    estimatedFinish = null;
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

  updateControls();
  updateSummary();

  section.body.append(summaryRow.row, actionsRow.row, statusRow.row);

  return {
    root: section.root,
    cleanup: () => {
      clearSummaryTimer();
      for (const [type, handler] of listeners) window.removeEventListener(type, handler);
    },
  };
}
