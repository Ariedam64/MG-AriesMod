import { button } from "../../../ui/kit/button";
import { h } from "../../../ui/kit/dom";
import { switchInput, type SwitchInput } from "../../../ui/kit/toggles";
import type { NotifierContext } from "../playbackDefaults";
import { NotifierRules, formatRuleSummary, hasRule } from "../rules";
import { closeRuleEditor, openRuleEditor } from "./ruleEditor";
import { ensureMenuStyles } from "./styles";

/**
 * The list the Shops and Weather tabs share: one row per item, with its icon,
 * name and details, its custom rule summary, the rule button and the alert switch.
 */

export type AlertRow = {
  id: string;
  name: string;
  /** Shown under the name in the rule editor. */
  type: string;
  context: NotifierContext;
  icon: HTMLElement;
  /** Shown right after the name, such as a "Current" pill. */
  badge?: HTMLElement;
  /** Lines under the name. */
  details: HTMLElement[];
  /** Outlines the row, for the weather happening now. */
  highlight?: boolean;
  alertOn: boolean;
  onAlertChange: (on: boolean) => void;
};

type RenderedRow = { gear: HTMLButtonElement; summary: HTMLElement; toggle: SwitchInput };

export class AlertList {
  /** The scrolling area; the tab puts it under its own toolbar. */
  readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly rows = new Map<string, RenderedRow>();

  constructor(private readonly emptyText: string) {
    ensureMenuStyles();
    this.root = h("div", "qws-al-scroll qmm-scroll");
    this.list = h("div", "qws-al-list");
    this.root.appendChild(this.list);
  }

  /** Replaces every row; an empty list shows the empty text. */
  setRows(rows: AlertRow[]): void {
    closeRuleEditor();
    this.rows.clear();
    if (!rows.length) {
      this.list.replaceChildren(h("div", "qws-al-empty", this.emptyText));
      return;
    }
    this.list.replaceChildren(...rows.map((row) => this.renderRow(row)));
  }

  private renderRow(row: AlertRow): HTMLDivElement {
    const el = h("div", row.highlight ? "qws-al-row is-current" : "qws-al-row");
    row.icon.classList.add("qws-al-icon");

    const name = h("div", "qws-al-name");
    name.appendChild(h("span", undefined, row.name));
    if (row.badge) name.appendChild(row.badge);
    const summary = h("div", "qws-al-summary");
    const text = h("div", "qws-al-text");
    text.append(name, ...row.details, summary);

    const gear = button("", { icon: "⚙", ariaLabel: `Custom rule for ${row.name}` });
    gear.classList.add("qws-rule-btn");
    gear.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openRuleEditor({ id: row.id, name: row.name, type: row.type, context: row.context }, gear);
    });
    const toggle = switchInput(row.alertOn, (on) => row.onAlertChange(on));
    toggle.setAttribute("aria-label", `Alert for ${row.name}`);

    const actions = h("div", "qws-al-actions");
    actions.append(gear, toggle);
    el.append(row.icon, text, actions);

    const rendered: RenderedRow = { gear, summary, toggle };
    this.rows.set(row.id, rendered);
    this.showRule(rendered, row.id);
    return el;
  }

  /** Redraws every row's rule button and summary. */
  refreshRules(): void {
    for (const [id, row] of this.rows) this.showRule(row, id);
  }

  private showRule(row: RenderedRow, id: string): void {
    const rule = NotifierRules.get(id);
    const summary = hasRule(rule) ? formatRuleSummary(rule) : "";
    row.gear.dataset.active = hasRule(rule) ? "1" : "0";
    row.gear.title = summary ? `Custom rule: ${summary}` : "Custom rule";
    row.summary.textContent = summary;
  }

  /** Updates one row's switch without redrawing it. `locked` greys it out with a reason. */
  setAlert(id: string, on: boolean, locked: string | null = null): void {
    const row = this.rows.get(id);
    if (!row) return;
    row.toggle.checked = on;
    row.toggle.disabled = !!locked;
    row.toggle.title = locked ?? "";
  }

  renderedIds(): Set<string> {
    return new Set(this.rows.keys());
  }
}
