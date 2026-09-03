// src/ui/menus/panel-layout.ts
// Composite layout built from the panel-ui atoms: a labelled setting row and a
// collapsible section card. Split out so panel-ui stays tokens + controls.

import { BORDER, CARD_BG, ROW_ICON_PX, TEXT, TEXT_DIM, card, css, sectionLabel } from "./panel-ui";
import { iconBox } from "./panel-icons";

export interface SettingRowOptions {
  /** Atlas frame key or image URL shown at the start of the row. */
  icon?: string;
  /** Log tag forwarded to the sprite loader. */
  iconTag?: string;
}

/** One labelled setting: title (+ optional hint) on the left, controls on the right. */
export function settingRow(
  title: string,
  hint: string | null,
  control: HTMLElement,
  opts: SettingRowOptions = {},
): { row: HTMLElement; controls: HTMLElement } {
  const row = document.createElement('div');
  css(row, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '10px',
    background: CARD_BG,
    border: `1px solid ${BORDER}`,
    flexShrink: '0',
  });

  if (opts.icon) row.appendChild(iconBox(opts.icon, ROW_ICON_PX, opts.iconTag ?? 'panel'));

  const labelCol = document.createElement('div');
  css(labelCol, { display: 'flex', flexDirection: 'column', gap: '2px', flex: '1 1 auto', minWidth: '0' });

  const name = document.createElement('div');
  css(name, { fontSize: '12px', color: TEXT });
  name.textContent = title;
  labelCol.appendChild(name);

  if (hint) {
    const desc = document.createElement('div');
    css(desc, { fontSize: '10px', color: TEXT_DIM, lineHeight: '1.4' });
    desc.textContent = hint;
    labelCol.appendChild(desc);
  }

  const controls = document.createElement('div');
  css(controls, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    flex: '0 0 auto',
    flexWrap: 'wrap',
  });
  controls.appendChild(control);

  row.append(labelCol, controls);
  return { row, controls };
}

export interface CollapsibleCardOptions {
  icon?: string;
  title?: string;
  description?: string;
  /** Custom header content, used instead of the icon/title/description trio. */
  header?: HTMLElement;
  collapsed: boolean;
  onToggle: (collapsed: boolean) => void;
}

/**
 * Section card whose header doubles as the collapse control.
 *
 * `flexShrink:0` / `minHeight:auto` opt out of the shared card()'s shrinking:
 * inside a scrolling list, shrinking makes every card collapse under its own
 * content and the rows overlap.
 */
export function collapsibleCard(opts: CollapsibleCardOptions): { root: HTMLElement; body: HTMLElement } {
  const root = card();
  css(root, { flexShrink: '0', minHeight: 'auto' });

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'qws-pnl-head';
  css(head, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    color: 'inherit',
  });

  const titles = document.createElement('div');
  css(titles, { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0', flex: '1 1 auto' });
  if (opts.header) {
    titles.appendChild(opts.header);
  } else {
    const title = opts.title ?? '';
    titles.appendChild(sectionLabel(opts.icon ? `${opts.icon} ${title}` : title));
    if (opts.description) {
      const desc = document.createElement('div');
      css(desc, { fontSize: '11px', color: TEXT_DIM, lineHeight: '1.45' });
      desc.textContent = opts.description;
      titles.appendChild(desc);
    }
  }

  const chevron = document.createElement('span');
  chevron.className = 'qws-pnl-chevron';
  css(chevron, {
    color: TEXT_DIM,
    fontSize: '10px',
    transition: 'transform 140ms ease, color 120ms ease',
    flex: '0 0 auto',
    marginLeft: 'auto',
  });
  chevron.textContent = '▶';

  head.append(titles, chevron);

  const body = document.createElement('div');
  css(body, { display: 'flex', flexDirection: 'column', gap: '8px' });

  let collapsed = opts.collapsed;
  const apply = () => {
    body.style.display = collapsed ? 'none' : 'flex';
    chevron.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(90deg)';
    head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  };
  apply();

  head.addEventListener('click', () => {
    collapsed = !collapsed;
    apply();
    opts.onToggle(collapsed);
  });

  root.append(head, body);
  return { root, body };
}
