// Layout pieces: the labelled setting row, the collapsible section card, and
// the generic form and flex rows.

import { plainCard, sectionLabel } from "./card";
import { h } from "./dom";
import { iconBox } from "./icons";

/** Icon size at the start of a setting row, matching the Keybinds rows. */
const ROW_ICON_PX = 26;

export interface SettingRowOptions {
  /** Atlas frame key or image URL shown at the start of the row. */
  icon?: string;
  /** Log tag forwarded to the sprite loader. */
  iconTag?: string;
}

/** One labelled setting: title (and an optional hint) on the left, controls on the right. */
export function settingRow(
  title: string,
  hint: string | null,
  control: HTMLElement,
  opts: SettingRowOptions = {},
): { row: HTMLElement; controls: HTMLElement } {
  const row = h("div", "qmm-setting-row");
  if (opts.icon) row.appendChild(iconBox(opts.icon, ROW_ICON_PX, opts.iconTag ?? "panel"));

  const text = h("div", "qmm-setting-row__text");
  text.appendChild(h("div", "qmm-setting-row__title", title));
  if (hint) text.appendChild(h("div", "qmm-setting-row__hint", hint));

  const controls = h("div", "qmm-setting-row__controls");
  controls.appendChild(control);

  row.append(text, controls);
  return { row, controls };
}

export interface CollapsibleCardOptions {
  icon?: string;
  title?: string;
  description?: string;
  /** Custom header content, used instead of the icon, title and description. */
  header?: HTMLElement;
  collapsed: boolean;
  onToggle: (collapsed: boolean) => void;
}

/**
 * Section card whose header doubles as the collapse control.
 *
 * It never shrinks below its content: inside a scrolling list, a shrinking
 * card collapses under its own rows and they overlap.
 */
export function collapsibleCard(opts: CollapsibleCardOptions): { root: HTMLElement; body: HTMLElement } {
  const root = plainCard();
  root.classList.add("qmm-collapse");

  const head = h("button", "qmm-collapse__head");
  head.type = "button";

  const titles = h("div", "qmm-collapse__titles");
  if (opts.header) {
    titles.appendChild(opts.header);
  } else {
    const title = opts.title ?? "";
    titles.appendChild(sectionLabel(opts.icon ? `${opts.icon} ${title}` : title));
    if (opts.description) titles.appendChild(h("div", "qmm-collapse__desc", opts.description));
  }
  head.append(titles, h("span", "qmm-collapse__chevron", "▶"));

  const body = h("div", "qmm-collapse__body");

  let collapsed = opts.collapsed;
  const apply = () => {
    root.classList.toggle("is-collapsed", collapsed);
    head.setAttribute("aria-expanded", collapsed ? "false" : "true");
  };
  apply();
  head.addEventListener("click", () => {
    collapsed = !collapsed;
    apply();
    opts.onToggle(collapsed);
  });

  root.append(head, body);
  return { root, body };
}

export type FlexRowOptions = {
  gap?: number;
  justify?: "start" | "center" | "end" | "between" | "around";
  align?: "start" | "center" | "end" | "stretch";
  wrap?: boolean;
  fullWidth?: boolean;
  className?: string;
};

const JUSTIFY = { start: "flex-start", center: "center", end: "flex-end", between: "space-between", around: "space-around" };
const ALIGN = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };

/** A wrapping flex row; gap 8, centred by default. */
export function flexRow(opts: FlexRowOptions = {}): HTMLDivElement {
  const row = h("div", ["qmm-flex", opts.className].filter(Boolean).join(" "));
  row.style.alignItems = ALIGN[opts.align ?? "center"];
  row.style.justifyContent = JUSTIFY[opts.justify ?? "start"];
  row.style.gap = `${opts.gap ?? 8}px`;
  row.style.flexWrap = opts.wrap === false ? "nowrap" : "wrap";
  if (opts.fullWidth) row.style.width = "100%";
  return row;
}
