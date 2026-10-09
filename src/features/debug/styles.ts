// Rules for the debug menu. Colours come from the kit's theme variables.

import { addStyle } from "../../lib/dom";

const DEBUG_CSS = `
/* Layout: a column of cards, side by side once the window is wide enough. */
.dd-view { display: flex; flex-direction: column; gap: var(--qmm-space-lg); min-width: 0; }
.dd-grid {
  display: grid; gap: var(--qmm-space-lg); align-items: start;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
}
.dd-grid--tight { grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
.dd-column { display: flex; flex-direction: column; gap: var(--qmm-space-lg); min-width: 0; }
.dd-view .qmm-card { min-width: 0; }
/* A card's header actions (a count, a status) sit beside its title, above the subtitle. */
.dd-view .qmm-card__actions { order: 1; }
.dd-view .qmm-card__subtitle { order: 2; }
.dd-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); min-width: 0; }
.dd-bar > .dd-grow { flex: 1 1 180px; min-width: 0; }
.dd-bar__end { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-sm); margin-left: auto; }
.dd-view .dd-full.qmm-input { width: 100%; box-sizing: border-box; }
.dd-stack {display: flex; flex-direction: column; gap: var(--qmm-space-sm); min-width: 0; }
.dd-hint { margin: 0; font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); }
.dd-empty { padding: 24px 12px; text-align: center; font-size: var(--qmm-fs-md); color: var(--qmm-text-dim); }
.dd-status .qmm-setting-row__controls { flex: 0 1 auto; }
/* Filter chips at the size of the small buttons beside them. */
.dd-view .qmm-chip-toggle__face { padding: 5px 11px; font-size: var(--qmm-fs-sm); }

/* Read-outs: values, listings, payloads. */
.dd-code {
  margin: 0; min-height: 96px; max-height: 260px; overflow: auto; padding: 10px 12px; box-sizing: border-box;
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep); color: var(--qmm-text);
  font-family: var(--qmm-font-mono); font-size: var(--qmm-fs-sm); line-height: 1.5;
  white-space: pre-wrap; word-break: break-word; user-select: text;
}
.dd-code:empty::before { content: attr(data-placeholder); font-family: var(--qmm-font); color: var(--qmm-text-dim); }
.dd-code--tall { min-height: 160px; max-height: 360px; }
.dd-code--list { min-height: 240px; max-height: 60vh; }
.dd-textarea {
  width: 100%; min-height: 120px; box-sizing: border-box; resize: vertical;
  font-family: var(--qmm-font-mono); font-size: var(--qmm-fs-sm); line-height: 1.5;
}

/* A scrolling well of rows. */
.dd-well {
  display: flex; flex-direction: column; gap: 2px; max-height: 48vh; overflow: auto; padding: 4px;
  border-radius: var(--qmm-radius-lg); background: var(--qmm-paper-deep);
}
.dd-well--short { max-height: 36vh; }
.dd-entry {
  display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 7px 10px; cursor: pointer;
  border: 2px solid transparent; border-radius: var(--qmm-radius-md);
  transition: background 120ms ease, border-color 120ms ease;
}
.dd-entry:hover { background: var(--qmm-sand); }
.dd-entry.is-selected { background: var(--qmm-sepia-soft); border-color: var(--qmm-accent-border); }
.dd-entry__head { display: flex; align-items: baseline; gap: var(--qmm-space-md); min-width: 0; }
.dd-entry__title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; font-size: var(--qmm-fs-md); }
.dd-entry.is-selected .dd-entry__title { color: var(--qmm-sepia-ink); }
.dd-entry__time { flex: 0 0 auto; font-family: var(--qmm-font-mono); font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
.dd-entry__text {
  font-family: var(--qmm-font-mono); font-size: var(--qmm-fs-sm); color: var(--qmm-text-soft);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dd-entry .dd-code { min-height: 0; max-height: 180px; padding: 6px 0 0; background: none; }

/* Atom picker. */
.dd-pick {
  display: flex; align-items: center; gap: var(--qmm-space-md); padding: 5px 8px; cursor: pointer;
  border-radius: var(--qmm-radius-sm); font-size: var(--qmm-fs-md); transition: background 120ms ease;
}
.dd-pick:hover { background: var(--qmm-sand); }
.dd-pick.is-on { background: var(--qmm-sepia-soft); color: var(--qmm-sepia-ink); font-weight: 800; }
.dd-pick input { flex: 0 0 auto; margin: 0; accent-color: var(--qmm-sepia); }
.dd-pick span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* WebSocket frames. */
.dd-frames { font-family: var(--qmm-font-mono); font-size: var(--qmm-fs-sm); line-height: 1.45; user-select: text; }
.dd-frame {
  position: relative; display: grid; grid-template-columns: auto 14px minmax(0, 1fr); gap: var(--qmm-space-md);
  align-items: start; padding: 4px 8px; cursor: pointer;
  border: 2px solid transparent; border-radius: var(--qmm-radius-md);
  transition: background 120ms ease, border-color 120ms ease;
}
.dd-frame:hover { background: var(--qmm-sand); }
.dd-frame.selected { background: var(--qmm-sepia-soft); border-color: var(--qmm-accent-border); }
.dd-frame__ts { color: var(--qmm-text-dim); font-size: var(--qmm-fs-xs); line-height: 1.6; }
.dd-frame__dir { font-weight: 900; text-align: center; }
.dd-frame__dir.is-in { color: var(--qmm-ok-ink); }
.dd-frame__dir.is-out { color: var(--qmm-sepia-ink); }
.dd-frame__body { white-space: pre-wrap; word-break: break-word; color: var(--qmm-text); }
.dd-frame__body code { font: inherit; }
.dd-frame__acts {
  position: absolute; top: 4px; right: 6px; display: flex; gap: var(--qmm-space-xs); padding: 3px;
  border-radius: var(--qmm-radius-md); background: var(--qmm-card); box-shadow: 0 2px 6px var(--qmm-shade);
  font-family: var(--qmm-font); opacity: 0; visibility: hidden; transition: opacity 120ms ease;
}
.dd-frame:hover .dd-frame__acts, .dd-frame:focus-within .dd-frame__acts { opacity: 1; visibility: visible; }
.dd-mutes { display: flex; flex-wrap: wrap; gap: var(--qmm-space-sm); }
.dd-mutes:empty { display: none; }
.dd-mute { font-family: var(--qmm-font-mono); }
.dd-send { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); }
.dd-send .dd-bar__end .qmm-btn--primary { min-width: 96px; }

/* Audio rows. */
.dd-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md) var(--qmm-space-lg);
  padding: 8px 10px; border-radius: var(--qmm-radius-md); transition: background 120ms ease;
}
.dd-row:hover { background: var(--qmm-sand); }
.dd-row__info { display: flex; flex-direction: column; gap: 2px; flex: 1 1 160px; min-width: 0; }
.dd-row__title { font-size: var(--qmm-fs-md); font-weight: 800; word-break: break-word; }
.dd-row__meta { font-family: var(--qmm-font-mono); font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
.dd-row__actions { display: flex; flex-wrap: wrap; gap: var(--qmm-space-xs); margin-left: auto; }
.dd-now { font-size: var(--qmm-fs-md); font-weight: 700; color: var(--qmm-text-soft); overflow: hidden; text-overflow: ellipsis; }

/* Sprites. */
.dd-fields { display: grid; gap: var(--qmm-space-md); grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); }
.dd-field { display: flex; flex-direction: column; gap: var(--qmm-space-xs); min-width: 0; }
.dd-view .dd-field .qmm-input { width: 100%; box-sizing: border-box; }
.dd-mutation { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-sm) var(--qmm-space-md); }
.dd-mutation > .qmm-section-label { flex: 0 0 72px; }
.dd-mutation__chips { display: flex; flex-wrap: wrap; gap: var(--qmm-space-xs); flex: 1 1 200px; min-width: 0; }
.dd-sprites { max-height: 62vh; overflow: auto; padding: 2px 4px 2px 0; }
.dd-sprite-grid { display: grid; gap: var(--qmm-space-md); grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); }
.dd-sprite {
  display: flex; flex-direction: column; align-items: center; gap: var(--qmm-space-xs); min-width: 0; padding: 8px;
  cursor: pointer; outline: none; text-align: center;
  border: 2px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-md); background: var(--qmm-card);
  transition: border-color 120ms ease, transform 120ms ease;
}
.dd-sprite:hover { border-color: var(--qmm-border-hover); transform: translateY(-1px); }
.dd-sprite:focus-visible { border-color: var(--qmm-sepia); box-shadow: 0 0 0 3px var(--qmm-accent-border); }
.dd-sprite__img {
  display: flex; align-items: center; justify-content: center; align-self: stretch; overflow: hidden;
  padding: 6px; border-radius: var(--qmm-radius-sm); background: var(--qmm-paper-deep);
}
.dd-sprite__icon { display: flex; align-items: center; justify-content: center; width: var(--sprite-size, 96px); height: var(--sprite-size, 96px); }
.dd-sprite__icon img { max-width: 100%; max-height: 100%; object-fit: contain; }
.dd-sprite__name { max-width: 100%; font-size: var(--qmm-fs-sm); font-weight: 800; word-break: break-word; }
.dd-sprite__meta { max-width: 100%; font-family: var(--qmm-font-mono); font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); word-break: break-all; }
.dd-sprite-grid > .dd-empty { grid-column: 1 / -1; }
`;

let injected = false;

export function ensureDebugStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(DEBUG_CSS);
}
