// src/core/bridge.ts
import { NativeWS, quinoaWS, setQWS, sockets, Workers } from "./state";
import { buildQuinoaMessage } from "./quinoaCommands";

export function postAllToWorkers(msg: any) {
  if ((Workers as any).forEach) (Workers as any).forEach((w: Worker) => { try { w.postMessage(msg); } catch {} });
  else for (const w of (Workers as any)._a) { try { w.postMessage(msg); } catch {} }
}

export function getPageWS(): WebSocket {
  if (quinoaWS && quinoaWS.readyState === NativeWS.OPEN) return quinoaWS;

  let any: WebSocket | null = null;
  if ((sockets as any).find) any = (sockets as any).find((s: WebSocket)=> s.readyState === NativeWS.OPEN) || null;
  if (!any) {
    for (let i=0;i<sockets.length;i++) if (sockets[i].readyState === NativeWS.OPEN) { any = sockets[i]; break; }
  }
  if (any) { setQWS(any, "getPageWS"); return any; }

  throw new Error("No page WebSocket open");
}

export function sendToGame(payloadObj: Record<string, any>) {
  // Gameplay actions travel inside the QuinoaCommand envelope (requestId +
  // commandSequence); Ping/PlayerPosition and the types the game still writes
  // flat keep the legacy shape. See src/core/quinoaCommands.ts.
  const msg: any = buildQuinoaMessage(payloadObj);

  // tente via page
  try {
    const ws = getPageWS();
    ws.send(JSON.stringify(msg));
    return true;
  } catch {
    // sinon, broadcast aux workers
    postAllToWorkers({ __QWS_CMD: "send", payload: JSON.stringify(msg) });
    return true;
  }
}
