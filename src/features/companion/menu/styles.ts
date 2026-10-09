// Rules for the companion's menu, popups and on-screen question. Colours come
// from the kit's theme variables only, so every theme (Night included) works.

import { addStyle } from "../../../lib/dom";
import { ensureKitStyles } from "../../../ui/kit/styles";

const COMPANION_CSS = `
.qws-cmp-window { min-width: min(460px, calc(100vw / var(--qmm-scale, 1) - 72px)); }
.qws-cmp-tab { display: flex; flex-direction: column; gap: var(--qmm-space-lg); }

/* Setting rows wrap their control under the text in a narrow window. */
.qws-cmp-tab .qmm-setting-row, .qws-cmp-modal .qmm-setting-row { flex-wrap: wrap; }
.qws-cmp-tab .qmm-setting-row__text, .qws-cmp-modal .qmm-setting-row__text { flex: 1 1 140px; }
.qws-cmp-tab .qmm-setting-row__controls, .qws-cmp-modal .qmm-setting-row__controls { margin-left: auto; }

.qws-cmp-hint { font-size: var(--qmm-fs-xs); line-height: 1.5; color: var(--qmm-text-dim); }
.qws-cmp-hint.is-warn { color: var(--qmm-warn-ink); font-weight: 800; }
.qws-cmp-dim { opacity: .45; }

/* The portrait: the borrowed NPC's head, or its initial while it loads. */
.qws-cmp-avatar {
  display: flex; align-items: center; justify-content: center; flex: 0 0 auto; overflow: hidden;
  border-radius: 50%; background: var(--qmm-sepia-soft); color: var(--qmm-sepia-ink); font-weight: 900;
}
.qws-cmp-avatar.is-framed { box-shadow: 0 0 0 2px var(--qmm-accent-border); }
.qws-cmp-avatar canvas { width: 100%; height: 100%; image-rendering: pixelated; }
.qws-cmp-avatar-gap { flex: 0 0 auto; }

.qws-cmp-dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--qmm-sand-shade); }
.qws-cmp-dot.is-ok { background: var(--qmm-ok); }
.qws-cmp-dot.is-busy { background: var(--qmm-amber); }

/* Behavior tab: who he is and whether he is out, on top. */
.qmm-card.qws-cmp-hero { gap: var(--qmm-space-lg); }
.qmm-card.qws-cmp-hero.is-on { border-color: var(--qmm-accent-border); }
.qws-cmp-hero__top { display: flex; align-items: center; gap: var(--qmm-space-lg); }
.qws-cmp-hero__text { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.qws-cmp-hero__name { font-size: var(--qmm-fs-xl); font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qws-cmp-hero__status { font-size: var(--qmm-fs-sm); line-height: 1.4; color: var(--qmm-text-dim); }
.qws-cmp-hero__look { display: flex; flex-direction: column; gap: var(--qmm-space-xs); }
.qws-cmp-hero__look-row { display: flex; align-items: center; gap: var(--qmm-space-lg); }
.qws-cmp-hero__look-row > .qmm-select { flex: 1 1 auto; min-width: 0; }
.qws-cmp-label { font-size: var(--qmm-fs-sm); font-weight: 800; color: var(--qmm-text-soft); }

/* Chat tab. */
.qws-cmp-chat__head { display: flex; align-items: center; gap: var(--qmm-space-lg); padding: 0 var(--qmm-space-xs); }
.qws-cmp-chat__who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.qws-cmp-chat__name { font-size: var(--qmm-fs-lg); font-weight: 900; color: var(--qmm-text); }
.qws-cmp-chat__status { display: flex; align-items: center; gap: var(--qmm-space-sm); font-size: var(--qmm-fs-sm); font-weight: 700; color: var(--qmm-text-dim); }
.qws-cmp-chat__status.is-busy { color: var(--qmm-sepia-ink); }

.qws-cmp-thread {
  display: flex; flex-direction: column; gap: 5px; height: min(300px, 45vh); overflow-y: auto; padding: var(--qmm-space-lg);
  border-radius: var(--qmm-radius-lg); background: var(--qmm-paper-deep);
}
.qws-cmp-day {
  align-self: center; margin: var(--qmm-space-md) 0 var(--qmm-space-xs); padding: 3px 10px;
  border-radius: var(--qmm-radius-pill); background: var(--qmm-sand); color: var(--qmm-text-soft);
  font-size: var(--qmm-fs-xs); font-weight: 800; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap;
}
.qws-cmp-system {
  align-self: center; max-width: 90%; padding: 2px var(--qmm-space-md); text-align: center;
  font-size: var(--qmm-fs-xs); line-height: 1.5; color: var(--qmm-text-dim);
}
.qws-cmp-msg { display: flex; align-items: flex-end; gap: var(--qmm-space-md); }
.qws-cmp-msg.is-out { justify-content: flex-end; }
.qws-cmp-msg.is-cont { margin-top: -2px; }
.qws-cmp-msg__col { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; max-width: 78%; }
.qws-cmp-msg.is-out .qws-cmp-msg__col { align-items: flex-end; }
.qws-cmp-bubble {
  padding: 7px 12px; border-radius: 14px 14px 14px 4px; background: var(--qmm-card); color: var(--qmm-text);
  font-size: var(--qmm-fs-md); font-weight: 600; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
}
.qws-cmp-msg.is-out .qws-cmp-bubble { border-radius: 14px 14px 4px 14px; background: var(--qmm-sepia-soft); }
.qws-cmp-msg__time { padding: 0 var(--qmm-space-xs); font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
.qws-cmp-empty { margin: auto; max-width: 240px; text-align: center; font-size: var(--qmm-fs-sm); line-height: 1.5; color: var(--qmm-text-dim); }
.qws-cmp-confirm { display: flex; flex-wrap: wrap; gap: var(--qmm-space-sm); align-self: flex-start; margin: 2px 0 0 34px; }
.qws-cmp-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); }
.qws-cmp-bar__grow { flex: 1 1 auto; }
.qws-cmp-bar__end { margin-left: auto; }

/* Popups. Their body scrolls, so nothing in it may shrink under its own content. */
.qws-cmp-modal > * { flex-shrink: 0; }
.qws-cmp-list { display: flex; flex-direction: column; gap: var(--qmm-space-md); }
.qws-cmp-foot-end { margin-left: auto; }

.qws-cmp-notice {
  display: flex; flex: 0 0 auto; align-items: center; gap: var(--qmm-space-lg); padding: 10px 12px;
  border-radius: var(--qmm-radius-md); background: var(--qmm-warn-soft); color: var(--qmm-warn-ink);
}
.qws-cmp-notice__text { flex: 1 1 auto; min-width: 0; font-size: var(--qmm-fs-sm); font-weight: 700; line-height: 1.45; }
.qws-cmp-notice .qmm-btn { flex: 0 0 auto; }

.qws-cmp-item {
  display: flex; align-items: center; gap: var(--qmm-space-lg); padding: 9px 12px;
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.qws-cmp-item__text { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.qws-cmp-item__title { font-size: var(--qmm-fs-md); font-weight: 800; color: var(--qmm-text); }
.qws-cmp-item__sub { font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
.qws-cmp-item__sub.is-warn { color: var(--qmm-warn-ink); font-weight: 800; }

/* A folded filter card: its title on the left, what it is set to on the right. */
.qmm-card.qws-cmp-filter { flex: 0 0 auto; gap: 10px; padding: 10px 12px; }
.qws-cmp-filter__head { display: flex; align-items: center; gap: var(--qmm-space-md); width: 100%; }
.qws-cmp-filter__summary {
  max-width: 60%; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right;
  font-size: var(--qmm-fs-xs); font-weight: 700; color: var(--qmm-text-dim);
}
.qws-cmp-filter__summary.is-active { color: var(--qmm-sepia-ink); font-weight: 800; }
.qws-cmp-field { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--qmm-space-lg); }
.qws-cmp-field__label { font-size: var(--qmm-fs-sm); font-weight: 800; color: var(--qmm-text); }
.qws-cmp-field__control { display: flex; align-items: center; gap: var(--qmm-space-lg); }
.qws-cmp-field__control.is-grow { flex: 1 1 160px; min-width: 0; }
.qws-cmp-field__control.is-grow > .qws-pnl-range { flex: 1 1 auto; }
.qws-cmp-scroll { max-height: 190px; overflow-y: auto; overscroll-behavior: contain; }

.qws-cmp-choice { --seg-pad: 3px; }
.qws-cmp-choice .qmm-seg__btn { padding: 6px 10px; font-size: var(--qmm-fs-sm); }

/* Selection tiles: a sprite and its count; selected through fill and border. */
.qws-cmp-tiles { display: flex; flex-wrap: wrap; align-items: stretch; gap: var(--qmm-space-sm); }
.qws-cmp-tile {
  display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  padding: 5px 6px 4px; border: 2px solid transparent; border-radius: var(--qmm-radius-sm);
  background: var(--qmm-paper-deep); color: var(--qmm-text-dim);
  font: 800 var(--qmm-fs-xs)/1 var(--qmm-font); cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease;
}
.qws-cmp-tile:hover { background: var(--qmm-sand); }
.qws-cmp-tile:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
.qws-cmp-tile.is-selected { border-color: var(--qmm-accent-border); background: var(--qmm-sepia-soft); color: var(--qmm-sepia-ink); }
.qws-cmp-tile.is-empty:not(.is-selected) { opacity: .45; }
.qws-cmp-tile.is-empty:not(.is-selected) .qws-cmp-tile__count { color: var(--qmm-warn-ink); }
.qws-cmp-tile--named { flex-direction: row; gap: var(--qmm-space-sm); padding: 4px 10px 4px 6px; color: var(--qmm-text); font-size: var(--qmm-fs-sm); white-space: nowrap; }
.qws-cmp-tile--all { min-width: 40px; padding: 0 10px; color: var(--qmm-text); font-size: var(--qmm-fs-sm); }

.qws-cmp-initial { font-size: var(--qmm-fs-sm); font-weight: 800; color: var(--qmm-text-dim); }
.qws-cmp-ability {
  display: inline-block; width: 13px; height: 13px; border-radius: 4px;
  box-shadow: 0 0 0 1px var(--qmm-field-bg) inset, 0 0 0 1px var(--qmm-track);
}

/* The summary at the bottom of a popup: what the request would do. */
.qws-cmp-result {
  display: flex; flex: 0 0 auto; flex-direction: column; gap: var(--qmm-space-md); padding: 12px 14px;
  border-radius: var(--qmm-radius-lg); background: var(--qmm-sepia-soft); color: var(--qmm-sepia-ink);
}
.qws-cmp-result__head { font-size: var(--qmm-fs-lg); font-weight: 900; }
.qws-cmp-result__icons { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; }
.qws-cmp-result .qws-cmp-hint { color: var(--qmm-sepia-ink); font-weight: 700; }
.qws-cmp-result .qws-cmp-hint.is-warn { color: var(--qmm-warn-ink); font-weight: 800; }
.qws-cmp-count { display: flex; align-items: center; gap: 3px; font-size: var(--qmm-fs-xs); font-weight: 800; }
.qws-cmp-more { align-self: center; font-size: var(--qmm-fs-xs); font-weight: 800; }

/* The planting palette and plot. */
.qws-cmp-palette { display: flex; flex-direction: column; gap: var(--qmm-space-sm); }
.qws-cmp-plot {
  display: grid; gap: 2px; width: 100%; margin: 0 auto; padding: 6px; box-sizing: border-box; flex: 0 0 auto;
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.qws-cmp-plot__cell {
  display: flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: 4px;
  user-select: none; transition: background 90ms ease;
}
.qws-cmp-plot__cell[data-state="absent"] { background: transparent; cursor: default; }
.qws-cmp-plot__cell[data-state="occupied"] { background: var(--qmm-danger-soft); border-color: var(--qmm-clay); cursor: not-allowed; }
.qws-cmp-plot__cell[data-state="free"] { background: var(--qmm-card); border-color: var(--qmm-sand-edge); cursor: pointer; }
.qws-cmp-plot__cell[data-state="free"]:hover { background: var(--qmm-sand); }
.qws-cmp-plot__cell[data-state="set"] { background: var(--qmm-sepia-soft); border-color: var(--qmm-accent-border); cursor: pointer; }
.qws-cmp-plot__cell > * { pointer-events: none; }
.qws-cmp-plot__aisle { pointer-events: none; }
`;

let injected = false;

export function ensureCompanionStyles(): void {
  if (injected) return;
  if (typeof document === "undefined" || !document.head) return;
  injected = true;
  // After the kit's sheet, so these rules win over the kit's at equal weight.
  ensureKitStyles();
  addStyle(COMPANION_CSS);
}
