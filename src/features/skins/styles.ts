// Rules for the Skins menu. Colours come from the kit's theme variables; the
// sprite grid cells are the kit's own `.qws-pnl-cell`.

import { addStyle } from "../../lib/dom";

const SKINS_CSS = `
.qws-skins {
  display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 12px; padding: 14px;
  width: 820px; max-width: 100%; height: min(72vh, 620px); overflow: hidden; box-sizing: border-box;
  background: var(--qmm-gradient-panel);
}
.qws-skins > .qmm-card { overflow: hidden; }
.qws-skins__header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.qws-skins__enable { display: flex; align-items: center; gap: 8px; }
.qws-skins__filters { display: flex; gap: 8px; }
.qws-skins__category { flex: 0 0 auto; max-width: 150px; }
.qws-skins__search { flex: 1 1 auto; min-width: 0; }
.qws-skins__grid {
  display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  overflow-y: auto; min-height: 0; flex: 1 1 auto; align-content: start; padding-right: 2px;
}
.qws-skins__empty { grid-column: 1 / -1; padding: 24px 0; text-align: center; font-size: 12px; color: var(--qmm-text-dim); }
.qws-skins__status { min-height: 15px; font-size: 11px; color: var(--qmm-text-dim); }
.qws-skins__status.is-warn { color: var(--qmm-warn); }
.qws-skins__error { font-size: 11px; color: var(--qmm-danger); }
.qws-skins__error[hidden] { display: none; }
.qws-skins__detail-host { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }

.qws-skins-detail { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.qws-skins-detail__empty { padding: 28px 0; text-align: center; font-size: 12px; color: var(--qmm-text-dim); }
.qws-skins-detail__notice {
  padding: 8px; border-radius: 9px; font-size: 11px; line-height: 1.45;
  color: var(--qmm-warn); background: var(--qmm-warn-soft); border: 1px solid var(--qmm-warn-border);
}
.qws-skins-detail__title {
  font-size: 14px; font-weight: 600; color: var(--qmm-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qws-skins-detail__list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; min-height: 0; }

.qws-skins-slot {
  display: flex; flex-direction: column; gap: 8px; padding: 8px;
  border-radius: 10px; background: var(--qmm-card-bg); border: 1px solid var(--qmm-border);
}
.qws-skins-slot__head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.qws-skins-slot__name {
  flex: 1 1 auto; min-width: 0; font-size: 11px; color: var(--qmm-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qws-skins-slot__head .qmm-badge { align-self: center; flex: 0 0 auto; }
.qws-skins-slot__body { display: flex; align-items: center; gap: 8px; }
.qws-skins-slot__arrow { font-size: 12px; color: var(--qmm-text-dim); }
.qws-skins-slot__dims { font-size: 10px; color: var(--qmm-text-dim); white-space: nowrap; }
.qws-skins-slot__spacer { flex: 1 1 auto; }
.qws-skins-slot__actions { display: flex; flex: 0 0 auto; gap: 5px; }
.qws-skins-thumb {
  display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 54px; height: 54px;
  border-radius: 9px; background: var(--qmm-field-bg); border: 1px solid var(--qmm-border);
}
.qws-skins-thumb__plus { font-size: 18px; color: var(--qmm-text-dim); }
`;

let injected = false;

export function ensureSkinsStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(SKINS_CSS);
}
