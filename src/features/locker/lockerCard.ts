// The card every locker section sits in: an optional icon, a title with a
// one-line subtitle under it, and a control on the right (a switch or a
// status pill). The kit's card puts its subtitle on a line of its own, which
// pushes a header control onto a third line.

import { h } from "../../ui/kit/dom";

export type LockerCardOptions = {
  subtitle?: string;
  icon?: HTMLElement;
  control?: HTMLElement;
};

export type LockerCard = {
  root: HTMLDivElement;
  body: HTMLDivElement;
  setSubtitle(text: string): void;
};

export function lockerCard(title: string, opts: LockerCardOptions = {}): LockerCard {
  const root = h("div", "qmm-card lk-card");
  const head = h("div", "lk-card__head");
  if (opts.icon) head.appendChild(opts.icon);

  const titles = h("div", "lk-card__titles");
  const subtitle = h("div", "lk-card__subtitle", opts.subtitle ?? "");
  subtitle.hidden = !opts.subtitle;
  titles.append(h("div", "qmm-card__title", title), subtitle);
  head.appendChild(titles);
  if (opts.control) head.appendChild(h("div", "lk-card__control")).appendChild(opts.control);

  const body = h("div", "qmm-card__body lk-card__body");
  root.append(head, body);
  return {
    root,
    body,
    setSubtitle(text) {
      subtitle.textContent = text;
      subtitle.hidden = !text;
    },
  };
}
