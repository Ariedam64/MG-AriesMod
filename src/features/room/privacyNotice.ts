// One-time popup at startup telling the player that their room code is shared
// with other mod users by default. A "seen" flag keeps it from coming back.

import { hasSeenRoomPrivacyNotice, markRoomPrivacyNoticeSeen } from "../../platform/storage";
import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";

const OVERLAY_ID = "mgRoomPrivacyNotice";

// The userscript file itself: the userscript manager opens its install dialog
// straight away, with no README to dig through.
const HUB_INSTALL_URL =
  "https://github.com/Ariedam64/MG-CommunityHub/raw/refs/heads/main/dist/mg-community-hub.user.js";

function box(): HTMLElement {
  const el = h("div");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Room privacy notice");
  Object.assign(el.style, {
    width: "440px",
    maxWidth: "92vw",
    padding: "24px 28px",
    borderRadius: "var(--qmm-radius-xl)",
    border: "3px solid var(--qmm-sand-edge)",
    background: "var(--qmm-paper)",
    color: "var(--qmm-text)",
    boxShadow: "var(--qmm-shadow-modal)",
    textAlign: "center",
  });
  return el;
}

/** Shows the notice unless it was seen already, is already up, or there is no DOM. */
export function showRoomPrivacyNoticeOnce(): void {
  if (typeof document === "undefined" || !document.body) return;
  if (hasSeenRoomPrivacyNotice()) return;
  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = h("div");
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--qmm-scrim)",
    fontFamily: "var(--qmm-font)",
  });

  const close = () => {
    markRoomPrivacyNoticeSeen();
    overlay.remove();
  };

  const title = h("div", undefined, "Your room code is shared with other players");
  Object.assign(title.style, { fontSize: "20px", fontWeight: "900", letterSpacing: ".02em", marginBottom: "10px" });

  const body = h("div");
  Object.assign(body.style, { fontSize: "14px", lineHeight: "1.5", opacity: ".9", marginBottom: "18px" });
  body.innerHTML = `This mod shares your room's code with other mod users so they can find
    and join it, that's what helps boost your sales. If you'd rather keep
    your room private and invisible to others, install
    <b>MG Community Hub</b>: it adds a privacy setting to hide your room
    from that list.`;

  const actions = h("div");
  Object.assign(actions.style, { display: "flex", justifyContent: "center", gap: "12px" });
  actions.append(
    button("Get the privacy tool", {
      variant: "primary",
      onClick: () => {
        try {
          window.open(HUB_INSTALL_URL, "_blank", "noopener");
        } catch {}
        close();
      },
    }),
    button("Got it", { onClick: close }),
  );

  const dialog = box();
  dialog.append(title, body, actions);
  overlay.appendChild(dialog);

  // A click on the backdrop, outside the box, dismisses it too.
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  document.body.appendChild(overlay);
}
