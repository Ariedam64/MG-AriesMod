// The locker menu's own layout rules, on top of the kit's components and
// colour variables.

import { addStyle } from "../../lib/dom";

const LOCKER_MENU_CSS = `
.lk-menu [hidden] { display: none !important; }
/* The window sizes itself to its content, so the menu sets its own width. */
.lk-menu {
  width: min(620px, calc((100vw - 64px) / var(--qmm-scale, 1)));
  container-type: inline-size; container-name: lk-menu;
}
.lk-view { max-height: 56vh; overflow: auto; }
.lk-tab, .lk-settings { display: flex; flex-direction: column; gap: var(--qmm-space-lg); }
.lk-settings.is-disabled { opacity: .5; }

.lk-card { gap: var(--qmm-space-lg); }
.lk-card__head { display: flex; align-items: center; gap: var(--qmm-space-lg); min-width: 0; }
.lk-card__titles { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.lk-card__subtitle { font-size: var(--qmm-fs-md); line-height: 1.4; color: var(--qmm-text-soft); }
.lk-card__control { display: flex; align-items: center; flex: 0 0 auto; }
.lk-card > .lk-card__body:empty { display: none; }
.lk-card__body { gap: var(--qmm-space-md); }
.lk-hero { border-color: var(--qmm-accent-border); }

.lk-hint { font-size: var(--qmm-fs-sm); line-height: 1.45; color: var(--qmm-text-dim); }
.lk-warning {
  padding: 8px 10px; border-radius: var(--qmm-radius-md);
  background: var(--qmm-warn-soft); color: var(--qmm-warn-ink);
  font-size: var(--qmm-fs-sm); font-weight: 700; line-height: 1.4;
}
.lk-empty { font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); }
.lk-empty-state {
  padding: 18px 14px; border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
  font-size: var(--qmm-fs-md); color: var(--qmm-text-dim); text-align: center;
}
.lk-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; line-height: 1; }
.lk-dim { opacity: .5; }

.lk-settings .qmm-seg--full { box-sizing: border-box; }
.lk-settings .qmm-seg--full .qmm-seg__btn { flex: 1 1 0; min-width: 0; padding-left: 6px; padding-right: 6px; }
.lk-slider-line { display: flex; align-items: center; gap: var(--qmm-space-lg); }
.lk-slider-line > :first-child { flex: 1 1 auto; min-width: 0; }
.lk-slider-value { flex: 0 0 auto; min-width: 44px; justify-content: center; font-variant-numeric: tabular-nums; }

.lk-colors { display: flex; flex-wrap: wrap; gap: var(--qmm-space-md); }
.lk-color { min-width: 84px; }
.lk-color--gold .label, .lk-color--rainbow .label {
  background-clip: text; -webkit-background-clip: text; color: transparent;
}
.lk-color--gold .label { background-image: var(--qmm-gradient-gold); }
.lk-color--rainbow .label { background-image: var(--qmm-gradient-rainbow); }

.lk-weather-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: var(--qmm-space-sm); }
.lk-weather-grid.is-dense { grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); }
.lk-tile {
  position: relative; display: grid; justify-items: center; align-content: center; gap: var(--qmm-space-xs);
  padding: 8px 4px 6px; border: 2px solid transparent; border-radius: var(--qmm-radius-md);
  background: var(--qmm-paper-deep); cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.lk-tile:hover { border-color: var(--qmm-border-hover); }
.lk-tile.is-checked { border-color: var(--qmm-accent-border); background: var(--qmm-accent-soft); }
.lk-tile:focus-within { outline: 3px solid var(--qmm-accent-border); outline-offset: 1px; }
.lk-tile input { position: absolute; inset: 0; margin: 0; opacity: 0; pointer-events: none; }
.lk-tile__icon { display: inline-flex; align-items: center; justify-content: center; filter: drop-shadow(0 1px 1px var(--qmm-shade)); }
.lk-tile__caption {
  max-width: 100%; overflow-wrap: anywhere;
  font-size: var(--qmm-fs-xs); font-weight: 700; line-height: 1.2; text-align: center; color: var(--qmm-text-soft);
}
.lk-tile.is-checked .lk-tile__caption { color: var(--qmm-sepia-ink); }
.is-dense > .lk-tile { padding: 6px 4px 4px; }
.lk-weather-badge {
  display: inline-flex; align-items: center; justify-content: center; line-height: 1; font-weight: 800;
  border-radius: var(--qmm-radius-pill); background: var(--qmm-sand); color: var(--qmm-text-soft);
}
.lk-no-weather { display: grid; place-items: center; line-height: 1; font-weight: 800; color: var(--qmm-danger); }

.lk-recipes { display: flex; flex-direction: column; gap: var(--qmm-space-md); }
.lk-recipes__head { display: flex; align-items: center; justify-content: space-between; gap: var(--qmm-space-lg); }
.lk-recipes__list { display: flex; flex-direction: column; gap: var(--qmm-space-sm); }
.lk-recipe {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); padding: 8px 10px;
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.lk-recipe.is-editing {
  flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: var(--qmm-space-lg); padding: 10px;
  background: var(--qmm-card); box-shadow: inset 0 0 0 2px var(--qmm-accent-border);
}
.lk-recipe.is-editing > * { flex: none; }
.lk-recipe__summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-sm); flex: 1 1 200px; min-width: 0; }
.lk-recipe__actions { display: flex; align-items: center; gap: var(--qmm-space-sm); }
.lk-tag {
  display: inline-flex; align-items: center; gap: var(--qmm-space-xs); padding: 3px 9px 3px 4px;
  border-radius: var(--qmm-radius-pill); background: var(--qmm-card);
  font-size: var(--qmm-fs-sm); font-weight: 700; color: var(--qmm-text);
}

.lk-overrides {
  display: grid; grid-template-columns: minmax(160px, 210px) minmax(0, 1fr); gap: var(--qmm-space-lg); height: 56vh;
}
.lk-overrides > .qmm-vtabs { min-height: 0; }
.lk-overrides__detail { display: flex; flex-direction: column; gap: var(--qmm-space-lg); min-height: 0; overflow: auto; }
.qmm-vtab.lk-crop-tab { grid-template-columns: 24px minmax(0, 1fr) auto; gap: var(--qmm-space-md); padding: 5px 8px; }
.lk-crop-tab__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--qmm-fs-md); }
.lk-on {
  padding: 2px 7px; border-radius: var(--qmm-radius-pill);
  background: var(--qmm-ok-soft); color: var(--qmm-ok-ink); font-size: var(--qmm-fs-xs); font-weight: 800;
}
@container lk-menu (max-width: 500px) {
  .lk-overrides { grid-template-columns: minmax(0, 1fr); height: auto; }
  .lk-overrides > .qmm-vtabs { height: 200px; }
  .lk-overrides__detail { overflow: visible; }
}

.lk-egg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--qmm-space-sm); }
.lk-egg-grid .qmm-setting-row { gap: var(--qmm-space-md); padding: 6px 10px; }
.lk-egg-grid .qmm-setting-row__title { font-size: var(--qmm-fs-md); }
.lk-egg-grid > .lk-empty-state { grid-column: 1 / -1; }

/* The window's own rule gives bare number fields 120px, which the stepper does not need. */
.lk-menu .qmm-input-number-input { width: 64px; min-width: 0; }

.lk-rarities {
  display: flex; flex-direction: column; gap: var(--qmm-space-md); padding: 10px 12px;
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.lk-rarities.is-disabled { opacity: .5; }
.lk-rarities__chips { display: flex; flex-wrap: wrap; gap: var(--qmm-space-sm); }
.lk-rarity {
  display: inline-flex; padding: 4px 10px 4px 6px; border: 0; border-radius: var(--qmm-radius-pill);
  font: inherit; background: var(--qmm-sand); cursor: pointer; opacity: .45; filter: grayscale(.7);
  transition: opacity 120ms ease, filter 120ms ease, box-shadow 120ms ease;
}
.lk-rarity:hover { opacity: .8; filter: none; }
.lk-rarity.is-on { opacity: 1; filter: none; box-shadow: 0 0 0 2px var(--qmm-accent-border); }
.lk-rarity:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 1px; }
`;

let installed = false;

export function ensureLockerMenuStyles(): void {
  if (installed) return;
  installed = true;
  addStyle(LOCKER_MENU_CSS);
}
