// scripts/checkActivityLogModal.ts
//
// Since v1396 Stats and Activity Log are one modal, `activityLog`, with a Logs
// and a Stats tab picked by `activityLogTabAtom`. The filter toolbar looked for
// a title and a divider at fixed child indexes, found neither, and never drew.
// Opening another player's stats targeted the `stats` modal, which is gone.
//
// The trees below copy the child layout of the v1396 constructor:
// modalContainer gets backgroundSprite, tabBar.tapContainer,
// scrollView.container, tabBar.container, in that order.
//
// Run with: npm run check:activitylogmodal

import {
  FILTER_TOOLBAR_LABEL,
  activityLogOpenTarget,
  activityLogTabOf,
  locateActivityLogAnchors,
} from "../src/utils/activityLogModalLayout";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
}

const node = (label: string, children: any[] = []) => ({ label, children, destroyed: false });

function v1396Modal(extra: any[] = []) {
  const background = node("ActivityLogBackground");
  const taps = node("JournalTabTaps");
  const scroll = node("ScrollViewContainer");
  const tabs = node("JournalTabs");
  const modalContainer = node("", [background, taps, scroll, tabs, ...extra]);
  return { modal: node("ActivityLogModal", [modalContainer, node("CloseButton")]), background, scroll };
}

{
  const { modal, background, scroll } = v1396Modal();
  const anchors = locateActivityLogAnchors(modal);
  check("v1396 layout: anchors are found", anchors !== null, true);
  check("v1396 layout: the scroll view is the scroll view", anchors?.scrollViewContainer === scroll, true);
  check("v1396 layout: the background is the background", anchors?.backgroundSprite === background, true);
}

{
  // Once our toolbar is added it sits last in the container: it must never be
  // taken for the scroll view on the next frame.
  const { modal, scroll } = v1396Modal();
  modal.children[0].children.splice(1, 0, node(FILTER_TOOLBAR_LABEL));
  check("our own toolbar is not taken for the scroll view", locateActivityLogAnchors(modal)?.scrollViewContainer === scroll, true);
}

{
  // The pre-1396 lookup, kept here to show why the toolbar stopped drawing.
  const oldLocate = (modalNode: any) => {
    const children = modalNode?.children?.[0]?.children;
    if (!Array.isArray(children) || children.length < 5) return null;
    return children[1] && children[3] && children[4] ? {} : null;
  };
  check("the old index lookup finds nothing in v1396", oldLocate(v1396Modal().modal), null);
}

check("a node without the tab bar is not the merged modal", locateActivityLogAnchors(node("X", [node("", [node("a"), node("b"), node("c")])])), null);
check("a destroyed modal yields nothing", locateActivityLogAnchors({ children: [{ destroyed: true, children: [] }] }), null);

check("stats opens the activityLog modal on its Stats tab", activityLogOpenTarget("stats"), { modal: "activityLog", tab: "stats" });
check("logs opens the activityLog modal on its Logs tab", activityLogOpenTarget("logs"), { modal: "activityLog", tab: "logs" });
check("the tab defaults to logs", activityLogTabOf(undefined), "logs");
check("the stats tab reads as stats", activityLogTabOf("stats"), "stats");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall activity log modal checks passed");
