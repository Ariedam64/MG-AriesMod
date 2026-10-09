// The full-screen dialog both auto reconnect screens use: the countdown while
// a reconnect waits, and the one-time notice that the feature is switched off.

import { addStyle } from "../../lib/dom";
import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";

const DIALOG_CSS = `
.qws-reco-scrim {
  position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
  background: var(--qmm-scrim); font-family: var(--qmm-font);
}
.qws-reco-box {
  width: 420px; max-width: 92vw; padding: 24px 28px; text-align: center; color: var(--qmm-text);
  background: var(--qmm-paper); border: 3px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-xl);
  box-shadow: var(--qmm-shadow-modal);
}
.qws-reco-title { margin: 0 0 10px; font-size: 22px; font-weight: 900; letter-spacing: .02em; }
.qws-reco-body { margin: 0 0 18px; font-size: 14px; line-height: 1.5; opacity: .9; }
.qws-reco-box .qmm-btn { margin: 0 auto; }
`;

let stylesInjected = false;

export type RecoDialog = {
  root: HTMLElement;
  setBody(text: string): void;
  close(): void;
};

export function openRecoDialog(opts: {
  id: string;
  title: string;
  body: string;
  buttonLabel: string;
  onButton: () => void;
}): RecoDialog {
  if (!stylesInjected) {
    stylesInjected = true;
    addStyle(DIALOG_CSS);
  }
  document.getElementById(opts.id)?.remove();

  const body = h("div", "qws-reco-body", opts.body);
  const action = button(opts.buttonLabel, { variant: "primary", onClick: opts.onButton });
  const box = h("div", "qws-reco-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", opts.title);
  box.append(h("div", "qws-reco-title", opts.title), body, action);

  const root = h("div", "qws-reco-scrim");
  root.id = opts.id;
  root.append(box);
  document.documentElement.appendChild(root);
  action.focus();

  return {
    root,
    setBody: (text) => {
      body.textContent = text;
    },
    close: () => {
      try { root.remove(); } catch {}
    },
  };
}
