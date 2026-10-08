// The shared popup shell, and the clickable entry popups list.
//
// HUD windows raise their z-index on focus, and a popup lives outside the
// window that opens it. Getting both of those right is why this file exists:
// copied into each popup, they were forgotten every other time.

import { h } from "./dom";
import { layer } from "./theme";

export type MenuCardOptions = {
  name: string;
  /** One line: what the entry does, or why it cannot do anything. */
  detail: string;
  /** Rendered greyed out, with the detail in the accent so it reads as a reason. */
  disabled?: boolean;
  onClick(): void;
};

/**
 * A clickable list entry: a name and a line of explanation.
 *
 * An unavailable entry stays visible but greyed out: hiding it would suggest
 * it does not exist.
 */
export function menuCard(options: MenuCardOptions): HTMLButtonElement {
  const card = h("button", "qmm-menu-card");
  card.type = "button";
  card.disabled = options.disabled === true;
  card.append(h("div", "qmm-menu-card__name", options.name), h("div", "qmm-menu-card__detail", options.detail));
  if (!card.disabled) card.addEventListener("click", options.onClick);
  return card;
}

export type ModalOptions = {
  /** The HUD window that opened the popup: used for stacking and closing. */
  host: HTMLElement;
  title: string;
  /** Maximum panel width. */
  widthPx?: number;
  /** Maximum panel height, capped at 88vh in any case. */
  maxHeightPx?: number;
  onClose?: () => void;
};

export type Modal = {
  /** The scrolling body: content goes here. */
  body: HTMLElement;
  /** The bottom bar, hidden while it is empty. */
  footer: HTMLElement;
  close(): void;
  isOpen(): boolean;
};

export function openModal(options: ModalOptions): Modal {
  let closed = false;

  const scrim = h("div", "qmm-modal-scrim");
  // Stack just above the calling window: HUD windows climb one step on every
  // focus, so a fixed value would end up underneath.
  const hostZ = Number.parseInt(getComputedStyle(options.host).zIndex, 10);
  scrim.style.zIndex = String((Number.isFinite(hostZ) ? hostZ : layer.window) + 1);

  const panel = h("div", "qmm-modal");
  panel.style.width = `min(${options.widthPx ?? 420}px, 100%)`;
  panel.style.maxHeight = `min(${options.maxHeightPx ?? 520}px, 88vh)`;
  // A click inside the popup must not close it.
  panel.addEventListener("click", (event) => event.stopPropagation());

  const closeButton = h("button", "qmm-modal__close", "✕");
  closeButton.type = "button";
  closeButton.title = "Close";
  closeButton.addEventListener("click", () => close());

  const header = h("div", "qmm-modal__head");
  header.append(h("div", "qmm-modal__title", options.title), closeButton);
  const body = h("div", "qmm-modal__body qmm-scroll");
  const footer = h("div", "qmm-modal__foot");

  panel.append(header, body, footer);
  scrim.append(panel);

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }

  function close(): void {
    if (closed) return;
    closed = true;
    clearInterval(hostWatch);
    document.removeEventListener("keydown", onKeyDown, true);
    scrim.remove();
    options.onClose?.();
  }

  // The popup outlives its window otherwise, left alone on screen with nothing
  // to dismiss it.
  const hostWatch = window.setInterval(() => {
    if (!options.host.isConnected) close();
  }, 1000);

  scrim.addEventListener("click", () => close());
  document.addEventListener("keydown", onKeyDown, true);
  (document.documentElement || document.body).appendChild(scrim);

  return { body, footer, close, isOpen: () => !closed };
}
