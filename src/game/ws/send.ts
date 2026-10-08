import { NativeWS, quinoaWS, setQWS, sockets } from "./sockets";
import { buildQuinoaMessage } from "./commands";

function getPageWS(): WebSocket | null {
  if (quinoaWS && quinoaWS.readyState === NativeWS.OPEN) return quinoaWS;

  const open = sockets.find((s) => s.readyState === NativeWS.OPEN) ?? null;
  if (open) setQWS(open, "getPageWS");
  return open;
}

/**
 * Sends a message from the mod to the game server. Gameplay actions travel
 * inside the QuinoaCommand envelope (requestId + commandSequence); Ping,
 * PlayerPosition and the types the game still writes flat keep the flat shape.
 * See `commands.ts`. Nothing is sent while no page socket is open.
 */
export function sendToGame(payloadObj: Record<string, any>) {
  const msg: any = buildQuinoaMessage(payloadObj);
  try {
    getPageWS()?.send(JSON.stringify(msg));
  } catch {}
  return true;
}
