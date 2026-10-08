// The locker menu's own layout rules, on top of the kit's components and
// colour variables.

import { addStyle } from "../../lib/dom";

const LOCKER_MENU_CSS = `
.lk-settings [hidden], .lk-restrictions [hidden], .lk-overrides [hidden] { display: none !important; }
.lk-view { max-height: 54vh; overflow: auto; }
.lk-column { display: flex; flex-direction: column; align-items: center; gap: var(--qmm-space-xl); width: 100%; }
.lk-wide { width: min(760px, 100%); }
.lk-hint { font-size: var(--qmm-fs-md); color: var(--qmm-text-soft); text-align: center; }
.lk-warning { font-size: var(--qmm-fs-md); font-weight: 600; color: var(--qmm-warn); text-align: center; }
.lk-empty { font-size: var(--qmm-fs-md); color: var(--qmm-text-dim); text-align: center; }
.lk-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; line-height: 1; }

.lk-settings { display: flex; flex-direction: column; gap: var(--qmm-space-xl); width: min(760px, 100%); }
.lk-settings.is-disabled { opacity: .55; }
.lk-settings .qmm-card { text-align: center; }
.lk-settings .qmm-card__header { justify-content: center; }
.lk-settings .qmm-card__body { justify-items: center; }
.lk-slider { width: min(420px, 100%); }
.lk-values { display: flex; justify-content: space-between; gap: 16px; width: min(420px, 100%); }
.lk-value { display: flex; align-items: center; gap: var(--qmm-space-sm); }
.lk-color { min-width: 92px; }
.lk-color .label { font-weight: 700; letter-spacing: .3px; }
.lk-color--gold .label, .lk-color--rainbow .label {
  background-clip: text; -webkit-background-clip: text; color: transparent; text-shadow: 0 0 6px rgba(0,0,0,.35);
}
.lk-color--gold .label { background-image: linear-gradient(120deg, #f5d76e, #c9932b, #f9e9b6); }
.lk-color--rainbow .label { background-image: linear-gradient(90deg, #ff6b6b, #f7d35c, #3fd3ff, #9b6bff, #ff6b6b); }

.lk-weather-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; width: min(640px, 100%); }
.lk-weather-grid.is-dense { grid-template-columns: repeat(4, minmax(80px, 1fr)); width: 100%; }
.lk-weather-grid.is-disabled { opacity: .55; pointer-events: none; }
.lk-tile {
  position: relative; display: grid; justify-items: center; align-items: center; gap: 3px; padding: 6px 8px;
  border: 1px solid var(--qmm-border-strong); border-radius: 10px; background: var(--qmm-card-bg); cursor: pointer;
  transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.lk-tile:hover { border-color: var(--qmm-accent-border); }
.lk-tile.is-checked {
  border-color: var(--qmm-accent-border); background: var(--qmm-accent-soft);
  box-shadow: inset 0 0 0 1px var(--qmm-accent-border), 0 2px 6px rgba(0,0,0,.45);
}
.lk-tile input { position: absolute; inset: 0; margin: 0; opacity: 0; pointer-events: none; }
.lk-tile__icon { display: inline-flex; align-items: center; justify-content: center; filter: drop-shadow(0 1px 1px rgba(0,0,0,.45)); }
.lk-tile__caption { font-size: 11.5px; font-weight: 600; opacity: .85; text-align: center; }
.is-dense > .lk-tile { padding: 4px 6px; }
.is-dense > .lk-tile .lk-tile__caption { font-size: var(--qmm-fs-sm); font-weight: 500; }
.lk-weather-badge {
  display: inline-flex; align-items: center; justify-content: center; line-height: 1;
  border: 1px solid var(--qmm-border); border-radius: var(--qmm-radius-pill); background: var(--qmm-field-bg); color: var(--qmm-text);
}
.lk-no-weather { display: grid; place-items: center; line-height: 1; font-weight: 700; color: var(--qmm-danger); text-shadow: 0 1px 2px rgba(0,0,0,.6); }

.lk-recipes { display: grid; gap: var(--qmm-space-md); width: 100%; }
.lk-recipes__head { display: flex; align-items: center; justify-content: space-between; gap: var(--qmm-space-md); }
.lk-recipes__title { font-weight: 600; opacity: .9; }
.lk-recipes__list { display: grid; gap: var(--qmm-space-md); grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.lk-recipe {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--qmm-space-xl); padding: 10px 12px;
  border: 1px solid var(--qmm-border); border-radius: 10px; background: var(--qmm-card-bg); text-align: left;
}
.lk-recipe.is-editing { flex-direction: column; align-items: stretch; gap: var(--qmm-space-lg); padding: 12px; }
.lk-recipe__summary { display: flex; flex-wrap: wrap; gap: 6px; flex: 1 1 auto; min-width: 220px; }
.lk-recipe__actions { display: flex; gap: 6px; }
.lk-recipe.is-editing .lk-recipe__actions > * { flex: 1; }
.lk-tag {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: var(--qmm-fs-md); font-weight: 600;
  border: 1px solid var(--qmm-border); border-radius: var(--qmm-radius-pill); background: var(--qmm-card-bg);
}

.lk-overrides { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); gap: var(--qmm-space-lg); height: 54vh; }
.lk-overrides > .qmm-vtabs { min-height: 0; }
.lk-overrides__detail { display: flex; flex-direction: column; align-items: center; gap: var(--qmm-space-xl); min-height: 0; overflow: auto; }
.lk-overrides__placeholder { padding: 32px 24px; border: 1px dashed var(--qmm-border-strong); border-radius: 10px; }
.qmm-vtab.lk-crop-tab { grid-template-columns: 16px 1fr auto; gap: var(--qmm-space-md); padding: 6px 8px; }
.lk-title { display: flex; align-items: center; gap: var(--qmm-space-lg); }

.lk-restrictions { display: grid; gap: var(--qmm-space-xl); width: 100%; max-width: 1100px; }
.lk-rarities { display: grid; gap: var(--qmm-space-md); padding: 8px 10px; border: 1px solid var(--qmm-border); border-radius: var(--qmm-radius-md); background: var(--qmm-card-bg); }
.lk-rarities.is-disabled { opacity: .6; pointer-events: none; }
.lk-rarities__head { display: flex; align-items: center; justify-content: space-between; }
.lk-rarities__chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.lk-rarities__picker { padding: 8px; border-radius: 8px; background: var(--qmm-muted-bg); }
.lk-rarity { display: inline-flex; align-items: center; gap: 3px; }
.lk-rarity > div { margin: 0 !important; }
.lk-rarities__picker > div { cursor: pointer; margin: 0 !important; }
.lk-dim { opacity: .6; }
`;

let installed = false;

export function ensureLockerMenuStyles(): void {
  if (installed) return;
  installed = true;
  addStyle(LOCKER_MENU_CSS);
}
