// Rules for the Settings menu. Colours come from the kit's theme variables.

import { addStyle } from "../../lib/dom";

const SETTINGS_CSS = `
.qws-set-tab { display: flex; flex-direction: column; gap: var(--qmm-space-lg); }
.qws-set-stack { display: flex; flex-direction: column; gap: var(--qmm-space-lg); }
.qws-set-end { display: flex; justify-content: flex-end; }
.qws-set-note { font-size: var(--qmm-fs-md); line-height: 1.5; color: var(--qmm-text-soft); }
.qws-set-empty {
  padding: var(--qmm-space-lg); text-align: center;
  font-size: var(--qmm-fs-md); color: var(--qmm-text-dim);
}

.qws-set-status {
  padding: var(--qmm-space-md) var(--qmm-space-lg); border-radius: var(--qmm-radius-md);
  font-size: var(--qmm-fs-sm); font-weight: 700; line-height: 1.4;
  background: var(--qmm-paper-deep); color: var(--qmm-text-soft);
}
.qws-set-status.is-ok { background: var(--qmm-ok-soft); color: var(--qmm-ok-ink); }
.qws-set-status.is-error { background: var(--qmm-danger-soft); color: var(--qmm-danger-ink); }

.qws-set-save { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); }
.qws-set-save > .qmm-input { flex: 1 1 110px; min-width: 0; }
.qws-set-backups { display: flex; flex-direction: column; gap: var(--qmm-space-sm); }
.qws-set-backup { flex-wrap: wrap; row-gap: var(--qmm-space-md); }
.qws-set-backup .qmm-setting-row__text { flex: 1 1 120px; }
.qws-set-backup .qmm-setting-row__title { font-size: var(--qmm-fs-md); overflow-wrap: anywhere; }
.qws-set-backup .qmm-setting-row__controls { margin-left: auto; }
.qws-set-backup__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--qmm-space-xs); }

.qws-set-drop {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--qmm-space-xs);
  width: 100%; min-height: 88px; padding: var(--qmm-space-xl); box-sizing: border-box; text-align: center; cursor: pointer;
  border-radius: var(--qmm-radius-lg); border: 2px dashed var(--qmm-border-hover); background: var(--qmm-paper-deep);
  transition: border-color 120ms ease, background 120ms ease;
}
.qws-set-drop.is-active, .qws-set-drop:focus-visible {
  outline: none; border-color: var(--qmm-accent-border-hover); background: var(--qmm-accent-soft);
}
.qws-set-drop__title { font-size: var(--qmm-fs-lg); font-weight: 800; color: var(--qmm-text); }
.qws-set-drop__hint { font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); overflow-wrap: anywhere; }

.qws-set-hero {
  display: flex; flex-direction: column; align-items: center; gap: var(--qmm-space-sm);
  padding: var(--qmm-space-lg) 0 var(--qmm-space-md); text-align: center;
}
.qws-set-hero__title { font-size: 20px; font-weight: 900; letter-spacing: .01em; color: var(--qmm-text); }
.qws-set-hero__sub { font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); }
.qws-set-facts { display: flex; flex-direction: column; gap: var(--qmm-space-md); margin: 0; }
.qws-set-facts__row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--qmm-space-lg); }
.qws-set-facts__label { margin: 0; flex: 0 0 auto; font-size: var(--qmm-fs-md); color: var(--qmm-text-dim); }
.qws-set-facts__value {
  margin: 0; min-width: 0; text-align: right; overflow-wrap: anywhere;
  font-size: var(--qmm-fs-md); font-weight: 800; color: var(--qmm-text);
}
.qws-set-link-btn { align-self: flex-start; text-decoration: none; }
.qws-set-link-btn:hover { text-decoration: none; }

.qws-set-themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: var(--qmm-space-md); }
.qws-set-theme {
  display: flex; flex-direction: column; align-items: center; gap: var(--qmm-space-sm); padding: var(--qmm-space-sm); cursor: pointer;
  font: inherit; color: var(--qmm-text); background: var(--qmm-card);
  border: 2px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-md);
  transition: border-color 120ms ease;
}
.qws-set-theme:hover { border-color: var(--qmm-border-hover); }
.qws-set-theme:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
.qws-set-theme.is-active { border-color: var(--qmm-sepia); box-shadow: 0 0 0 2px var(--qmm-accent-border); }
.qws-set-theme__preview {
  position: relative; display: block; width: 100%; height: 50px; overflow: hidden;
  border: 2px solid; border-radius: var(--qmm-radius-sm); box-sizing: border-box;
}
.qws-set-theme__band { position: absolute; inset: 0 0 auto 0; height: 12px; }
.qws-set-theme__text { position: absolute; left: 7px; bottom: 5px; font-weight: 900; font-size: var(--qmm-fs-lg); }
.qws-set-theme__chip { position: absolute; right: 7px; bottom: 9px; width: 22px; height: 11px; border-radius: 6px; }
.qws-set-theme__label { font-size: var(--qmm-fs-sm); font-weight: 800; }

.qws-set-tune .qmm-setting-row { flex-wrap: wrap; row-gap: var(--qmm-space-md); }
.qws-set-tune .qmm-setting-row__text { flex: 1 1 140px; }
.qws-set-tune .qmm-setting-row__controls { margin-left: auto; }
.qws-set-size > .qws-pnl-range { flex: 1 0 100%; }
.qws-set-color {
  width: 44px; height: 32px; padding: 3px; cursor: pointer; box-sizing: border-box;
  border: 2px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-sm); background: var(--qmm-card);
}
.qws-set-color:hover { border-color: var(--qmm-border-hover); }
.qws-set-color:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
.qws-set-color::-webkit-color-swatch-wrapper { padding: 0; }
.qws-set-color::-webkit-color-swatch { border: 0; border-radius: 4px; }
.qws-set-color::-moz-color-swatch { border: 0; border-radius: 4px; }
`;

let injected = false;

export function ensureSettingsStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(SETTINGS_CSS);
}
