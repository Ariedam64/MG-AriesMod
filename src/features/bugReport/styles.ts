// Rules for the bug report window. Colours come from the kit's theme
// variables. Every class starts with `qws-bug-`, which is also what keeps the
// game's shortcuts off while the player types in these fields.

import { addStyle } from "../../lib/dom";

const BUG_REPORT_CSS = `
.qws-bug-tab {
  display: flex; flex-direction: column; gap: var(--qmm-space-lg); box-sizing: border-box;
  width: min(500px, calc((100vw - 48px) / var(--qmm-scale, 1))); max-width: 100%;
}
.qws-bug-tab:focus { outline: none; }
.qws-bug-stack { display: flex; flex-direction: column; gap: var(--qmm-space-lg); min-width: 0; }
.qws-bug-note { margin: 0; font-size: var(--qmm-fs-md); line-height: 1.5; color: var(--qmm-text-soft); }
.qws-bug-hint { display: block; margin: 0; font-size: var(--qmm-fs-xs); line-height: 1.45; color: var(--qmm-text-dim); }
.qws-bug-hint:empty { display: none; }

.qws-bug-field { display: flex; flex-direction: column; gap: var(--qmm-space-xs); min-width: 0; }
.qws-bug-label { font-size: var(--qmm-fs-sm); font-weight: 800; color: var(--qmm-text-soft); }
.qws-bug-label__optional { font-weight: 600; color: var(--qmm-text-dim); }
.qws-bug-field > .qmm-input { width: 100%; box-sizing: border-box; }
.qws-bug-textarea {
  width: 100%; min-height: 96px; box-sizing: border-box; resize: vertical;
  font-size: var(--qmm-fs-md); line-height: 1.45;
}
.qws-bug-textarea--short { min-height: 56px; }
.qws-bug-field.is-invalid > .qmm-input { border-color: var(--qmm-danger-border); box-shadow: 0 0 0 3px var(--qmm-danger-soft); }
.qws-bug-field.is-invalid .qws-bug-hint { color: var(--qmm-danger-ink); font-weight: 700; }

.qws-bug-chips { display: flex; flex-wrap: wrap; gap: var(--qmm-space-sm); }
.qws-bug-chips .qmm-chip-toggle__face { padding: 5px 11px; font-size: var(--qmm-fs-sm); }
.qws-bug-row { display: flex; flex-wrap: wrap; gap: var(--qmm-space-lg); }
.qws-bug-row > .qws-bug-field { flex: 1 1 180px; }

.qws-bug-notice {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md);
  padding: 10px 12px; border-radius: var(--qmm-radius-md); border: 2px solid var(--qmm-warn-border);
  background: var(--qmm-warn-soft); color: var(--qmm-warn-ink);
  font-size: var(--qmm-fs-sm); font-weight: 700; line-height: 1.45;
}
.qws-bug-notice > span { flex: 1 1 200px; }
.qws-bug-notice--info { border-color: var(--qmm-border); background: var(--qmm-paper-deep); color: var(--qmm-text-soft); }
.qws-bug-notice[hidden] { display: none; }

.qws-bug-shots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--qmm-space-md); }
.qws-bug-shots:empty { display: none; }
.qws-bug-shot {
  position: relative; aspect-ratio: 16 / 10; overflow: hidden; box-sizing: border-box; padding: 0;
  border: 2px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
  cursor: zoom-in;
}
.qws-bug-shot:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
.qws-bug-shot__img { display: block; width: 100%; height: 100%; object-fit: cover; }
.qws-bug-shot__label {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 3px 6px;
  background: var(--qmm-scrim); color: var(--qmm-on-sepia);
  font-size: var(--qmm-fs-xs); font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.qws-bug-shot__remove.qmm-btn {
  position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; min-width: 0; padding: 0;
  border-radius: var(--qmm-radius-pill); font-size: var(--qmm-fs-xs);
}
.qws-bug-shot.is-pending { cursor: progress; display: flex; align-items: center; justify-content: center; }
.qws-bug-shot.is-pending .qws-bug-shot__label { position: static; background: none; color: var(--qmm-text-dim); }
.qws-bug-shot-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-sm); }
.qws-bug-shot-bar .qws-bug-hint { flex: 1 1 140px; }
.qws-bug-shot-full { display: block; max-width: 100%; height: auto; margin: 0 auto; border-radius: var(--qmm-radius-md); }

.qws-bug-data .qmm-setting-row { padding: 8px 10px; }
.qws-bug-data .qmm-setting-row__title { font-size: var(--qmm-fs-md); }
.qws-bug-data .qmm-switch:disabled { opacity: .6; cursor: default; }

.qws-bug-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--qmm-space-md); }
.qws-bug-actions > .qws-bug-progress { flex: 1 1 160px; }
.qws-bug-progress { font-size: var(--qmm-fs-sm); font-weight: 700; color: var(--qmm-text-soft); }
.qws-bug-progress:empty { display: none; }

.qws-bug-success { display: flex; flex-direction: column; align-items: center; gap: var(--qmm-space-md); padding: var(--qmm-space-xl) var(--qmm-space-md); text-align: center; }
.qws-bug-success__title { font-size: 20px; font-weight: 900; color: var(--qmm-text); }
.qws-bug-success__ref {
  display: flex; align-items: center; gap: var(--qmm-space-md);
  padding: 6px 8px 6px 14px; border-radius: var(--qmm-radius-pill); background: var(--qmm-accent-soft);
}
.qws-bug-success__code { font-family: var(--qmm-font-mono); font-size: 18px; font-weight: 800; color: var(--qmm-sepia-ink); user-select: all; }

.qws-bug-json {
  margin: 0; max-height: 50vh; overflow: auto; padding: 10px 12px; box-sizing: border-box;
  border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep); color: var(--qmm-text);
  font-family: var(--qmm-font-mono); font-size: var(--qmm-fs-xs); line-height: 1.5;
  white-space: pre-wrap; word-break: break-word; user-select: text;
}

.qws-bug-list { display: flex; flex-direction: column; gap: var(--qmm-space-lg); }
.qws-bug-list-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); }
.qws-bug-list-head > .qws-bug-note { flex: 1 1 200px; }
.qws-bug-empty {
  padding: var(--qmm-space-xl) var(--qmm-space-lg); border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
  font-size: var(--qmm-fs-md); line-height: 1.5; color: var(--qmm-text-soft); text-align: center;
}
.qws-bug-empty__title { margin-bottom: var(--qmm-space-sm); font-weight: 900; color: var(--qmm-text); }
.qws-bug-report__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-sm); }
.qws-bug-report__title { flex: 1 1 180px; min-width: 0; font-size: var(--qmm-fs-lg); font-weight: 900; color: var(--qmm-text); overflow-wrap: anywhere; }
.qws-bug-report__meta { font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim); }
.qws-bug-fix { padding: 8px 10px; border-radius: var(--qmm-radius-md); font-size: var(--qmm-fs-sm); font-weight: 700; background: var(--qmm-ok-soft); color: var(--qmm-ok-ink); }
.qws-bug-fix.is-update { background: var(--qmm-warn-soft); color: var(--qmm-warn-ink); display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); }
.qws-bug-fix.is-update > span { flex: 1 1 160px; }
.qws-bug-thread { display: flex; flex-direction: column; gap: var(--qmm-space-sm); }
.qws-bug-comment {
  max-width: 88%; padding: 8px 10px; border-radius: var(--qmm-radius-md);
  background: var(--qmm-paper-deep); color: var(--qmm-text);
  font-size: var(--qmm-fs-md); line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere;
}
.qws-bug-comment.is-admin { align-self: flex-start; background: var(--qmm-accent-soft); border: 2px solid var(--qmm-accent-border); }
.qws-bug-comment.is-reporter { align-self: flex-end; }
.qws-bug-comment__who { display: block; margin-bottom: 2px; font-size: var(--qmm-fs-xs); font-weight: 900; color: var(--qmm-text-dim); }
.qws-bug-comment.is-admin .qws-bug-comment__who { color: var(--qmm-sepia-ink); }
.qws-bug-reply { display: flex; flex-direction: column; gap: var(--qmm-space-sm); }
.qws-bug-reply .qws-bug-actions { justify-content: flex-end; }
`;

let injected = false;

export function ensureBugReportStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(BUG_REPORT_CSS);
}
