// Rules for the deleter section card and its picker popup. Colours come from
// the kit's `--qmm-*` variables, so they follow the theme.

import { addStyle } from "../../lib/dom";

const DELETER_CSS = `
.qws-del-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.qws-del-head__text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.qws-del-head__desc { font-size: var(--qmm-fs-sm); line-height: 1.45; color: var(--qmm-text-dim); }

.qws-del-stats { display: flex; gap: 6px; margin-bottom: 8px; }
.qws-del-stat {
  flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 4px; border-radius: 10px; background: var(--qmm-card-bg); border: 1px solid var(--qmm-border);
}
.qws-del-stat__value { font-size: 19px; font-weight: 700; line-height: 1.1; color: var(--qmm-text); }
.qws-del-stat__value.is-warn { color: var(--qmm-warn); }
.qws-del-stat__caption {
  font-size: 9.5px; color: var(--qmm-text-dim); text-transform: uppercase; letter-spacing: .06em; white-space: nowrap;
}

.qws-del-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.qws-del-chip {
  display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 3px 8px 3px 4px;
  border-radius: var(--qmm-radius-pill); border: 1px solid var(--qmm-border); background: var(--qmm-card-bg);
  font-size: var(--qmm-fs-sm); color: var(--qmm-text);
}
.qws-del-chip--more { padding: 3px 10px; border-style: dashed; background: none; color: var(--qmm-text-dim); }
.qws-del-chip__icon {
  width: 22px; height: 22px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
  font-size: 13px;
}
.qws-del-chip__name { max-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qws-del-chip__qty { flex: 0 0 auto; font-weight: 600; color: var(--qmm-accent); }
.qws-del-hint { font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); }

.qws-del-estimate { min-height: 14px; margin-bottom: 10px; font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); }

.qws-del-progress { display: none; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.qws-del-progress__line { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--qmm-text); }
.qws-del-progress__target { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qws-del-progress__count { flex: 0 0 auto; color: var(--qmm-text-dim); }
.qws-del-section.is-running .qws-del-progress { display: flex; }
.qws-del-section.is-running .qws-del-stats,
.qws-del-section.is-running .qws-del-chips { display: none; }

.qws-del-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
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
  border-radius: 10px; border: 1px solid var(--qmm-border); background: var(--qmm-card-bg);
}
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
