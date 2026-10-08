import { onWebSocketClose } from "../../game/ws/socketHook";
import { pageWindow } from "../../platform/pageContext";
import { detectEnvironment } from "../../platform/environment";
import { createAutoRecoOverlay, type AutoRecoOverlay } from "./overlay";
import { AUTO_RECO_TEMPORARILY_DISABLED, readAutoRecoDelayMs, readAutoRecoEnabled } from "./settings";

/**
 * What the mod does when the game's socket closes on its own:
 *
 * - "Version Expired": the game shipped a new build, so the page reloads
 *   (outside Discord, where a reload would drop the activity).
 * - the session was taken over by another tab or device: if the player turned
 *   auto reconnect on, the room reconnects after their delay, with a countdown
 *   overlay and a button to reconnect at once. This half is switched off for
 *   now (`AUTO_RECO_TEMPORARILY_DISABLED` in ./settings) at the request of the
 *   game developers; the code stays so it can come back.
 */

let versionReloadScheduled = false;
let reconnectTimer: number | null = null;
let countdownInterval: number | null = null;
let overlay: AutoRecoOverlay | null = null;

function isVersionExpiredClose(ev: CloseEvent): boolean {
  return ev?.code === 4710 || /Version\s*Expired/i.test(ev?.reason || "");
}

function isSupersededSessionClose(ev: CloseEvent): boolean {
  if (!ev) return false;
  const reason = ev.reason || "";
  if (ev.code === 4300 && reason.toLowerCase().includes("heartbeat")) return false;
  return (
    ev.code === 4300 ||
    (ev.code === 4250 && (/superseded/i.test(reason) || /newer user session/i.test(reason)))
  );
}

function getRoomConnection(): any {
  return (pageWindow as any).MagicCircle_RoomConnection;
}

function getRoomConnectionSocket(): WebSocket | null {
  try {
    const rc = getRoomConnection();
    if (!rc) return null;
    return (rc.ws || rc.socket || rc.currentWebSocket) ?? null;
  } catch {
    return null;
  }
}

function reloadOnVersionExpired(ev: CloseEvent) {
  if (!isVersionExpiredClose(ev)) return;

  const env = detectEnvironment();
  if (env.surface === "discord" || env.isInIframe) return;
  if (versionReloadScheduled) return;
  versionReloadScheduled = true;

  try {
    console.warn("[MagicGarden] Version expired, reloading...");
  } catch {}

  try {
    pageWindow.location.reload();
  } catch {
    try {
      window.location.reload();
    } catch {}
  }
}

function clearOverlayAndCountdown() {
  if (countdownInterval !== null) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (overlay) {
    try { overlay.destroy(); } catch {}
    overlay = null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer === null) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function reconnectNow() {
  reconnectTimer = null;
  clearOverlayAndCountdown();
  if (!readAutoRecoEnabled()) return;
  try {
    const conn = getRoomConnection();
    if (typeof conn?.connect === "function") conn.connect.call(conn);
  } catch (error) {
    console.warn("[MagicGarden] Auto reco failed:", error);
  }
}

function reconnectOnSupersededSession(ev: CloseEvent, ws: WebSocket) {
  if (!isSupersededSessionClose(ev)) return;
  const rcSocket = getRoomConnectionSocket();
  if (rcSocket && ws && ws !== rcSocket) return;
  if (AUTO_RECO_TEMPORARILY_DISABLED) return;
  if (!readAutoRecoEnabled()) return;

  clearReconnectTimer();
  clearOverlayAndCountdown();

  const delayMs = readAutoRecoDelayMs();
  if (delayMs > 0) {
    overlay = createAutoRecoOverlay(delayMs, () => {
      clearReconnectTimer();
      reconnectNow();
    });
    let remainingMs = delayMs;
    countdownInterval = window.setInterval(() => {
      remainingMs = Math.max(0, remainingMs - 1000);
      overlay?.update(remainingMs);
      if (remainingMs <= 0) clearOverlayAndCountdown();
    }, 1000);
  }

  reconnectTimer = window.setTimeout(reconnectNow, delayMs);
}

/** Starts listening for socket closes. Call once, right after the socket hook. */
export function startAutoReco(): void {
  onWebSocketClose(reloadOnVersionExpired);
  onWebSocketClose(reconnectOnSupersededSession);
}
