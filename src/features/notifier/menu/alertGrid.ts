import { button } from "../../../ui/kit/button";
import { plainCard } from "../../../ui/kit/card";
import { h } from "../../../ui/kit/dom";
import { switchInput, type SwitchInput } from "../../../ui/kit/toggles";
import type { NotifierContext } from "../playbackDefaults";
import { NotifierRules, formatRuleSummary, hasRule } from "../rules";
import { closeRuleEditor, openRuleEditor } from "./ruleEditor";
import { ensureMenuStyles } from "./styles";

/**
 * The four-column list the Shops and Weather tabs share: the item, one
 * column of the tab's own, the alert switch and the custom rule button.
 */

export type AlertGridRow = {
  id: string;
  name: string;
  /** Shown under the name in the rule editor. */
  type: string;
  context: NotifierContext;
  /** The first column's content. */
  item: HTMLElement;
  /** Where the rule summary goes, inside `item`; optional. */
  summary?: HTMLElement;
  /** The second column's content. */
  detail: HTMLElement;
  alertOn: boolean;
  onAlertChange: (on: boolean) => void;
};

type RenderedRow = { gear: HTMLButtonElement; summary?: HTMLElement; toggle: SwitchInput };

const CELL_BORDER = "1px solid var(--qmm-border)";

function headCell(text: string, align: "left" | "center"): HTMLDivElement {
  const el = h("div", undefined, text);
  Object.assign(el.style, {
    fontWeight: "600",
    opacity: "0.9",
    padding: "4px 6px",
    display: "flex",
    alignItems: "center",
    justifyContent: align === "left" ? "flex-start" : "center",
  });
  return el;
}

function centeredCell(child: HTMLElement): HTMLDivElement {
  const cell = h("div");
  Object.assign(cell.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderBottom: CELL_BORDER,
    padding: "4px 6px",
    boxSizing: "border-box",
  });
  cell.appendChild(child);
  return cell;
}

/** The line under an item's name that sums up its custom rule. */
export function ruleSummaryLine(): HTMLDivElement {
  const el = h("div", "qws-rule-summary");
  el.style.visibility = "hidden";
  return el;
}

export class AlertGrid {
  readonly root: HTMLDivElement;
  private readonly head: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly rows = new Map<string, RenderedRow>();

  /** `firstColumnMin` is the item column's minimum width. */
  constructor(headers: [string, string, string, string], firstColumnMin: string, private readonly emptyText: string) {
    ensureMenuStyles();
    const columns = `minmax(${firstColumnMin}, 1fr) 9rem 7rem 8rem`;

    this.root = plainCard();
    Object.assign(this.root.style, { display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden", minHeight: "0" });

    this.head = h("div");
    Object.assign(this.head.style, {
      display: "grid",
      gridTemplateColumns: columns,
      justifyContent: "start",
      borderBottom: "1px solid var(--qmm-border-strong)",
      padding: "0 0 4px 0",
      boxSizing: "border-box",
    });
    this.head.append(
      headCell(headers[0], "left"),
      headCell(headers[1], "center"),
      headCell(headers[2], "center"),
      headCell(headers[3], "center"),
    );

    this.body = h("div");
    Object.assign(this.body.style, {
      display: "grid",
      gridTemplateColumns: columns,
      justifyContent: "start",
      gridAutoRows: "auto",
      alignContent: "start",
      minHeight: "0",
      height: "100%",
      overflow: "auto",
      overscrollBehavior: "contain",
      width: "100%",
      scrollbarGutter: "stable",
    });

    this.root.append(this.head, this.body);
    // Keep the header columns over the body's, whatever the scrollbar takes.
    new ResizeObserver(() => this.alignHeader()).observe(this.body);
    window.addEventListener("resize", () => this.alignHeader());
  }

  private alignHeader(): void {
    this.head.style.paddingRight = `${this.body.offsetWidth - this.body.clientWidth}px`;
  }

  /** Replaces every row; an empty list shows the empty text. */
  setRows(rows: AlertGridRow[]): void {
    closeRuleEditor();
    this.body.replaceChildren();
    this.rows.clear();
    if (!rows.length) {
      const empty = h("div", undefined, this.emptyText);
      Object.assign(empty.style, { opacity: "0.75", gridColumn: "1 / -1", padding: "8px" });
      this.body.appendChild(empty);
    }
    for (const row of rows) this.addRow(row);
    this.alignHeader();
  }

  private addRow(row: AlertGridRow): void {
    row.item.style.borderBottom = CELL_BORDER;

    const toggle = switchInput(row.alertOn, (on) => row.onAlertChange(on));

    const gear = button("", { icon: "⚙", size: "sm", tooltip: "Custom rule", ariaLabel: `Custom rule for ${row.name}` });
    gear.classList.add("qws-rule-btn");
    gear.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openRuleEditor({ id: row.id, name: row.name, type: row.type, context: row.context }, gear);
    });

    this.body.append(row.item, centeredCell(row.detail), centeredCell(toggle), centeredCell(gear));
    const rendered: RenderedRow = { gear, summary: row.summary, toggle };
    this.rows.set(row.id, rendered);
    this.showRule(rendered, row.id);
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
    if (row.summary) {
      row.summary.textContent = summary;
      row.summary.style.visibility = summary ? "visible" : "hidden";
    }
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
