// Shared visual atoms for mod panels, in the Editor menu's language: dark
// gradient, rounded cards, teal accent, uppercase section labels.
//
// Deliberately self-contained rather than reusing the Editor menu's own
// helpers: those styles are only injected when the Editor tab is opened, so
// borrowing its class names would leave other panels unstyled for anyone who
// never opens it.

const STYLE_ID = 'qws-panel-ui-css';

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
    css(btn, { opacity: '0.6', pointerEvents: 'none' });
    try {
      await onClick();
    } finally {
      css(btn, { opacity: '1', pointerEvents: 'auto' });
    }
  };
  return btn;
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
