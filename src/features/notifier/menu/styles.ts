/** The few rules the alerts menu needs beyond the kit: the gear button and the rule popover. */

const STYLE_ID = "qws-rule-style";

const CSS = `
.qws-rule-btn {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  min-width: 32px;
  padding: 0;
  border-radius: 8px;
  line-height: 1;
  font-size: 18px;
  box-sizing: border-box;
}
.qws-rule-btn[data-active="1"] {
  color: var(--qmm-accent);
  background: var(--qmm-accent-soft);
  border-color: var(--qmm-accent-border);
}
.qws-rule-popover {
  position: fixed;
  z-index: 99999999999999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 260px;
  max-width: 320px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--qmm-border-strong);
  background: var(--qmm-gradient-panel);
  box-shadow: var(--qmm-shadow-panel);
  color: var(--qmm-text);
}
.qws-rule-popover .qws-rule-field { display: grid; gap: 6px; }
.qws-rule-popover .qws-rule-field > label { font-weight: 600; font-size: 13px; }
.qws-rule-popover .qws-rule-hint { opacity: .7; font-size: 11px; }
.qws-rule-popover .qws-rule-actions { display: flex; justify-content: space-between; gap: 8px; }
.qws-rule-summary {
  min-height: 1.2em;
  opacity: .75;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;

export function ensureMenuStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
