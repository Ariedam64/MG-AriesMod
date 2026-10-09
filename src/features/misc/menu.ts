// The Misc menu: one scrolling column of folding cards. Everyday toggles come
// first, the bulk deleters after them, and auto reconnect, switched off for
// now, last.

import { Menu } from "../../ui/kit/menu";
import { buildDecorDeleterSection, buildSeedDeleterSection } from "./deleterCards";
import {
  buildAutoRecoSection,
  buildDisplaySection,
  buildInventorySection,
  buildMovementSection,
} from "./sections";
import { ensureMiscStyles } from "./styles";

export async function renderMiscMenu(container: HTMLElement) {
  ensureMiscStyles();
  const ui = new Menu({ id: "misc", compact: true });
  ui.mount(container);

  // `.qmm-views` already is the panel, with its own scroller: nesting a second
  // one inside would stack two scroll containers, so fill it directly.
  const root = ui.root.querySelector<HTMLElement>(".qmm-views") ?? ui.root;
  root.replaceChildren();
  root.classList.add("qws-misc");

  /** HUD window the popups anchor to, so they stack above this menu. */
  const modalHost = (): HTMLElement =>
    (ui.root.closest(".qws-win") as HTMLElement | null) ?? ui.root;

  root.append(
    buildDisplaySection(modalHost),
    buildMovementSection(),
    buildInventorySection(),
    buildSeedDeleterSection(modalHost),
    buildDecorDeleterSection(modalHost),
    buildAutoRecoSection(),
  );
}
