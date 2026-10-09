// Buttons, fields, switches, sliders, the segmented control and the hotkey button.
//
// Buttons are "raised": an inset shade along their bottom edge that flattens
// when pressed, like the game's own buttons.

export const controlsCss = `
.qmm-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--qmm-space-sm); padding: 9px 16px;
  border: 0; border-radius: var(--qmm-radius-md);
  background: var(--qmm-sand); color: var(--qmm-text-soft); box-shadow: inset 0 -3px 0 var(--qmm-sand-shade);
  font-family: var(--qmm-font); font-size: var(--qmm-fs-md); font-weight: 800; line-height: 1.2;
  cursor: pointer; user-select: none;
  transition: background 120ms ease, color 120ms ease, opacity 120ms ease, transform 100ms ease;
}
.qmm-compact .qmm-btn:where(:not(.qmm-btn--sm, .qmm-btn--xs, .qmm-btn--icon)) { padding: 7px 12px; }
.qmm-btn:hover { background: var(--qmm-border-hover); color: var(--qmm-text); }
.qmm-btn:active { transform: translateY(2px); box-shadow: none; }
.qmm-btn:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
.qmm-btn:disabled, .qmm-btn.is-disabled { opacity: .45; pointer-events: none; }
.qmm-btn.is-busy { opacity: .6; pointer-events: none; }
.qmm-btn--sm { padding: 7px 12px; font-size: var(--qmm-fs-sm); white-space: nowrap; }
.qmm-btn--xs { padding: 4px 9px; font-size: var(--qmm-fs-sm); box-shadow: inset 0 -2px 0 var(--qmm-sand-shade); }
.qmm-btn--full { width: 100%; }
.qmm-btn--block { display: flex; }
.qmm-btn--icon { width: 36px; height: 36px; padding: 6px; gap: 0; border-radius: 12px; }
.qmm-btn__icon { display: inline-flex; align-items: center; justify-content: center; font-size: 1.1em; }
.qmm-btn__icon.is-right { order: 2; }
.qmm-btn--primary {
  background: var(--qmm-sepia-strong); color: var(--qmm-on-sepia); box-shadow: inset 0 -3px 0 var(--qmm-sepia-shade);
}
.qmm-btn--primary:hover { background: var(--qmm-sepia-shade); color: var(--qmm-on-sepia); }
.qmm-btn--danger { background: var(--qmm-clay); color: var(--qmm-on-sepia); box-shadow: inset 0 -3px 0 var(--qmm-danger-ink); }
.qmm-btn--danger:hover { background: var(--qmm-danger-ink); color: var(--qmm-on-sepia); }
.qmm-btn--ghost { background: transparent; box-shadow: none; }
.qmm-btn--ghost:hover { background: var(--qmm-sand); }
.qmm-btn.active { background: var(--qmm-sepia-soft); color: var(--qmm-sepia-ink); box-shadow: inset 0 0 0 2px var(--qmm-accent-border); }

.qmm-input, .qws-pnl-input {
  padding: 8px 10px; border: 2px solid var(--qmm-field-border); border-radius: var(--qmm-radius-md);
  background: var(--qmm-field-bg); color: var(--qmm-text); font-family: var(--qmm-font); font-weight: 600; outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.qmm-input { min-width: 90px; }
.qws-pnl-input { font-size: var(--qmm-fs-md); }
.qmm-input::placeholder, .qws-pnl-input::placeholder { color: var(--qmm-text-dim); font-weight: 500; }
.qmm-input:focus, .qws-pnl-input:focus { border-color: var(--qmm-sepia); box-shadow: 0 0 0 3px var(--qmm-sepia-soft); }
.qmm-input option, .qws-pnl-input option { background: var(--qmm-card); color: var(--qmm-text); }
.qmm-input--sm { min-width: 0; padding: 6px 9px; font-size: var(--qmm-fs-sm); }
.qmm-select { cursor: pointer; }

.qmm-input-number { display: inline-flex; align-items: center; gap: var(--qmm-space-sm); }
.qmm-input-number-input { width: 70px; text-align: center; }
.qmm-spin { display: inline-flex; flex-direction: column; gap: 2px; }
.qmm-step {
  display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 17px; padding: 0;
  border: 0; border-radius: var(--qmm-radius-sm); background: var(--qmm-sand); color: var(--qmm-text-soft);
  box-shadow: inset 0 -2px 0 var(--qmm-sand-shade); font-size: 11px; font-weight: 900; line-height: 1;
  cursor: pointer; user-select: none;
}
.qmm-step:hover { background: var(--qmm-border-hover); color: var(--qmm-text); }
.qmm-step:active { transform: translateY(1px); box-shadow: none; }

.qmm-radio { transform: scale(1.15); accent-color: var(--qmm-sepia); }

.qmm-switch {
  -webkit-appearance: none; appearance: none; position: relative; flex-shrink: 0;
  width: 46px; height: 26px; margin: 0; vertical-align: middle; cursor: pointer;
  border: 0; border-radius: 13px; background: var(--qmm-sand-edge); box-shadow: inset 0 -2px 0 var(--qmm-sand-shade);
  transition: background 150ms ease;
}
.qmm-switch::before {
  content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%;
  background: var(--qmm-card); box-shadow: 0 1px 2px var(--qmm-shade); transition: transform 150ms ease;
}
.qmm-switch:checked { background: var(--qmm-sepia); box-shadow: inset 0 -2px 0 var(--qmm-sepia-shade); }
.qmm-switch:checked::before { transform: translateX(20px); }
.qmm-switch:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
.qmm-switch:disabled { opacity: .45; cursor: not-allowed; }

.qmm-chip-toggle {
  display: inline-flex; align-items: stretch; cursor: pointer;
  border: 2px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-pill); background: var(--qmm-card);
  transition: border-color 120ms ease, background 120ms ease;
}
.qmm-chip-toggle:hover { border-color: var(--qmm-accent-border); }
.qmm-chip-toggle input { display: none; }
.qmm-chip-toggle__face { display: flex; align-items: center; gap: var(--qmm-space-md); padding: 6px 12px; border-radius: var(--qmm-radius-pill); }
.qmm-chip-toggle input:checked + .qmm-chip-toggle__face { color: var(--qmm-sepia-ink); background: var(--qmm-sepia-soft); }
.qmm-chip-toggle__icon { font-size: 14px; }
.qmm-chip-toggle__label { font-weight: 800; }
.qmm-chip-toggle__desc { font-size: var(--qmm-fs-md); color: var(--qmm-text-soft); }
.qmm-chip-toggle__badge {
  padding: 2px 7px; font-size: var(--qmm-fs-sm); font-weight: 800;
  border-radius: var(--qmm-radius-pill); background: var(--qmm-sand); color: var(--qmm-text-soft);
}

.qmm-range, .qws-pnl-range {
  -webkit-appearance: none; appearance: none; height: 24px; margin: 0; padding: 0;
  border: none; background: transparent; outline: none; cursor: pointer;
}
.qmm-range { width: 180px; }
.qws-pnl-range { width: 100%; }
.qmm-range::-webkit-slider-runnable-track, .qws-pnl-range::-webkit-slider-runnable-track {
  height: 10px; border-radius: var(--qmm-radius-pill); background: var(--qmm-sand-edge);
}
.qmm-range::-moz-range-track, .qws-pnl-range::-moz-range-track {
  height: 10px; border-radius: var(--qmm-radius-pill); background: var(--qmm-sand-edge);
}
.qmm-range::-moz-range-progress, .qws-pnl-range::-moz-range-progress {
  height: 10px; border-radius: var(--qmm-radius-pill); background: var(--qmm-sepia);
}
.qmm-range::-webkit-slider-thumb, .qws-pnl-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 22px; height: 22px; margin-top: -6px; box-sizing: border-box;
  border: 3px solid var(--qmm-sepia); border-radius: 50%; background: var(--qmm-card); cursor: pointer;
  transition: transform 120ms ease;
}
.qmm-range::-moz-range-thumb, .qws-pnl-range::-moz-range-thumb {
  width: 16px; height: 16px; border: 3px solid var(--qmm-sepia); border-radius: 50%; background: var(--qmm-card); cursor: pointer;
}
.qmm-range:hover::-webkit-slider-thumb, .qws-pnl-range:hover::-webkit-slider-thumb { transform: scale(1.1); }
.qmm-range:focus-visible::-webkit-slider-thumb, .qws-pnl-range:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 4px var(--qmm-accent-border);
}
.qmm-range:disabled, .qws-pnl-range:disabled { opacity: .45; cursor: not-allowed; }

.qmm-range-dual { position: relative; width: 100%; padding: 18px 0 10px; }
.qmm-range-dual-track {
  position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%);
  height: 10px; border-radius: var(--qmm-radius-pill); background: var(--qmm-sand-edge);
}
.qmm-range-dual-fill {
  position: absolute; top: 50%; transform: translateY(-50%); height: 10px;
  border-radius: var(--qmm-radius-pill); background: var(--qmm-sepia); transition: left .12s ease, right .12s ease;
}
.qmm-range-dual-input {
  position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%);
  width: 100%; height: 28px; pointer-events: none;
}
.qmm-range-dual-input::-webkit-slider-runnable-track { background: none; }
.qmm-range-dual-input::-moz-range-track { background: none; }
.qmm-range-dual-input::-webkit-slider-thumb {
  pointer-events: auto; width: 22px; height: 22px; margin-top: -6px; box-sizing: border-box;
  background: var(--qmm-card); border: 3px solid var(--qmm-sepia); border-radius: 50%;
}
.qmm-range-dual-input::-moz-range-thumb {
  pointer-events: auto; width: 16px; height: 16px;
  background: var(--qmm-card); border: 3px solid var(--qmm-sepia); border-radius: 50%;
}
.qmm-range-dual-input--min { z-index: 2; }
.qmm-range-dual-input--max { z-index: 3; }

/* --seg-pad, --seg-fill and --seg-stroke-color let a caller tint one control (the calculator does). */
.qmm-seg {
  position: relative; display: inline-flex; align-items: center; gap: var(--qmm-space-xs); overflow: hidden;
  padding: var(--seg-pad, 4px); border-radius: var(--qmm-radius-pill); background: var(--qmm-sand);
}
.qmm-seg--full { display: flex; width: 100%; }
.qmm-seg__btn {
  position: relative; z-index: 1; padding: 8px 14px; border: 0; border-radius: var(--qmm-radius-pill);
  appearance: none; background: transparent; color: var(--qmm-text-soft);
  font: 800 var(--qmm-fs-md) var(--qmm-font); line-height: 1; white-space: nowrap; cursor: pointer;
  transition: color .15s ease, transform .06s ease;
}
.qmm-seg__btn-label { display: inline-flex; align-items: center; justify-content: center; white-space: inherit; }
.qmm-compact .qmm-seg__btn { padding: 6px 10px; }
.qmm-seg__btn:hover { color: var(--qmm-text); }
.qmm-seg__btn.active { color: var(--qmm-paper); }
.qmm-seg__btn:active { transform: translateY(1px); }
.qmm-seg__btn[disabled] { opacity: .5; cursor: not-allowed; }
.qmm-seg__indicator {
  position: absolute; top: 0; left: 0; width: 40px; height: 100%; border-radius: inherit; pointer-events: none;
  background: var(--seg-fill, var(--qmm-bark));
  outline: 2px solid var(--seg-stroke-color, transparent); outline-offset: -2px;
  transform-origin: left center; will-change: transform, width, opacity;
  transition: transform .18s cubic-bezier(.2,.8,.2,1), width .18s cubic-bezier(.2,.8,.2,1), opacity .18s ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .qmm-seg__indicator, .qmm-seg__btn { transition: none; }
}

.qmm-hotkey {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--qmm-hotkey-w, 180px); min-width: 104px; padding: 7px 12px;
  border: 2px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-md);
  background: var(--qmm-card); color: var(--qmm-text);
  font-family: var(--qmm-font); font-size: var(--qmm-fs-sm); font-weight: 800; white-space: nowrap;
  cursor: pointer; user-select: none; transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.qmm-hotkey:hover { border-color: var(--qmm-border-hover); }
.qmm-hotkey:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
.qmm-hotkey.is-assigned { color: var(--qmm-sepia-ink); border-color: var(--qmm-accent-border); background: var(--qmm-sepia-soft); }
.qmm-hotkey.is-empty { color: var(--qmm-text-dim); font-weight: 600; }
.qmm-hotkey.is-recording {
  color: var(--qmm-warn-ink); border-color: var(--qmm-warn-border); background: var(--qmm-warn-soft);
  animation: qmm-hotkey-breathe 1.2s ease-in-out infinite;
}
@keyframes qmm-hotkey-breathe {
  0% { box-shadow: 0 0 0 0 var(--qmm-warn-glow); }
  60% { box-shadow: 0 0 0 10px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
`;
