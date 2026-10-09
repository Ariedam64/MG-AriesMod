// Rules for the Alerts menu and its rule popover. Colours come from the kit's theme variables.

import { addStyle } from "../../../lib/dom";

const STYLE_ID = "qws-rule-style";

const CSS = `
/* Every tab has the same size, so switching tabs never resizes the window. */
.qws-al-tab {
  display: flex; flex-direction: column; gap: var(--qmm-space-lg);
  width: 560px; max-width: min(100%, calc((100vw - 64px) / var(--qmm-scale, 1)));
  height: 54vh; min-height: 0;
}
.qws-al-scroll {
  display: flex; flex-direction: column; gap: var(--qmm-space-lg);
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 2px;
}
.qws-al-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); }
.qws-al-toolbar .qmm-select { min-width: 0; }
.qws-al-toolbar .qmm-pill { margin-left: auto; }
.qws-al-empty { padding: 28px 12px; text-align: center; font-size: var(--qmm-fs-md); color: var(--qmm-text-dim); }

/* One alert: icon, name and details, then the rule button and the switch. */
.qws-al-list { display: flex; flex-direction: column; gap: var(--qmm-space-sm); }
.qws-al-row {
  display: flex; align-items: center; gap: var(--qmm-space-lg); padding: 8px 10px;
  border-radius: var(--qmm-radius-md); background: var(--qmm-card);
}
.qws-al-row.is-current { box-shadow: inset 0 0 0 2px var(--qmm-accent-border); }
.qws-al-icon {
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 40px;
  width: 40px; height: 40px; border-radius: var(--qmm-radius-sm); background: var(--qmm-paper-deep);
  overflow: hidden; font-size: 26px;
}
.qws-al-text { display: flex; flex-direction: column; gap: 3px; flex: 1 1 auto; min-width: 0; }
.qws-al-name {
  display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--qmm-space-sm); min-width: 0;
  font-size: var(--qmm-fs-lg); font-weight: 800; color: var(--qmm-text);
}
.qws-al-name > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qws-al-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-xs) var(--qmm-space-sm);
  font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim);
}
.qws-al-chip {
  display: inline-flex; align-items: center; padding: 2px 8px; white-space: nowrap;
  border-radius: var(--qmm-radius-pill); background: var(--qmm-sand); color: var(--qmm-text-soft);
  font-size: var(--qmm-fs-xs); font-weight: 800;
}
.qws-al-chip.is-weather { background: var(--qmm-sepia-soft); color: var(--qmm-sepia-ink); }
.qws-al-chip.is-only { background: var(--qmm-warn-soft); color: var(--qmm-warn-ink); }
.qws-al-summary {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--qmm-fs-xs); font-weight: 700; color: var(--qmm-sepia-ink);
}
.qws-al-summary:empty { display: none; }
.qws-al-actions { display: flex; align-items: center; gap: var(--qmm-space-md); flex: 0 0 auto; }

.qws-rule-btn.qmm-btn--icon { width: 32px; height: 32px; border-radius: var(--qmm-radius-sm); font-size: 15px; }
.qws-rule-btn[data-active="1"] {
  background: var(--qmm-sepia-soft); color: var(--qmm-sepia-ink); box-shadow: inset 0 0 0 2px var(--qmm-accent-border);
}

/* Pets. */
.qws-al-pet { display: flex; align-items: center; gap: var(--qmm-space-lg); padding: 8px 10px; border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep); }
.qws-al-pet .qws-al-icon { background: var(--qmm-card); }
.qws-al-pet__body { display: flex; flex-direction: column; gap: var(--qmm-space-sm); flex: 1 1 auto; min-width: 0; }
.qws-al-pet__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; }
.qws-al-pet .qmm-meter { flex: 0 0 auto; width: 100%; min-width: 0; }
.qws-al-pet__value { flex: 0 0 auto; min-width: 40px; text-align: right; font-weight: 900; font-variant-numeric: tabular-nums; }
.qws-al-pet__value.is-low { color: var(--qmm-warn-ink); }
.qws-al-pct { display: inline-flex; align-items: center; gap: var(--qmm-space-sm); font-weight: 800; color: var(--qmm-text-soft); }

/* Cards never grow past the tab, and rows wrap their controls under the title in a narrow window. */
.qws-al-tab .qmm-card, .qws-al-tab .qmm-card__body { grid-template-columns: minmax(0, 1fr); }
.qws-al-tab .qmm-setting-row { flex-wrap: wrap; }
.qws-al-tab .qmm-setting-row__controls { flex: 0 1 auto; min-width: 0; margin-left: auto; }
.qws-al-tab .qmm-range { width: 150px; }
.qws-win .qws-al-tab input.qmm-input-number-input { width: 76px; }
.qws-al-sound-pick { min-width: 0; }
.qws-al-sound-pick .qmm-select { flex: 0 1 170px; width: 170px; min-width: 0; }
.qws-al-ctx { display: flex; flex-direction: column; gap: var(--qmm-space-md); }

.qws-al-drop {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  padding: 16px; text-align: center; cursor: pointer;
  border: 2px dashed var(--qmm-border-hover); border-radius: var(--qmm-radius-lg); background: var(--qmm-paper-deep);
  transition: border-color 150ms ease, background 150ms ease;
}
.qws-al-drop.is-active, .qws-al-drop:focus-visible {
  outline: none; border-color: var(--qmm-accent-border-hover); background: var(--qmm-accent-soft);
}
.qws-al-drop__title { font-size: var(--qmm-fs-lg); font-weight: 900; color: var(--qmm-text); }
.qws-al-drop__hint { font-size: var(--qmm-fs-sm); color: var(--qmm-text-soft); }
.qws-al-drop__formats { font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }

.qws-al-sound {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-sm) var(--qmm-space-md);
  padding: 8px 10px; border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.qws-al-sound__name {
  flex: 1 1 120px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800;
}
.qws-al-sound__uses { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-xs); margin-left: auto; }
.qws-al-sound__label { margin-right: 2px; font-size: var(--qmm-fs-xs); font-weight: 800; color: var(--qmm-text-dim); }

/* The custom rule popover, outside any window. */
.qws-rule-popover {
  position: fixed; z-index: 99999999999999;
  display: flex; flex-direction: column; gap: var(--qmm-space-lg);
  width: 290px; max-width: calc(100vw - 24px); padding: 14px; box-sizing: border-box;
  border: 3px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-lg);
  background: var(--qmm-paper); box-shadow: var(--qmm-shadow-raise); color: var(--qmm-text);
  font-family: var(--qmm-font); font-size: var(--qmm-fs-md);
}
.qws-rule-head { display: flex; align-items: flex-start; gap: var(--qmm-space-lg); cursor: move; user-select: none; touch-action: none; }
.qws-rule-head__titles { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.qws-rule-head__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--qmm-fs-xl); font-weight: 900; }
.qws-rule-popover .qws-rule-field { display: grid; gap: var(--qmm-space-sm); }
.qws-rule-field__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--qmm-space-md); }
.qws-rule-field__label { font-size: var(--qmm-fs-sm); font-weight: 800; color: var(--qmm-text-soft); }
.qws-rule-popover .qmm-select, .qws-rule-popover .qmm-input--sm { width: 100%; box-sizing: border-box; }
.qws-rule-inline { display: flex; align-items: center; gap: var(--qmm-space-md); }
.qws-rule-inline .qws-pnl-range { flex: 1 1 auto; min-width: 0; }
.qws-rule-popover .qmm-select:disabled { opacity: .6; cursor: default; }
.qws-rule-hint { font-size: var(--qmm-fs-xs); line-height: 1.4; color: var(--qmm-text-dim); }
.qws-rule-popover .qws-rule-actions { display: flex; justify-content: space-between; gap: var(--qmm-space-md); }
`;

export function ensureMenuStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  addStyle(CSS).id = STYLE_ID;
}
