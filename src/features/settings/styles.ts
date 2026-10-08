// Rules for the Settings menu. Colours come from the kit's theme variables.

import { addStyle } from "../../lib/dom";

const SETTINGS_CSS = `
.qws-set-tab { display: flex; flex-direction: column; gap: 12px; }
.qws-set-card-body { display: flex; flex-direction: column; gap: 10px; }
.qws-set-status { min-height: 18px; font-size: 13px; opacity: .9; }
.qws-set-status.is-ok { color: var(--qmm-accent); }
.qws-set-status.is-error { color: var(--qmm-danger); }

.qws-set-drop {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  width: 100%; min-height: 110px; padding: 18px 22px; box-sizing: border-box; text-align: center; cursor: pointer;
  border-radius: 14px; border: 1px dashed var(--qmm-border-hover); background: var(--qmm-field-bg);
  transition: border-color .2s ease, background .2s ease, box-shadow .2s ease;
}
.qws-set-drop.is-active, .qws-set-drop:focus-visible {
  outline: none; border-color: var(--qmm-accent-border-hover); background: var(--qmm-accent-soft);
  box-shadow: 0 0 0 3px var(--qmm-accent-soft);
}
.qws-set-drop__title { font-size: 14px; font-weight: 600; letter-spacing: .02em; }
.qws-set-drop__hint { font-size: 12px; opacity: .75; }

.qws-set-row { display: flex; align-items: center; gap: 8px; }
.qws-set-row > .qmm-input { flex: 1; }
.qws-set-list { display: flex; flex-direction: column; gap: 10px; }
.qws-set-empty { opacity: .6; }
.qws-set-backup {
  display: flex; flex-direction: column; gap: 6px; padding: 10px;
  border-radius: 8px; border: 1px solid var(--qmm-border); background: var(--qmm-card-bg);
}
.qws-set-backup__head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.qws-set-backup__name { font-size: 13px; font-weight: 600; }
.qws-set-backup__date { font-size: 11px; opacity: .65; }
.qws-set-backup__actions { display: flex; flex-wrap: wrap; gap: 6px; }

.qws-set-hero { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 0 14px; text-align: center; }
.qws-set-hero__title { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; color: var(--qmm-text); }
.qws-set-hero__sub { margin-top: 2px; font-size: 11px; color: var(--qmm-text-dim); }
.qws-set-sep { height: 1px; margin: 0 0 12px; background: var(--qmm-border); }
.qws-set-grid {
  display: flex; flex-direction: column; margin-bottom: 14px; overflow: hidden;
  border-radius: 10px; border: 1px solid var(--qmm-border);
}
.qws-set-grid__row { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; font-size: 12px; }
.qws-set-grid__row:nth-child(odd) { background: var(--qmm-card-bg); }
.qws-set-grid__label { color: var(--qmm-text-dim); }
.qws-set-grid__value { font-weight: 600; color: var(--qmm-text); }
.qws-set-support {
  display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px 12px;
  border-radius: 10px; border: 1px solid var(--qmm-border); background: var(--qmm-card-bg);
}
.qws-set-support__text { font-size: 12px; line-height: 1.5; text-align: center; color: var(--qmm-text-soft); }
.qws-set-kofi { display: inline-block; border: 0; transition: opacity .15s ease, transform .15s ease; }
.qws-set-kofi:hover { opacity: .82; transform: translateY(-2px); }
.qws-set-kofi img { display: block; height: 36px; border: 0; }
`;

let injected = false;

export function ensureSettingsStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(SETTINGS_CSS);
}
