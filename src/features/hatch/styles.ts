// The Hatch tab's layout rules, on top of the kit's components and colour
// variables.

import { addStyle } from "../../lib/dom";

const HATCH_CSS = `
.ht-tab {
  display: flex; flex-direction: column; gap: var(--qmm-space-lg);
  width: min(700px, calc((100vw - 64px) / var(--qmm-scale, 1))); max-width: 100%; box-sizing: border-box;
  container-type: inline-size;
}
.ht-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md) var(--qmm-space-lg); }
.ht-head__text { flex: 1 1 220px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ht-title { font-size: var(--qmm-fs-xl); font-weight: 900; }
.ht-sub { font-size: var(--qmm-fs-sm); line-height: 1.4; color: var(--qmm-text-dim); }
.ht-list {
  display: flex; flex-direction: column; gap: var(--qmm-space-md);
  max-height: calc(58vh / var(--qmm-scale, 1)); overflow-y: auto; min-height: 0; padding-right: 2px;
}
.ht-empty { padding: var(--qmm-space-xl) var(--qmm-space-md); font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); text-align: center; }

/* An egg's card: its header is the collapse button. */
.qmm-card.ht-egg { padding: var(--qmm-space-lg) var(--qmm-space-xl); }
.ht-egg > .qmm-collapse__body { gap: var(--qmm-space-xl); padding-top: var(--qmm-space-xs); }
.ht-egg-head { display: flex; align-items: center; gap: var(--qmm-space-md); min-width: 0; }
.ht-egg-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--qmm-fs-lg); font-weight: 800; }
.ht-egg-seen { margin-left: auto; white-space: nowrap; font-size: var(--qmm-fs-xs); font-weight: 700; color: var(--qmm-text-dim); }

.ht-section { display: flex; flex-direction: column; gap: var(--qmm-space-sm); }
.ht-note { font-size: var(--qmm-fs-xs); line-height: 1.45; color: var(--qmm-text-dim); }

/* A Bad Luck Protection counter: label | meter | value | head start. */
.ht-row {
  display: grid; grid-template-columns: minmax(96px, 1fr) minmax(70px, 1.5fr) auto auto;
  align-items: center; gap: var(--qmm-space-lg); padding: 2px 0;
}
.ht-row__label { display: flex; align-items: center; gap: var(--qmm-space-sm); min-width: 0; }
.ht-row__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--qmm-fs-md); font-weight: 700; }
.ht-row__rate { white-space: nowrap; font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
.ht-row__value {
  white-space: nowrap; text-align: right; font-size: var(--qmm-fs-sm); font-weight: 700;
  font-variant-numeric: tabular-nums; color: var(--qmm-text-dim);
}
.ht-row__value.is-near { color: var(--qmm-warn-ink); font-weight: 800; }
/* Beats the window's own width for bare number fields. */
.qws-win .ht-row input.ht-offset, .ht-row input.ht-offset { width: 64px; text-align: right; }

/* Per species: Species | Normal | Gold | Rainbow | Total. */
.ht-counts { display: flex; flex-direction: column; gap: 2px; }
.ht-counts__row {
  display: grid; grid-template-columns: minmax(0, 2.2fr) repeat(4, minmax(44px, 1fr));
  align-items: center; gap: var(--qmm-space-sm); padding: 3px var(--qmm-space-sm); border-radius: var(--qmm-radius-sm);
}
.ht-counts__row.is-total { margin-top: var(--qmm-space-xs); background: var(--qmm-paper-deep); }
.ht-counts__head {
  text-align: center; font-size: var(--qmm-fs-xs); font-weight: 900; letter-spacing: .06em; text-transform: uppercase;
  color: var(--qmm-text-dim);
}
.ht-counts__head.is-left { text-align: left; }
.ht-counts__mutation { display: flex; justify-content: center; }
.ht-num { text-align: center; font-size: var(--qmm-fs-md); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--qmm-text-dim); }
.ht-num.is-strong { font-weight: 800; }
.ht-species { display: flex; align-items: center; gap: var(--qmm-space-sm); min-width: 0; }
.ht-species__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--qmm-fs-md); font-weight: 700; }
.ht-species__share { flex: 0 0 auto; white-space: nowrap; font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }

@container (max-width: 460px) {
  .ht-row { grid-template-columns: minmax(0, 1fr) auto auto; row-gap: var(--qmm-space-xs); }
  .ht-row > .qmm-meter { grid-column: 1 / -1; order: 1; }
  .ht-counts__row { grid-template-columns: minmax(0, 1.6fr) repeat(4, minmax(34px, 1fr)); }
  .ht-species__share { display: none; }
}
`;

let installed = false;

export function ensureHatchStyles(): void {
  if (installed) return;
  installed = true;
  addStyle(HATCH_CSS);
}
