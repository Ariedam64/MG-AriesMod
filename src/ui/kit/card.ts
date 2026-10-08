import { h, iconNode } from "./dom";

export type CardOptions = {
  subtitle?: string;
  /** Same as `subtitle`, kept for older callers. */
  description?: string;
  icon?: string | HTMLElement;
  maxWidth?: number | string;
  align?: "left" | "center" | "stretch";
  tone?: "default" | "muted" | "accent";
  padding?: string;
  gap?: number;
  actions?: HTMLElement[];
  compactHeader?: boolean;
};

export type CardHandle = {
  root: HTMLDivElement;
  header: HTMLDivElement;
  body: HTMLDivElement;
  setTitle(next: string): void;
};

/** A titled card: header (icon, title, subtitle, actions) above a body. */
export function card(title: string, opts: CardOptions = {}): CardHandle {
  const root = h("div", "qmm-card");
  root.dataset.tone = opts.tone || "default";
  if (opts.align === "center") root.classList.add("is-center");
  if (opts.align === "stretch") root.classList.add("is-stretch");
  if (opts.padding) root.style.padding = opts.padding;
  if (opts.gap != null) root.style.gap = `${opts.gap}px`;
  if (opts.maxWidth) {
    const max = typeof opts.maxWidth === "number" ? `${opts.maxWidth}px` : opts.maxWidth;
    root.style.width = `min(${max}, 100%)`;
  }

  const header = h("div", opts.compactHeader ? "qmm-card__header is-compact" : "qmm-card__header");
  if (opts.icon) header.appendChild(iconNode(opts.icon, "qmm-card__icon"));
  const titleEl = h("div", "qmm-card__title", title);
  header.appendChild(titleEl);
  const subtitle = opts.subtitle || opts.description;
  if (subtitle) header.appendChild(h("div", "qmm-card__subtitle", subtitle));
  if (opts.actions?.length) {
    const actions = h("div", "qmm-card__actions");
    actions.append(...opts.actions);
    header.appendChild(actions);
  }

  const body = h("div", "qmm-card__body");
  root.append(header, body);
  return { root, header, body, setTitle: (next) => (titleEl.textContent = next) };
}

/** An untitled card: a bordered column that callers fill directly. */
export function plainCard(): HTMLDivElement {
  return h("div", "qmm-card qmm-card--plain");
}

/** Small uppercase heading above a group of settings. */
export function sectionLabel(text: string): HTMLDivElement {
  return h("div", "qmm-section-label", text);
}

export type ErrorBarHandle = {
  el: HTMLDivElement;
  show(message: string): void;
  clear(): void;
};

/** A red message strip, hidden until `show` is called. */
export function errorBar(): ErrorBarHandle {
  const el = h("div", "qmm-error");
  el.hidden = true;
  return {
    el,
    show(message) {
      el.textContent = message;
      el.hidden = false;
    },
    clear() {
      el.textContent = "";
      el.hidden = true;
    },
  };
}
