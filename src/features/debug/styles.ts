// Rules for the debug menu. Colours come from the kit's theme variables.

import { addStyle } from "../../lib/dom";

const DEBUG_CSS = `
.dd-debug-view{display:flex;flex-direction:column;gap:16px;}
.dd-debug-columns{display:grid;gap:16px;grid-template-columns:repeat(2,minmax(320px,1fr));align-items:start;}
@media (max-width:720px){.dd-debug-columns{grid-template-columns:minmax(0,1fr);}}
.dd-debug-column{display:flex;flex-direction:column;gap:16px;min-width:0;}
.dd-pre{max-height:260px;overflow:auto;margin:6px 0 0;padding:12px;border-radius:12px;border:1px solid var(--qmm-border-hover);background:var(--qmm-sunken);color:var(--qmm-text);font-size:12px;line-height:1.5;}
.dd-atom-entry{padding:10px 12px;border-radius:12px;border:1px solid var(--qmm-border-strong);background:var(--qmm-muted-bg);cursor:pointer;}
.dd-atom-entry:hover{border-color:var(--qmm-border-hover);}
.dd-atom-entry.is-selected{background:var(--qmm-accent-soft);border-color:var(--qmm-accent-border-hover);}
.dd-atom-entry--row{display:grid;grid-template-columns:minmax(120px,160px) minmax(0,1fr);gap:12px;margin:4px 0;}
.dd-atom-entry--history{display:flex;flex-direction:column;gap:6px;}
.dd-atom-badge{padding:2px 6px;border-radius:999px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;background:var(--qmm-hover-bg);border:1px solid var(--qmm-border-hover);}
.dd-card-description{font-size:13px;opacity:.72;margin:0;}
.dd-atom-list{display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:40vh;overflow:auto;padding-right:4px;}
.dd-atom-list__item{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 6px;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:background .12s ease,border-color .12s ease;}
.dd-atom-list__item:hover{background:var(--qmm-hover-bg);border-color:var(--qmm-border-hover);}
.dd-atom-list__checkbox{accent-color:var(--qmm-accent);}
.dd-atom-list__label{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dd-status-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.01em;background:var(--qmm-hover-bg);border:1px solid var(--qmm-border-strong);color:var(--qmm-text);}
.dd-status-chip.is-ok{color:var(--qmm-accent);background:var(--qmm-accent-soft);border-color:var(--qmm-accent-border);}
.dd-status-chip.is-warn{color:var(--qmm-warn);background:var(--qmm-warn-soft);border-color:var(--qmm-warn-border);}
.dd-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
.dd-toolbar--stretch{width:100%;}
.dd-toolbar .qmm-input{min-width:160px;}
.dd-toolbar .dd-grow{flex:1 1 220px;min-width:180px;}
.dd-mute-chips{display:flex;flex-wrap:wrap;gap:6px;}
.dd-log{position:relative;border:1px solid var(--qmm-border-hover);border-radius:16px;background:var(--qmm-sunken);padding:10px;max-height:48vh;overflow:auto;}
.dd-log{font-family:var(--qmm-font-mono);font-size:12px;line-height:1.4;user-select:text;}
.dd-log .ws-row .arrow.is-in{color:var(--qmm-accent);}
.dd-log .ws-row .arrow.is-out{color:var(--qmm-rainbow);}
.dd-log__empty{padding:28px 12px;text-align:center;font-size:13px;opacity:.6;}
.dd-log .ws-row{position:relative;display:grid;grid-template-columns:96px 20px minmax(0,1fr);gap:10px;padding:8px 12px;border-radius:12px;border:1px solid transparent;transition:background .15s ease,border-color .15s ease;align-items:start;margin:2px 0;}
.dd-log .ws-row .ts{opacity:.76;font-size:12px;}
.dd-log .ws-row .arrow{font-weight:600;}
.dd-log .ws-row .body{white-space:pre-wrap;word-break:break-word;}
.dd-log .ws-row .body code{font-family:inherit;font-size:12px;color:var(--qmm-text);}
.dd-log .ws-row .acts{position:absolute;top:6px;right:8px;display:flex;gap:6px;padding:4px 6px;background:var(--qmm-surface);border:1px solid var(--qmm-border-hover);border-radius:8px;opacity:0;visibility:hidden;transition:opacity .12s ease;z-index:1;}
.dd-log .ws-row .acts .qmm-btn{padding:2px 6px;font-size:11px;}
.dd-log .ws-row:hover .acts{opacity:1;visibility:visible;}
.dd-log .ws-row:hover{background:var(--qmm-hover-bg);border-color:var(--qmm-border-hover);}
.dd-log .ws-row.selected{background:var(--qmm-accent-soft);border-color:var(--qmm-accent-border-hover);}
.dd-send-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
.dd-send-controls .qmm-radio-group{display:flex;gap:10px;}
.dd-textarea{min-height:140px;}
.dd-inline-note{font-size:12px;opacity:.7;}
.dd-audio-summary{display:grid;gap:4px;font-size:13px;}
.dd-audio-summary strong{font-size:14px;}
.dd-audio-volume{font-family:var(--qmm-font-mono);font-size:12px;opacity:.78;}
.dd-audio-list{display:flex;flex-direction:column;gap:8px;margin-top:4px;max-height:48vh;overflow:auto;padding-right:4px;}
.dd-audio-row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:12px;border:1px solid var(--qmm-border);background:var(--qmm-muted-bg);}
.dd-audio-row__info{flex:1 1 260px;min-width:0;display:flex;flex-direction:column;gap:6px;}
.dd-audio-row__title{font-weight:600;font-size:13px;word-break:break-word;}
.dd-audio-meta{font-size:12px;opacity:.72;display:flex;flex-wrap:wrap;gap:8px;}
.dd-audio-url{font-family:var(--qmm-font-mono);font-size:11px;word-break:break-all;color:var(--qmm-text-soft);}
.dd-audio-actions{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;}
.dd-audio-empty{padding:24px 12px;text-align:center;font-size:13px;opacity:.6;}
.dd-sprite-control-grid{display:grid;gap:12px;width:100%;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));align-items:end;}
.dd-sprite-control{display:flex;flex-direction:column;gap:4px;font-size:12px;}
.dd-sprite-control__label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.75;}
.dd-sprite-control select,.dd-sprite-control input{width:100%;padding:6px 8px;border-radius:8px;border:1px solid var(--qmm-field-border);background:var(--qmm-field-bg);color:var(--qmm-text);font-size:13px;}
.dd-sprite-control input[type="search"]::-webkit-search-cancel-button{filter:invert(1);}
.dd-sprite-stats{font-size:13px;opacity:.75;margin:8px 0 0;}
.dd-sprite-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}
.dd-sprite-grid-wrap{max-height:65vh;overflow:auto;padding-right:6px;width:100%;}
.dd-sprite-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));align-items:stretch;min-height:0;}
.dd-sprite-grid__item{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;border:1px solid var(--qmm-border);background:var(--qmm-muted-bg);min-width:0;cursor:pointer;outline:none;}
.dd-sprite-grid__item:focus-visible{border-color:var(--qmm-accent-border-hover);box-shadow:0 0 0 1px var(--qmm-accent-border);}
.dd-sprite-grid__img{display:flex;align-items:center;justify-content:center;background:var(--qmm-sunken);border-radius:12px;border:1px solid var(--qmm-border);overflow:hidden;min-height:var(--sprite-size,96px);}
.dd-sprite-grid__icon{width:var(--sprite-size,96px);height:var(--sprite-size,96px);display:flex;align-items:center;justify-content:center;}
.dd-sprite-grid__icon img{max-width:100%;max-height:100%;object-fit:contain;}
.dd-sprite-grid__name{font-weight:600;font-size:13px;word-break:break-word;}
.dd-sprite-grid__meta{font-size:11px;opacity:.65;word-break:break-all;font-family:var(--qmm-font-mono);}
.dd-sprite-grid__empty{grid-column:1/-1;text-align:center;padding:32px 12px;font-size:13px;opacity:.66;}
.dd-sprite-mutation-card{display:flex;flex-direction:column;gap:12px;}
.dd-sprite-mutation-group{display:flex;flex-direction:column;gap:6px;}
.dd-sprite-mutation-group-title{font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.75;}
.dd-sprite-mutation-buttons{display:flex;flex-wrap:wrap;gap:6px;}
.dd-sprite-mutation-btn{padding:6px 10px;border-radius:999px;border:1px solid var(--qmm-border-hover);background:var(--qmm-field-bg);color:var(--qmm-text);font-size:12px;cursor:pointer;transition:background .12s ease,border-color .12s ease,color .12s ease;}
.dd-sprite-mutation-btn:hover{border-color:var(--qmm-accent-border);}
.dd-sprite-mutation-btn.active{background:var(--qmm-accent-soft);border-color:var(--qmm-accent-border-hover);color:var(--qmm-accent);}
`;

let injected = false;

export function ensureDebugStyles(): void {
  if (injected) return;
  injected = true;
  addStyle(DEBUG_CSS);
}
