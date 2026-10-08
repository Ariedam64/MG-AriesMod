// The filter toolbar drawn in Pixi: a "Filter: X (n)" button that opens a
// wrapping panel of one button per action found in the history.

import { classifyEntryAction, getActionLabel, mergeActions, type ActionKey } from "./classification";
import { getActiveFilter, setActiveFilter } from "./filter";
import { getActivityLogHistory, type ActivityLogEntry } from "./history";
import { FILTER_TOOLBAR_LABEL } from "../../game/activityLogModalLayout";

const BUTTON_HEIGHT = 26;
const BUTTON_PADDING_X = 10;
const BUTTON_GAP = 6;
const BUTTON_RADIUS = 8;
const BUTTON_FILL_INACTIVE = 0x7b5a38;
const BUTTON_FILL_ACTIVE = 0xe3a23d;
const BUTTON_ALPHA_INACTIVE = 0.55;
const BUTTON_ALPHA_ACTIVE = 0.95;
const TEXT_STYLE = { fontFamily: "Arial", fontSize: 12, fontWeight: "700", fill: "#FFFFFF" };

const CLOSED_LABEL_PREFIX = "Filter: ";
const CARET_GAP = 8;
const CARET_CLOSED = "▾";
const CARET_OPEN = "▴";
const PANEL_GAP = 6;

/** Height of the toolbar with its options closed. */
export const COLLAPSED_HEIGHT = BUTTON_HEIGHT;

/** The Pixi constructors the toolbar is built from, taken from the running game. */
export interface PixiCtors {
  Graphics: any;
  Text: any;
  Container: any;
}

interface OptionButton {
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

export interface FilterToolbar {
  container: any;
  closedButton: ClosedButton;
  options: { container: any; buttons: OptionButton[]; height: number };
  counts: Map<ActionKey, number>;
  total: number;
  isExpanded: boolean;
}

function countActions(history: ActivityLogEntry[]): Map<ActionKey, number> {
  const counts = new Map<ActionKey, number>();
  for (const entry of history) {
    const key = classifyEntryAction(entry.action);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function labelFor(key: ActionKey, counts: Map<ActionKey, number>, total: number): string {
  const count = key === "all" ? total : counts.get(key) ?? 0;
  return `${getActionLabel(key)}${count ? ` (${count})` : ""}`;
}

const closedLabel = (toolbar: Pick<FilterToolbar, "counts" | "total">) =>
  CLOSED_LABEL_PREFIX + labelFor(getActiveFilter(), toolbar.counts, toolbar.total);

function drawButtonBg(bg: any, width: number, active: boolean): void {
  bg.roundRect(0, 0, width, BUTTON_HEIGHT, BUTTON_RADIUS).fill({
    color: active ? BUTTON_FILL_ACTIVE : BUTTON_FILL_INACTIVE,
    alpha: active ? BUTTON_ALPHA_ACTIVE : BUTTON_ALPHA_INACTIVE,
  });
}

/** Sizes the closed button's background and caret to its current text. */
function layoutClosedButton(button: ClosedButton): void {
  const width = button.text.width + BUTTON_PADDING_X * 2 + CARET_GAP + button.caret.width;
  button.bg.clear();
  drawButtonBg(button.bg, width, true);
  button.text.position.set(BUTTON_PADDING_X, (BUTTON_HEIGHT - button.text.height) / 2);
  button.caret.position.set(width - BUTTON_PADDING_X - button.caret.width, (BUTTON_HEIGHT - button.caret.height) / 2);
}

function buildClosedButton(ctors: PixiCtors, label: string): ClosedButton {
  const text = new ctors.Text({ text: label, style: TEXT_STYLE });
  const caret = new ctors.Text({ text: CARET_CLOSED, style: TEXT_STYLE });
  const bg = new ctors.Graphics();
  const container = new ctors.Container();
  container.addChild(bg);
  container.addChild(text);
  container.addChild(caret);
  container.eventMode = "static";
  container.cursor = "pointer";
  const button: ClosedButton = { container, bg, text, caret };
  layoutClosedButton(button);
  return button;
}

function buildOptions(ctors: PixiCtors, maxWidth: number, counts: Map<ActionKey, number>, total: number) {
  const keys: ActionKey[] = ["all", ...mergeActions(Array.from(counts.keys()))];
  const container = new ctors.Container();
  const buttons: OptionButton[] = [];
  const active = getActiveFilter();
  let x = 0;
  let y = 0;

  for (const key of keys) {
    const text = new ctors.Text({ text: labelFor(key, counts, total), style: TEXT_STYLE });
    const width = text.width + BUTTON_PADDING_X * 2;

    // Wrap when this button would overflow the list's width. The first button
    // of a row never wraps, or one wider than the list would loop forever.
    if (x > 0 && x + width > maxWidth) {
      x = 0;
      y += BUTTON_HEIGHT + BUTTON_GAP;
    }

    const bg = new ctors.Graphics();
    drawButtonBg(bg, width, key === active);
    text.position.set(BUTTON_PADDING_X, (BUTTON_HEIGHT - text.height) / 2);

    const button = new ctors.Container();
    button.addChild(bg);
    button.addChild(text);
    button.position.set(x, y);
    button.eventMode = "static";
    button.cursor = "pointer";

    container.addChild(button);
    buttons.push({ container: button, bg, key });
    x += width + BUTTON_GAP;
  }

  return { container, buttons, height: y + BUTTON_HEIGHT };
}

export function setExpanded(toolbar: FilterToolbar, expanded: boolean): void {
  if (toolbar.isExpanded === expanded) return;
  toolbar.isExpanded = expanded;
  toolbar.options.container.visible = expanded;
  toolbar.closedButton.caret.text = expanded ? CARET_OPEN : CARET_CLOSED;
}

/** Builds the toolbar from the current history; `maxWidth` is where option rows wrap. */
export function buildFilterToolbar(ctors: PixiCtors, maxWidth: number): FilterToolbar {
  const history = getActivityLogHistory();
  const counts = countActions(history);
  const total = history.length;

  const container = new ctors.Container();
  container.label = FILTER_TOOLBAR_LABEL;

  const closedButton = buildClosedButton(ctors, closedLabel({ counts, total }));
  container.addChild(closedButton.container);

  const options = buildOptions(ctors, maxWidth, counts, total);
  options.container.position.set(0, BUTTON_HEIGHT + PANEL_GAP);
  options.container.visible = false;
  container.addChild(options.container);

  const toolbar: FilterToolbar = { container, closedButton, options, counts, total, isExpanded: false };

  closedButton.container.on("pointertap", () => setExpanded(toolbar, !toolbar.isExpanded));
  for (const button of options.buttons) {
    button.container.on("pointertap", () => {
      setActiveFilter(button.key);
      setExpanded(toolbar, false);
    });
  }
  return toolbar;
}

/** Repaints which option is active and the closed button's label. */
export function refreshToolbarHighlight(toolbar: FilterToolbar): void {
  const active = getActiveFilter();
  for (const button of toolbar.options.buttons) {
    if (button.bg.destroyed) continue;
    const width = button.bg.getLocalBounds().width;
    button.bg.clear();
    drawButtonBg(button.bg, width, button.key === active);
  }
  const label = closedLabel(toolbar);
  if (toolbar.closedButton.text.text !== label) {
    toolbar.closedButton.text.text = label;
    layoutClosedButton(toolbar.closedButton);
  }
}
