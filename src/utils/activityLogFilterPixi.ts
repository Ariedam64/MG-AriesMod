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
import { readAriesPath, writeAriesPath } from "./localStorage";
import { shareGlobal, pageWindow } from "./page-context";
import {
  classifyEntryAction,
  getActionLabel,
  mergeActions,
  type ActionKey,
} from "./activityLogClassification";
import { getActivityLogHistory, type ActivityLogEntry } from "../services/activityLogHistory";
import { fakeActivityLogShow } from "../services/fakeModal";
import { Atoms } from "../store/atoms";
import { getSpriteState, getStage, findAcrossBranches, findGraphicsCtor } from "./gardenInfoCardPixi";

const FILTER_STORAGE_KEY = "activityLog.filter";
const ACTIVITY_LOG_MODAL_ID = "activityLog";
const ACTIVITY_LOG_MODAL_LABEL = "ActivityLogModal";
const FIND_RETRY_MS = 1000;

const BUTTON_HEIGHT = 26;
const BUTTON_PADDING_X = 10;
const BUTTON_GAP = 6;
const TOOLBAR_GAP_ABOVE = 4;
const TOOLBAR_GAP_BELOW = 6;
const BUTTON_FILL_INACTIVE = 0x7b5a38;
const BUTTON_FILL_ACTIVE = 0xe3a23d;
const BUTTON_ALPHA_INACTIVE = 0.55;
const BUTTON_ALPHA_ACTIVE = 0.95;
const BUTTON_TEXT_STYLE = { fontFamily: "Arial", fontSize: 12, fontWeight: "700", fill: "#FFFFFF" };
const BUTTON_RADIUS = 8;

const raf: (cb: (t: number) => void) => number = (pageWindow as any).requestAnimationFrame.bind(pageWindow);

let activeFilter: ActionKey = loadPersistedFilter();
let modalOpen = false;

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

export function getActiveFilter(): ActionKey {
  return activeFilter;
}

/** Full local history (up to 500 entries) narrowed to the given filter. "all" returns it unfiltered. */
export function computeFilteredHistory(filter: ActionKey): ActivityLogEntry[] {
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
    await fakeActivityLogShow(computeFilteredHistory(activeFilter), { open: false });
  } catch {
  }
}

export function setActiveFilter(filter: ActionKey): void {
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

interface ModalAnchors {
  modalContainer: any;
  title: any;
  divider: any;
  scrollViewContainer: any;
}

// Confirmed via a live console check against the running game: `this.container`
// (found by label) always has [modalContainer, closeButton.view] as its own two
// children (set by the base modal class), and modalContainer always has
// [backgroundSprite, title, infoTooltip.container, divider,
// scrollView.container] in that order (set by the ActivityLogModal subclass's
// constructor). If a future game build changes this order, this is the one
// place to update.
function locateModalAnchors(modalNode: any): ModalAnchors | null {
  const modalContainer = modalNode?.children?.[0];
  if (!modalContainer || modalContainer.destroyed) return null;
  const children = modalContainer.children;
  if (!Array.isArray(children) || children.length < 5) return null;
  const title = children[1];
  const divider = children[3];
  const scrollViewContainer = children[4];
  if (!title || !divider || !scrollViewContainer) return null;
  return { modalContainer, title, divider, scrollViewContainer };
}

interface ToolbarButton {
  container: any;
  bg: any;
  key: ActionKey;
}

interface ToolbarState {
  container: any;
  buttons: ToolbarButton[];
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

function safeHeight(node: any, fallback: number): number {
  try {
    const value = node?.height;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function buildToolbar(graphicsCtor: any, textCtor: any, containerCtor: any, maxWidth: number): ToolbarState {
  const history = getActivityLogHistory();
  const counts = new Map<ActionKey, number>();
  for (const entry of history) {
    const key = classifyEntryAction(entry.action);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys: ActionKey[] = ["all", ...mergeActions(Array.from(counts.keys()))];

  const toolbar = new containerCtor();
  const buttons: ToolbarButton[] = [];
  let x = 0;
  let y = 0;
  const active = getActiveFilter();

  for (const key of keys) {
    const count = key === "all" ? history.length : counts.get(key) ?? 0;
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
    button.on("pointertap", () => setActiveFilter(key));

    toolbar.addChild(button);
    buttons.push({ container: button, bg, key });
    x += width + BUTTON_GAP;
  }

  return { container: toolbar, buttons, height: y + BUTTON_HEIGHT };
}

function refreshToolbarHighlight(toolbarState: ToolbarState): void {
  const active = getActiveFilter();
  for (const button of toolbarState.buttons) {
    if (button.bg.destroyed) continue;
    const isActive = button.key === active;
    const bounds = button.bg.getLocalBounds();
    button.bg.clear();
    button.bg
      .roundRect(0, 0, bounds.width, BUTTON_HEIGHT, BUTTON_RADIUS)
      .fill({ color: isActive ? BUTTON_FILL_ACTIVE : BUTTON_FILL_INACTIVE, alpha: isActive ? BUTTON_ALPHA_ACTIVE : BUTTON_ALPHA_INACTIVE });
  }
}

let modalNode: any = null;
let toolbarState: ToolbarState | null = null;
let appliedOffset = 0;
let lastNativeDividerY = 0;
let findRafId: number | null = null;
let lastFindCheckAt = 0;

let ownScrollMask: any = null;
let nativeScrollHeight = 0;

function teardownToolbar(): void {
  if (toolbarState) {
    try { toolbarState.container.destroy({ children: true }); } catch {}
  }
  if (ownScrollMask) {
    try {
      if (ownScrollMask.parent) ownScrollMask.parent.mask = null;
      ownScrollMask.destroy();
    } catch {}
  }
  toolbarState = null;
  ownScrollMask = null;
  nativeScrollHeight = 0;
  appliedOffset = 0;
  lastNativeDividerY = 0;
}

const debugSyncState: { lastError: string | null; anchorsFound: boolean; toolbarBuilt: boolean } = {
  lastError: null,
  anchorsFound: false,
  toolbarBuilt: false,
};

// Pushing the scroll view down to make room for the toolbar would otherwise
// let its content overflow past the modal's own bottom edge, since only its
// position moved, not whatever clips its visible window (which may not even
// be a plain Pixi `.mask` we can find and shrink — this custom scroll view
// could clip via an internal scissor rect recalculated only on its own
// `resize()`, which we have no handle on). Rather than depend on guessing
// that internal mechanism, install our own rectangular mask as a child of
// the scroll view container (so it moves automatically when we reposition
// the container) sized to keep the *bottom* edge exactly where the game's
// native layout originally put it, taking full ownership of clipping while
// the toolbar is attached.
function applyScrollViewClip(scrollViewContainer: any, width: number, height: number, graphicsCtor: any): void {
  if (!ownScrollMask || ownScrollMask.destroyed || ownScrollMask.parent !== scrollViewContainer) {
    ownScrollMask = new graphicsCtor();
    scrollViewContainer.addChild(ownScrollMask);
  }
  scrollViewContainer.mask = ownScrollMask;
  ownScrollMask.clear();
  ownScrollMask.rect(0, 0, Math.max(0, width), Math.max(0, height)).fill({ color: 0xffffff });
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

function syncToolbarUnsafe(): void {
  if (!modalNode || modalNode.destroyed) { teardownToolbar(); modalNode = null; return; }
  const anchors = locateModalAnchors(modalNode);
  debugSyncState.anchorsFound = !!anchors;
  if (!anchors) return;

  if (!toolbarState) {
    const state = getSpriteState();
    if (!state?.ctors?.Text) return;
    const stage = getStage(state);
    const graphicsCtor = findGraphicsCtor(stage);
    if (!graphicsCtor) return;
    const maxWidth = safeWidth(anchors.divider, 0);
    if (maxWidth <= 0) return;
    const containerCtor = anchors.modalContainer.constructor;
    toolbarState = buildToolbar(graphicsCtor, state.ctors.Text, containerCtor, maxWidth);
    anchors.modalContainer.addChild(toolbarState.container);
    nativeScrollHeight = safeHeight(anchors.scrollViewContainer, 0);
    debugSyncState.toolbarBuilt = true;
  }

  const currentDividerY = anchors.divider.position.y;
  if (Math.abs(currentDividerY - (lastNativeDividerY + appliedOffset)) > 0.5) {
    lastNativeDividerY = currentDividerY;
    appliedOffset = 0;
  }

  const toolbarTopY = anchors.title.position.y + anchors.title.textHeight + TOOLBAR_GAP_ABOVE;
  const desiredOffset = Math.max(0, toolbarTopY + toolbarState.height + TOOLBAR_GAP_BELOW - lastNativeDividerY);
  if (desiredOffset !== appliedOffset) {
    anchors.divider.position.y = lastNativeDividerY + desiredOffset;
    anchors.scrollViewContainer.position.y += desiredOffset - appliedOffset;
    appliedOffset = desiredOffset;
    if (nativeScrollHeight > 0) {
      const state = getSpriteState();
      const stage = state ? getStage(state) : null;
      const graphicsCtor = stage ? findGraphicsCtor(stage) : null;
      if (graphicsCtor) {
        const clipWidth = safeWidth(anchors.scrollViewContainer, safeWidth(anchors.divider, 0));
        applyScrollViewClip(anchors.scrollViewContainer, clipWidth, nativeScrollHeight - appliedOffset, graphicsCtor);
      }
    }
  }
  toolbarState.container.position.set(anchors.divider.position.x, toolbarTopY);
  refreshToolbarHighlight(toolbarState);
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
    return modalNode ? locateModalAnchors(modalNode) : null;
  },
  get nativeScrollHeight() {
    return nativeScrollHeight;
  },
  get appliedOffset() {
    return appliedOffset;
  },
});
