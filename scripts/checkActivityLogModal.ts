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

import { checkEqual, done } from "./_check";
import {
  FILTER_TOOLBAR_LABEL,
  activityLogOpenTarget,
  activityLogTabOf,
  locateActivityLogAnchors,
  locateScrollParts,
  logsContentKind,
  maskTransformFor,
  planLogRowsShift,
} from "../src/game/activityLogModalLayout";

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
  checkEqual("v1396 layout: anchors are found", anchors !== null, true);
  checkEqual("v1396 layout: the scroll view is the scroll view", anchors?.scrollViewContainer === scroll, true);
  checkEqual("v1396 layout: the background is the background", anchors?.backgroundSprite === background, true);
}

{
  // Once our toolbar is added it sits last in the container: it must never be
  // taken for the scroll view on the next frame.
  const { modal, scroll } = v1396Modal();
  modal.children[0].children.splice(1, 0, node(FILTER_TOOLBAR_LABEL));
  checkEqual("our own toolbar is not taken for the scroll view", locateActivityLogAnchors(modal)?.scrollViewContainer === scroll, true);
}

{
  // The pre-1396 lookup, kept here to show why the toolbar stopped drawing.
  const oldLocate = (modalNode: any) => {
    const children = modalNode?.children?.[0]?.children;
    if (!Array.isArray(children) || children.length < 5) return null;
    return children[1] && children[3] && children[4] ? {} : null;
  };
  checkEqual("the old index lookup finds nothing in v1396", oldLocate(v1396Modal().modal), null);
}

checkEqual("a node without the tab bar is not the merged modal", locateActivityLogAnchors(node("X", [node("", [node("a"), node("b"), node("c")])])), null);
checkEqual("a destroyed modal yields nothing", locateActivityLogAnchors({ children: [{ destroyed: true, children: [] }] }), null);

{
  // ScrollableView in v1396: container [viewportMask, viewport], viewport [content].
  const mask = { label: "mask" };
  const content = node("content");
  const viewport = { label: "", mask, children: [content] };
  const scroll = node("ScrollableView", [{ label: "", children: [] }, viewport]);
  const parts = locateScrollParts(scroll);
  checkEqual("the list content is found inside the scroll view", parts?.content === content, true);
  checkEqual("the list mask is found inside the scroll view", parts?.mask === mask, true);
  checkEqual("a scroll view without a masked viewport yields nothing", locateScrollParts(node("x", [node("a")])), null);
}

{
  // Logs tab: the note sits at topPadding, the first row starts noteSpace below it.
  const note = { text: "Your most recent activity. The last 25 logs are saved.", children: [], position: { y: 12 }, height: 14 };
  const row = { children: [{}], position: { y: 46 } };
  checkEqual("the note is hidden and its 34px go to a 32px toolbar", planLogRowsShift([note, row], 32), { hideFirst: true, shift: -2 });
  checkEqual("a taller toolbar pushes the rows by the difference", planLogRowsShift([note, row], 40), { hideFirst: true, shift: 6 });
  // The real note: the game's rich text component, a Container wrapping a Pixi
  // Text in `textComponent`, with no `text` of its own.
  const textComponent = { text: "Your most recent activity. The last 25 logs are saved.", children: [] };
  const richNote = { textComponent, children: [textComponent], textWidth: 300, textHeight: 14, position: { y: 12 } };
  checkEqual("the game's rich text note is recognised and hidden", planLogRowsShift([richNote, row], 32), { hideFirst: true, shift: -2 });
  const logRow = { label: "ActivityLogRow", children: [{}], position: { y: 46 } };
  checkEqual("without the note, log rows move down by the whole toolbar", planLogRowsShift([logRow], 32), { hideFirst: false, shift: 32 });
  // The Stats tab shares the content, and the hub hears about a tab switch a
  // little after the game has rebuilt it, so the content must say which tab it
  // belongs to. Stats opens with a group heading written with the same rich
  // text component as the note, then StatCards.
  const heading = { textComponent: { text: "Garden" }, children: [{}], position: { y: 12 } };
  const statCard = { label: "StatCard", children: [{}], position: { y: 40 } };
  checkEqual("log rows mean the Logs tab", logsContentKind([richNote, logRow]), "logs");
  checkEqual("stat cards mean the Stats tab, even under a rich text heading", logsContentKind([heading, statCard]), "stats");
  checkEqual("an empty log list cannot tell", logsContentKind([richNote, { children: [] }]), "unknown");
  checkEqual("an empty content cannot tell", logsContentKind([]), "unknown");
}

checkEqual("the mask loses the toolbar's space at its top", maskTransformFor(400, 32), { y: 32, scaleY: 368 / 400 });
checkEqual("no toolbar, the mask is left alone", maskTransformFor(400, 0), { y: 0, scaleY: 1 });
checkEqual("a mask not yet sized is left alone", maskTransformFor(0, 32), { y: 0, scaleY: 1 });

checkEqual("stats opens the activityLog modal on its Stats tab", activityLogOpenTarget("stats"), { modal: "activityLog", tab: "stats" });
checkEqual("logs opens the activityLog modal on its Logs tab", activityLogOpenTarget("logs"), { modal: "activityLog", tab: "logs" });
checkEqual("the tab defaults to logs", activityLogTabOf(undefined), "logs");
checkEqual("the stats tab reads as stats", activityLogTabOf("stats"), "stats");

done();
