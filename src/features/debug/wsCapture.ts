// Frame capture for the debug menu's WebSocket tab.
//
// The mod's own socket hook (game/ws/socketHook) tracks every socket in
// `sockets` but does not report the frames themselves, so this adds a second,
// lighter layer on top of it the first time the tab opens: the constructor is
// wrapped again to catch new sockets, each socket gets a message listener, and
// its `send` is wrapped per instance. Outgoing frames are captured before the
// mod's outgoing rules run, so a frame a rule drops still shows here.
//
// It only watches: which socket the mod treats as the game's stays the socket
// hook's call, and the hook's socket list is left alone.

import { Emitter } from "../../lib/emitter";
import { pad2 } from "../../lib/format";
import { quinoaWS, sockets, label as wsStateLabel } from "../../game/ws/sockets";

export type Frame = {
  /** Epoch milliseconds. */
  t: number;
  dir: "in" | "out";
  /** The raw payload, unparsed. */
  text: string;
  ws?: WebSocket | null;
};

/** `HH:MM:SS.mmm` */
export const fmtTime = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
};

/** Escapes the three characters that matter when a payload goes into innerHTML. */
export const escapeLite = (s: string) =>
  s.replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[m]!);

/** Keeps the last `max` items, so a long capture cannot exhaust memory. */
export class FrameBuffer<T = Frame> {
  private arr: T[] = [];
  constructor(private max = 2000) {}
  push(f: T) {
    this.arr.push(f);
    if (this.arr.length > this.max) this.arr.splice(0, this.arr.length - this.max);
  }
  toArray() {
    return this.arr.slice();
  }
  find(predicate: (item: T) => boolean): T | undefined {
    return this.arr.find(predicate);
  }
  clear() {
    this.arr.length = 0;
  }
}

/* ------------------------------- Registry -------------------------------- */

type WSInfo = {
  ws: WebSocket;
  /** Shown in the socket picker, e.g. "WS#1 (OPEN)". */
  id: string;
};

const registry = new Map<WebSocket, WSInfo>();

/** Every socket seen, in the order it was first seen. */
export function getWSInfos(): WSInfo[] {
  return Array.from(registry.values());
}

export function getWSStatusText(): string {
  const anyOpen = sockets.some((ws) => ws.readyState === WebSocket.OPEN);
  return `status: ${anyOpen ? "OPEN" : "none"}`;
}

/** Every captured frame, in and out, once `installWSHookIfNeeded` has run. */
export const wsFrames = new Emitter<Frame>();

/* ----------------------------- Hook WebSocket ---------------------------- */

// Symbol.for keys stay the same across bundles, so two copies of the mod
// never wrap the same constructor or socket twice.
const HOOKED_CTOR_FLAG = Symbol.for("qmm.wsCtorHooked");
const WS_PATCHED_SEND = Symbol.for("qmm.wsPatchedSend");

const toText = (data: unknown): string => {
  try {
    return typeof data === "string" ? data : JSON.stringify(data);
  } catch {
    return String(data);
  }
};

/** Wraps the constructor once and starts capturing the sockets already open. */
export function installWSHookIfNeeded(): void {
  const Ctor: any = window.WebSocket;
  if (!Ctor[HOOKED_CTOR_FLAG]) {
    const ProxyCtor = new Proxy(Ctor, {
      construct(target: any, args: any[], newTarget: any) {
        const ws: WebSocket = Reflect.construct(target, args, newTarget);
        try { trackSocket(ws); } catch {}
        return ws;
      },
    });
    ProxyCtor[HOOKED_CTOR_FLAG] = true;
    window.WebSocket = ProxyCtor;
  }

  for (const ws of sockets) {
    try { trackSocket(ws); } catch {}
  }
}

function trackSocket(ws: WebSocket) {
  if (registry.has(ws)) return;

  const info: WSInfo = { ws, id: `WS#${1 + registry.size} (${wsStateLabel(ws.readyState)})` };

  ws.addEventListener("message", (ev: MessageEvent) => {
    wsFrames.emit({ t: Date.now(), dir: "in", text: toText(ev.data), ws });
  });

  const refreshId = () => {
    info.id = info.id.replace(/\(.*\)/, `(${wsStateLabel(ws.readyState)})`);
  };
  ws.addEventListener("open", refreshId);
  ws.addEventListener("close", refreshId);

  const patchable = ws as WebSocket & { [WS_PATCHED_SEND]?: boolean };
  if (!patchable[WS_PATCHED_SEND]) {
    const originalSend = ws.send.bind(ws);
    patchable[WS_PATCHED_SEND] = true;
    ws.send = (data: any) => {
      wsFrames.emit({ t: Date.now(), dir: "out", text: toText(data), ws });
      return originalSend(data);
    };
  }

  registry.set(ws, info);
}

/** The socket the mod identified as the game's room socket. */
export { quinoaWS };
