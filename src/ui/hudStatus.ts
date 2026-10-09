// The mod's health: the version against the latest release (shown in
// Settings, Infos) and the socket and store hooks once the sprite warm-up is
// done (shown on the dock's status dot).

import { NativeWS, sockets, workerFound } from "../game/ws/sockets";
import { isStoreCaptured, getCapturedInfo } from "../game/store/jotai";
import { getSpriteWarmupState, onSpriteWarmupProgress } from "./kit/sprites/iconCache";
import { fetchRemoteVersion, getLocalVersion } from "../platform/modVersion";
import { isDiscordSurface } from "../platform/environment";
import { setTone, type StatusTone } from "./kit/badges";
import type { Dock } from "./kit/dock";
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

/** Sprite warm-up progress first, then socket and store health, on the dock's status dot. */
export function startStatusLoop(dock: Dock): void {
  let warmup = getSpriteWarmupState();
  let shown = "";

  // Only touch the dot when something changed: a write is a DOM mutation every observer sees.
  const show = (tone: StatusTone, text: string) => {
    if (shown === `${tone}|${text}`) return;
    shown = `${tone}|${text}`;
    dock.setStatus(tone, text);
  };

  const update = () => {
    if (!warmup.completed) {
      const progress = warmup.total > 0 ? `${warmup.done}/${warmup.total}` : `${warmup.done}`;
      show("warn", warmup.total > 0 ? `Sprites warming: ${progress}` : "Sprites warming up");
      return;
    }

    const ws = getWSStatus();
    const store = getStoreStatus();
    const level: StatusTone = store.message === "store none" && ws.level === "bad"
      ? "bad"
      : ws.level === "ok" && store.level === "ok" ? "ok" : "warn";
    show(level, `${ws.message}, ${store.message}`);
  };

  onSpriteWarmupProgress((state) => {
    warmup = state;
    update();
  });
  refreshWhileVisible(dock.root, update, 800);
}
