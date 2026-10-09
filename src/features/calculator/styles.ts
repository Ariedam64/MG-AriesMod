// Rules for the Calculator menu. Colours come from the kit's theme variables.

import { addStyle } from "../../lib/dom";

const CALCULATOR_CSS = `
.qws-calc {
  container-type: inline-size;
  width: min(720px, calc((100vw - 64px) / var(--qmm-scale, 1)));
  height: calc(68vh / var(--qmm-scale, 1));
  box-sizing: border-box;
}
.qws-calc__layout {
  display: grid; grid-template-columns: minmax(180px, 240px) minmax(0, 1fr); gap: var(--qmm-space-xl);
  height: 100%; min-height: 0;
}
.qws-calc__list { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.qws-calc__list > .qmm-vtabs { flex: 1 1 auto; min-height: 0; }
.qws-calc__detail {
  display: flex; flex-direction: column; gap: var(--qmm-space-lg); min-width: 0; min-height: 0;
  overflow: auto; padding-right: var(--qmm-space-xs);
}
.qws-calc__detail > * { flex-shrink: 0; }
/* The kit's cards are grids: without this, a row of options sets their minimum width. */
.qws-calc__detail .qmm-card, .qws-calc__detail .qmm-card__body { grid-template-columns: minmax(0, 1fr); }

.qws-calc-item__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qws-calc-icon { display: inline-flex; align-items: center; justify-content: center; }

.qmm-card.qws-calc-hero { gap: var(--qmm-space-xl); padding: 14px; }
.qws-calc-hero__top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-xl); }
.qws-calc-stage {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  width: 116px; height: 116px; border-radius: var(--qmm-radius-xl); background: var(--qmm-paper-deep);
}
.qws-calc-summary { display: flex; flex-direction: column; gap: var(--qmm-space-xs); flex: 1 1 120px; min-width: 0; }
.qws-calc-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--qmm-fs-xl); font-weight: 900; color: var(--qmm-text);
}
.qws-calc-price {
  display: flex; align-items: center; gap: var(--qmm-space-md);
  font-size: 24px; font-weight: 900; line-height: 1.15; color: var(--qmm-gold-ink); font-variant-numeric: tabular-nums;
}
.qws-calc-price img { flex: 0 0 auto; width: 22px; height: 22px; pointer-events: none; user-select: none; }
.qws-calc-weight { font-size: var(--qmm-fs-sm); font-weight: 700; color: var(--qmm-text-dim); font-variant-numeric: tabular-nums; }
.qws-calc-size { display: flex; align-items: center; gap: var(--qmm-space-lg); }
.qws-calc-size__label { font-size: var(--qmm-fs-sm); font-weight: 800; color: var(--qmm-text-soft); }
.qws-calc-size > .qws-pnl-range { flex: 1 1 auto; min-width: 0; }
.qws-calc-size > .qmm-pill { min-width: 4ch; justify-content: center; font-variant-numeric: tabular-nums; }

.qws-calc-sprite { position: relative; display: inline-flex; flex-shrink: 0; transform-origin: center; }
.qws-calc-sprite__fallback, .qws-calc-sprite__layer {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
}
.qws-calc-sprite__fallback { z-index: 0; font-size: 42px; }
.qws-calc-sprite__layer { z-index: 1; }
.qws-calc-sprite.has-sprite .qws-calc-sprite__fallback { opacity: 0; }

.qws-calc-pick { display: flex; flex-direction: column; gap: var(--qmm-space-sm); }
.qws-calc-pick__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--qmm-space-md); font-size: var(--qmm-fs-sm); }
.qws-calc-pick__label { font-weight: 800; color: var(--qmm-text-soft); }
.qws-calc-pick__value { font-weight: 700; color: var(--qmm-text-dim); }

.qws-calc-seg { --seg-pad: 4px; }
.qws-calc-seg .qmm-seg__btn { flex: 1 1 0; min-width: 0; display: flex; justify-content: center; padding: 6px 4px; font-size: var(--qmm-fs-sm); }
.qws-calc-seg .qmm-seg__btn-label { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.qws-calc-seg__icon { display: block; width: 20px; height: 20px; margin: 0 auto; object-fit: contain; }

.qws-calc-empty {
  margin: auto; max-width: 260px; padding: var(--qmm-space-xl);
  text-align: center; font-size: var(--qmm-fs-md); line-height: 1.5; color: var(--qmm-text-dim);
}
.qws-calc-credit {
  margin-top: auto; padding: var(--qmm-space-xs) 0;
  text-align: center; font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim);
}
.qws-calc-credit a { color: var(--qmm-sepia-ink); font-weight: 800; text-decoration: underline; }

/* A narrow window stacks the list above the crop. Last, so it wins over the rules above. */
@container (max-width: 520px) {
  .qws-calc__layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: 176px minmax(0, 1fr); gap: var(--qmm-space-lg); }
  .qws-calc-stage { width: 100px; height: 100px; }
  .qws-calc-seg .qmm-seg__btn { padding: 6px 1px; font-size: var(--qmm-fs-xs); }
}
`;

let injected = false;

export function ensureCalculatorStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(CALCULATOR_CSS);
}
