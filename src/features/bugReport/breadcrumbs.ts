// The trail a bug report carries: which mod windows the player opened, which
// game window was up, and when the game's connection dropped. A handful of
// cheap listeners; the lines stay in memory (platform/diagnostics) and only
// leave with a report.

import { Subscriptions } from "../../lib/emitter";
import { onWebSocketClose } from "../../game/ws/socketHook";
import { Atoms } from "../../game/store/atoms";
import { recordBreadcrumb } from "../../platform/diagnostics";
import { onMenuOpened } from "../../ui/kit/menuList";

let subs: Subscriptions | null = null;

export function startBugReportBreadcrumbs(): void {
  if (subs) return;
  subs = new Subscriptions();
  subs.add(onMenuOpened((menu) => recordBreadcrumb(`opened ${menu.title}`)));
  subs.add(
    onWebSocketClose((event) => {
      const reason = event.reason ? ` (${event.reason.slice(0, 80)})` : "";
      recordBreadcrumb(`connection closed, code ${event.code}${event.wasClean ? "" : ", not clean"}${reason}`);
    }),
  );
  // The modal atom may never resolve (a renamed label): no trail then, and no
  // rejection left unhandled either.
  subs.add(
    Atoms.ui.activeModal
      .onChange((modal) => recordBreadcrumb(modal ? `game window ${modal}` : "game window closed"))
      .catch(() => undefined),
  );
}

export function stopBugReportBreadcrumbs(): void {
  subs?.dispose();
  subs = null;
}
