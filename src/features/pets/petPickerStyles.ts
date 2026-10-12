// Rules for the pet picker popup. Colours come from the kit's theme variables.

import { addStyle } from "../../lib/dom";

const PET_PICKER_CSS = `
.pt-pick-body { display: flex; flex-direction: column; gap: var(--qmm-space-lg); padding-top: 0; }
.pt-pick-tools {
  position: sticky; top: 0; z-index: 1; display: flex; flex-direction: column; gap: var(--qmm-space-md);
  padding: var(--qmm-space-md) 0 var(--qmm-space-lg); background: var(--qmm-paper);
}
.pt-pick-subtitle { font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); }
.pt-pick-search { width: 100%; box-sizing: border-box; }

.pt-pick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: var(--qmm-space-md); }
.pt-pick-card {
  position: relative; display: flex; align-items: center; gap: var(--qmm-space-lg); min-width: 0;
  padding: 10px 12px; text-align: left; font: inherit; color: var(--qmm-text); cursor: pointer;
  background: var(--qmm-card); border: 2px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-lg);
  transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}
.pt-pick-card:hover { border-color: var(--qmm-accent-border); transform: translateY(-1px); box-shadow: 0 3px 0 var(--qmm-sand-shade); }
.pt-pick-card:active { transform: translateY(1px); box-shadow: none; }
.pt-pick-card:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
.pt-pick-card__text { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 auto; padding-right: 44px; }
.pt-pick-card__name { font-weight: 900; font-size: var(--qmm-fs-lg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-pick-card__species {
  display: flex; align-items: center; gap: var(--qmm-space-xs); min-width: 0;
  font-size: var(--qmm-fs-sm); color: var(--qmm-text-soft); white-space: nowrap; overflow: hidden;
}
.pt-pick-card__meta { display: flex; align-items: center; gap: var(--qmm-space-md); flex-wrap: wrap; }
.pt-pick-card__str { font-size: var(--qmm-fs-xs); font-weight: 800; color: var(--qmm-text-dim); }
.pt-pick-card__str.is-max { color: var(--qmm-gold-ink); }
.pt-pick-card__where {
  position: absolute; top: 8px; right: 8px; padding: 2px 8px; border-radius: var(--qmm-radius-pill);
  font-size: var(--qmm-fs-xs); font-weight: 800; color: var(--qmm-text-soft); background: var(--qmm-sand);
}
.pt-pick-card__where.is-active { color: var(--qmm-ok-ink); background: var(--qmm-ok-soft); }
.pt-pick-card__where.is-hutch { color: var(--qmm-sepia-ink); background: var(--qmm-sepia-soft); }

.pt-pick-empty {
  grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 28px 12px; text-align: center; border-radius: var(--qmm-radius-lg); background: var(--qmm-paper-deep);
}
.pt-pick-empty__title { font-weight: 900; }
.pt-pick-empty__hint { font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); }
.pt-pick-status { display: flex; justify-content: flex-end; width: 100%; }
`;

let installed = false;

export function ensurePetPickerStyles(): void {
  if (installed) return;
  installed = true;
  addStyle(PET_PICKER_CSS);
}
