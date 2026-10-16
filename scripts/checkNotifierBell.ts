// Where the notification bell sits on the game's RightSideRail, and where its
// panel opens.
//
// Players kept reporting a bell that was misplaced, half off screen, or huge
// enough to cover half of it. The bell took its size from `rail.width`, the
// bounds of everything inside the rail: in the game every icon's hover tooltip
// and the chat preview bubble live inside it, so one hovered icon or one
// unread message blew the bell up. It also read the slot spacing from icons
// the game had hidden (they keep their old position), always used the first
// column, and ignored the rail fading out under game modals.
//
// The fakes below are built the way build 1597 lays the rail out.
//
// Run with: npm run check:notifierbell

import { checkEqual, done } from "./_check";
import { computeRailSlot, isShownOnStage } from "../src/features/notifier/bell/railSlot";
import { panelPositionBeside } from "../src/features/notifier/bell/panelPlacement";

interface FakeNode {
  label?: string;
  x?: number;
  y?: number;
  visible?: boolean;
  alpha?: number;
  pivot?: { x: number; y: number };
  width?: number;
  parent?: FakeNode;
  children: FakeNode[];
}

function node(props: Omit<FakeNode, "children">, children: FakeNode[] = []): FakeNode {
  const n: FakeNode = { visible: true, alpha: 1, x: 0, y: 0, ...props, children };
  for (const child of children) child.parent = n;
  return n;
}

// The rail's icons, in the game's order (`entries` of the rail system).
const ORDER = ["weather", "friend", "activity", "camera", "chat", "devLauncher", "quests"] as const;
type IconId = (typeof ORDER)[number];
// The game's gap between two icons.
const GAP = 4;

/** The game's grid: index `i` of `n` visible icons, one column or two. */
function gameCell(i: number, n: number, size: number, twoColumns: boolean): { x: number; y: number } {
  const columns = n > 0 ? Math.min(twoColumns ? 2 : 1, n) : 0;
  const column = columns <= 1 ? 0 : columns - 1 - (i % columns);
  const row = columns <= 1 ? i : Math.floor(i / columns);
  return { x: column * (size + GAP), y: row * (size + GAP) };
}

function layout(visible: IconId[], size: number, twoColumns: boolean): Map<IconId, { x: number; y: number }> {
  const shown = ORDER.filter((id) => visible.includes(id));
  return new Map(shown.map((id, i) => [id, gameCell(i, shown.length, size, twoColumns)]));
}

/**
 * One icon as the game nests it: the tooltip wrapper the rail positions,
 * holding the button and its `ContentButtonFace`, and the `TooltipPopup`
 * that opens on hover. The popup's content can hold faces of its own.
 */
function icon(id: IconId, pos: { x: number; y: number }, size: number, visible: boolean, tooltipOpen: boolean): FakeNode {
  const face = node({ label: "ContentButtonFace", pivot: { x: size / 2, y: size / 2 } });
  const decorations: FakeNode[] = [];
  if (id === "chat") decorations.push(node({ label: "RightSideRailChatBadge", x: -10, y: -4, visible: false }));
  const button = node({ label: "" }, [face, ...decorations]);
  const popupCard = node({ label: "ContentButtonFace", pivot: { x: 110, y: 20 } });
  const popup = node({ label: "TooltipPopup", x: -230, visible: tooltipOpen }, [popupCard]);
  return node({ label: "PixiTooltip", x: pos.x, y: pos.y, visible }, [button, popup]);
}

interface RailScenario {
  visible: IconId[];
  /** What was visible at the previous layout: hidden icons keep that position. */
  before?: IconId[];
  size?: number;
  twoColumns?: boolean;
  /** What Pixi reports as the rail's width in that state. */
  width: number;
  tooltipOpenOn?: IconId;
}

function buildRail(s: RailScenario): FakeNode {
  const size = s.size ?? 48;
  const twoColumns = s.twoColumns ?? false;
  const now = layout(s.visible, size, twoColumns);
  const then = layout(s.before ?? s.visible, size, twoColumns);
  const icons = ORDER.map((id) => {
    const pos = now.get(id) ?? then.get(id) ?? { x: 0, y: 0 };
    return icon(id, pos, size, now.has(id), s.tooltipOpenOn === id);
  });
  return node({ label: "RightSideRail", width: s.width }, icons);
}

// Weather and friend are always shown; activity, camera and chat once past
// the tutorial; quests while some are outstanding. The dev launcher is hidden.
const NORMAL: IconId[] = ["weather", "friend", "activity", "camera", "chat", "quests"];

/** `screenBottom`: the bottom of the screen in the rail's coordinates. */
function slotOf(s: RailScenario, screenBottom: number | null = null) {
  return computeRailSlot(buildRail(s), null, screenBottom);
}

// Desktop: 48 px icons, one column, 52 px apart.
checkEqual(
  "desktop: the bell takes the cell after the last icon",
  slotOf({ visible: NORMAL, width: 48 }),
  { x: 0, y: 312, size: 48 },
);
checkEqual(
  "a hovered icon's tooltip does not change the bell's size or place",
  slotOf({ visible: NORMAL, width: 278, tooltipOpenOn: "weather" }),
  { x: 0, y: 312, size: 48 },
);
checkEqual(
  "an unread chat message (preview bubble, badge) does not blow the bell up",
  slotOf({ visible: NORMAL, width: 142 }),
  { x: 0, y: 312, size: 48 },
);
checkEqual(
  "chat widget open: chat is hidden at its old place, the bell follows the icons that moved up",
  slotOf({ visible: ["weather", "friend", "activity", "camera", "quests"], before: NORMAL, width: 48 }),
  { x: 0, y: 260, size: 48 },
);
checkEqual(
  "daily quests done: no gap where the hidden quests icon used to be",
  slotOf({ visible: ["weather", "friend", "activity", "camera", "chat"], before: NORMAL, width: 48 }),
  { x: 0, y: 260, size: 48 },
);

// Landscape phone: 38 px icons in two columns, the first in the right one.
checkEqual(
  "landscape phone: the bell joins the two-column grid at the game's size",
  slotOf({ visible: NORMAL, size: 38, twoColumns: true, width: 80 }),
  { x: 42, y: 126, size: 38 },
);
checkEqual(
  "landscape phone with an odd icon count: the bell fills the free left cell",
  slotOf({ visible: ["weather", "friend", "activity", "camera", "chat"], before: NORMAL, size: 38, twoColumns: true, width: 80 }),
  { x: 0, y: 84, size: 38 },
);

checkEqual(
  "cinematic mode (only the camera left on the rail): the bell steps aside too",
  slotOf({ visible: ["camera"], before: NORMAL, width: 48 }),
  null,
);

checkEqual(
  "short screen: the bell goes left of the column, on the lowest row that fits",
  slotOf({ visible: NORMAL, width: 48 }, 300),
  { x: -52, y: 208, size: 48 },
);

// The rail fades out under game modals and slides away in cutscenes; a bell
// that is not drawn must not take clicks or show its count.
{
  const bell = node({ label: "GeminiNotificationBell" });
  const rail = node({ label: "RightSideRail" }, [bell]);
  const hud = node({ label: "hud" }, [rail]);
  checkEqual("the bell is shown while the rail is", isShownOnStage(bell), true);
  rail.alpha = 0;
  checkEqual("a game modal fades the rail out: the bell counts as hidden", isShownOnStage(bell), false);
  rail.alpha = 1;
  hud.visible = false;
  checkEqual("a hidden ancestor hides the bell", isShownOnStage(bell), false);
}

// The panel opens beside the bell, kept inside the window.
{
  const railBell = { left: 1404, top: 372, right: 1452, bottom: 420, width: 48, height: 48 };
  const panel = { width: 340, height: 400 };
  checkEqual(
    "a bell on the right edge opens its panel to its left, top-aligned",
    panelPositionBeside(railBell, panel, { width: 1460, height: 900 }),
    { left: 1056, top: 372 },
  );
  checkEqual(
    "on a short window the panel moves up instead of running off the bottom",
    panelPositionBeside(railBell, panel, { width: 1460, height: 600 }),
    { left: 1056, top: 192 },
  );
  const leftBell = { left: 20, top: 300, right: 64, bottom: 344, width: 44, height: 44 };
  checkEqual(
    "a floating bell on the left half opens its panel to its right",
    panelPositionBeside(leftBell, panel, { width: 1460, height: 900 }),
    { left: 72, top: 300 },
  );
}

done();
