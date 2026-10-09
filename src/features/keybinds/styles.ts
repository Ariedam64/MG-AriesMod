// Rules for the Keybinds menu. Colours come from the kit's theme variables.

import { addStyle } from "../../lib/dom";

const KEYBINDS_CSS = `
/* The menu's panel. A definite height, not 100%: the HUD window scrolls itself
   and has no fixed height, so 100% would collapse onto the content. */
.qmm-views.qws-kb {
  display: flex; flex-direction: column; gap: var(--qmm-space-lg);
  width: 620px; max-width: 100%; height: min(70vh, 600px); overflow-y: auto; box-sizing: border-box;
  --qmm-hotkey-w: 136px;
}
.qws-kb-intro { margin: 0 2px; font-size: var(--qmm-fs-sm); line-height: 1.45; color: var(--qmm-text-dim); }

.qws-kb .qmm-card--plain { padding: var(--qmm-space-lg); }
.qws-kb .qmm-collapse__body { gap: 2px; }

.qws-kb-group {
  margin: var(--qmm-space-md) 8px 2px; font-size: var(--qmm-fs-sm); font-weight: 800; color: var(--qmm-text-dim);
}
.qws-kb-group:first-child { margin-top: 0; }

.qws-kb-row {
  flex-wrap: wrap; row-gap: var(--qmm-space-sm); padding: 6px 8px;
  background: transparent; transition: background 120ms ease;
}
.qws-kb-row:hover { background: var(--qmm-paper-deep); }
/* Narrow windows put the key under the label rather than squeezing it. */
.qws-kb-row .qmm-setting-row__text { flex: 1 1 140px; }
.qws-kb-row .qmm-setting-row__controls { flex-wrap: nowrap; gap: var(--qmm-space-sm); margin-left: auto; }

/* Reset and remove keep their slots when hidden, so every key lines up. */
.qws-kb-acts { display: grid; grid-template-columns: 28px 28px; gap: 2px; }
.qws-kb-act--reset { grid-column: 1; }
.qws-kb-act--clear { grid-column: 2; }
.qws-kb-act.qmm-btn--icon { width: 28px; height: 28px; border-radius: var(--qmm-radius-sm); color: var(--qmm-text-dim); }
.qws-kb-act.qmm-btn--icon:hover { color: var(--qmm-text); }
.qws-kb-act--clear.qmm-btn--icon:hover { color: var(--qmm-danger-ink); background: var(--qmm-danger-soft); }
.qws-kb-act:disabled, .qws-kb-act.is-disabled { visibility: hidden; }

.qws-kb-hold {
  display: inline-flex; align-items: center; gap: var(--qmm-space-sm); align-self: flex-start; margin-top: 4px;
  font-size: var(--qmm-fs-sm); font-weight: 700; color: var(--qmm-text-soft); cursor: pointer; user-select: none;
}
.qws-kb-hold .qmm-switch { width: 34px; height: 20px; border-radius: 10px; }
.qws-kb-hold .qmm-switch::before { top: 3px; left: 3px; width: 14px; height: 14px; }
.qws-kb-hold .qmm-switch:checked::before { transform: translateX(14px); }

.qws-kb-empty { margin: 4px 8px 2px; font-size: var(--qmm-fs-sm); line-height: 1.45; color: var(--qmm-text-dim); }
`;

let injected = false;

export function ensureKeybindsStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(KEYBINDS_CSS);
}
