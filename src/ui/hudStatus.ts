// The dock's status dot: sprite warm-up progress, then the health of the
// socket and store hooks.

import { NativeWS, sockets, workerFound } from "../game/ws/sockets";
import { isStoreCaptured, getCapturedInfo } from "../game/store/jotai";
import { getSpriteWarmupState, onSpriteWarmupProgress } from "./kit/sprites/iconCache";
import type { StatusTone } from "./kit/badges";
import type { Dock } from "./kit/dock";
import { refreshWhileVisible } from "./kit/dom";

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
