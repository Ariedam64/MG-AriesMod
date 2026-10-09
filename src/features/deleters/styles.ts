// Rules for the deleter section card and its picker popup. Colours come from
// the kit's `--qmm-*` variables, so they follow the theme.

import { addStyle } from "../../lib/dom";

const DELETER_CSS = `
.qws-del-empty {
  display: flex; align-items: center; gap: var(--qmm-space-lg); padding: 10px 12px;
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.qws-del-empty__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.qws-del-empty__title { font-size: var(--qmm-fs-lg); font-weight: 800; color: var(--qmm-text); }
.qws-del-empty__hint { font-size: var(--qmm-fs-xs); line-height: 1.4; color: var(--qmm-text-dim); }

.qws-del-selection {
  display: flex; flex-direction: column; gap: var(--qmm-space-md); padding: 10px 12px;
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.qws-del-totals { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--qmm-space-sm) var(--qmm-space-md); }
.qws-del-totals__value { font-size: var(--qmm-fs-xl); font-weight: 900; color: var(--qmm-text); }
.qws-del-totals__groups { font-size: var(--qmm-fs-sm); font-weight: 700; color: var(--qmm-text-soft); }
.qws-del-totals .qmm-pill { align-self: center; padding: 2px 8px; font-size: var(--qmm-fs-xs); }

.qws-del-chips { display: flex; flex-wrap: wrap; gap: var(--qmm-space-xs); }
.qws-del-chip {
  display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 3px 9px 3px 4px;
  border-radius: var(--qmm-radius-pill); background: var(--qmm-card);
  font-size: var(--qmm-fs-sm); font-weight: 700; color: var(--qmm-text);
}
.qws-del-chip--more { padding: 3px 10px; background: var(--qmm-sand); color: var(--qmm-text-soft); }
.qws-del-chip__icon {
  width: 22px; height: 22px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--qmm-fs-md);
}
.qws-del-chip__name { max-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qws-del-chip__qty { flex: 0 0 auto; font-weight: 900; color: var(--qmm-sepia-ink); }

.qws-del-estimate { font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
.qws-del-estimate:empty { display: none; }

.qws-del-progress {
  display: flex; flex-direction: column; gap: var(--qmm-space-sm); padding: 10px 12px;
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.qws-del-progress__line { display: flex; align-items: center; gap: var(--qmm-space-md); font-size: var(--qmm-fs-sm); font-weight: 700; color: var(--qmm-text); }
.qws-del-progress__target { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qws-del-progress__count { flex: 0 0 auto; color: var(--qmm-text-dim); font-variant-numeric: tabular-nums; }

.qws-del-actions { display: flex; align-items: center; gap: var(--qmm-space-sm); flex-wrap: wrap; }
.qws-del-spacer { flex: 1 1 auto; }

.qws-del-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.qws-del-search { flex: 1 1 160px; min-width: 120px; }
.qws-del-list { display: flex; flex-direction: column; gap: 4px; }
.qws-del-note { padding: 14px; text-align: center; font-size: var(--qmm-fs-md); color: var(--qmm-text-dim); }
.qws-del-footer { display: flex; align-items: center; gap: 8px; }
.qws-del-summary { flex: 1; min-width: 0; font-size: var(--qmm-fs-md); color: var(--qmm-text-dim); }
.qws-del-summary.is-error { color: var(--qmm-danger); }

.qws-del-row {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer;
  border-radius: var(--qmm-radius-md); border: 2px solid transparent; background: var(--qmm-card-bg);
  transition: border-color 120ms ease, background 120ms ease;
}
.qws-del-row:hover { border-color: var(--qmm-border-hover); }
.qws-del-row.is-selected { border-color: var(--qmm-accent-border); background: var(--qmm-accent-soft); }
.qws-del-row__icon {
  width: 36px; height: 36px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
  font-size: 22px; line-height: 1;
}
.qws-del-row__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.qws-del-row__name { font-size: 12.5px; color: var(--qmm-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qws-del-row__detail { font-size: 10.5px; color: var(--qmm-text-dim); }
.qws-del-amount { width: 66px; flex: 0 0 auto; text-align: right; }
`;

let injected = false;

export function ensureDeleterStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(DELETER_CSS);
}
