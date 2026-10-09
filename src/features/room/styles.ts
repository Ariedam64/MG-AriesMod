// Rules for the Room menu. Colours come from the kit's theme variables.

import { addStyle } from "../../lib/dom";

const ROOM_CSS = `
.qws-win .w-body.qws-room-body { padding: 0; overflow: hidden; }

/* A width of its own, so the split inside can follow it with a container query. */
.qws-room {
  container-type: inline-size;
  width: min(600px, calc((100vw - 32px) / var(--qmm-scale, 1)));
  height: min(660px, calc(90vh / var(--qmm-scale, 1) - 62px));
  background: var(--qmm-paper);
}
.qws-room-split { display: grid; grid-template-columns: 196px minmax(0, 1fr); height: 100%; min-height: 0; }

.qws-room-side {
  display: flex; flex-direction: column; gap: var(--qmm-space-md); min-height: 0;
  padding: var(--qmm-space-xl) var(--qmm-space-lg); background: var(--qmm-paper-deep);
}
.qws-room-side__head { display: flex; align-items: center; justify-content: space-between; gap: var(--qmm-space-md); padding: 0 var(--qmm-space-xs); }
.qws-room-side .qmm-vtabs { flex: 1 1 auto; min-height: 0; }
.qws-room-side .qmm-vlist { padding: 0; background: transparent; border-radius: 0; }
.qws-room-side .qmm-vlist__empty { padding: var(--qmm-space-md) var(--qmm-space-xs); opacity: 1; font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); }
.qws-room-side .qmm-vtab { grid-template-columns: auto minmax(0, 1fr); gap: var(--qmm-space-md); padding: 7px 9px; }
.qws-room-side .qmm-vtab:not(.active) { background: transparent; }
.qws-room-side .qmm-vtab:not(.active):hover { background: var(--qmm-card); border-color: transparent; }

.qws-room-entry { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.qws-room-entry__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--qmm-fs-md); font-weight: 800; }
.qws-room-entry__status { font-size: var(--qmm-fs-xs); font-weight: 700; color: var(--qmm-text-dim); }
.qmm-vtab.active .qws-room-entry__status { color: var(--qmm-sepia-ink); }

.qws-room-avatar {
  position: relative; flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  width: var(--room-avatar, 30px); height: var(--room-avatar, 30px); box-sizing: border-box;
  border: 2px solid var(--qmm-accent-border); border-radius: 50%;
  background: var(--qmm-sepia-soft) center / cover no-repeat; color: var(--qmm-sepia-ink);
  font-size: calc(var(--room-avatar, 30px) * .4); font-weight: 900; line-height: 1;
}
.qws-room-avatar.is-large { --room-avatar: 56px; border-width: 3px; }
.qws-room-avatar__dot {
  position: absolute; right: -2px; bottom: -2px; width: 10px; height: 10px; border-radius: 50%;
  background: var(--qmm-bark-dim); box-shadow: 0 0 0 2px var(--qmm-paper-deep);
}
.qws-room-avatar.is-large .qws-room-avatar__dot { right: 0; bottom: 0; width: 14px; height: 14px; box-shadow: 0 0 0 3px var(--qmm-card); }
.qws-room-avatar__dot.is-online { background: var(--qmm-ok); }
.qmm-vtab.active .qws-room-avatar__dot { box-shadow: 0 0 0 2px var(--qmm-sepia-soft); }

.qws-room-detail { min-width: 0; min-height: 0; overflow-y: auto; padding: var(--qmm-space-xl); }
.qws-room-player { display: flex; flex-direction: column; gap: var(--qmm-space-lg); }
/* In a narrow detail pane the buttons drop under their label instead of squeezing it. */
.qws-room-player .qmm-setting-row { flex-wrap: wrap; }
.qws-room-player .qmm-setting-row__text { flex: 1 1 150px; }
.qws-room-player .qmm-setting-row__controls { flex-wrap: nowrap; margin-left: auto; }

.qmm-card.qws-room-hero { padding: var(--qmm-space-xl); gap: var(--qmm-space-xl); }
.qws-room-hero__top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-lg); }
.qws-room-hero__who { display: flex; flex-direction: column; align-items: flex-start; gap: var(--qmm-space-xs); flex: 1 1 120px; min-width: 0; }
.qws-room-hero__name {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 18px; font-weight: 900; color: var(--qmm-text);
}
.qws-room-hero .qmm-pill { padding: 2px 9px; font-size: var(--qmm-fs-xs); }

.qws-room-values { display: grid; grid-template-columns: 1fr 1fr; gap: var(--qmm-space-md); }
.qws-room-value {
  display: flex; flex-direction: column; gap: 2px; min-width: 0;
  padding: 10px 12px; border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.qws-room-value__label { font-size: var(--qmm-fs-xs); font-weight: 700; color: var(--qmm-text-dim); }
.qws-room-value__amount { font-size: var(--qmm-fs-xl); font-weight: 900; color: var(--qmm-gold-ink); }

.qws-room-inspect { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: var(--qmm-space-md); }
.qws-room-inspect .qmm-btn { justify-content: flex-start; }

.qws-room-icon { display: inline-flex; }
.qws-room-icon svg { display: block; }

/* Greyed out, but still clickable so the player learns why it does nothing. */
.qmm-btn.qws-room-off { opacity: .5; cursor: not-allowed; }
.qmm-btn.qws-room-off:hover { background: var(--qmm-sand); color: var(--qmm-text-soft); }

.qws-room-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--qmm-space-md);
  height: 100%; min-height: 200px; padding: var(--qmm-space-xl); text-align: center;
  color: var(--qmm-text-dim); font-size: var(--qmm-fs-md);
}
.qws-room-empty .qws-room-icon { opacity: .45; }
.qws-room-empty__title { font-size: var(--qmm-fs-lg); font-weight: 800; color: var(--qmm-text-soft); }

/* Narrow windows: the players become a row of chips above the details. */
@container (max-width: 480px) {
  .qws-room-split { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .qws-room-side { padding: var(--qmm-space-lg); }
  .qws-room-side .qmm-vlist.is-scroll { overflow-x: auto; overflow-y: hidden; }
  .qws-room-side .qmm-vlist__items { flex-direction: row; }
  .qws-room-side .qmm-vlist__items > li { flex: 0 0 auto; max-width: 150px; }
  .qws-room-entry__status { display: none; }
  .qws-room-detail { padding: var(--qmm-space-lg); }
}
`;

let injected = false;

export function ensureRoomStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(ROOM_CSS);
}
