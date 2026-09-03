// Shared visual atoms for mod panels, in the Editor menu's language: dark
// gradient, rounded cards, teal accent, uppercase section labels.
//
// Deliberately self-contained rather than reusing the Editor menu's own
// helpers: those styles are only injected when the Editor tab is opened, so
// borrowing its class names would leave other panels unstyled for anyone who
// never opens it.

export { iconBox, spriteLookup } from './panel-icons';

const STYLE_ID = 'qws-panel-ui-css';

/** Icon size for a setting row, matching the Keybinds rows. */
export const ROW_ICON_PX = 26;

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

export const GOLD = '#FFC734';
export const RAINBOW = '#c084fc';

/**
 * Paints an element's text with the rainbow gradient.
 *
 * The gradient is painted across the element's box and then clipped to the
 * glyphs, so a box wider than its text shows only the gradient's first colours.
 * `width: fit-content` shrinks the box onto the text, which is what makes the
 * full spectrum land on the letters; grid and flex parents need the element to
 * stop stretching, hence `justifySelf`/`alignSelf`.
 *
 * The transparent fill is what lets the background show through, so the element
 * must carry no `color` of its own afterwards.
 */
export function rainbowText(el: HTMLElement): void {
  css(el, {
    display: 'inline-block',
    width: 'fit-content',
    justifySelf: 'center',
    alignSelf: 'center',
    background: 'linear-gradient(90deg, #ff4d4d, #ff9f1c, #ffe14d, #3ddc84, #4dabf7, #a06bff)',
    backgroundClip: 'text',
    color: 'transparent',
  });
  el.style.setProperty('-webkit-background-clip', 'text');
  el.style.setProperty('-webkit-text-fill-color', 'transparent');
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
    padding: '10px',
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

export interface Meter {
  root: HTMLElement;
  /** `ratio` is clamped to 0..1; `tone` colours the fill. */
  set(ratio: number, tone?: 'accent' | 'warn'): void;
}

/** Thin horizontal progress bar. */
export function meter(): Meter {
  const root = document.createElement('div');
  css(root, {
    position: 'relative',
    height: '5px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    flex: '1 1 auto',
    minWidth: '60px',
  });

  const fill = document.createElement('div');
  css(fill, {
    position: 'absolute',
    inset: '0 auto 0 0',
    width: '0%',
    borderRadius: '999px',
    background: TEAL,
    transition: 'width 200ms ease, background 200ms ease',
  });
  root.appendChild(fill);

  return {
    root,
    set(ratio, tone = 'accent') {
      const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
      fill.style.width = `${clamped * 100}%`;
      fill.style.background = tone === 'warn' ? WARN : TEAL;
    },
  };
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

export function textField(placeholder: string, value = ''): HTMLInputElement {
  const el = document.createElement('input');
  el.className = 'qws-pnl-input';
  el.type = 'text';
  el.placeholder = placeholder;
  el.value = value;
  css(el, { padding: '6px 9px', fontSize: '11.5px' });
  return el;
}

export function selectField(options: Array<[value: string, label: string]>): HTMLSelectElement {
  const el = document.createElement('select');
  el.className = 'qws-pnl-input';
  css(el, { padding: '6px 9px', fontSize: '11.5px', cursor: 'pointer' });
  for (const [value, label] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    el.appendChild(option);
  }
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
