import { Menu } from "../../ui/kit/menu";
import { renderAudioPlayerTab } from "./audioTab";
import { renderJotaiTab } from "./jotaiTab";
import { renderLiveAtomsTab } from "./liveAtomsTab";
import { renderWSTab } from "./wsTab";
import { renderSpritesTab } from "./spritesTab";

let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.id = "mg-debug-data-styles";
  style.textContent = `
  .dd-debug-view{display:flex;flex-direction:column;gap:16px;}
  .dd-debug-columns{display:grid;gap:16px;grid-template-columns:repeat(2,minmax(320px,1fr));align-items:start;}
  @media (max-width:720px){.dd-debug-columns{grid-template-columns:minmax(0,1fr);}}
  .dd-debug-column{display:flex;flex-direction:column;gap:16px;min-width:0;}
  .dd-card-description{font-size:13px;opacity:.72;margin:0;}
  .dd-atom-list{display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:40vh;overflow:auto;padding-right:4px;}
  .dd-atom-list__item{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 6px;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:background .12s ease,border-color .12s ease;}
  .dd-atom-list__item:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1);}
  .dd-atom-list__checkbox{accent-color:#5c7eff;}
  .dd-atom-list__label{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .dd-status-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.01em;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#f5f7ff;}
  .dd-status-chip.is-ok{color:#49d389;background:rgba(73,211,137,.14);border-color:rgba(73,211,137,.32);}
  .dd-status-chip.is-warn{color:#ffb760;background:rgba(255,183,96,.12);border-color:rgba(255,183,96,.32);}
  .dd-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
  .dd-toolbar--stretch{width:100%;}
  .dd-toolbar .qmm-input{min-width:160px;}
  .dd-toolbar .dd-grow{flex:1 1 220px;min-width:180px;}
  .dd-mute-chips{display:flex;flex-wrap:wrap;gap:6px;}
  .dd-log{position:relative;border:1px solid #ffffff18;border-radius:16px;background:#0b1016;padding:10px;max-height:48vh;overflow:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);}
  .dd-log__empty{padding:28px 12px;text-align:center;font-size:13px;opacity:.6;}
  .dd-log .ws-row{position:relative;display:grid;grid-template-columns:96px 20px minmax(0,1fr);gap:10px;padding:8px 12px;border-radius:12px;border:1px solid transparent;transition:background .15s ease,border-color .15s ease;align-items:start;margin:2px 0;}
  .dd-log .ws-row .ts{opacity:.76;font-size:12px;}
  .dd-log .ws-row .arrow{font-weight:600;}
  .dd-log .ws-row .body{white-space:pre-wrap;word-break:break-word;}
  .dd-log .ws-row .body code{font-family:inherit;font-size:12px;color:#dbe4ff;}
  .dd-log .ws-row .acts{position:absolute;top:6px;right:8px;display:flex;gap:6px;padding:4px 6px;background:rgba(13,18,25,.94);border:1px solid rgba(255,255,255,.18);border-radius:8px;opacity:0;visibility:hidden;transition:opacity .12s ease;z-index:1;}
  .dd-log .ws-row .acts .qmm-btn{padding:2px 6px;font-size:11px;}
  .dd-log .ws-row:hover .acts{opacity:1;visibility:visible;}
  .dd-log .ws-row:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.18);}
  .dd-log .ws-row.selected{background:rgba(92,126,255,.16);border-color:rgba(92,126,255,.42);}
  .dd-send-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
  .dd-send-controls .qmm-radio-group{display:flex;gap:10px;}
  .dd-textarea{min-height:140px;}
  .dd-inline-note{font-size:12px;opacity:.7;}
  .dd-log-filter-group{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
  .dd-script-log{position:relative;border:1px solid #ffffff18;border-radius:16px;background:#0b1016;max-height:48vh;overflow:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);}
  .dd-script-log__empty{padding:28px 12px;text-align:center;font-size:13px;opacity:.6;}
  .dd-script-log__row{display:grid;grid-template-columns:minmax(92px,96px) minmax(70px,90px) minmax(120px,160px) minmax(0,1fr);gap:12px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06);align-items:start;}
  .dd-script-log__row:last-child{border-bottom:none;}
  .dd-script-log__ts{font-size:12px;opacity:.7;font-family:var(--qmm-font-mono,monospace);}
  .dd-script-log__level{display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;min-width:58px;}
  .dd-script-log__level.is-debug{background:rgba(138,180,255,.14);color:#8ab4ff;border:1px solid rgba(138,180,255,.32);}
  .dd-script-log__level.is-info{background:rgba(92,126,255,.14);color:#9fb6ff;border:1px solid rgba(92,126,255,.32);}
  .dd-script-log__level.is-warn{background:rgba(255,183,96,.12);color:#ffb760;border:1px solid rgba(255,183,96,.32);}
  .dd-script-log__level.is-error{background:rgba(255,108,132,.16);color:#ff6c84;border:1px solid rgba(255,108,132,.32);}
  .dd-script-log__source{font-size:12px;font-weight:600;opacity:.85;}
  .dd-script-log__context{display:block;font-size:11px;opacity:.6;margin-top:2px;text-transform:uppercase;letter-spacing:.05em;}
  .dd-script-log__message-wrap{display:flex;flex-direction:column;gap:6px;}
  .dd-script-log__message{font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word;}
  .dd-script-log__actions{display:flex;gap:6px;justify-content:flex-end;align-self:flex-end;}
  .dd-script-log__actions button{padding:2px 8px;font-size:11px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:inherit;cursor:pointer;transition:background .12s ease,border-color .12s ease;}
  .dd-script-log__actions button:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.28);}
  .dd-script-log__details{grid-column:1/-1;margin:4px 0 0;background:#05080c;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;white-space:pre-wrap;font-family:var(--qmm-font-mono,monospace);font-size:12px;line-height:1.4;display:none;word-break:break-word;max-height:180px;overflow:auto;}
  .dd-script-log__row.is-open .dd-script-log__details{display:block;}
  .dd-log-source-chips{display:flex;flex-wrap:wrap;gap:6px;}
  .dd-log-toolbar-spacer{flex:1 1 auto;}
  .dd-audio-summary{display:grid;gap:4px;font-size:13px;}
  .dd-audio-summary strong{font-size:14px;}
  .dd-audio-volume{font-family:var(--qmm-font-mono,monospace);font-size:12px;opacity:.78;}
  .dd-audio-list{display:flex;flex-direction:column;gap:8px;margin-top:4px;max-height:48vh;overflow:auto;padding-right:4px;}
  .dd-audio-row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(9,12,18,.72);}
  .dd-audio-row__info{flex:1 1 260px;min-width:0;display:flex;flex-direction:column;gap:6px;}
  .dd-audio-row__title{font-weight:600;font-size:13px;word-break:break-word;}
  .dd-audio-meta{font-size:12px;opacity:.72;display:flex;flex-wrap:wrap;gap:8px;}
  .dd-audio-url{font-family:var(--qmm-font-mono,monospace);font-size:11px;word-break:break-all;color:#d6dcffb3;}
  .dd-audio-actions{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;}
  .dd-audio-empty{padding:24px 12px;text-align:center;font-size:13px;opacity:.6;}
  .dd-sprite-control-grid{display:grid;gap:12px;width:100%;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));align-items:end;}
  .dd-sprite-control{display:flex;flex-direction:column;gap:4px;font-size:12px;}
  .dd-sprite-control__label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.75;}
  .dd-sprite-control select,.dd-sprite-control input{width:100%;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(12,16,23,.9);color:#f5f7ff;font-size:13px;}
  .dd-sprite-control input[type="search"]::-webkit-search-cancel-button{filter:invert(1);}
  .dd-sprite-stats{font-size:13px;opacity:.75;margin:8px 0 0;}
  .dd-sprite-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}
  .dd-sprite-grid-wrap{max-height:65vh;overflow:auto;padding-right:6px;width:100%;}
  .dd-sprite-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));align-items:stretch;min-height:0;}
  .dd-sprite-grid__item{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(8,11,17,.85);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);min-width:0;cursor:pointer;outline:none;}
  .dd-sprite-grid__item:focus-visible{border-color:rgba(88,138,255,.6);box-shadow:0 0 0 1px rgba(88,138,255,.3);}
  .dd-sprite-grid__img{display:flex;align-items:center;justify-content:center;background:#05080d;border-radius:12px;border:1px solid rgba(255,255,255,.05);overflow:hidden;min-height:var(--sprite-size,96px);}
  .dd-sprite-grid__icon{width:var(--sprite-size,96px);height:var(--sprite-size,96px);display:flex;align-items:center;justify-content:center;}
  .dd-sprite-grid__icon img{max-width:100%;max-height:100%;object-fit:contain;}
  .dd-sprite-grid__name{font-weight:600;font-size:13px;word-break:break-word;}
  .dd-sprite-grid__meta{font-size:11px;opacity:.65;word-break:break-all;font-family:var(--qmm-font-mono,monospace);}
  .dd-sprite-grid__empty{grid-column:1/-1;text-align:center;padding:32px 12px;font-size:13px;opacity:.66;}
  .dd-sprite-mutation-card{display:flex;flex-direction:column;gap:12px;}
  .dd-sprite-mutation-group{display:flex;flex-direction:column;gap:6px;}
  .dd-sprite-mutation-group-title{font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.75;}
  .dd-sprite-mutation-buttons{display:flex;flex-wrap:wrap;gap:6px;}
  .dd-sprite-mutation-btn{padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(14,18,26,.8);color:#e4e8f1;font-size:12px;cursor:pointer;transition:background .12s ease,border-color .12s ease,color .12s ease;}
  .dd-sprite-mutation-btn:hover{border-color:rgba(255,255,255,.35);}
  .dd-sprite-mutation-btn.active{background:rgba(90,118,255,.18);border-color:rgba(90,118,255,.6);color:#9fb4ff;}
  `;
  document.head.appendChild(style);
}

export async function renderDebugDataMenu(root: HTMLElement) {
  ensureStyles();

  const ui = new Menu({ id: "debug-tools", compact: true });
  ui.mount(root);

  ui.addTab("jotai", "Jotai", (view) => renderJotaiTab(view, ui));
  ui.addTab("atoms-live", "Live atoms", (view) => renderLiveAtomsTab(view, ui));
  ui.addTab("sprite-assets", "Sprites", (view) => renderSpritesTab(view, ui));
  ui.addTab("audio-player", "Audio player", (view) => renderAudioPlayerTab(view, ui));
  ui.addTab("websocket", "WebSocket", (view) => renderWSTab(view, ui));
}
