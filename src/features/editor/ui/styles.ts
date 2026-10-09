// Rules for the Editor window and the panels the editor puts on screen.
// Colours come from the kit's theme variables only.

import { addStyle } from "../../../lib/dom";
import { ensureKitStyles } from "../../../ui/kit/styles";

/** Width of the decor rotation thumb. `decorRotation.ts` places its notches with it. */
export const ROTATION_THUMB_PX = 14;

const MENU_CSS = `
.qws-ed-menu { display: flex; flex-direction: column; gap: var(--qmm-space-lg); width: 380px; max-width: 100%; }
/* A card header with both a subtitle and actions keeps the actions beside the title. */
.qws-ed-menu .qmm-card__actions { order: 1; }
.qws-ed-menu .qmm-card__subtitle { order: 2; }

.qws-ed-tips { display: flex; flex-wrap: wrap; gap: var(--qmm-space-sm); }
.qws-ed-tip {
  display: inline-flex; align-items: baseline; gap: var(--qmm-space-sm); padding: 5px 10px;
  border-radius: var(--qmm-radius-pill); background: var(--qmm-paper-deep);
  font-size: var(--qmm-fs-sm); font-weight: 700; color: var(--qmm-text-soft);
}
.qws-ed-tip b { font-weight: 900; color: var(--qmm-text); }

.qws-ed-save { display: flex; align-items: center; gap: var(--qmm-space-md); }
.qws-ed-save > .qmm-input { flex: 1 1 auto; min-width: 0; }

.qws-ed-status {
  max-width: 210px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--qmm-fs-sm); font-weight: 800; color: var(--qmm-text-dim);
}
.qws-ed-status.is-ok { color: var(--qmm-ok-ink); }
.qws-ed-status.is-warn { color: var(--qmm-warn-ink); }
.qws-ed-status.is-err { color: var(--qmm-danger-ink); }

.qws-ed-list { display: flex; flex-direction: column; gap: var(--qmm-space-sm); }
.qws-ed-note { font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); }
.qws-ed-empty { padding: var(--qmm-space-lg) var(--qmm-space-md); text-align: center; font-size: var(--qmm-fs-md); color: var(--qmm-text-dim); }
.qws-ed-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md);
  padding: 8px 8px 8px 12px; border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.qws-ed-row__text { display: flex; flex-direction: column; gap: 1px; flex: 1 1 120px; min-width: 0; }
.qws-ed-row__name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--qmm-fs-lg); font-weight: 800; color: var(--qmm-text);
}
.qws-ed-row__date { font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
.qws-ed-row__actions { display: flex; align-items: center; gap: var(--qmm-space-xs); flex: 0 0 auto; margin-left: auto; }
.qmm-btn.qmm-btn--ghost.qws-ed-delete { color: var(--qmm-danger-ink); }
.qmm-btn.qmm-btn--ghost.qws-ed-delete:hover { background: var(--qmm-danger-soft); color: var(--qmm-danger-ink); }

.qws-ed-drop {
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: var(--qmm-space-lg);
  border: 2px dashed var(--qmm-border-hover); border-radius: var(--qmm-radius-md);
  text-align: center; cursor: pointer; transition: border-color 150ms ease, background 150ms ease;
}
.qws-ed-drop:hover, .qws-ed-drop.is-active, .qws-ed-drop:focus-visible {
  outline: none; border-color: var(--qmm-accent-border-hover); background: var(--qmm-accent-soft);
}
.qws-ed-drop__title { font-size: var(--qmm-fs-md); font-weight: 800; color: var(--qmm-text); }
.qws-ed-drop__hint { font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
`;

const PANEL_CSS = `
.qws-ed-panel {
  position: fixed; top: 12%; display: grid; grid-template-rows: auto minmax(0, 1fr);
  width: 300px; max-height: calc(86vh / var(--qmm-scale, 1)); box-sizing: border-box; overflow: hidden;
  border: 3px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-xl);
  background: var(--qmm-paper); color: var(--qmm-text); box-shadow: var(--qmm-shadow-raise-small);
  font-family: var(--qmm-font); pointer-events: auto;
  scale: var(--qmm-scale, 1);
}
.qws-ed-panel.is-left { left: 12px; transform-origin: 0 0; }
.qws-ed-panel.is-right { right: 12px; transform-origin: 100% 0; }
.qws-ed-panel__head {
  display: flex; align-items: center; min-height: 40px; padding: 0 16px;
  background: var(--qmm-sepia); color: var(--qmm-on-sepia);
  font-size: var(--qmm-fs-xl); font-weight: 900; letter-spacing: .01em;
}
.qws-ed-panel__body { display: grid; gap: var(--qmm-space-lg); min-height: 0; padding: var(--qmm-space-lg); }
.qws-ed-scroll { min-height: 0; overflow: auto; }
.qws-ed-section { min-height: 0; border-radius: var(--qmm-radius-lg); background: var(--qmm-paper-deep); }

.qws-ed-hint { text-align: center; font-size: var(--qmm-fs-md); line-height: 1.45; color: var(--qmm-text-dim); }
.qws-ed-label {
  font-size: var(--qmm-fs-xs); font-weight: 900; letter-spacing: .08em; text-transform: uppercase;
  color: var(--qmm-text-dim);
}
.qws-ed-named { display: flex; flex-direction: column; align-items: center; gap: var(--qmm-space-sm); min-width: 0; }
.qws-ed-named__name {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  text-align: center; font-weight: 900; color: var(--qmm-text);
}

.qws-ed-round.qmm-btn {
  width: 28px; height: 28px; padding: 0; border-radius: 50%; font-size: var(--qmm-fs-lg); line-height: 1;
}

.qws-ed-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)); gap: var(--qmm-space-xs); padding: var(--qmm-space-sm); }
.qws-ed-entry {
  display: flex; align-items: center; justify-content: center; aspect-ratio: 1; padding: 3px; cursor: pointer;
  border: 2px solid transparent; border-radius: var(--qmm-radius-sm); background: var(--qmm-card); color: var(--qmm-text);
  transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
}
.qws-ed-entry:hover { border-color: var(--qmm-border-hover); }
.qws-ed-entry:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 1px; }
.qws-ed-entry.is-selected { border-color: var(--qmm-sepia); background: var(--qmm-sepia-soft); transform: scale(1.06); }

.qws-ed-brush { display: grid; align-content: start; gap: var(--qmm-space-lg); padding: var(--qmm-space-lg); }
.qws-ed-selected { display: flex; align-items: center; gap: var(--qmm-space-lg); min-width: 0; }
.qws-ed-selected__name {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--qmm-fs-xl); font-weight: 900; color: var(--qmm-text);
}

.qws-ed-opts { display: grid; gap: var(--qmm-space-md); }
.qws-ed-opt {
  display: flex; align-items: center; justify-content: space-between; gap: var(--qmm-space-md);
  font-size: var(--qmm-fs-md); font-weight: 800; color: var(--qmm-text-soft);
}
label.qws-ed-opt { cursor: pointer; }
.qws-ed-stepper { display: inline-flex; align-items: center; gap: var(--qmm-space-sm); }
.qws-ed-stepper__count { min-width: 34px; text-align: center; font-weight: 900; color: var(--qmm-text); }

.qws-ed-slots { display: grid; gap: var(--qmm-space-md); }
.qws-ed-slot { display: grid; gap: var(--qmm-space-md); padding: 10px 12px; border-radius: var(--qmm-radius-md); background: var(--qmm-card); }
.qws-ed-slot__head { display: flex; align-items: center; gap: var(--qmm-space-md); min-height: 26px; }
.qws-ed-slot__title { font-size: var(--qmm-fs-md); font-weight: 900; color: var(--qmm-text); }
.qws-ed-slot__mode {
  display: inline-flex; align-items: center; gap: var(--qmm-space-sm); margin-left: auto; cursor: pointer;
  font-size: var(--qmm-fs-xs); font-weight: 800; color: var(--qmm-text-dim);
}
.qws-ed-slot__mode .qmm-switch { transform: scale(.8); transform-origin: right center; }
.qws-ed-slot .qmm-pill { min-width: 26px; justify-content: center; padding: 3px 8px; }
.qws-ed-custom {
  display: flex; align-items: center; gap: var(--qmm-space-md);
  font-size: var(--qmm-fs-sm); font-weight: 800; color: var(--qmm-text-soft);
}
.qws-ed-custom > .qmm-input { width: 90px; }

.qws-ed-muts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-sm); }
.qws-ed-muts__more {
  display: flex; flex-wrap: wrap; gap: var(--qmm-space-sm); padding: var(--qmm-space-sm);
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.qws-ed-mut {
  display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0;
  border: 2px solid transparent; border-radius: var(--qmm-radius-sm); background: var(--qmm-paper-deep);
  color: var(--qmm-text); cursor: pointer; transition: border-color 120ms ease, background 120ms ease;
}
.qws-ed-mut:hover { border-color: var(--qmm-border-hover); }
.qws-ed-mut:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 1px; }
.qws-ed-muts__more .qws-ed-mut { background: var(--qmm-card); }
.qws-ed-mut.is-on { border-color: var(--qmm-sepia); background: var(--qmm-sepia-soft); }
.qws-ed-mut.is-add { font-size: var(--qmm-fs-xl); font-weight: 900; color: var(--qmm-text-soft); border-style: dashed; border-color: var(--qmm-border-hover); background: transparent; }
.qws-ed-mut.is-add.is-open { border-style: solid; border-color: var(--qmm-sepia); background: var(--qmm-sepia-soft); color: var(--qmm-sepia-ink); }
.qws-ed-tag {
  display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  border-radius: var(--qmm-radius-sm); background: var(--qmm-paper-deep);
}
.qws-ed-tags { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--qmm-space-sm); }

.qws-ed-toolbar {
  /* The translate property applies after scale, so the bar stays centred at any menu size. */
  position: fixed; top: 7%; left: 50%; translate: -50% 0; transform-origin: 50% 0;
  scale: var(--qmm-scale, 1);
  display: flex; align-items: center; gap: var(--qmm-space-md); padding: 6px 6px 6px 14px;
  border: 3px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-pill);
  background: var(--qmm-paper); color: var(--qmm-text); box-shadow: var(--qmm-shadow-raise-small);
  font-family: var(--qmm-font); white-space: nowrap;
}
.qws-ed-toolbar__label { display: inline-flex; align-items: center; gap: var(--qmm-space-sm); font-size: var(--qmm-fs-md); font-weight: 900; }
.qws-ed-toolbar__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--qmm-ok); }
.qws-ed-toolbar .qmm-btn { border-radius: var(--qmm-radius-pill); }

.qws-ed-rot { display: grid; gap: var(--qmm-space-sm); width: 100%; box-sizing: border-box; overflow: hidden; }
.qws-ed-rot > .qws-ed-label { text-align: center; }
.qws-ed-rot__preview {
  display: grid; place-items: center; justify-self: center; width: 100%; max-width: 168px; box-sizing: border-box;
  padding: 7px 0; overflow: hidden; border-radius: var(--qmm-radius-md); background: var(--qmm-card);
}
/* 14px narrower than the preview on each side, so the first and last tick
   labels, centred on their notch, stay inside the panel. */
.qws-ed-rot__track { display: grid; gap: 2px; justify-self: center; width: 100%; max-width: 140px; }
.qws-ed-rot__ticks { position: relative; width: 100%; height: 22px; }
.qws-ed-rot__tick { position: absolute; top: 0; display: grid; justify-items: center; gap: 2px; transform: translateX(-50%); }
.qws-ed-rot__mark { width: 2px; height: 5px; border-radius: 1px; background: var(--qmm-track); }
.qws-ed-rot__caption { white-space: nowrap; font-size: var(--qmm-fs-xs); font-weight: 700; color: var(--qmm-text-dim); }
.qws-ed-rot__tick.is-active .qws-ed-rot__mark { background: var(--qmm-sepia); }
.qws-ed-rot__tick.is-active .qws-ed-rot__caption { font-weight: 900; color: var(--qmm-sepia-ink); }
.qws-ed-rot__slider {
  -webkit-appearance: none; appearance: none; width: 100%; height: ${ROTATION_THUMB_PX}px; margin: 0;
  background: transparent; cursor: pointer;
}
.qws-ed-rot__slider::-webkit-slider-runnable-track { height: 6px; border-radius: var(--qmm-radius-pill); background: var(--qmm-track); }
.qws-ed-rot__slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: ${ROTATION_THUMB_PX}px; height: ${ROTATION_THUMB_PX}px;
  margin-top: ${(6 - ROTATION_THUMB_PX) / 2}px; border: none; border-radius: 50%;
  background: var(--qmm-sepia); box-shadow: 0 1px 3px var(--qmm-shade);
}
.qws-ed-rot__slider::-moz-range-track { height: 6px; border-radius: var(--qmm-radius-pill); background: var(--qmm-track); }
.qws-ed-rot__slider::-moz-range-thumb {
  width: ${ROTATION_THUMB_PX}px; height: ${ROTATION_THUMB_PX}px; border: none; border-radius: 50%; background: var(--qmm-sepia);
}
.qws-ed-rot__slider:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
`;

let injected = false;

/** Injects the kit stylesheet and the editor's own rules, once. */
export function ensureEditorStyles(): void {
  if (injected) return;
  if (typeof document === "undefined" || !document.head) return;
  injected = true;
  ensureKitStyles();
  addStyle(MENU_CSS + PANEL_CSS);
}
