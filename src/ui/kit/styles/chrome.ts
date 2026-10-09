// Scrollbars, the tabbed menu shell, HUD windows and the dock.

import { layer } from "../theme";

export const chromeCss = `
/* Any rule setting display beats the browser's own [hidden] rule, so kit
   elements restate it, important to also beat compound selectors. */
[class*="qmm"][hidden], [class*="qws"][hidden] { display: none !important; }

.qmm, .qws-win, .qws-dock, .qmm-modal { font-family: var(--qmm-font); }

.qmm-scroll, .qws-pnl-scroll, .qmm-views, .qws-win .w-body, .qws-dock {
  scrollbar-width: thin; scrollbar-color: var(--qmm-scrollbar) transparent;
}
.qmm-scroll::-webkit-scrollbar, .qws-pnl-scroll::-webkit-scrollbar, .qmm-views::-webkit-scrollbar,
.qws-win .w-body::-webkit-scrollbar, .qws-dock::-webkit-scrollbar { width: 8px; }
.qmm-scroll::-webkit-scrollbar-track, .qws-pnl-scroll::-webkit-scrollbar-track, .qmm-views::-webkit-scrollbar-track,
.qws-win .w-body::-webkit-scrollbar-track, .qws-dock::-webkit-scrollbar-track { background: transparent; }
.qmm-scroll::-webkit-scrollbar-thumb, .qws-pnl-scroll::-webkit-scrollbar-thumb, .qmm-views::-webkit-scrollbar-thumb,
.qws-win .w-body::-webkit-scrollbar-thumb, .qws-dock::-webkit-scrollbar-thumb {
  background: var(--qmm-scrollbar); border-radius: 4px;
}

.qmm { display: flex; flex-direction: column; gap: var(--qmm-space-lg); color: var(--qmm-text); }
.qmm-compact { gap: var(--qmm-space-sm); }
.qmm.qmm-alt-drag { cursor: grab; }
.qmm.qmm-alt-drag:active { cursor: grabbing; }

.qmm-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-sm); padding: 0 0 12px; }
.qmm-tab {
  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: var(--qmm-space-sm);
  height: 36px; margin: 0; padding: 0 16px; border: 0; border-radius: var(--qmm-radius-pill);
  background: var(--qmm-sand); color: var(--qmm-text-soft);
  font-family: var(--qmm-font); font-size: var(--qmm-fs-md); font-weight: 800; cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.qmm-compact .qmm-tab { height: 32px; padding: 0 12px; }
.qmm-tab:hover { background: var(--qmm-border-hover); color: var(--qmm-text); }
.qmm-tab:active { transform: translateY(1px); }
.qmm-tab:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
.qmm-tab.active { background: var(--qmm-bark); color: var(--qmm-paper); }

.qmm-views { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: auto; padding: 0; }
.qmm-view { display: none; min-width: 0; min-height: 0; }
.qmm-view.active { display: block; }

.qmm-spacer { flex: 1; }

.qws-win {
  position: fixed; z-index: ${layer.window}; display: flex; flex-direction: column;
  min-width: 280px; max-width: 900px; max-height: 90vh; overflow: hidden;
  color: var(--qmm-text); background: var(--qmm-paper);
  border: 3px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-xl);
  box-shadow: var(--qmm-shadow-raise);
}
.qws-win.is-hidden { display: none !important; }
.qws-win .w-head {
  display: flex; align-items: center; gap: var(--qmm-space-md); flex: 0 0 auto;
  min-height: 56px; padding: 0 12px 0 18px; cursor: move;
  background: var(--qmm-leaf); color: var(--qmm-on-leaf);
}
.qws-win .w-title { font-size: 18px; font-weight: 900; letter-spacing: .01em; }
.qws-win .w-head .w-btn {
  width: 34px; height: 34px; padding: 0; border: 0; border-radius: 12px;
  background: var(--qmm-leaf-shade); color: var(--qmm-on-leaf); box-shadow: none; font-weight: 900;
}
.qws-win .w-head .w-btn:hover { background: var(--qmm-bark); }
.qws-win .w-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px; }

/* Bare text and number inputs a feature builds inside a window get the field look too. */
.qws-win input:is([type="text"], [type="number"]):not(.qmm-input, .qws-pnl-input) {
  padding: 8px 10px; border: 2px solid var(--qmm-field-border); border-radius: var(--qmm-radius-md);
  background: var(--qmm-field-bg); color: var(--qmm-text); font-family: var(--qmm-font);
}
.qws-win input:is([type="text"], [type="number"]):not(.qmm-input, .qws-pnl-input):focus {
  outline: none; border-color: var(--qmm-leaf); box-shadow: 0 0 0 3px var(--qmm-leaf-soft);
}
/* Windows give text and number fields one width; an inline width still wins. */
.qws-win input[type="text"], .qws-win input[type="number"] { width: 120px; }

.qws-dock {
  position: fixed; left: 12px; top: 50%; transform: translateY(-50%); z-index: ${layer.hud};
  display: flex; flex-direction: column; align-items: center; gap: var(--qmm-space-sm);
  max-height: calc(100vh - 24px); overflow-y: auto; overflow-x: visible; padding: 8px;
  background: var(--qmm-paper); border: 3px solid var(--qmm-sand-edge); border-radius: 22px;
  box-shadow: var(--qmm-shadow-raise-small);
}
.qws-dock.hidden { display: none; }
.qws-dock-status {
  flex: 0 0 auto; width: 10px; height: 10px; margin: 2px 0 4px; border-radius: 50%;
  background: var(--qmm-amber); box-shadow: 0 0 0 2px var(--qmm-paper-deep);
}
.qws-dock-status[data-tone="ok"] { background: var(--qmm-leaf); }
.qws-dock-status[data-tone="bad"] { background: var(--qmm-clay); }
.qws-dock-btn {
  position: relative; flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  width: 48px; height: 48px; padding: 0; border: 0; border-radius: 16px;
  background: var(--qmm-sand); color: var(--qmm-text-soft);
  box-shadow: inset 0 -4px 0 var(--qmm-border-hover); cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.qws-dock-btn:hover { background: var(--qmm-border-hover); color: var(--qmm-text); }
.qws-dock-btn:active { transform: translateY(2px); box-shadow: none; }
.qws-dock-btn:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
.qws-dock-btn.open {
  background: var(--qmm-leaf-strong); color: var(--qmm-on-leaf); box-shadow: inset 0 -4px 0 var(--qmm-leaf-shade);
}
.qws-dock-btn svg { width: 24px; height: 24px; pointer-events: none; }
.qws-dock-badge {
  position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; border-radius: var(--qmm-radius-pill);
  border: 2px solid var(--qmm-paper); background: var(--qmm-clay); color: var(--qmm-on-leaf);
  font: 900 11px var(--qmm-font);
}
.qws-dock-tip {
  position: fixed; z-index: ${layer.hud}; padding: 6px 10px; border-radius: var(--qmm-radius-md);
  background: var(--qmm-bark); color: var(--qmm-paper); font: 800 var(--qmm-fs-md) var(--qmm-font);
  white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 100ms ease;
}
.qws-dock-tip.shown { opacity: 1; }

/* The version pill in Settings, Infos links to the download when behind. */
.qmm-pill.is-link { cursor: pointer; }
`;
