// src/service/debug-data.ts
// All "debug-data" logic (types, WebSocket hooks, buffer, utils).

import {
  sockets,
  quinoaWS,
  setQWS,
  workerFound,
  label as wsStateLabel,
} from "../../game/ws/sockets";

/* ----------------------------- Types & utils ----------------------------- */

type WSDir = "in" | "out";

export type Frame = {
  t: number;            // ms epoch
  dir: WSDir;           // "in" | "out"
  text: string;         // raw payload, no parsing here
  ws?: WebSocket | null;
};

// format HH:MM:SS.mmm
export const fmtTime = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number, s = 2) => String(n).padStart(s, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3,"0")}`;
};

// Mini-escape (log display)
export const escapeLite = (s: string) =>
  s.replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m]!));

// Simple ring buffer (prevents memory blow-up)
export class FrameBuffer<T = Frame> {
  private arr: T[] = [];
  constructor(private max = 2000) {}
  push(f: T) {
    this.arr.push(f);
    if (this.arr.length > this.max) this.arr.splice(0, this.arr.length - this.max);
  }
  toArray() { return this.arr.slice(); }
  clear() { this.arr.length = 0; }
}

/* ------------------------------- Registry -------------------------------- */

export type WSInfo = {
  ws: WebSocket;
  id: string;                  // label UI, ex: "WS#1 (OPEN)"
  sendOrig?: WebSocket["send"];
  listeners?: Array<() => void>;
};

// Local registry of tracked sockets
const registry = new Map<WebSocket, WSInfo>();

/** Readable snapshot of the registry (for the UI). */
export function getWSInfos(): WSInfo[] {
  return Array.from(registry.values());
}


/** Small helper status string for the UI. */
export function getWSStatusText(): string {
  const anyOpen = sockets.some((ws) => ws.readyState === WebSocket.OPEN);
  const viaW = workerFound ? "worker" : "page/auto";
  return `status: ${anyOpen ? "OPEN" : "none"} • mode: ${viaW}`;
}

/* ----------------------------- Hook WebSocket ---------------------------- */

const HOOKED_CTOR_FLAG = Symbol.for("qmm.wsCtorHooked"); // stable across modules
const WS_PATCHED_SEND  = Symbol.for("qmm.wsPatchedSend"); // avoid double patching
let hookedOnce = false;

/**
 * Install the global hook once and attach sockets that already exist.
 * The UI provides an `onFrame` callback to receive frames (IN/OUT).
 */
export function installWSHookIfNeeded(onFrame: (f: Frame) => void) {
  // 1) Always proxy the current constructor (even if already proxied)
  const Ctor: any = window.WebSocket as any;
  if (!Ctor[HOOKED_CTOR_FLAG]) {
    // proxy "as is": whether native, proxied, monkey patched… it doesn't matter
    const ProxyCtor = new Proxy(Ctor, {
      construct(target: any, args: any[], newTarget: any) {
        const ws: WebSocket = Reflect.construct(target, args, newTarget);
        try {
          trackSocket(ws, "new", onFrame);
        } catch (err) {
        }
        return ws;
      }
    });

    // tag the new ctor to avoid proxying again
    (ProxyCtor as any)[HOOKED_CTOR_FLAG] = true;
    window.WebSocket = ProxyCtor as unknown as typeof WebSocket;
  }

  // 2) Track sockets already known (if another hook pushed them into `sockets`)
  sockets.forEach((ws) => {
    try {
      trackSocket(ws, "existing", onFrame);
    } catch (err) {
    }
  });

  // 3) Mark the first pass as completed
  if (!hookedOnce) {
    hookedOnce = true;
  } else {
  }
}

function trackSocket(ws: WebSocket, why: string, onFrame: (f: Frame) => void) {
  if (registry.has(ws)) {
    return;
  }

  const id = `WS#${1 + registry.size} (${wsStateLabel(ws.readyState)})`;
  const info: WSInfo = { ws, id, listeners: [] };

  if (!sockets.includes(ws)) sockets.push(ws);
  setQWS?.(ws, why);

  // IN: messages
  const onMsg = (ev: MessageEvent) => {
    let text = "";
    try { text = typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data); }
    catch { text = String(ev.data); }
    onFrame({ t: Date.now(), dir: "in", text, ws });
  };
  ws.addEventListener("message", onMsg);
  info.listeners!.push(() => ws.removeEventListener("message", onMsg));

  const onOpen = () => { info.id = info.id.replace(/\(.*\)/, `(${wsStateLabel(ws.readyState)})`); };
  const onClose = () => { info.id = info.id.replace(/\(.*\)/, `(${wsStateLabel(ws.readyState)})`); };
  ws.addEventListener("open", onOpen);
  ws.addEventListener("close", onClose);
  info.listeners!.push(() => ws.removeEventListener("open", onOpen));
  info.listeners!.push(() => ws.removeEventListener("close", onClose));

  // OUT: patch send (idempotent & detectable)
  if (!(ws as any)[WS_PATCHED_SEND]) {
    const orig = ws.send.bind(ws);
    (info as any).sendOrig = orig;
    (ws as any)[WS_PATCHED_SEND] = true;

    ws.send = (data: any) => {
      try {
        const text = typeof data === "string" ? data : JSON.stringify(data);
        onFrame({ t: Date.now(), dir: "out", text, ws });
      } catch {
        onFrame({ t: Date.now(), dir: "out", text: String(data), ws });
      }
      return orig(data);
    };
  } else {
  }

  registry.set(ws, info);
}

/* ------------------------------ Re-exports ------------------------------- */
/** Optional: if the UI wants to tag the current page socket. */
export { quinoaWS };
