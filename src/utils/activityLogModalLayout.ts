// src/utils/activityLogModalLayout.ts
//
// Since v1396 the game's Stats and Activity Log modals are one: the
// `activityLog` modal with a Logs tab and a Stats tab, picked by
// `activityLogTabAtom`. The standalone `stats` modal no longer exists, so
// opening it does nothing, and the title and divider the filter toolbar used
// to anchor on are gone.
//
// Kept free of Pixi and atoms so the node checks can load it.

export const ACTIVITY_LOG_MODAL_ID = "activityLog";
export const ACTIVITY_LOG_MODAL_LABEL = "ActivityLogModal";
/** Our own toolbar, labelled so the anchor search never mistakes it for the game's. */
export const FILTER_TOOLBAR_LABEL = "AriesActivityLogFilter";

export type ActivityLogTab = "logs" | "stats";

/** The tab bar's art and its tap targets, both added straight to the modal container. */
const TAB_BAR_LABELS = new Set(["JournalTabs", "JournalTabTaps"]);

export interface ActivityLogAnchors {
  modalContainer: any;
  backgroundSprite: any;
  scrollViewContainer: any;
}

/**
 * Finds where the filter toolbar goes inside the `ActivityLogModal` node.
 *
 * The node holds `[modalContainer, closeButton.view]`, and since v1396
 * modalContainer holds `[backgroundSprite, tabBar.tapContainer,
 * scrollView.container, tabBar.container]`. The tab bar is found by its labels
 * and the background by being first, so the scroll view is whatever is left.
 * That survives the game reordering its children, which the old index based
 * lookup did not.
 */
export function locateActivityLogAnchors(modalNode: any): ActivityLogAnchors | null {
  const modalContainer = modalNode?.children?.[0];
  if (!modalContainer || modalContainer.destroyed) return null;
  const children = modalContainer.children;
  if (!Array.isArray(children) || children.length < 3) return null;

  const backgroundSprite = children[0];
  if (!children.some((child: any) => TAB_BAR_LABELS.has(child?.label))) return null;

  const scrollViewContainer = children.find(
    (child: any, index: number) =>
      index > 0 && child && !TAB_BAR_LABELS.has(child.label) && child.label !== FILTER_TOOLBAR_LABEL,
  );
  if (!backgroundSprite || !scrollViewContainer) return null;
  return { modalContainer, backgroundSprite, scrollViewContainer };
}

/**
 * What to write to show a tab: the tab first, then the modal, the order the
 * game uses. Stats included, since its own modal is gone.
 */
export function activityLogOpenTarget(tab: ActivityLogTab): { modal: string; tab: ActivityLogTab } {
  return { modal: ACTIVITY_LOG_MODAL_ID, tab };
}

/** The tab the modal is on, from the raw `activityLogTabAtom` value. Defaults to logs, as the game does. */
export function activityLogTabOf(value: unknown): ActivityLogTab {
  return value === "stats" ? "stats" : "logs";
}

export interface ScrollParts {
  /** The Graphics clipping the list; `viewport.mask`. */
  mask: any;
  /** What the game fills with rows on every rebuild. */
  content: any;
}

/**
 * The inside of the game's `ScrollableView`: `container` holds
 * `[viewportMask, viewport]` and `viewport` holds `content`. The viewport is
 * found as the child carrying a mask rather than by index.
 */
export function locateScrollParts(scrollViewContainer: any): ScrollParts | null {
  const children = scrollViewContainer?.children;
  if (!Array.isArray(children)) return null;
  const viewport = children.find((child: any) => child?.mask && Array.isArray(child.children));
  const content = viewport?.children?.[0];
  if (!viewport || !content || !Array.isArray(content.children)) return null;
  return { mask: viewport.mask, content };
}

/**
 * How far to move the rows of one rebuild, and whether its first child is the
 * "Your most recent activity" note.
 *
 * The note is always the first thing the Logs tab adds, and the only text
 * placed directly in the content. It is hidden and its space handed to the
 * toolbar: rows move by the toolbar's space minus the note's. If the note is
 * not there (a game change), the rows simply move down by the toolbar's space.
 */
export function planLogRowsShift(contentChildren: any[], toolbarSpace: number): { hideFirst: boolean; shift: number } {
  const first = contentChildren[0];
  const isNote = !!first && typeof first.text === "string" && !(first.children?.length > 0);
  if (!isNote) return { hideFirst: false, shift: toolbarSpace };
  const next = contentChildren[1];
  const firstY = first.position?.y ?? first.y ?? 0;
  const noteSpace = next ? (next.position?.y ?? next.y ?? firstY) - firstY : (first.height ?? 0);
  return { hideFirst: true, shift: toolbarSpace - noteSpace };
}

/**
 * The mask, shortened from the top by the toolbar's space so rows scrolling
 * up vanish under the toolbar instead of showing through it. Expressed on the
 * mask node, not its geometry: the game redraws the geometry on every resize.
 */
export function maskTransformFor(maskGeometryHeight: number, toolbarSpace: number): { y: number; scaleY: number } {
  if (!(maskGeometryHeight > toolbarSpace) || toolbarSpace <= 0) return { y: 0, scaleY: 1 };
  return { y: toolbarSpace, scaleY: (maskGeometryHeight - toolbarSpace) / maskGeometryHeight };
}
