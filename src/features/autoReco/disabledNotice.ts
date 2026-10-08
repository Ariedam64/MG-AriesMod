// One-time popup at startup telling the player that auto reconnect has been
// switched off at the request of the game developers. A "seen" flag keeps it
// from showing again.

import { hasSeenAutoRecoDisabledNotice, markAutoRecoDisabledNoticeSeen } from "../../platform/storage";
import { openRecoDialog } from "./dialog";

const NOTICE_ID = "mgAutoRecoDisabledNotice";

/** Shows the notice once. Does nothing if it was seen, is already up, or there is no page yet. */
export function showAutoRecoDisabledNoticeOnce(): void {
  if (typeof document === "undefined" || !document.body) return;
  if (hasSeenAutoRecoDisabledNotice()) return;
  if (document.getElementById(NOTICE_ID)) return;

  const dismiss = () => {
    markAutoRecoDisabledNoticeSeen();
    dialog.close();
  };
  const dialog = openRecoDialog({
    id: NOTICE_ID,
    title: "Auto reconnect disabled",
    body:
      "The auto-reconnect option has been temporarily disabled at the request of the game developers. " +
      "It will most likely come back later.",
    buttonLabel: "Got it",
    onButton: dismiss,
  });
  // A click on the dark backdrop, outside the box, dismisses it too.
  dialog.root.addEventListener("click", (event) => {
    if (event.target === dialog.root) dismiss();
  });
}
