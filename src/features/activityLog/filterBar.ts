// src/utils/activityLogFilterPixi.ts
// Restores the "filter activity log by action" mod feature under the game's
// Pixi-rendered Activity Log modal.
//
// Filtering happens at the data layer, not by touching individual Pixi rows:
// the modal reads its entries from `Atoms.data.myData.activityLogs` (the
// same atom `activityLogHistory.ts` already patches for the 500-entry
// history) and reactively rebuilds itself whenever that atom's value
// changes, including its own native "Show more" pagination. So filtering is
// just "patch that atom with a classified subset of the local history" —
// see docs/superpowers/specs/2026-07-30-activity-log-pixi-filter-design.md.
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { shareGlobal, pageWindow } from "../../platform/pageContext";
import {
  classifyEntryAction,
  getActionLabel,
  mergeActions,
  type ActionKey,
} from "./classification";
import { getActivityLogHistory, type ActivityLogEntry } from "./history";
import { fakeActivityLog } from "../../game/fakeModal";
import { Atoms } from "../../game/store/atoms";
import { getSpriteState, getStage, findAcrossBranches, findGraphicsCtor } from "../../game/pixi/gardenInfoCard";
import {
  ACTIVITY_LOG_MODAL_ID,
  ACTIVITY_LOG_MODAL_LABEL,
  FILTER_TOOLBAR_LABEL,
  activityLogTabOf,
  locateActivityLogAnchors,
  locateScrollParts,
  logsContentKind,
  maskTransformFor,
  planLogRowsShift,
  type ActivityLogTab,
} from "../../game/activityLogModalLayout";

const FILTER_STORAGE_KEY = "activityLog.filter";
const FIND_RETRY_MS = 1000;

const BUTTON_HEIGHT = 26;
const BUTTON_PADDING_X = 10;
const BUTTON_GAP = 6;
const TOOLBAR_GAP_BELOW = 6;
const BUTTON_FILL_INACTIVE = 0x7b5a38;
const BUTTON_FILL_ACTIVE = 0xe3a23d;
const BUTTON_ALPHA_INACTIVE = 0.55;
const BUTTON_ALPHA_ACTIVE = 0.95;
const BUTTON_TEXT_STYLE = { fontFamily: "Arial", fontSize: 12, fontWeight: "700", fill: "#FFFFFF" };
const BUTTON_RADIUS = 8;

const CLOSED_LABEL_PREFIX = "Filter: ";
const CARET_GAP = 8;
const CARET_CLOSED = "▾";
const CARET_OPEN = "▴";
const CARET_TEXT_STYLE = { fontFamily: "Arial", fontSize: 12, fontWeight: "700", fill: "#FFFFFF" };
const PANEL_GAP = 6;

const raf: (cb: (t: number) => void) => number = (pageWindow as any).requestAnimationFrame.bind(pageWindow);

let activeFilter: ActionKey = loadPersistedFilter();
let modalOpen = false;
/** Since v1396 the modal also hosts Stats; the filter only belongs on Logs. */
let activeTab: ActivityLogTab = "logs";

function loadPersistedFilter(): ActionKey {
  try {
    const stored = readAriesPath<string>(FILTER_STORAGE_KEY);
    return stored || "all";
  } catch {
    return "all";
  }
}

function persistFilter(filter: ActionKey): void {
  try {
    writeAriesPath(FILTER_STORAGE_KEY, String(filter));
  } catch {
  }
}

function getActiveFilter(): ActionKey {
  return activeFilter;
}

/** Full local history (up to 500 entries) narrowed to the given filter. "all" returns it unfiltered. */
function computeFilteredHistory(filter: ActionKey): ActivityLogEntry[] {
  const history = getActivityLogHistory();
  if (filter === "all") return history;
  return history.filter((entry) => classifyEntryAction(entry.action) === filter);
}

/** What activityLogHistory.ts's reopen flow should push: the persisted filter applied to the full history. */
export function getFilteredHistoryForReopen(): ActivityLogEntry[] {
  return computeFilteredHistory(activeFilter);
}

async function applyActiveFilter(): Promise<void> {
  if (!modalOpen) return;
  try {
    await fakeActivityLog.show(computeFilteredHistory(activeFilter), { open: false });
  } catch {
  }
}

function setActiveFilter(filter: ActionKey): void {
  if (filter === activeFilter) return;
  activeFilter = filter;
  debugState.activeFilter = filter;
  persistFilter(filter);
  void applyActiveFilter();
}

const debugState = {
  activeFilter,
  get modalOpen() {
    return modalOpen;
  },
  getActiveFilter,
  setActiveFilter,
  computeFilteredHistory,
};
shareGlobal("__MG_ACTIVITY_LOG_FILTER_DEBUG__", debugState);

interface ToolbarButton {
  container: any;
  bg: any;
  key: ActionKey;
}

interface ClosedButton {
  container: any;
  bg: any;
  text: any;
  caret: any;
}

interface ToolbarPanel {
  container: any;
  buttons: ToolbarButton[];
  height: number;
}

interface ToolbarState {
  container: any;
  closedButton: ClosedButton;
  panel: ToolbarPanel;
  counts: Map<ActionKey, number>;
  total: number;
  isExpanded: boolean;
  height: number;
}

function safeWidth(node: any, fallback: number): number {
  try {
    const value = node?.width;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function computeActionCounts(history: ActivityLogEntry[]): Map<ActionKey, number> {
  const counts = new Map<ActionKey, number>();
  for (const entry of history) {
    const key = classifyEntryAction(entry.action);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function countFor(key: ActionKey, counts: Map<ActionKey, number>, total: number): number {
  return key === "all" ? total : counts.get(key) ?? 0;
}

function closedButtonLabel(counts: Map<ActionKey, number>, total: number): string {
  const active = getActiveFilter();
  const count = countFor(active, counts, total);
  return `${CLOSED_LABEL_PREFIX}${getActionLabel(active)}${count ? ` (${count})` : ""}`;
}

function buildClosedButton(graphicsCtor: any, textCtor: any, containerCtor: any, counts: Map<ActionKey, number>, total: number): ClosedButton {
  const text = new textCtor({ text: closedButtonLabel(counts, total), style: BUTTON_TEXT_STYLE });
  const caret = new textCtor({ text: CARET_CLOSED, style: CARET_TEXT_STYLE });
  const bg = new graphicsCtor();

  const container = new containerCtor();
  container.addChild(bg);
  container.addChild(text);
  container.addChild(caret);
  container.eventMode = "static";
  container.cursor = "pointer";

  const closedButton: ClosedButton = { container, bg, text, caret };
  layoutClosedButton(closedButton);
  return closedButton;
}

/** Redraws the closed button's background/caret to fit its current text (called whenever the label changes). */
function layoutClosedButton(closedButton: ClosedButton): void {
  const width = closedButton.text.width + BUTTON_PADDING_X * 2 + CARET_GAP + closedButton.caret.width;
  closedButton.bg.clear();
  closedButton.bg
    .roundRect(0, 0, width, BUTTON_HEIGHT, BUTTON_RADIUS)
    .fill({ color: BUTTON_FILL_ACTIVE, alpha: BUTTON_ALPHA_ACTIVE });
  closedButton.text.position.set(BUTTON_PADDING_X, (BUTTON_HEIGHT - closedButton.text.height) / 2);
  closedButton.caret.position.set(width - BUTTON_PADDING_X - closedButton.caret.width, (BUTTON_HEIGHT - closedButton.caret.height) / 2);
}

function buildOptionsPanel(graphicsCtor: any, textCtor: any, containerCtor: any, maxWidth: number, counts: Map<ActionKey, number>, total: number): ToolbarPanel {
  const keys: ActionKey[] = ["all", ...mergeActions(Array.from(counts.keys()))];

  const panel = new containerCtor();
  const buttons: ToolbarButton[] = [];
  let x = 0;
  let y = 0;
  const active = getActiveFilter();

  for (const key of keys) {
    const count = countFor(key, counts, total);
    const label = `${getActionLabel(key)}${count ? ` (${count})` : ""}`;

    const text = new textCtor({ text: label, style: BUTTON_TEXT_STYLE });
    const width = text.width + BUTTON_PADDING_X * 2;

    // Wrap to a new row when this button would overflow the modal's
    // content width — never wrap the very first button on a row, or a
    // single button wider than maxWidth would loop forever.
    if (x > 0 && x + width > maxWidth) {
      x = 0;
      y += BUTTON_HEIGHT + BUTTON_GAP;
    }

    const bg = new graphicsCtor();
    bg.roundRect(0, 0, width, BUTTON_HEIGHT, BUTTON_RADIUS)
      .fill({ color: key === active ? BUTTON_FILL_ACTIVE : BUTTON_FILL_INACTIVE, alpha: key === active ? BUTTON_ALPHA_ACTIVE : BUTTON_ALPHA_INACTIVE });

    text.position.set(BUTTON_PADDING_X, (BUTTON_HEIGHT - text.height) / 2);

    const button = new containerCtor();
    button.addChild(bg);
    button.addChild(text);
    button.position.set(x, y);
    button.eventMode = "static";
    button.cursor = "pointer";

    panel.addChild(button);
    buttons.push({ container: button, bg, key });
    x += width + BUTTON_GAP;
  }

  return { container: panel, buttons, height: y + BUTTON_HEIGHT };
}

function collapsedHeight(): number {
  return BUTTON_HEIGHT;
}

function expandedHeight(panel: ToolbarPanel): number {
  return BUTTON_HEIGHT + PANEL_GAP + panel.height;
}

function setExpanded(toolbarState: ToolbarState, expanded: boolean): void {
  if (toolbarState.isExpanded === expanded) return;
  toolbarState.isExpanded = expanded;
  toolbarState.panel.container.visible = expanded;
  toolbarState.height = expanded ? expandedHeight(toolbarState.panel) : collapsedHeight();
  toolbarState.closedButton.caret.text = expanded ? CARET_OPEN : CARET_CLOSED;
}

function buildToolbar(graphicsCtor: any, textCtor: any, containerCtor: any, maxWidth: number): ToolbarState {
  const history = getActivityLogHistory();
  const counts = computeActionCounts(history);
  const total = history.length;

  const container = new containerCtor();
  container.label = FILTER_TOOLBAR_LABEL;

  const closedButton = buildClosedButton(graphicsCtor, textCtor, containerCtor, counts, total);
  container.addChild(closedButton.container);

  const panel = buildOptionsPanel(graphicsCtor, textCtor, containerCtor, maxWidth, counts, total);
  panel.container.position.set(0, BUTTON_HEIGHT + PANEL_GAP);
  panel.container.visible = false;
  container.addChild(panel.container);

  const toolbarState: ToolbarState = {
    container,
    closedButton,
    panel,
    counts,
    total,
    isExpanded: false,
    height: collapsedHeight(),
  };

  closedButton.container.on("pointertap", () => setExpanded(toolbarState, !toolbarState.isExpanded));
  for (const button of panel.buttons) {
    button.container.on("pointertap", () => {
      setActiveFilter(button.key);
      setExpanded(toolbarState, false);
    });
  }

  return toolbarState;
}

function refreshToolbarHighlight(toolbarState: ToolbarState): void {
  const active = getActiveFilter();
  for (const button of toolbarState.panel.buttons) {
    if (button.bg.destroyed) continue;
    const isActive = button.key === active;
    const bounds = button.bg.getLocalBounds();
    button.bg.clear();
    button.bg
      .roundRect(0, 0, bounds.width, BUTTON_HEIGHT, BUTTON_RADIUS)
      .fill({ color: isActive ? BUTTON_FILL_ACTIVE : BUTTON_FILL_INACTIVE, alpha: isActive ? BUTTON_ALPHA_ACTIVE : BUTTON_ALPHA_INACTIVE });
  }
  const label = closedButtonLabel(toolbarState.counts, toolbarState.total);
  if (toolbarState.closedButton.text.text !== label) {
    toolbarState.closedButton.text.text = label;
    layoutClosedButton(toolbarState.closedButton);
  }
}

let modalNode: any = null;
let toolbarState: ToolbarState | null = null;
let findRafId: number | null = null;
let lastFindCheckAt = 0;

/** What we changed on the game's nodes, so it can be put back. */
let touchedScroll: { container: any; mask: any } | null = null;
/** Rows already moved. The game recreates them on every rebuild, so new ones show up unmarked. */
let shiftedRows = new WeakSet<object>();
/** First child of the content when we last planned, i.e. the current rebuild, and its shift. */
let plannedFirst: object | null = null;
let plannedShift = 0;

const debugSyncState: { lastError: string | null; anchorsFound: boolean; toolbarBuilt: boolean; scrollPartsFound: boolean } = {
  lastError: null,
  anchorsFound: false,
  toolbarBuilt: false,
  scrollPartsFound: false,
};

function restoreScroll(): void {
  if (!touchedScroll) return;
  const { container, mask } = touchedScroll;
  try { if (!container.destroyed) container.visible = true; } catch {}
  try {
    if (mask && !mask.destroyed) {
      mask.position.y = 0;
      mask.scale.y = 1;
    }
  } catch {}
  touchedScroll = null;
}

function teardownToolbar(): void {
  restoreScroll();
  if (toolbarState) {
    try { toolbarState.container.destroy({ children: true }); } catch {}
  }
  toolbarState = null;
  shiftedRows = new WeakSet();
  plannedFirst = null;
  plannedShift = 0;
}

function syncToolbar(): void {
  try {
    syncToolbarUnsafe();
    debugSyncState.lastError = null;
  } catch (error) {
    debugSyncState.lastError = String((error as Error)?.message ?? error);
    console.warn("[activityLogFilterPixi] syncToolbar failed", error);
  }
}

/**
 * Hides the "Your most recent activity" note and moves this rebuild's rows so
 * the first one starts under the toolbar. Rows already moved are skipped, so
 * running it every frame is harmless.
 */
function shiftLogRows(content: any, toolbarSpace: number): void {
  const children: any[] = content.children;
  const first = children[0];
  if (!first) return;
  if (first !== plannedFirst) {
    const plan = planLogRowsShift(children, toolbarSpace);
    plannedFirst = first;
    plannedShift = plan.shift;
    if (plan.hideFirst) {
      first.visible = false;
      shiftedRows.add(first);
    }
  }
  for (const child of children) {
    if (shiftedRows.has(child)) continue;
    shiftedRows.add(child);
    child.position.y += plannedShift;
  }
}

// The toolbar sits where the list natively starts, just under the tab bar,
// over the space the game gives its "Your most recent activity" note, which is
// hidden. The scroll view itself is not moved: moving it carried its window
// past the bottom of the card. Instead its mask loses the toolbar's height at
// the top, so rows scrolling up vanish under the toolbar, and the rows are
// moved down by whatever the toolbar needs beyond the note's space.
//
// While the filter options are open, the list is hidden: the options can be
// taller than the room above the list, and drawing both overlaps them.
function syncToolbarUnsafe(): void {
  if (!modalNode || modalNode.destroyed) { teardownToolbar(); modalNode = null; return; }
  const anchors = locateActivityLogAnchors(modalNode);
  debugSyncState.anchorsFound = !!anchors;
  if (!anchors) return;

  if (!toolbarState) {
    const state = getSpriteState();
    if (!state?.ctors?.Text) return;
    const stage = getStage(state);
    const graphicsCtor = findGraphicsCtor(stage);
    if (!graphicsCtor) return;
    // The list is centred in the card, so its width is the card's minus its
    // left inset on both sides.
    const maxWidth = safeWidth(anchors.backgroundSprite, 0) - 2 * (anchors.scrollViewContainer.position?.x ?? 0);
    if (maxWidth <= 0) return;
    const containerCtor = anchors.modalContainer.constructor;
    toolbarState = buildToolbar(graphicsCtor, state.ctors.Text, containerCtor, maxWidth);
    anchors.modalContainer.addChild(toolbarState.container);
    debugSyncState.toolbarBuilt = true;
  }

  const scrollContainer = anchors.scrollViewContainer;
  const parts = locateScrollParts(scrollContainer);
  debugSyncState.scrollPartsFound = !!parts;

  // What the content shows wins over the tab atom, which lags a rebuild by a
  // moment; the atom only decides when the content carries no row of either
  // tab (an empty log list).
  const kind = parts ? logsContentKind(parts.content.children) : "unknown";
  const onLogs = kind === "unknown" ? activeTab === "logs" : kind === "logs";
  toolbarState.container.visible = onLogs;
  if (!onLogs && toolbarState.isExpanded) setExpanded(toolbarState, false);
  toolbarState.container.position.set(scrollContainer.position.x, scrollContainer.position.y);
  refreshToolbarHighlight(toolbarState);

  if (!onLogs || !parts) {
    restoreScroll();
    return;
  }

  touchedScroll = { container: scrollContainer, mask: parts.mask };
  scrollContainer.visible = !toolbarState.isExpanded;

  // Always the collapsed height: the options panel hides the list rather than
  // pushing it, so the rows never have to move when it opens.
  const toolbarSpace = collapsedHeight() + TOOLBAR_GAP_BELOW;
  const maskHeight = parts.mask.getLocalBounds?.().height ?? 0;
  const transform = maskTransformFor(maskHeight, toolbarSpace);
  parts.mask.position.y = transform.y;
  parts.mask.scale.y = transform.scaleY;

  shiftLogRows(parts.content, toolbarSpace);
}

function tryFindModal(): void {
  if (!modalOpen || modalNode) return;
  const state = getSpriteState();
  if (!state) return;
  const stage = getStage(state);
  const found = findAcrossBranches(stage, (node: any) => node?.label === ACTIVITY_LOG_MODAL_LABEL);
  if (!found) return;
  modalNode = found;
  found.once("destroyed", () => {
    if (modalNode === found) {
      modalNode = null;
      teardownToolbar();
    }
  });
}

function scheduleFind(now: number): void {
  findRafId = null;
  if (modalOpen && !modalNode && now - lastFindCheckAt >= FIND_RETRY_MS) {
    lastFindCheckAt = now;
    tryFindModal();
  }
  if (modalNode) syncToolbar();
  if (!modalOpen && modalNode) {
    // Modal closed without the underlying node being destroyed — drop our
    // toolbar and go back to searching next time it opens.
    modalNode = null;
    teardownToolbar();
  }
  findRafId = raf(scheduleFind);
}

export function startActivityLogFilterPixi(): void {
  void (async () => {
    try {
      const current = await Atoms.ui.activeModal.get();
      modalOpen = current === ACTIVITY_LOG_MODAL_ID;
    } catch {
    }
    try {
      await Atoms.ui.activeModal.onChange((next: string | null) => {
        modalOpen = next === ACTIVITY_LOG_MODAL_ID;
      });
    } catch {
    }
    try {
      activeTab = activityLogTabOf(await Atoms.ui.activityLogTab.get());
      await Atoms.ui.activityLogTab.onChange((next) => {
        activeTab = activityLogTabOf(next);
      });
    } catch {
    }
    if (findRafId == null) findRafId = raf(scheduleFind);
  })();
}

shareGlobal("__MG_ACTIVITY_LOG_TOOLBAR_DEBUG__", {
  get modalOpen() {
    return modalOpen;
  },
  get modalFound() {
    return !!modalNode;
  },
  get toolbarBuilt() {
    return debugSyncState.toolbarBuilt;
  },
  get anchorsFound() {
    return debugSyncState.anchorsFound;
  },
  get lastError() {
    return debugSyncState.lastError;
  },
  get modalNode() {
    return modalNode;
  },
  get anchors() {
    return modalNode ? locateActivityLogAnchors(modalNode) : null;
  },
  get activeTab() {
    return activeTab;
  },
  get scrollPartsFound() {
    return debugSyncState.scrollPartsFound;
  },
});
