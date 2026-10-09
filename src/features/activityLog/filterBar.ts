// Puts the filter toolbar into the game's Pixi activity log modal and keeps it
// placed, every frame, while the modal is open. Nothing runs while it is closed.

import { shareGlobal, pageWindow } from "../../platform/pageContext";
import { Atoms } from "../../game/store/atoms";
import { getStage, findAcrossBranches, findGraphicsCtor } from "../../game/pixi/stageSearch";
import { getReadySpriteState } from "../../game/sprites/context";
import {
  ACTIVITY_LOG_MODAL_ID,
  ACTIVITY_LOG_MODAL_LABEL,
  activityLogTabOf,
  locateActivityLogAnchors,
  locateScrollParts,
  logsContentKind,
  maskTransformFor,
  planLogRowsShift,
  type ActivityLogTab,
} from "../../game/activityLogModalLayout";
import { isActivityLogModalOpen, setActivityLogModalOpen } from "./filter";
import {
  COLLAPSED_HEIGHT,
  buildFilterToolbar,
  refreshToolbarHighlight,
  setExpanded,
  type FilterToolbar,
} from "./filterToolbar";

const FIND_RETRY_MS = 1000;
const TOOLBAR_GAP_BELOW = 6;

const raf: (cb: (t: number) => void) => number = (pageWindow as any).requestAnimationFrame.bind(pageWindow);

/** Since v1396 the modal also hosts Stats; the filter only belongs on Logs. */
let activeTab: ActivityLogTab = "logs";

let modalNode: any = null;
let toolbar: FilterToolbar | null = null;
let findRafId: number | null = null;
let lastFindCheckAt = 0;

/** What we changed on the game's nodes, so it can be put back. */
let touchedScroll: { container: any; mask: any } | null = null;
/** Rows already moved. The game recreates them on every rebuild, so new ones show up unmarked. */
let shiftedRows = new WeakSet<object>();
/** First child of the content when we last planned, i.e. the current rebuild, and its shift. */
let plannedFirst: object | null = null;
let plannedShift = 0;

const syncDebug = {
  lastError: null as string | null,
  anchorsFound: false,
  toolbarBuilt: false,
  scrollPartsFound: false,
};

function safeWidth(node: any, fallback: number): number {
  try {
    const value = node?.width;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function restoreScroll(): void {
  if (!touchedScroll) return;
  const { container, mask } = touchedScroll;
  try {
    if (!container.destroyed) container.visible = true;
  } catch {}
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
  try {
    toolbar?.container.destroy({ children: true });
  } catch {}
  toolbar = null;
  shiftedRows = new WeakSet();
  plannedFirst = null;
  plannedShift = 0;
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

function buildToolbarInto(anchors: NonNullable<ReturnType<typeof locateActivityLogAnchors>>): FilterToolbar | null {
  const state = getReadySpriteState();
  if (!state?.ctors?.Text) return null;
  const graphicsCtor = findGraphicsCtor(getStage(state));
  if (!graphicsCtor) return null;
  // The list is centred in the card, so its width is the card's minus its
  // left inset on both sides.
  const maxWidth = safeWidth(anchors.backgroundSprite, 0) - 2 * (anchors.scrollViewContainer.position?.x ?? 0);
  if (maxWidth <= 0) return null;
  const built = buildFilterToolbar(
    { Graphics: graphicsCtor, Text: state.ctors.Text, Container: anchors.modalContainer.constructor },
    maxWidth,
  );
  anchors.modalContainer.addChild(built.container);
  syncDebug.toolbarBuilt = true;
  return built;
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
  if (!modalNode || modalNode.destroyed) {
    teardownToolbar();
    modalNode = null;
    return;
  }
  const anchors = locateActivityLogAnchors(modalNode);
  syncDebug.anchorsFound = !!anchors;
  if (!anchors) return;

  toolbar ??= buildToolbarInto(anchors);
  if (!toolbar) return;

  const scrollContainer = anchors.scrollViewContainer;
  const parts = locateScrollParts(scrollContainer);
  syncDebug.scrollPartsFound = !!parts;

  // What the content shows wins over the tab atom, which lags a rebuild by a
  // moment; the atom only decides when the content carries no row of either
  // tab (an empty log list).
  const kind = parts ? logsContentKind(parts.content.children) : "unknown";
  const onLogs = kind === "unknown" ? activeTab === "logs" : kind === "logs";
  toolbar.container.visible = onLogs;
  if (!onLogs && toolbar.isExpanded) setExpanded(toolbar, false);
  toolbar.container.position.set(scrollContainer.position.x, scrollContainer.position.y);
  refreshToolbarHighlight(toolbar);

  if (!onLogs || !parts) {
    restoreScroll();
    return;
  }

  touchedScroll = { container: scrollContainer, mask: parts.mask };
  scrollContainer.visible = !toolbar.isExpanded;

  // Always the collapsed height: the options panel hides the list rather than
  // pushing it, so the rows never have to move when it opens.
  const toolbarSpace = COLLAPSED_HEIGHT + TOOLBAR_GAP_BELOW;
  const maskHeight = parts.mask.getLocalBounds?.().height ?? 0;
  const transform = maskTransformFor(maskHeight, toolbarSpace);
  parts.mask.position.y = transform.y;
  parts.mask.scale.y = transform.scaleY;

  shiftLogRows(parts.content, toolbarSpace);
}

function syncToolbar(): void {
  try {
    syncToolbarUnsafe();
    syncDebug.lastError = null;
  } catch (error) {
    syncDebug.lastError = String((error as Error)?.message ?? error);
    console.warn("[activityLogFilter] syncToolbar failed", error);
  }
}

function tryFindModal(): void {
  if (!isActivityLogModalOpen() || modalNode) return;
  const state = getReadySpriteState();
  if (!state) return;
  const found = findAcrossBranches(getStage(state), (node: any) => node?.label === ACTIVITY_LOG_MODAL_LABEL);
  if (!found) return;
  modalNode = found;
  found.once("destroyed", () => {
    if (modalNode === found) {
      modalNode = null;
      teardownToolbar();
    }
  });
}

function onFrame(now: number): void {
  findRafId = null;
  const open = isActivityLogModalOpen();
  if (open && !modalNode && now - lastFindCheckAt >= FIND_RETRY_MS) {
    lastFindCheckAt = now;
    tryFindModal();
  }
  if (modalNode) syncToolbar();
  if (!open && modalNode) {
    // Closed without the node being destroyed: drop the toolbar and search
    // again the next time it opens.
    modalNode = null;
    teardownToolbar();
  }
  if (open || modalNode) findRafId = raf(onFrame);
}

/** Runs the frame loop while the modal is open; it stops itself once closed and cleaned up. */
function ensureFrameLoop(): void {
  if (findRafId == null && (isActivityLogModalOpen() || modalNode)) findRafId = raf(onFrame);
}

export function startActivityLogFilterPixi(): void {
  void (async () => {
    try {
      setActivityLogModalOpen((await Atoms.ui.activeModal.get()) === ACTIVITY_LOG_MODAL_ID);
    } catch {}
    try {
      await Atoms.ui.activeModal.onChange((next: string | null) => {
        setActivityLogModalOpen(next === ACTIVITY_LOG_MODAL_ID);
        ensureFrameLoop();
      });
    } catch {}
    try {
      activeTab = activityLogTabOf(await Atoms.ui.activityLogTab.get());
      await Atoms.ui.activityLogTab.onChange((next) => {
        activeTab = activityLogTabOf(next);
      });
    } catch {}
    ensureFrameLoop();
  })();
}

shareGlobal("__MG_ACTIVITY_LOG_TOOLBAR_DEBUG__", {
  get modalOpen() {
    return isActivityLogModalOpen();
  },
  get modalFound() {
    return !!modalNode;
  },
  get toolbarBuilt() {
    return syncDebug.toolbarBuilt;
  },
  get anchorsFound() {
    return syncDebug.anchorsFound;
  },
  get lastError() {
    return syncDebug.lastError;
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
    return syncDebug.scrollPartsFound;
  },
});
