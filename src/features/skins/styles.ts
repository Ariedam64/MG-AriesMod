// Rules for the Skins menu. Colours come from the kit's theme variables; the
// sprite grid cells are the kit's own `.qws-pnl-cell`, softened here.

import { addStyle } from "../../lib/dom";

const SKINS_CSS = `
.qws-skins {
  container: qws-skins / inline-size;
  display: flex; flex-direction: column; gap: var(--qmm-space-lg);
  width: min(820px, calc((100vw - 48px) / var(--qmm-scale, 1)));
  height: min(620px, calc(72vh / var(--qmm-scale, 1)));
  padding: var(--qmm-space-xl); box-sizing: border-box; overflow: hidden;
  background: var(--qmm-paper);
}
.qws-skins > .qmm-setting-row { flex: 0 0 auto; }
.qws-skins .qmm-error { padding: 8px 10px; font-size: var(--qmm-fs-sm); }

.qws-skins__notice {
  display: flex; flex-direction: column; gap: 2px; flex: 0 0 auto; padding: 8px 12px;
  border-radius: var(--qmm-radius-md); background: var(--qmm-warn-soft); color: var(--qmm-warn-ink);
  font-size: var(--qmm-fs-sm); font-weight: 700; line-height: 1.4;
}

.qws-skins__panes {
  display: grid; grid-template-columns: minmax(0, 1fr) 316px; gap: var(--qmm-space-lg);
  flex: 1 1 auto; min-height: 0;
}
@container qws-skins (max-width: 600px) {
  .qws-skins__panes { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 3fr) minmax(0, 2fr); }
}
.qws-skins__pane { overflow: hidden; padding: var(--qmm-space-lg); gap: var(--qmm-space-lg); }
@container qws-skins (max-width: 360px) {
  .qws-skins__pane { padding: var(--qmm-space-md); gap: var(--qmm-space-md); }
}

.qws-skins__filters { display: flex; flex-wrap: wrap; gap: var(--qmm-space-md); flex: 0 0 auto; }
.qws-skins__search { flex: 1 1 100px; min-width: 0; }
.qws-skins__category { flex: 0 1 120px; min-width: 0; }

.qws-skins__grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: var(--qmm-space-md);
  align-content: start; flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 2px 4px 2px 2px;
}
.qws-skins__grid .qws-pnl-cell {
  flex-direction: column; gap: var(--qmm-space-xs); aspect-ratio: auto; min-width: 0;
  padding: var(--qmm-space-md) var(--qmm-space-xs) var(--qmm-space-sm);
  border: 2px solid transparent; border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
  font: inherit; color: inherit;
}
.qws-skins__grid .qws-pnl-cell:hover { border-color: var(--qmm-border-hover); }
.qws-skins__grid .qws-pnl-cell:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 1px; }
.qws-skins__grid .qws-pnl-cell.is-active { border-color: var(--qmm-sepia); background: var(--qmm-sepia-soft); }
.qws-skins__grid .qws-pnl-cell.is-skinned::after { width: 8px; height: 8px; }
.qws-skins-cell__art { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; }
.qws-skins-cell__name {
  max-width: 100%; font-size: var(--qmm-fs-xs); font-weight: 700; color: var(--qmm-text-soft);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qws-skins__grid .is-active .qws-skins-cell__name { color: var(--qmm-sepia-ink); }

.qws-skins__empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--qmm-space-xs);
  padding: 32px 12px; text-align: center;
}
.qws-skins__grid > .qws-skins__empty { grid-column: 1 / -1; }
.qws-skins__empty-title { font-size: var(--qmm-fs-lg); font-weight: 800; color: var(--qmm-text-soft); }
.qws-skins__empty-hint { font-size: var(--qmm-fs-sm); line-height: 1.45; color: var(--qmm-text-dim); }

.qws-skins__foot {
  display: flex; align-items: center; justify-content: space-between; gap: var(--qmm-space-md);
  flex: 0 0 auto; min-height: 30px; font-size: var(--qmm-fs-xs); font-weight: 700; color: var(--qmm-text-dim);
}

.qws-skins-detail { display: flex; flex-direction: column; gap: var(--qmm-space-lg); flex: 1 1 auto; min-height: 0; }
.qws-skins-detail > .qws-skins__empty { flex: 1 1 auto; justify-content: center; }
.qws-skins-detail__head { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.qws-skins-detail__title {
  font-size: var(--qmm-fs-xl); font-weight: 900; color: var(--qmm-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qws-skins-detail__sub { font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
.qws-skins-detail__notice {
  padding: 8px 10px; border-radius: var(--qmm-radius-md); font-size: var(--qmm-fs-sm); line-height: 1.45;
  color: var(--qmm-warn-ink); background: var(--qmm-warn-soft);
}
.qws-skins-detail__list {
  display: flex; flex-direction: column; gap: var(--qmm-space-md); overflow-y: auto; min-height: 0; padding-right: 2px;
}

.qws-skins-slot {
  display: flex; flex-direction: column; gap: var(--qmm-space-md); flex: 0 0 auto; padding: var(--qmm-space-md) 10px;
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.qws-skins-slot__head { display: flex; align-items: center; gap: var(--qmm-space-md); min-width: 0; }
.qws-skins-slot__text { display: flex; flex-direction: column; gap: 1px; flex: 1 1 auto; min-width: 0; }
.qws-skins-slot__name {
  font-size: var(--qmm-fs-sm); font-weight: 800; color: var(--qmm-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qws-skins-slot__dims { font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); white-space: nowrap; }
.qws-skins-slot__head .qmm-badge { align-self: center; flex: 0 0 auto; }
.qws-skins-slot__body { display: flex; align-items: center; gap: var(--qmm-space-sm); }
.qws-skins-slot__arrow { font-size: var(--qmm-fs-md); color: var(--qmm-text-dim); }
.qws-skins-slot__spacer { flex: 1 1 auto; }
.qws-skins-slot__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: var(--qmm-space-xs); flex: 0 1 auto; }
.qws-skins-slot__remove { width: 30px; padding: 7px 0; }
.qws-skins-slot__remove:hover { background: var(--qmm-danger-soft); color: var(--qmm-danger-ink); }

.qws-skins-thumb {
  display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 50px; height: 50px;
  box-sizing: border-box; border-radius: var(--qmm-radius-sm); background: var(--qmm-card);
}
button.qws-skins-thumb {
  padding: 0; border: 2px dashed var(--qmm-border-hover); font: inherit; color: var(--qmm-text-dim); cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
button.qws-skins-thumb.is-filled { border-style: solid; border-color: transparent; }
button.qws-skins-thumb:hover { border-color: var(--qmm-sepia); color: var(--qmm-sepia-ink); background: var(--qmm-sepia-soft); }
button.qws-skins-thumb:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 1px; }
button.qws-skins-thumb.is-busy { opacity: .6; pointer-events: none; }
.qws-skins-thumb__plus { font-size: 20px; font-weight: 800; line-height: 1; }
`;

let injected = false;

export function ensureSkinsStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(SKINS_CSS);
}
