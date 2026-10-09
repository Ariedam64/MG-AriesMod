// Rules for the Misc menu. Colours come from the kit's theme variables.

import { addStyle } from "../../lib/dom";

const MISC_CSS = `
.qmm-views.qws-misc {
  display: flex; flex-direction: column; gap: var(--qmm-space-lg); box-sizing: border-box;
  /* Never wider than the screen, whatever the menu size. */
  width: min(560px, calc((100vw - 48px) / var(--qmm-scale, 1))); max-width: 100%;
  /* A definite height, not 100%: the HUD window has none, so 100% would
     collapse onto the content and hand the scrollbar back to the window. */
  height: min(70vh, 600px); overflow-y: auto; padding-right: 2px;
}

/* A narrow window puts a row's controls under its text instead of crushing it. */
.qws-misc .qmm-setting-row { flex-wrap: wrap; }
.qws-misc .qmm-setting-row__text { flex: 1 1 140px; }
.qws-misc .qmm-setting-row__controls { margin-left: auto; }
/* Windows and the kit widen every number field; the step delay holds four digits. */
.qws-win .qws-misc input.qmm-input-number-input { width: 72px; min-width: 0; box-sizing: border-box; }

.qws-misc-sub {
  margin: var(--qmm-space-sm) 2px 0; font-size: var(--qmm-fs-sm); font-weight: 800; color: var(--qmm-text-soft);
}

.qws-misc-note {
  padding: 8px 12px; border-radius: var(--qmm-radius-md);
  background: var(--qmm-warn-soft); color: var(--qmm-warn-ink);
  font-size: var(--qmm-fs-sm); font-weight: 700; line-height: 1.45;
}

.qws-misc-range { display: flex; align-items: center; gap: var(--qmm-space-md); }
.qws-misc-range .qws-pnl-range { width: 140px; }
.qws-misc-range .qmm-pill { min-width: 64px; justify-content: center; }
`;

let injected = false;

export function ensureMiscStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(MISC_CSS);
}
