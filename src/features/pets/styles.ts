// The Pets menu's own layout rules, on top of the kit's components and colour
// variables. The Hatch tab keeps its rules in hatch/styles.ts.

import { addStyle } from "../../lib/dom";

/** Heights are divided by the menu size, or a scaled window would overflow the screen. */
const PANE_HEIGHT = "calc(56vh / var(--qmm-scale, 1))";

const PETS_CSS = `
/* A tab takes a set width, so the window keeps its size from tab to tab, and
   is the container its layouts query to stack on a narrow window. */
.pt-tab {
  display: flex; flex-direction: column; gap: var(--qmm-space-xl);
  width: min(780px, calc((100vw - 64px) / var(--qmm-scale, 1))); max-width: 100%; box-sizing: border-box;
  container-type: inline-size;
}
.pt-empty {
  padding: var(--qmm-space-xl) var(--qmm-space-md); font-size: var(--qmm-fs-sm); line-height: 1.45;
  color: var(--qmm-text-dim); text-align: center;
}
.pt-hint { font-size: var(--qmm-fs-sm); line-height: 1.4; color: var(--qmm-text-dim); }
.pt-scroll { max-height: ${PANE_HEIGHT}; overflow-y: auto; min-height: 0; padding: 2px 2px 2px 0; }

/* A list on the left, its detail on the right. */
.pt-split {
  display: grid; grid-template-columns: minmax(200px, 250px) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr);
  gap: var(--qmm-space-xl); height: ${PANE_HEIGHT}; min-height: 0;
}
.pt-split > * { min-height: 0; }

/* ----------------------------- Teams: the list ---------------------------- */
.pt-teams { display: flex; flex-direction: column; gap: var(--qmm-space-md); }
.pt-teams__head { display: flex; align-items: center; gap: var(--qmm-space-md); min-height: 32px; }
.pt-teams__head .qmm-section-label { flex: 1 1 auto; }
.pt-teams__rows {
  flex: 1 1 auto; min-height: 0; overflow: auto; scroll-behavior: smooth;
  display: flex; flex-direction: column; gap: var(--qmm-space-xs);
  padding: var(--qmm-space-sm); border-radius: var(--qmm-radius-lg); background: var(--qmm-paper-deep);
}
.pt-team {
  flex: 0 0 auto; display: flex; align-items: center; gap: var(--qmm-space-md);
  height: 40px; padding: 0 var(--qmm-space-sm) 0 var(--qmm-space-lg); box-sizing: border-box;
  border: 2px solid transparent; border-radius: var(--qmm-radius-md); background: var(--qmm-card);
  font-size: var(--qmm-fs-md); font-weight: 700; white-space: nowrap; cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.pt-team:hover { border-color: var(--qmm-border-hover); }
.pt-team.is-selected { background: var(--qmm-sepia-soft); border-color: var(--qmm-accent-border); color: var(--qmm-sepia-ink); }
.pt-team__dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--qmm-sand-edge); }
.pt-team__dot.is-active { background: var(--qmm-ok); box-shadow: 0 0 0 3px var(--qmm-ok-soft); }
.pt-team__name { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pt-team__pets { flex: 0 0 auto; display: flex; align-items: center; gap: 3px; }
.pt-team .qmm-grab { margin-left: 0; }
.pt-sync {
  display: flex; align-items: center; gap: var(--qmm-space-md); padding: var(--qmm-space-xs) var(--qmm-space-sm);
  font-size: var(--qmm-fs-sm); font-weight: 700; color: var(--qmm-text-soft); cursor: pointer;
}

/* ---------------------------- Teams: the editor --------------------------- */
.pt-editor { display: flex; flex-direction: column; gap: var(--qmm-space-xl); overflow-y: auto; padding-right: 2px; }
.pt-editor__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); }
.pt-editor__name { flex: 1 1 0; font-size: var(--qmm-fs-xl); font-weight: 800; }
.pt-editor__foot { display: flex; justify-content: flex-end; }
.pt-slots { display: flex; flex-direction: column; gap: var(--qmm-space-md); }
.pt-slot {
  display: grid; grid-template-columns: 44px minmax(0, 1fr) auto auto; align-items: center; gap: var(--qmm-space-lg);
  padding: var(--qmm-space-md) var(--qmm-space-md) var(--qmm-space-md) var(--qmm-space-lg);
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.pt-slot.is-empty { background: transparent; outline: 2px dashed var(--qmm-sand-edge); outline-offset: -2px; }
.pt-slot__icon { display: grid; place-items: center; width: 44px; height: 44px; font-size: 26px; }
.pt-slot.is-empty .pt-slot__icon { opacity: .4; }
.pt-slot__text { display: flex; flex-direction: column; gap: var(--qmm-space-sm); min-width: 0; }
.pt-slot__title { display: flex; align-items: center; gap: var(--qmm-space-sm); min-width: 0; }
.pt-slot__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--qmm-fs-lg); font-weight: 800; }
.pt-slot.is-empty .pt-slot__name { color: var(--qmm-text-dim); font-weight: 700; }

/* Strength, as current/max. Green once the pet is at its max. */
.pt-str {
  flex: 0 0 auto; padding: 2px 7px; border-radius: var(--qmm-radius-pill);
  background: var(--qmm-sand); color: var(--qmm-text-soft);
  font-size: var(--qmm-fs-xs); font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.pt-str.is-max { background: var(--qmm-ok-soft); color: var(--qmm-ok-ink); }

/* -------------------------------- Team stats ------------------------------ */
.pt-stats { display: flex; flex-direction: column; gap: var(--qmm-space-sm); }
.pt-stats__groups { display: grid; gap: var(--qmm-space-sm); }
.pt-stats.is-all .pt-stats__groups { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--qmm-space-md); }
.pt-stat {
  display: flex; flex-direction: column; gap: 3px; min-width: 0;
  padding: var(--qmm-space-md) var(--qmm-space-lg); border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.pt-stat__head { display: flex; align-items: center; justify-content: space-between; gap: var(--qmm-space-sm); min-height: 16px; }
.pt-stat__name {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--qmm-fs-xs); font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--qmm-text-dim);
}
.pt-stat__value { display: flex; align-items: baseline; gap: var(--qmm-space-xs); font-variant-numeric: tabular-nums; }
.pt-stat__big { font-size: var(--qmm-fs-xl); font-weight: 900; line-height: 1.1; }
.pt-stat__unit, .pt-stat__max { font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
.pt-stat__max { margin-left: auto; white-space: nowrap; }
.pt-stat__always { font-size: var(--qmm-fs-md); font-weight: 700; color: var(--qmm-text-soft); }
.pt-stat__bar { height: 4px; margin-top: 2px; overflow: hidden; border-radius: var(--qmm-radius-pill); background: var(--qmm-sand-edge); }
.pt-stat__fill { height: 100%; border-radius: inherit; }
.pt-stat__proc { display: flex; align-items: baseline; justify-content: space-between; gap: var(--qmm-space-md); font-size: var(--qmm-fs-xs); color: var(--qmm-text-soft); }
.pt-stat__proc b { flex: 0 0 auto; font-weight: 800; color: var(--qmm-text); font-variant-numeric: tabular-nums; }
.pt-stat__nav { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; }
.pt-stat__arrow {
  padding: 1px 5px; border: 0; border-radius: var(--qmm-radius-sm); background: transparent; color: var(--qmm-text-soft);
  font: 900 var(--qmm-fs-md) var(--qmm-font); line-height: 1; cursor: pointer;
}
.pt-stat__arrow:hover { background: var(--qmm-sand); color: var(--qmm-text); }
.pt-stat__count { font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); font-variant-numeric: tabular-nums; }
.pt-stats__warn { font-size: var(--qmm-fs-xs); font-weight: 700; color: var(--qmm-warn-ink); }
.pt-feedrow {
  display: flex; align-items: center; justify-content: space-between; gap: var(--qmm-space-md);
  padding: var(--qmm-space-sm) var(--qmm-space-lg); border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
  font-size: var(--qmm-fs-sm);
}
.pt-feedrow__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--qmm-text-soft); }
.pt-feedrow__value { flex: 0 0 auto; font-weight: 800; font-variant-numeric: tabular-nums; }

/* ------------------------------ Team Builder ----------------------------- */
.pt-builder__bar { display: flex; align-items: center; gap: var(--qmm-space-lg); }
.pt-builder__bar .pt-hint { flex: 1 1 auto; }
.pt-builder__grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--qmm-space-lg); align-items: start;
}
.pt-builder__grid > .qmm-collapse, .pt-builder__grid > .pt-empty { grid-column: 1 / -1; }
/* The kit card is a grid: its one column must be allowed to shrink, or a long
   pet name pushes the card wider than its cell. */
.pt-suggest, .pt-suggest .qmm-card__body { grid-template-columns: minmax(0, 1fr); }
.pt-suggest {
  position: relative; overflow: hidden; gap: var(--qmm-space-md);
  padding: var(--qmm-space-lg) var(--qmm-space-lg) var(--qmm-space-lg) calc(var(--qmm-space-lg) + 4px);
  transition: transform 140ms ease, border-color 140ms ease;
}
.pt-suggest:hover { transform: translateY(-2px); border-color: var(--qmm-border-hover); }
.pt-suggest .qmm-card__header { flex-wrap: nowrap; align-items: flex-start; gap: var(--qmm-space-md); }
.pt-suggest .qmm-card__title { flex: 1 1 0; min-width: 0; font-size: var(--qmm-fs-lg); line-height: 1.3; }
.pt-suggest .qmm-card__actions { align-items: center; }
.pt-suggest .qmm-card__body { gap: var(--qmm-space-md); }
/* The colours of the abilities the team is built around. */
.pt-suggest__strip { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; }
.pt-suggest__pets { display: grid; gap: 2px; }

/* One pet on one line: portrait, name, strength, ability squares. */
.pt-chip { display: flex; align-items: center; gap: var(--qmm-space-sm); min-width: 0; padding: 3px 4px; border-radius: var(--qmm-radius-sm); }
.pt-chip:hover { background: var(--qmm-paper-deep); }
.pt-chip__name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--qmm-fs-sm); font-weight: 700; }
.pt-unused { display: flex; align-items: center; gap: var(--qmm-space-md); opacity: .85; }
.pt-unused > .pt-chip { flex: 1 1 auto; }
.pt-unused__why {
  flex: 0 1 auto; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim);
}

/* -------------------------------- Feeding -------------------------------- */
.pt-feed-side { display: flex; flex-direction: column; gap: var(--qmm-space-xl); overflow-y: auto; padding-right: 2px; }
.pt-crops { display: flex; flex-direction: column; gap: var(--qmm-space-sm); }
.qmm-vtab.pt-species { grid-template-columns: 24px minmax(0, 1fr) auto; gap: 10px; }
.pt-species__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-crop-icon { display: grid; place-items: center; flex: 0 0 auto; width: 28px; height: 28px; font-weight: 800; color: var(--qmm-text-dim); }

/* ---------------------------------- Logs --------------------------------- */
.pt-logs__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); }
.pt-logs__title { font-size: var(--qmm-fs-xl); font-weight: 900; }
.pt-logs__head .qmm-pill { margin-right: auto; }
.pt-logs__tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); }
.pt-logs__search { flex: 1 1 180px; }
.pt-logs__ability { min-width: 150px; }
.pt-logs__cols, .pt-log {
  display: grid; grid-template-columns: 92px minmax(110px, 1.1fr) minmax(100px, .9fr) minmax(0, 2fr);
  align-items: center; gap: var(--qmm-space-lg);
}
.pt-logs__cols { padding: 0 var(--qmm-space-lg); }
.pt-logs__list { display: flex; flex-direction: column; gap: var(--qmm-space-xs); max-height: calc(50vh / var(--qmm-scale, 1)); overflow-y: auto; min-height: 0; }
.pt-log { padding: var(--qmm-space-sm) var(--qmm-space-lg); border-radius: var(--qmm-radius-md); background: var(--qmm-card); }
/* A proc from this session reads at a glance without a legend. */
.pt-log.is-session { background: var(--qmm-sepia-soft); box-shadow: inset 3px 0 0 var(--qmm-accent); }
.pt-log__when { display: flex; flex-direction: column; gap: 1px; min-width: 0; font-variant-numeric: tabular-nums; }
.pt-log__date { font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
.pt-log__time { font-size: var(--qmm-fs-sm); font-weight: 600; white-space: nowrap; }
.pt-log.is-session .pt-log__time { font-weight: 800; color: var(--qmm-sepia-ink); }
.pt-log__pet { display: flex; align-items: center; gap: var(--qmm-space-md); min-width: 0; }
.pt-log__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--qmm-fs-sm); font-weight: 700; }
.pt-log__ability { display: flex; min-width: 0; }
.pt-log__details {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim);
}

/* ----------------------------- Ability chips ----------------------------- */
.pt-abilities { display: inline-flex; flex-wrap: wrap; align-items: center; line-height: 1; }
.pt-abilities__empty { font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); }
.pt-ability-dot {
  display: inline-block; flex: 0 0 auto; border-radius: 3px; cursor: default;
  background: var(--pt-ability); box-shadow: 0 0 0 1px var(--qmm-shade) inset, 0 0 0 1px var(--qmm-border);
  transition: transform 80ms ease, box-shadow 120ms ease;
}
.pt-ability-dot:hover {
  background: var(--pt-ability-hover); transform: scale(1.08);
  box-shadow: 0 0 0 1px var(--qmm-shade) inset, 0 0 0 1px var(--qmm-border-hover);
}
.pt-ability-pill {
  display: inline-block; max-width: 100%; padding: 3px 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border-radius: var(--qmm-radius-pill); background: var(--pt-ability); box-shadow: 0 0 0 1px var(--qmm-shade) inset;
  color: var(--qmm-on-sepia); text-shadow: 0 1px 2px var(--qmm-shade);
  font-size: var(--qmm-fs-xs); font-weight: 800; line-height: 1.5;
}
.pt-ability-pill:hover { background: var(--pt-ability-hover); }

/* A pet portrait. Its size and corner come inline, from the caller's size. */
.pt-pet-icon {
  flex: 0 0 auto; display: grid; place-items: center; overflow: hidden;
  background: var(--qmm-card); box-shadow: inset 0 0 0 1px var(--qmm-sand-edge);
  color: var(--qmm-text-soft); font-weight: 800;
}
.pt-pet-icon.is-empty { opacity: .4; }
.pt-pet-icon img { object-fit: contain; }

/* ------------------------------ Narrow windows ---------------------------- */
@container (max-width: 560px) {
  .pt-split { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; height: auto; }
  .pt-teams__rows { max-height: 200px; }
  .pt-slot { grid-template-columns: 32px minmax(0, 1fr) auto auto; gap: var(--qmm-space-md); padding: var(--qmm-space-sm); }
  .pt-slot__icon { width: 32px; height: 32px; font-size: 20px; }
  .pt-slot__title { flex-wrap: wrap; row-gap: 2px; }
  .pt-slot .qmm-btn--icon { width: 28px; }
  .pt-split .qmm-vlist { max-height: 200px; }
  .pt-logs__cols { display: none; }
  .pt-log {
    grid-template-columns: minmax(0, 1fr) auto; row-gap: var(--qmm-space-xs);
    grid-template-areas: "pet when" "ability ability" "details details";
  }
  .pt-log__pet { grid-area: pet; }
  .pt-log__when { grid-area: when; align-items: flex-end; }
  .pt-log__ability { grid-area: ability; }
  .pt-log__details { grid-area: details; white-space: normal; }
}
`;

let installed = false;

export function ensurePetsStyles(): void {
  if (installed) return;
  installed = true;
  addStyle(PETS_CSS);
}
