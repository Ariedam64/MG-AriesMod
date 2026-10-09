import { h } from "../../ui/kit/dom";
import { toastSimple, type ToastVariant } from "../../ui/toast";

export function setBtnLabel(btn: HTMLButtonElement, text: string) {
  const label = btn.querySelector<HTMLElement>(".label");
  if (label) label.textContent = text;
  else btn.textContent = text;
}

export function toast(msg: string, type: ToastVariant = "warn") {
  void toastSimple(msg, "", type).catch(() => {});
}

/**
 * Empties a tab's view and returns the column its content goes in. The view
 * itself keeps only the kit's classes, so the tab bar still hides it.
 */
export function tabRoot(view: HTMLElement): HTMLDivElement {
  const root = h("div", "dd-view");
  view.replaceChildren(root);
  return root;
}

/** Cards side by side when the window is wide, stacked when it is narrow. */
export function cardGrid(parent: HTMLElement): HTMLDivElement {
  const grid = h("div", "dd-grid");
  parent.appendChild(grid);
  return grid;
}

/** Two columns of cards in a `cardGrid`, so a short card does not leave a hole beside a tall one. */
export function cardColumns(parent: HTMLElement): [HTMLDivElement, HTMLDivElement] {
  const grid = cardGrid(parent);
  const left = h("div", "dd-column");
  const right = h("div", "dd-column");
  grid.append(left, right);
  return [left, right];
}

/** A wrapping row of controls. Pass a field through `grow` to let it take the room left. */
export function bar(...children: HTMLElement[]): HTMLDivElement {
  const row = h("div", "dd-bar");
  row.append(...children);
  return row;
}

/** Controls pushed to the end of a `bar`. */
export function barEnd(...children: HTMLElement[]): HTMLDivElement {
  const end = h("div", "dd-bar__end");
  end.append(...children);
  return end;
}

export function grow<T extends HTMLElement>(el: T): T {
  el.classList.add("dd-grow");
  return el;
}

/** Monospace read-out box. `placeholder` shows while it is empty. */
export function codeBox(placeholder: string, tall = false): HTMLPreElement {
  const pre = h("pre", tall ? "dd-code dd-code--tall" : "dd-code");
  pre.dataset.placeholder = placeholder;
  return pre;
}

export function emptyNote(text: string): HTMLDivElement {
  return h("div", "dd-empty", text);
}

export function hint(text: string): HTMLParagraphElement {
  return h("p", "dd-hint", text);
}

export function copy(text: string) {
  const str = String(text ?? "");
  if (!str.length) return;

  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = str;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
    toast(ok ? "Copied" : "Copy failed", ok ? "success" : "error");
  };

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(str)
      .then(() => toast("Copied", "success"))
      .catch(fallback);
  } else {
    fallback();
  }
}

export function safeRegex(q: string) { try { return new RegExp(q, "i"); } catch { return /.*/i; } }
