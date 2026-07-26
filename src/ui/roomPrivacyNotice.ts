// roomPrivacyNotice.ts
// One-time dismissible popup shown at mod startup to inform the user that
// their room's code is shared with other mod users by default. Shown only
// once (persisted via a "seen" flag).

import {
  hasSeenRoomPrivacyNotice,
  markRoomPrivacyNoticeSeen,
} from "../utils/localStorage";

const OVERLAY_ID = "mgRoomPrivacyNotice";
const STYLE_ID = "mgRoomPrivacyNoticeStyle";

// Direct link to the userscript file: the userscript manager opens its
// install dialog immediately (no need to find the link in the README).
const HUB_INSTALL_URL =
  "https://github.com/Ariedam64/MG-CommunityHub/raw/refs/heads/main/dist/mg-community-hub.user.js";

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.65); font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    #${OVERLAY_ID} .box { background: #0f1318; color: #fff; padding: 24px 28px; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.45); text-align: center; max-width: 92vw; width: 440px; border: 1px solid rgba(255,255,255,.15); }
    #${OVERLAY_ID} .title { font-size: 20px; font-weight: 900; letter-spacing: .02em; margin: 0 0 10px 0; }
    #${OVERLAY_ID} .body { font-size: 14px; line-height: 1.5; opacity: .9; margin: 0 0 18px 0; }
    #${OVERLAY_ID} .btn { padding: 10px 18px; border-radius: 999px; border: 1px solid #7aa2ff; background: #1a2644; color: #fff; font-weight: 700; cursor: pointer; margin: 0 6px; }
    #${OVERLAY_ID} .btn:focus { outline: 2px solid #7aa2ff; outline-offset: 2px; }
    #${OVERLAY_ID} .btn.primary { background: #2a59ff; border-color: #2a59ff; }
  `;
  document.head.appendChild(style);
}

function dismiss(overlay: HTMLElement): void {
  markRoomPrivacyNoticeSeen();
  try {
    overlay.remove();
  } catch {
    /* ignore */
  }
}

/**
 * Shows the room privacy notice once. No-op if already seen, if already
 * mounted, or if there is no DOM available.
 */
export function showRoomPrivacyNoticeOnce(): void {
  if (typeof document === "undefined" || !document.body) return;
  if (hasSeenRoomPrivacyNotice()) return;
  if (document.getElementById(OVERLAY_ID)) return;

  ensureStyle();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="box" role="dialog" aria-label="Room privacy notice">
      <div class="title">Your room code is shared with other players</div>
      <div class="body">
        This mod shares your room's code with other mod users so they can find
        and join it, that's what helps boost your sales. If you'd rather keep
        your room private and invisible to others, install
        <b>MG Community Hub</b>: it adds a privacy setting to hide your room
        from that list.
      </div>
      <button class="btn primary" type="button" data-action="install">Get the privacy tool</button>
      <button class="btn" type="button" data-action="close">Got it</button>
    </div>
  `;

  const close = () => dismiss(overlay);

  overlay
    .querySelector<HTMLButtonElement>('[data-action="install"]')
    ?.addEventListener("click", () => {
      try {
        window.open(HUB_INSTALL_URL, "_blank", "noopener");
      } catch {
        /* ignore */
      }
      close();
    });
  overlay
    .querySelector<HTMLButtonElement>('[data-action="close"]')
    ?.addEventListener("click", close);

  // Dismiss when clicking the dark backdrop (outside the box).
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  document.body.appendChild(overlay);
}
