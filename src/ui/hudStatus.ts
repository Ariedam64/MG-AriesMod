// The HUD's status row: the mod version against the latest release, and the
// health of the socket and store hooks once the sprite warm-up is done.

import { NativeWS, sockets, workerFound } from "../game/ws/sockets";
import { isStoreCaptured, getCapturedInfo } from "../game/store/jotai";
import { getSpriteWarmupState, onSpriteWarmupProgress } from "./kit/sprites/iconCache";
import { fetchRemoteVersion, getLocalVersion } from "../platform/modVersion";
import { isDiscordSurface } from "../platform/environment";
import { setTone, type StatusTone } from "./kit/badges";
import { refreshWhileVisible } from "./kit/dom";

/** Opens a link in a new tab; inside Discord the userscript manager has to do it. */
function openDownloadLink(url: string): void {
  const gmObject = (globalThis as typeof globalThis & { GM?: { openInTab?: typeof GM_openInTab } }).GM;
  const gmOpen = typeof GM_openInTab === "function"
    ? GM_openInTab
    : typeof gmObject?.openInTab === "function"
      ? gmObject.openInTab.bind(gmObject)
      : null;
  if (isDiscordSurface() && gmOpen) {
    try {
      gmOpen(url, { active: true, setParent: true });
      return;
    } catch (error) {
      console.warn("[MagicGarden] GM_openInTab failed, falling back to window.open", error);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function initVersionBadge(badge: HTMLElement): void {
  const show = (text: string, tone: StatusTone, downloadUrl?: string | null) => {
    badge.textContent = text;
    setTone(badge, tone);
    badge.classList.toggle("is-link", !!downloadUrl);
    if (downloadUrl) {
      badge.dataset.download = downloadUrl;
      badge.title = "Download the new version";
    } else {
      delete badge.dataset.download;
      badge.removeAttribute("title");
    }
  };

  show("checking…", "warn");
  badge.addEventListener("click", () => {
    const url = badge.dataset.download;
    if (url) openDownloadLink(url);
  });

  void (async () => {
    const localVersion = getLocalVersion();
    try {
      const remoteData = await fetchRemoteVersion();
      const remoteVersion = remoteData?.version?.trim();
      if (!remoteVersion) show(localVersion || "Unknown", "warn");
      else if (!localVersion) show(remoteVersion, "warn", remoteData?.download);
      else if (localVersion === remoteVersion) show(localVersion, "ok");
      else show(`${localVersion} → ${remoteVersion}`, "warn", remoteData?.download);
    } catch (error) {
      console.error("[MagicGarden] Failed to check version:", error);
      show(localVersion || "Unknown", "warn");
    }
  })();
}

type StatusInfo = { level: StatusTone; message: string };

function getWSStatus(): StatusInfo {
  if (sockets.some((ws) => ws.readyState === NativeWS.OPEN)) return { level: "ok", message: "ws open" };
  if ((window as any).__QWS_workerFound || workerFound) return { level: "ok", message: "ws via worker" };
  return { level: "bad", message: "ws none" };
}

function getStoreStatus(): StatusInfo {
  try {
    const info = getCapturedInfo() as { via?: string; polyfill?: unknown };
    if (isStoreCaptured()) return { level: "ok", message: `store ${info.via || "ready"}` };
    if (info.via === "polyfill" || info.polyfill) return { level: "warn", message: "store polyfill" };
    return { level: "bad", message: "store none" };
  } catch {
    return { level: "bad", message: "store error" };
  }
}

/** Rewrites a pill only when something changed: a write is a DOM mutation every observer sees. */
function showStatus(el: HTMLElement, text: string, title: string, tone: StatusTone): void {
  if (el.textContent !== text) el.textContent = text;
  if (el.title !== title) el.title = title;
  if (!el.classList.contains(`is-${tone}`)) setTone(el, tone);
}

/** Sprite warm-up progress first, then socket and store health, refreshed while the HUD shows. */
export function startStatusLoop(box: HTMLElement, full: HTMLElement, mini: HTMLElement): void {
  let warmup = getSpriteWarmupState();

  const update = () => {
    if (!warmup.completed) {
      const progress = warmup.total > 0 ? `${warmup.done}/${warmup.total}` : `${warmup.done}`;
      const summary = warmup.total > 0 ? `Sprites warming: ${progress}` : "Sprites warming up";
      showStatus(full, `Sprites ${progress}`, summary, "warn");
      showStatus(mini, progress, summary, "warn");
      mini.style.display = "";
      return;
    }

    const ws = getWSStatus();
    const store = getStoreStatus();
    const level: StatusTone = store.message === "store none" && ws.level === "bad"
      ? "bad"
      : ws.level === "ok" && store.level === "ok" ? "ok" : "warn";
    const title = `${ws.message}, ${store.message}`;
    showStatus(full, "status", title, level);
    showStatus(mini, level === "ok" ? "OK" : level === "warn" ? "WARN" : "ISSUES", title, level);
    mini.style.display = level === "ok" ? "none" : "";
  };

  onSpriteWarmupProgress((state) => {
    warmup = state;
    update();
  });
  refreshWhileVisible(box, update, 800);
}
