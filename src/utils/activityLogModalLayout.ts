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
