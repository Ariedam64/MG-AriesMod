/** The full-screen countdown shown while auto reconnect waits out its delay. */
export type AutoRecoOverlay = { update: (ms: number) => void; destroy: () => void };

const OVERLAY_ID = "mgAutoRecoOverlay";
const STYLE_ID = "mgAutoRecoOverlayStyle";

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.65); font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    #${OVERLAY_ID} .box { background: #0f1318; color: #fff; padding: 24px 28px; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.45); text-align: center; max-width: 92vw; border: 1px solid rgba(255,255,255,.15); }
    #${OVERLAY_ID} .title { font-size: 24px; font-weight: 900; letter-spacing: .02em; margin: 0 0 8px 0; }
    #${OVERLAY_ID} .subtitle { font-size: 14px; opacity: .85; margin: 0 0 14px 0; }
    #${OVERLAY_ID} .btn { margin-top: 6px; padding: 10px 16px; border-radius: 999px; border: 1px solid #7aa2ff; background: #1a2644; color: #fff; font-weight: 700; cursor: pointer; }
    #${OVERLAY_ID} .btn:focus { outline: 2px solid #7aa2ff; outline-offset: 2px; }
  `;
  document.documentElement.appendChild(style);
}

export function createAutoRecoOverlay(initialMs: number, onReconnectNow: () => void): AutoRecoOverlay {
  ensureStyle();
  document.getElementById(OVERLAY_ID)?.remove();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="box" role="dialog" aria-label="Auto reconnect status">
      <div class="title">Auto reconnect</div>
      <div class="subtitle auto-reco-subtitle">The game will reconnect soon.</div>
      <button class="btn" type="button">Reconnect now</button>
    </div>
  `;
  const subtitle = overlay.querySelector(".auto-reco-subtitle") as HTMLElement | null;
  const btn = overlay.querySelector("button.btn") as HTMLButtonElement | null;

  const render = (ms: number) => {
    if (!subtitle) return;
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const unit = seconds <= 1 ? "second" : "seconds";
    subtitle.textContent = `The game will reconnect in ${seconds} ${unit}...`;
  };

  btn?.addEventListener("click", (e) => {
    e.preventDefault();
    onReconnectNow();
  });

  document.documentElement.appendChild(overlay);
  render(initialMs);

  return {
    update: render,
    destroy: () => {
      try { overlay.remove(); } catch {}
    },
  };
}
