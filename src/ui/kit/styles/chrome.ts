// Scrollbars, the tabbed menu shell, HUD windows and the HUD box itself.

import { layer } from "../theme";

export const chromeCss = `
/* Any rule setting display beats the browser's own [hidden] rule, so kit
   elements restate it, important to also beat compound selectors. */
[class*="qmm"][hidden], [class*="qws"][hidden] { display: none !important; }

.qmm-scroll, .qws-pnl-scroll, .qmm-views {
  scrollbar-width: thin; scrollbar-color: var(--qmm-scrollbar) transparent;
}
.qmm-scroll::-webkit-scrollbar, .qws-pnl-scroll::-webkit-scrollbar, .qmm-views::-webkit-scrollbar { width: 6px; }
.qmm-scroll::-webkit-scrollbar-track, .qws-pnl-scroll::-webkit-scrollbar-track, .qmm-views::-webkit-scrollbar-track { background: transparent; }
.qmm-scroll::-webkit-scrollbar-thumb, .qws-pnl-scroll::-webkit-scrollbar-thumb, .qmm-views::-webkit-scrollbar-thumb {
  background: var(--qmm-scrollbar); border-radius: 3px;
}
.qmm-scroll::-webkit-scrollbar-thumb:hover, .qws-pnl-scroll::-webkit-scrollbar-thumb:hover, .qmm-views::-webkit-scrollbar-thumb:hover {
  background: var(--qmm-accent-border);
}

.qmm { display: flex; flex-direction: column; gap: var(--qmm-space-lg); color: var(--qmm-text); }
.qmm-compact { gap: var(--qmm-space-sm); }
.qmm.qmm-alt-drag { cursor: grab; }
.qmm.qmm-alt-drag:active { cursor: grabbing; }

.qmm-tabs {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-xs); padding: 8px 10px;
  border-bottom: 1px solid var(--qmm-border);
  border-radius: var(--qmm-radius-xl) var(--qmm-radius-xl) 0 0;
  background: var(--qmm-gradient-tab-bar);
}
.qmm-tab {
  flex: 1 1 0; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: var(--qmm-space-md);
  margin: 0; padding: 8px 12px; border: 1px solid transparent; border-radius: var(--qmm-radius-lg);
  background: transparent; color: var(--qmm-text-soft); font-size: var(--qmm-fs-md); cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.qmm-compact .qmm-tab { padding: 6px 10px; }
.qmm-tab:hover { background: var(--qmm-hover-bg); color: var(--qmm-text); }
.qmm-tab:active { transform: translateY(1px); }
.qmm-tab:focus-visible { outline: 2px solid var(--qmm-accent); outline-offset: 2px; }
.qmm-tab.active { background: var(--qmm-accent-soft); border-color: var(--qmm-accent-border); color: var(--qmm-accent); }

.qmm-views {
  display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: auto; padding: 14px;
  border: 1px solid var(--qmm-border-strong); border-radius: var(--qmm-radius-xl);
  background: var(--qmm-gradient-panel); backdrop-filter: blur(10px); box-shadow: var(--qmm-shadow-panel);
}
.qmm-compact .qmm-views { padding: 8px; }
.qmm-tabs + .qmm-views { border-top: none; border-top-left-radius: 0; border-top-right-radius: 0; }
.qmm-view { display: none; min-width: 0; min-height: 0; }
.qmm-view.active { display: block; }

.qmm-spacer { flex: 1; }

.qws-win {
  position: fixed; z-index: ${layer.window}; min-width: 260px; max-width: 900px; max-height: 90vh; overflow: auto;
  color: var(--qmm-text); background: var(--qmm-panel-bg);
  border: 1px solid var(--qmm-border-strong); border-radius: var(--qmm-radius-lg);
  box-shadow: var(--qmm-shadow-window); backdrop-filter: blur(8px);
}
.qws-win.is-hidden { display: none !important; }
.qws-win .w-head {
  display: flex; align-items: center; gap: var(--qmm-space-md); padding: 10px 12px; cursor: move;
  border-bottom: 1px solid var(--qmm-border-strong);
  border-radius: var(--qmm-radius-lg) var(--qmm-radius-lg) 0 0;
  background: var(--qmm-gradient-head);
}
.qws-win .w-title { font-weight: 700; }
.qws-win .w-body { padding: 12px; }

/* Bare text and number inputs a feature builds inside a window get the field look too. */
.qws-win input:is([type="text"], [type="number"]):not(.qmm-input, .qws-pnl-input) {
  padding: 8px 10px; border: 1px solid var(--qmm-field-border); border-radius: var(--qmm-radius-md);
  background: var(--qmm-field-bg); color: var(--qmm-text);
}
.qws-win input:is([type="text"], [type="number"]):not(.qmm-input, .qws-pnl-input):focus {
  outline: none; border-color: var(--qmm-accent-border-hover);
}
/* Windows give text and number fields one width; an inline width still wins. */
.qws-win input[type="text"], .qws-win input[type="number"] { width: 120px; }

.qws2 {
  position: fixed; right: 16px; bottom: 16px; z-index: ${layer.hud};
  display: flex; flex-direction: column; gap: var(--qmm-space-md); min-width: 160px; padding: 10px 12px;
  font: 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: var(--qmm-text);
  background: var(--qmm-panel-bg); border: 1px solid var(--qmm-border-strong); border-radius: var(--qmm-radius-lg);
  box-shadow: var(--qmm-shadow-window); backdrop-filter: blur(8px);
}
.qws2.hidden { display: none; }
.qws2 .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); }
.qws2 .title { font-weight: 700; letter-spacing: .2px; }
.qws2 .drag { cursor: move; opacity: .9; }
.qws2 .mini { display: none; }
.qws2.min .mini { display: inline-flex; }
.qws2.min .body { display: none; }
.qws2 .is-link { cursor: pointer; }

.qws-launch { margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--qmm-border-strong); }
.qws-launch .launch-item { display: flex; align-items: center; gap: var(--qmm-space-md); margin: 4px 0; }
.qws-launch .launch-item .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
