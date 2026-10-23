// The fields the player fills in: category, title, what happened, which part
// of the mod, the optional details and a contact. Reading and filling them
// goes through one handle, which the draft and the submit both use.

import { BUG_REPORT_LIMITS as L } from "../../lib/bugReport/limits";
import type { BugReportCategory, BugReportFrequency, BugReportWithoutMod } from "../../lib/bugReport/types";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { h } from "../../ui/kit/dom";
import { select, textInput } from "../../ui/kit/fields";
import { collapsibleCard } from "../../ui/kit/layout";
import { registeredMenus } from "../../ui/kit/menuList";
import { segmented } from "../../ui/kit/segmented";
import { toggleChip } from "../../ui/kit/toggles";
import { DRAFT_FIELDS, type Draft } from "./draft";

const CATEGORIES: Array<[BugReportCategory, string]> = [
  ["bug", "Bug"],
  ["crash", "Crash or error"],
  ["visual", "Visual"],
  ["performance", "Performance"],
  ["feature", "Feature idea"],
  ["question", "Question"],
  ["other", "Other"],
];

const FREQUENCIES: Array<[BugReportFrequency, string]> = [
  ["unknown", "Not sure"],
  ["always", "Every time"],
  ["often", "Often"],
  ["sometimes", "Sometimes"],
  ["once", "Only once"],
];

const OTHER_AREA = "Other";
const DETAILS_OPEN_PATH = "bugReport.detailsOpen";

export type FormValues = {
  category: BugReportCategory;
  title: string;
  description: string;
  feature: string;
  steps: string;
  expected: string;
  actual: string;
  frequency: BugReportFrequency;
  withoutMod: BugReportWithoutMod;
  contact: string;
};

export type ValidatedField = "title" | "description";

export type ReportFields = {
  root: HTMLElement;
  read(): FormValues;
  /** Puts a draft back, leaving untouched any field it does not mention. */
  fill(draft: Draft): void;
  reset(keepContact: boolean): void;
  /** Flags one field with a message under it, or clears every flag with null. */
  markInvalid(field: ValidatedField | null, message?: string): void;
  focus(field: ValidatedField): void;
  /** Called on every change of any field. */
  onChange(cb: () => void): void;
};

let uid = 0;

function field(labelText: string, control: HTMLElement, opts: { optional?: boolean; hint?: string } = {}) {
  const root = h("label", "qws-bug-field");
  const label = h("span", "qws-bug-label", labelText);
  if (opts.optional) label.append(" ", h("span", "qws-bug-label__optional", "(optional)"));
  const hint = h("span", "qws-bug-hint", opts.hint ?? "");
  root.append(label, control, hint);
  return { root, hint, defaultHint: opts.hint ?? "" };
}

function option(label: string, value: string): HTMLOptionElement {
  const opt = h("option", undefined, label);
  opt.value = value;
  return opt;
}

function textArea(placeholder: string, max: number, rows: number, short = false): HTMLTextAreaElement {
  const area = h("textarea", short ? "qmm-input qws-bug-textarea qws-bug-textarea--short" : "qmm-input qws-bug-textarea");
  area.placeholder = placeholder;
  area.maxLength = max;
  area.rows = rows;
  return area;
}

/** The mod's menus as the parts a report can be about, in dock order, then "Other". */
function areaSelect(): HTMLSelectElement {
  const sel = select({ placeholder: "Pick a menu or feature" });
  for (const menu of registeredMenus()) {
    if (menu.id === "bug-report") continue;
    sel.append(option(menu.title, menu.title));
  }
  sel.append(option("Something else, or not sure", OTHER_AREA));
  return sel;
}

export function buildReportFields(): ReportFields {
  const listeners: Array<() => void> = [];
  const changed = () => listeners.forEach((cb) => cb());
  const name = `qws-bug-category-${++uid}`;

  const chips = h("div", "qws-bug-chips");
  chips.setAttribute("role", "radiogroup");
  chips.setAttribute("aria-label", "Category");
  const categoryInputs = CATEGORIES.map(([value, label]) => {
    const chip = toggleChip(label, { type: "radio", name, value, checked: value === "bug" });
    chip.input.addEventListener("change", changed);
    chips.appendChild(chip.root);
    return chip.input;
  });
  const categoryRow = h("div", "qws-bug-field");
  categoryRow.append(h("span", "qws-bug-label", "What kind of report?"), chips);

  const title = textInput("Short summary, e.g. Pet team hotkeys do nothing");
  title.maxLength = L.title.max;
  const titleField = field("Title", title);

  const description = textArea("What were you doing, what went wrong, and since when?", L.description.max, 5);
  const descriptionField = field("What happened?", description, { hint: `At least ${L.description.min} characters.` });

  const area = areaSelect();
  const areaField = field("Which part of the mod?", area, { optional: true });

  const steps = textArea("1. Open Pets\n2. Press 1\n3. ...", L.steps, 3);
  const expected = textArea("What should have happened?", L.expected, 2, true);
  const actual = textArea("What happened instead?", L.actual, 2, true);
  const frequency = select();
  for (const [value, label] of FREQUENCIES) frequency.append(option(label, value));
  const withoutMod = segmented<BugReportWithoutMod>(
    [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "unknown", label: "Not sure" },
    ],
    "unknown",
    changed,
    { ariaLabel: "Does it happen without the mod?" },
  );

  const details = collapsibleCard({
    title: "More details",
    description: "Steps, what you expected, how often. Optional, but it helps a lot.",
    collapsed: readAriesPath<boolean>(DETAILS_OPEN_PATH) !== true,
    onToggle: (collapsed) => writeAriesPath(DETAILS_OPEN_PATH, collapsed ? undefined : true),
  });
  const pair = h("div", "qws-bug-row");
  pair.append(field("Expected", expected).root, field("Actual", actual).root);
  const withoutModField = h("div", "qws-bug-field");
  withoutModField.append(
    h("span", "qws-bug-label", "Does it happen without the mod?"),
    withoutMod,
    h("p", "qws-bug-hint", "If you can, turn the mod off in your userscript manager, reload, and try again."),
  );
  details.body.append(field("Steps to make it happen", steps).root, pair, field("How often?", frequency).root, withoutModField);

  const contact = textInput("Discord name or email");
  contact.maxLength = L.contact;
  const contactField = field("Contact", contact, {
    optional: true,
    hint: "Only if you are happy to be contacted about this report.",
  });

  for (const el of [title, description, steps, expected, actual, contact]) el.addEventListener("input", changed);
  for (const el of [area, frequency]) el.addEventListener("change", changed);

  const root = h("div", "qws-bug-stack");
  root.append(categoryRow, titleField.root, descriptionField.root, areaField.root, details.root, contactField.root);

  const texts: Record<string, HTMLInputElement | HTMLTextAreaElement> = { title, description, steps, expected, actual, contact };
  const setSelect = (sel: HTMLSelectElement, value: string | undefined) => {
    if (value !== undefined && Array.from(sel.options).some((opt) => opt.value === value && !opt.disabled)) sel.value = value;
  };
  const invalid = { title: titleField, description: descriptionField };

  const handle: ReportFields = {
    root,
    read() {
      const checked = categoryInputs.find((input) => input.checked);
      return {
        category: (checked?.value as BugReportCategory) || "bug",
        title: title.value,
        description: description.value,
        feature: area.value,
        steps: steps.value,
        expected: expected.value,
        actual: actual.value,
        frequency: (frequency.value as BugReportFrequency) || "unknown",
        withoutMod: withoutMod.get(),
        contact: contact.value,
      };
    },
    fill(draft) {
      for (const key of DRAFT_FIELDS) {
        const value = draft[key];
        if (value === undefined) continue;
        if (key in texts) texts[key].value = value;
      }
      if (draft.category) categoryInputs.forEach((input) => (input.checked = input.value === draft.category));
      setSelect(area, draft.feature);
      setSelect(frequency, draft.frequency);
      if (draft.withoutMod === "yes" || draft.withoutMod === "no" || draft.withoutMod === "unknown") withoutMod.set(draft.withoutMod);
      // Details already written stay in sight.
      if ((draft.steps || draft.expected || draft.actual) && details.root.classList.contains("is-collapsed")) {
        details.root.querySelector<HTMLButtonElement>(".qmm-collapse__head")?.click();
      }
    },
    reset(keepContact) {
      for (const [key, el] of Object.entries(texts)) if (key !== "contact" || !keepContact) el.value = "";
      categoryInputs.forEach((input) => (input.checked = input.value === "bug"));
      area.selectedIndex = 0;
      frequency.value = "unknown";
      withoutMod.set("unknown");
      handle.markInvalid(null);
    },
    markInvalid(which, message) {
      for (const [key, entry] of Object.entries(invalid)) {
        const on = key === which;
        entry.root.classList.toggle("is-invalid", on);
        entry.hint.textContent = on && message ? message : entry.defaultHint;
      }
    },
    focus(which) {
      (which === "title" ? title : description).focus();
    },
    onChange(cb) {
      listeners.push(cb);
    },
  };
  return handle;
}
