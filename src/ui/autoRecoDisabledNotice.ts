// autoRecoDisabledNotice.ts
// One-time dismissible popup shown at mod startup to inform the user that the
// auto-reconnect option has been temporarily disabled at the request of the
// game developers. Shown only once (persisted via a "seen" flag).

import {
  hasSeenAutoRecoDisabledNotice,
  markAutoRecoDisabledNoticeSeen,
} from "../utils/localStorage";

const OVERLAY_ID = "mgAutoRecoDisabledNotice";
const STYLE_ID = "mgAutoRecoDisabledNoticeStyle";

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.65); font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    #${OVERLAY_ID} .box { background: #0f1318; color: #fff; padding: 24px 28px; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.45); text-align: center; max-width: 92vw; width: 420px; border: 1px solid rgba(255,255,255,.15); }
    #${OVERLAY_ID} .title { font-size: 20px; font-weight: 900; letter-spacing: .02em; margin: 0 0 10px 0; }
    #${OVERLAY_ID} .body { font-size: 14px; line-height: 1.5; opacity: .9; margin: 0 0 18px 0; }
    #${OVERLAY_ID} .btn { padding: 10px 18px; border-radius: 999px; border: 1px solid #7aa2ff; background: #1a2644; color: #fff; font-weight: 700; cursor: pointer; }
    #${OVERLAY_ID} .btn:focus { outline: 2px solid #7aa2ff; outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}

function dismiss(overlay: HTMLElement): void {
  markAutoRecoDisabledNoticeSeen();
  try {
    overlay.remove();
  } catch {
    /* ignore */
  }
}

/**
 * Shows the auto-reconnect-disabled notice once. No-op if already seen,
 * if already mounted, or if there is no DOM available.
 */
export function showAutoRecoDisabledNoticeOnce(): void {
  if (typeof document === "undefined" || !document.body) return;
  if (hasSeenAutoRecoDisabledNotice()) return;
  if (document.getElementById(OVERLAY_ID)) return;

  ensureStyle();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="box" role="dialog" aria-label="Auto reconnect disabled">
      <div class="title">Auto reconnect disabled</div>
      <div class="body">
        The auto-reconnect option has been temporarily disabled at the request
        of the game developers. It will most likely come back later.
      </div>
      <button class="btn" type="button">Got it</button>
    </div>
  `;

  const close = () => dismiss(overlay);

  const button = overlay.querySelector<HTMLButtonElement>(".btn");
  button?.addEventListener("click", close);

  // Dismiss when clicking the dark backdrop (outside the box).
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  document.body.appendChild(overlay);
  button?.focus();
}
