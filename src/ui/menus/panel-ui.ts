// Shared visual atoms for mod panels, in the Editor menu's language: dark
// gradient, rounded cards, teal accent, uppercase section labels.
//
// Deliberately self-contained rather than reusing the Editor menu's own
// helpers: those styles are only injected when the Editor tab is opened, so
// borrowing its class names would leave other panels unstyled for anyone who
// never opens it.

import { attachSpriteIcon } from '../spriteIconCache';
import { setImageSafe } from '../../utils/discordCsp';

const STYLE_ID = 'qws-panel-ui-css';

/** Icon size for a setting row, matching the Keybinds rows. */
const ROW_ICON_PX = 26;

export const TEAL = '#5eead4';
export const TEAL_DIM = 'rgba(94,234,212,0.12)';
export const TEAL_BORDER = 'rgba(94,234,212,0.3)';
export const BORDER = 'rgba(255,255,255,0.08)';
export const CARD_BG = 'rgba(255,255,255,0.03)';
export const TEXT = '#e7eef7';
export const TEXT_DIM = 'rgba(226,232,240,0.45)';
export const DANGER = '#ef4444';
export const WARN = '#fbbf24';

export const css = (el: HTMLElement, style: Partial<CSSStyleDeclaration>) =>
  Object.assign(el.style, style);

export function ensurePanelStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
.qws-pnl-scroll::-webkit-scrollbar { width: 6px; }
.qws-pnl-scroll::-webkit-scrollbar-track { background: transparent; }
.qws-pnl-scroll::-webkit-scrollbar-thumb { background: rgba(94,234,212,0.2); border-radius: 3px; }
.qws-pnl-scroll::-webkit-scrollbar-thumb:hover { background: rgba(94,234,212,0.35); }
.qws-pnl-scroll { scrollbar-width: thin; scrollbar-color: rgba(94,234,212,0.2) transparent; }

.qws-pnl-cell {
  position: relative; display: flex; align-items: center; justify-content: center;
  aspect-ratio: 1; border-radius: 10px; cursor: pointer;
  background: ${CARD_BG}; border: 1px solid ${BORDER};
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
}
.qws-pnl-cell:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.16); transform: translateY(-1px); }
.qws-pnl-cell.is-active { border-color: ${TEAL_BORDER}; background: ${TEAL_DIM}; }
.qws-pnl-cell.is-skinned::after {
  content: ''; position: absolute; top: 5px; right: 5px;
  width: 6px; height: 6px; border-radius: 50%; background: ${TEAL};
}

.qws-pnl-toggle { position:relative; display:inline-block; width:36px; height:20px; cursor:pointer; flex-shrink:0; }
.qws-pnl-toggle input { opacity:0; width:0; height:0; position:absolute; }
.qws-pnl-track {
  position:absolute; inset:0; border-radius:10px;
  background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.12);
  transition:background 150ms ease, border-color 150ms ease;
}
.qws-pnl-toggle input:checked ~ .qws-pnl-track { background:rgba(94,234,212,0.25); border-color:rgba(94,234,212,0.5); }
.qws-pnl-thumb {
  position:absolute; top:3px; left:3px; width:12px; height:12px; border-radius:50%;
  background:rgba(226,232,240,0.5); transition:transform 150ms ease, background 150ms ease;
}
.qws-pnl-toggle input:checked ~ .qws-pnl-track .qws-pnl-thumb { transform:translateX(16px); background:${TEAL}; }

.qws-pnl-input {
  padding: 8px 10px; border-radius: 9px; border: 1px solid ${BORDER};
  background: rgba(0,0,0,0.22); color: ${TEXT}; font-size: 12px; outline: none;
  transition: border-color 120ms ease;
}
.qws-pnl-input:focus { border-color: ${TEAL_BORDER}; }
.qws-pnl-input option { background: #10151c; color: ${TEXT}; }

/* Restyles the Menu's own hotkey capture button, which stays in use for its
   key-recording behaviour. Scoped to panels so other menus keep their look. */
.qws-pnl-root .qmm-hotkey {
  min-width: 104px; padding: 7px 12px; border-radius: 9px;
  border: 1px solid ${BORDER}; background: rgba(0,0,0,0.22);
  color: ${TEXT}; font-size: 11px; font-weight: 600; font-family: inherit;
  cursor: pointer; transition: all 120ms ease;
}
.qws-pnl-root .qmm-hotkey:hover { border-color: rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); }
.qws-pnl-root .qmm-hotkey.is-assigned { color: ${TEAL}; border-color: ${TEAL_BORDER}; background: ${TEAL_DIM}; }
.qws-pnl-root .qmm-hotkey.is-empty { color: ${TEXT_DIM}; font-weight: 500; }
.qws-pnl-root .qmm-hotkey.is-recording {
  color: ${WARN}; border-color: rgba(251,191,36,0.55); background: rgba(251,191,36,0.12);
}
.qws-pnl-root .qmm-check, .qws-pnl-root .qmm-switch { accent-color: ${TEAL}; }

.qws-pnl-range {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 4px; border-radius: 999px; outline: none; cursor: pointer;
  background: rgba(255,255,255,0.1); border: none; padding: 0; margin: 0;
}
.qws-pnl-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 13px; height: 13px; border-radius: 50%;
  background: ${TEAL}; border: none; cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.qws-pnl-range::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 0 0 4px ${TEAL_DIM}; }
.qws-pnl-range::-moz-range-thumb {
  width: 13px; height: 13px; border-radius: 50%;
  background: ${TEAL}; border: none; cursor: pointer;
}
.qws-pnl-range::-moz-range-track { height: 4px; border-radius: 999px; background: rgba(255,255,255,0.1); }
.qws-pnl-range:disabled { opacity: 0.4; cursor: not-allowed; }
.qws-pnl-range:disabled::-webkit-slider-thumb { background: ${TEXT_DIM}; cursor: not-allowed; }
.qws-pnl-range:disabled::-moz-range-thumb { background: ${TEXT_DIM}; cursor: not-allowed; }

.qws-pnl-head:hover .qws-pnl-chevron { color: ${TEAL}; }
`;
  document.head.appendChild(st);
}

export function sectionLabel(text: string): HTMLElement {
  const el = document.createElement('div');
  css(el, {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    color: TEXT_DIM,
    textTransform: 'uppercase',
  });
  el.textContent = text;
  return el;
}

export function card(): HTMLElement {
  const el = document.createElement('div');
  css(el, {
    padding: '12px',
    background: CARD_BG,
    borderRadius: '12px',
    border: `1px solid ${BORDER}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minHeight: '0',
  });
  return el;
}

type BtnTone = 'accent' | 'neutral' | 'danger';

const TONES: Record<BtnTone, { fg: string; bg: string; border: string; hoverBg: string; hoverBorder: string }> = {
  accent: {
    fg: TEAL, bg: TEAL_DIM, border: TEAL_BORDER,
    hoverBg: 'rgba(94,234,212,0.22)', hoverBorder: 'rgba(94,234,212,0.55)',
  },
  neutral: {
    fg: TEXT, bg: CARD_BG, border: BORDER,
    hoverBg: 'rgba(255,255,255,0.06)', hoverBorder: 'rgba(255,255,255,0.16)',
  },
  danger: {
    fg: DANGER, bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)',
    hoverBg: 'rgba(239,68,68,0.2)', hoverBorder: 'rgba(239,68,68,0.55)',
  },
};

export function button(
  label: string,
  tone: BtnTone,
  onClick: () => void | Promise<void>,
): HTMLButtonElement {
  const btn = document.createElement('button');
  const palette = TONES[tone];
  css(btn, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '7px 12px',
    border: `1px solid ${palette.border}`,
    borderRadius: '9px',
    background: palette.bg,
    color: palette.fg,
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 120ms ease',
    whiteSpace: 'nowrap',
  });
  btn.textContent = label;
  btn.onmouseenter = () => css(btn, { background: palette.hoverBg, borderColor: palette.hoverBorder });
  btn.onmouseleave = () => css(btn, { background: palette.bg, borderColor: palette.border });
  btn.onclick = async () => {
    if (btn.disabled) return;
    css(btn, { opacity: '0.6', pointerEvents: 'none' });
    try {
      await onClick();
    } finally {
      // Restore to whatever the button's state is *now*: the handler may well
      // have disabled it (a completed run, an emptied selection), and blindly
      // restoring full opacity would leave it looking clickable.
      setButtonEnabled(btn, !btn.disabled);
    }
  };
  return btn;
}

/** Enables/disables a panel button, keeping the dimmed look in sync. */
export function setButtonEnabled(btn: HTMLButtonElement, enabled: boolean): void {
  btn.disabled = !enabled;
  css(btn, { opacity: enabled ? '1' : '0.35', pointerEvents: enabled ? 'auto' : 'none' });
}

export function toggle(checked: boolean, onChange: (on: boolean) => void): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'qws-pnl-toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  const track = document.createElement('span');
  track.className = 'qws-pnl-track';
  const thumb = document.createElement('span');
  thumb.className = 'qws-pnl-thumb';
  track.appendChild(thumb);
  wrap.append(input, track);
  input.addEventListener('change', () => onChange(input.checked));
  (wrap as any).setChecked = (value: boolean) => {
    input.checked = value;
  };
  return wrap;
}

/** Small status pill, e.g. Active / Waiting. */
export function chip(text: string, tone: 'ok' | 'warn'): HTMLElement {
  const el = document.createElement('span');
  const color = tone === 'ok' ? TEAL : WARN;
  css(el, {
    alignSelf: 'flex-start',
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 7px',
    borderRadius: '999px',
    color,
    background: tone === 'ok' ? TEAL_DIM : 'rgba(251,191,36,0.12)',
  });
  el.textContent = text;
  return el;
}

/** Read-only value badge, e.g. a slider's current value or a selection summary. */
export function pill(text: string): HTMLElement {
  const el = document.createElement('span');
  css(el, {
    fontSize: '11px',
    fontWeight: '600',
    padding: '4px 9px',
    borderRadius: '999px',
    border: `1px solid ${BORDER}`,
    background: 'rgba(0,0,0,0.22)',
    color: TEXT,
    whiteSpace: 'nowrap',
  });
  el.textContent = text;
  return el;
}

export function range(min: number, max: number, step: number, value: number): HTMLInputElement {
  const el = document.createElement('input');
  el.className = 'qws-pnl-range';
  el.type = 'range';
  el.min = String(min);
  el.max = String(max);
  el.step = String(step);
  el.value = String(value);
  return el;
}

export function numberField(min: number, max: number, step: number, value: number): HTMLInputElement {
  const el = document.createElement('input');
  el.className = 'qws-pnl-input';
  el.type = 'number';
  el.min = String(min);
  el.max = String(max);
  el.step = String(step);
  el.value = String(value);
  css(el, { width: '78px', textAlign: 'right' });
  return el;
}

/**
 * Splits an atlas frame key into the category/name pair the sprite API uses.
 *
 * The API pluralises some categories (`sprite/object/…` is served under
 * `objects/`), and a few sprites exist under more than one, so candidates are
 * returned rather than a single guess — `attachSpriteIcon` takes the first that
 * resolves.
 */
export function spriteLookup(frameKey: string): { categories: string[]; name: string } {
  const parts = frameKey.split('/').filter(Boolean);
  const name = parts[parts.length - 1] ?? frameKey;
  const category = parts.length >= 2 ? parts[parts.length - 2] : '';
  const categories = [category, `${category}s`, 'ui', 'decor', 'objects'].filter(
    (value, index, all) => value && all.indexOf(value) === index,
  );
  return { categories, name };
}

/**
 * Square icon holder for an atlas frame key (`sprite/decor/SeedSilo`) or a
 * hosted image URL. Remote URLs go through `setImageSafe`, which routes them via
 * GM inside the Discord Activity where the CSP blocks direct loads.
 */
export function iconBox(source: string, sizePx: number, logTag: string): HTMLElement {
  const box = document.createElement('div');
  css(box, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    flex: '0 0 auto',
  });
  if (/^https?:\/\//i.test(source)) {
    const img = document.createElement('img');
    css(img, { maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' });
    img.alt = '';
    setImageSafe(img, source);
    box.appendChild(img);
  } else {
    const { categories, name } = spriteLookup(source);
    attachSpriteIcon(box, categories, name, sizePx, logTag);
  }
  return box;
}

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
  title: string;
  description?: string;
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
  titles.appendChild(sectionLabel(opts.icon ? `${opts.icon} ${opts.title}` : opts.title));
  if (opts.description) {
    const desc = document.createElement('div');
    css(desc, { fontSize: '11px', color: TEXT_DIM, lineHeight: '1.45' });
    desc.textContent = opts.description;
    titles.appendChild(desc);
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
