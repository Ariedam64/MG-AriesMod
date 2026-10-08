// Buttons, fields, switches, sliders, the segmented control and the hotkey button.

export const controlsCss = `
.qmm-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--qmm-space-sm); padding: 8px 14px;
  border: 1px solid var(--qmm-border); border-radius: var(--qmm-radius-md);
  background: var(--qmm-card-bg); color: var(--qmm-text);
  font-size: var(--qmm-fs-lg); font-weight: 600; line-height: 1.2; cursor: pointer; user-select: none;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease, transform 100ms ease;
}
.qmm-compact .qmm-btn:where(:not(.qmm-btn--sm, .qmm-btn--xs, .qmm-btn--icon)) { padding: 6px 10px; }
.qmm-btn:hover { background: var(--qmm-hover-bg); border-color: var(--qmm-border-hover); }
.qmm-btn:active { transform: translateY(1px); }
.qmm-btn:focus-visible { outline: 2px solid var(--qmm-accent); outline-offset: 2px; }
.qmm-btn:disabled, .qmm-btn.is-disabled { opacity: .4; pointer-events: none; }
.qmm-btn.is-busy { opacity: .6; pointer-events: none; }
.qmm-btn--sm { padding: 7px 12px; font-size: var(--qmm-fs-sm); white-space: nowrap; }
.qmm-btn--xs { padding: 4px 8px; font-size: var(--qmm-fs-sm); }
.qmm-btn--full { width: 100%; }
.qmm-btn--block { display: flex; }
.qmm-btn--icon { width: 34px; height: 34px; padding: 6px; gap: 0; border-radius: 50%; }
.qmm-btn__icon { display: inline-flex; align-items: center; justify-content: center; font-size: 1.1em; }
.qmm-btn__icon.is-right { order: 2; }
.qmm-btn--primary { color: var(--qmm-accent); background: var(--qmm-accent-soft); border-color: var(--qmm-accent-border); }
.qmm-btn--primary:hover { background: var(--qmm-accent-hover); border-color: var(--qmm-accent-border-hover); }
.qmm-btn--danger { color: var(--qmm-danger); background: var(--qmm-danger-soft); border-color: var(--qmm-danger-border); }
.qmm-btn--danger:hover { background: var(--qmm-danger-hover); border-color: var(--qmm-danger-border-hover); }
.qmm-btn--ghost { background: transparent; border-color: transparent; }
.qmm-btn--ghost:hover { background: var(--qmm-hover-bg); border-color: var(--qmm-border); }
.qmm-btn.active { color: var(--qmm-accent); background: var(--qmm-accent-soft); border-color: var(--qmm-accent-border); }

.qmm-input, .qws-pnl-input {
  padding: 8px 10px; border: 1px solid var(--qmm-field-border); border-radius: var(--qmm-radius-md);
  background: var(--qmm-field-bg); color: var(--qmm-text); outline: none;
  transition: border-color 120ms ease, background 120ms ease;
}
.qmm-input { min-width: 90px; }
.qws-pnl-input { font-size: var(--qmm-fs-md); }
.qmm-input::placeholder, .qws-pnl-input::placeholder { color: var(--qmm-text-dim); }
.qmm-input:focus, .qws-pnl-input:focus { border-color: var(--qmm-accent-border-hover); }
.qmm-input option, .qws-pnl-input option { background: var(--qmm-surface); color: var(--qmm-text); }
.qmm-input--sm { min-width: 0; padding: 6px 9px; font-size: 11.5px; }
.qmm-select { cursor: pointer; }

.qmm-input-number { display: inline-flex; align-items: center; gap: var(--qmm-space-sm); }
.qmm-input-number-input { width: 70px; text-align: center; }
.qmm-spin { display: inline-flex; flex-direction: column; gap: 2px; }
.qmm-step {
  display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 16px; padding: 0;
  border: 1px solid var(--qmm-border-strong); border-radius: var(--qmm-radius-sm);
  background: var(--qmm-hover-bg); color: var(--qmm-text); font-size: 11px; line-height: 1;
  cursor: pointer; user-select: none; transition: border-color 120ms ease, color 120ms ease;
}
.qmm-step:hover { border-color: var(--qmm-accent-border); color: var(--qmm-accent); }
.qmm-step:active { transform: translateY(1px); }

.qmm-radio { transform: scale(1.1); accent-color: var(--qmm-accent); }

.qmm-switch {
  -webkit-appearance: none; appearance: none; position: relative; flex-shrink: 0;
  width: 36px; height: 20px; margin: 0; vertical-align: middle; cursor: pointer;
  border: 1px solid var(--qmm-field-border); border-radius: 10px; background: var(--qmm-track);
  transition: background 150ms ease, border-color 150ms ease;
}
.qmm-switch::before {
  content: ""; position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; border-radius: 50%;
  background: var(--qmm-text-dim); transition: transform 150ms ease, background 150ms ease;
}
.qmm-switch:checked { background: var(--qmm-accent-hover); border-color: var(--qmm-accent-border-hover); }
.qmm-switch:checked::before { transform: translateX(16px); background: var(--qmm-accent); }
.qmm-switch:focus-visible { outline: 2px solid var(--qmm-accent); outline-offset: 2px; }
.qmm-switch:disabled { opacity: .4; cursor: not-allowed; }

.qmm-chip-toggle {
  display: inline-flex; align-items: stretch; cursor: pointer;
  border: 1px solid var(--qmm-border-strong); border-radius: var(--qmm-radius-pill); background: var(--qmm-card-bg);
  transition: border-color 120ms ease, background 120ms ease;
}
.qmm-chip-toggle:hover { border-color: var(--qmm-accent-border); }
.qmm-chip-toggle input { display: none; }
.qmm-chip-toggle__face { display: flex; align-items: center; gap: var(--qmm-space-md); padding: 6px 12px; border-radius: var(--qmm-radius-pill); }
.qmm-chip-toggle input:checked + .qmm-chip-toggle__face {
  color: var(--qmm-accent); background: var(--qmm-accent-soft); box-shadow: inset 0 0 0 1px var(--qmm-accent-border);
}
.qmm-chip-toggle__icon { font-size: 14px; }
.qmm-chip-toggle__label { font-weight: 600; }
.qmm-chip-toggle__desc { font-size: var(--qmm-fs-md); color: var(--qmm-text-soft); }
.qmm-chip-toggle__badge {
  padding: 2px 6px; font-size: var(--qmm-fs-sm);
  border: 1px solid var(--qmm-border-strong); border-radius: var(--qmm-radius-pill); background: var(--qmm-hover-bg);
}

.qmm-range, .qws-pnl-range {
  -webkit-appearance: none; appearance: none; height: 16px; margin: 0; padding: 0;
  border: none; background: transparent; outline: none; cursor: pointer;
}
.qmm-range { width: 180px; }
.qws-pnl-range { width: 100%; }
.qmm-range::-webkit-slider-runnable-track, .qws-pnl-range::-webkit-slider-runnable-track {
  height: 4px; border-radius: var(--qmm-radius-pill); background: var(--qmm-track);
}
.qmm-range::-moz-range-track, .qws-pnl-range::-moz-range-track {
  height: 4px; border-radius: var(--qmm-radius-pill); background: var(--qmm-track);
}
.qmm-range::-webkit-slider-thumb, .qws-pnl-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 13px; height: 13px; margin-top: -4.5px;
  border: none; border-radius: 50%; background: var(--qmm-accent); cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.qmm-range::-moz-range-thumb, .qws-pnl-range::-moz-range-thumb {
  width: 13px; height: 13px; border: none; border-radius: 50%; background: var(--qmm-accent); cursor: pointer;
}
.qmm-range:hover::-webkit-slider-thumb, .qws-pnl-range:hover::-webkit-slider-thumb {
  transform: scale(1.15); box-shadow: 0 0 0 4px var(--qmm-accent-soft);
}
.qmm-range:disabled, .qws-pnl-range:disabled { opacity: .4; cursor: not-allowed; }
.qmm-range:disabled::-webkit-slider-thumb, .qws-pnl-range:disabled::-webkit-slider-thumb { background: var(--qmm-text-dim); }
.qmm-range:disabled::-moz-range-thumb, .qws-pnl-range:disabled::-moz-range-thumb { background: var(--qmm-text-dim); }

.qmm-range-dual { position: relative; width: 100%; padding: 18px 0 10px; }
.qmm-range-dual-track {
  position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%);
  height: 6px; border-radius: var(--qmm-radius-pill); background: var(--qmm-track);
}
.qmm-range-dual-fill {
  position: absolute; top: 50%; transform: translateY(-50%); height: 6px;
  border-radius: var(--qmm-radius-pill); background: var(--qmm-accent); transition: left .12s ease, right .12s ease;
}
.qmm-range-dual-input {
  position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%);
  width: 100%; height: 28px; pointer-events: none;
}
.qmm-range-dual-input::-webkit-slider-runnable-track { background: none; }
.qmm-range-dual-input::-moz-range-track { background: none; }
.qmm-range-dual-input::-webkit-slider-thumb {
  pointer-events: auto; width: 16px; height: 16px; margin-top: -6px;
  background: var(--qmm-accent); border: 2px solid var(--qmm-surface); box-shadow: 0 2px 8px rgba(0,0,0,.35);
}
.qmm-range-dual-input::-moz-range-thumb {
  pointer-events: auto; width: 16px; height: 16px;
  background: var(--qmm-accent); border: 2px solid var(--qmm-surface); box-shadow: 0 2px 8px rgba(0,0,0,.35);
}
.qmm-range-dual-input--min { z-index: 2; }
.qmm-range-dual-input--max { z-index: 3; }

/* --seg-pad, --seg-fill and --seg-stroke-color let a caller tint one control (the calculator does). */
.qmm-seg {
  position: relative; display: inline-flex; align-items: center; gap: var(--qmm-space-sm); overflow: hidden;
  padding: var(--seg-pad, 8px); border-radius: var(--qmm-radius-pill);
  background: var(--qmm-bg-soft, var(--qmm-sunken)); background-clip: padding-box;
  border: 1px solid var(--qmm-border-2, var(--qmm-border));
}
.qmm-seg--full { display: flex; width: 100%; }
.qmm-seg__btn {
  position: relative; z-index: 1; padding: 8px 14px; border: 0; border-radius: var(--qmm-radius-pill);
  appearance: none; background: transparent; color: var(--qmm-text-dim);
  font: inherit; line-height: 1; white-space: nowrap; cursor: pointer;
  transition: color .15s ease, transform .06s ease;
}
.qmm-seg__btn-label { display: inline-flex; align-items: center; justify-content: center; white-space: inherit; }
.qmm-compact .qmm-seg__btn { padding: 6px 10px; }
.qmm-seg__btn:hover { color: var(--qmm-text); }
.qmm-seg__btn.active { color: var(--qmm-text); font-weight: 600; }
.qmm-seg__btn:active { transform: translateY(1px); }
.qmm-seg__btn[disabled] { opacity: .5; cursor: not-allowed; }
.qmm-seg__indicator {
  position: absolute; top: 0; left: 0; width: 40px; height: 100%; border-radius: inherit; pointer-events: none;
  background: var(--seg-fill, var(--qmm-accent-soft));
  outline: 1.2px solid var(--seg-stroke-color, var(--qmm-accent-border-hover)); outline-offset: -1.2px;
  transform-origin: left center; will-change: transform, width, opacity;
  transition: transform .18s cubic-bezier(.2,.8,.2,1), width .18s cubic-bezier(.2,.8,.2,1), opacity .18s ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .qmm-seg__indicator, .qmm-seg__btn { transition: none; }
}

.qmm-hotkey {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--qmm-hotkey-w, 180px); min-width: 104px; padding: 7px 12px;
  border: 1px solid var(--qmm-border); border-radius: var(--qmm-radius-md);
  background: var(--qmm-field-bg); color: var(--qmm-text);
  font-family: inherit; font-size: var(--qmm-fs-sm); font-weight: 600; white-space: nowrap;
  cursor: pointer; user-select: none; transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.qmm-hotkey:hover { border-color: var(--qmm-border-hover); }
.qmm-hotkey:focus-visible { outline: none; }
.qmm-hotkey.is-assigned { color: var(--qmm-accent); border-color: var(--qmm-accent-border); background: var(--qmm-accent-soft); }
.qmm-hotkey.is-empty { color: var(--qmm-text-dim); font-weight: 500; }
.qmm-hotkey.is-recording {
  color: var(--qmm-warn); border-color: var(--qmm-warn-border); background: var(--qmm-warn-soft);
  animation: qmm-hotkey-breathe 1.2s ease-in-out infinite;
}
@keyframes qmm-hotkey-breathe {
  0% { box-shadow: 0 0 0 0 rgba(251,191,36,.45); }
  60% { box-shadow: 0 0 0 10px rgba(251,191,36,0); }
  100% { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
}
`;
