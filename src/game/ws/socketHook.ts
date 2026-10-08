import { NativeWS, sockets, setQWS } from "./sockets";
import { pageWindow, readSharedGlobal } from "../../platform/pageContext";
import { parseWSData } from "./parse";
import {
  consumeOwnRequestId,
  hasInjectedCommands,
  observeGameCommandSequence,
  resetCommandSequence,
  seedCommandSequence,
  takeCommandSequenceForGame,
} from "./commands";
import { runOutgoing } from "./outgoing";
import { hookRoomConnectionSendMessage } from "./sendMessageHook";

type WsCloseListener = (ev: CloseEvent, ws: WebSocket) => void;

const wsCloseListeners: WsCloseListener[] = [];

/** Called whenever a page socket closes. Returns the function that stops listening. */
export function onWebSocketClose(cb: WsCloseListener): () => void {
  wsCloseListeners.push(cb);
  return () => {
    const idx = wsCloseListeners.indexOf(cb);
    if (idx !== -1) wsCloseListeners.splice(idx, 1);
  };
}

function notifyWebSocketClose(ev: CloseEvent, ws: WebSocket) {
  for (const listener of [...wsCloseListeners]) {
    try {
      listener(ev, ws);
    } catch {}
  }
}

/**
 * Keeps one gapless `commandSequence` stream on a socket both the game and the
 * mod write to.
 *
 * The game's counter is module-local to its bundle, so it cannot know about the
 * commands we inject: as soon as the mod sends one, the game's next number is
 * already taken. Rewriting the game's outgoing commands from our own counter is
 * what closes that gap. While the mod has sent nothing, we stay a passive
 * observer and the bytes on the wire are exactly what vanilla would send.
 */
function renumberGameCommand(envelope: any): any {
  if (!hasInjectedCommands()) {
    observeGameCommandSequence(envelope?.commandSequence);
    return envelope;
  }
  return { ...envelope, commandSequence: takeCommandSequenceForGame() };
}

/**
 * What actually goes on the wire for one frame the page sends: the frame
 * itself, a rewritten frame, or null when a rule dropped the command.
 *
 * Only QuinoaCommand envelopes are touched. Envelopes the mod built are already
 * numbered, and the rules exist to filter what the *game* sends (locker,
 * stats, inventory reserve): running them on our own commands would make the
 * mod block and count itself.
 */
export function processOutgoingFrame(data: unknown): unknown | null {
  if (typeof data !== "string" || data.indexOf('"QuinoaCommand"') === -1) return data;

  const parsed = JSON.parse(data);
  const command =
    parsed?.type === "QuinoaCommand" && parsed.command && typeof parsed.command === "object"
      ? parsed.command
      : null;
  if (!command) return data;
  if (consumeOwnRequestId(parsed.requestId)) return data;

  const next = runOutgoing(command);
  if (next === null) return null;

  const envelope = renumberGameCommand(next === command ? parsed : { ...parsed, command: next });
  return envelope === parsed ? data : JSON.stringify(envelope);
}

/**
 * Intercepts QuinoaCommand envelopes at the WebSocket.send level.
 *
 * The game no longer routes commands through RoomConnection.sendMessage: they
 * are wrapped in { type: "QuinoaCommand", requestId, commandSequence, command }
 * and written straight to the socket. Patching the native prototype covers
 * every socket instance, including reconnections. Rules stay keyed on the inner
 * command type (HarvestCrop, PurchaseShopItem, ...).
 *
 * This is also where the command sequence stays gapless: the game and the mod
 * both number into the same socket, and only the mod can see both streams.
 */
function patchSocketSend() {
  const proto = NativeWS.prototype as any;
  if (proto.__qwsSendPatched) return;

  const originalSend = proto.send;
  proto.send = function (this: WebSocket, data: any, ...rest: any[]) {
    let frame = data;
    try {
      frame = processOutgoingFrame(data);
    } catch (error) {
      console.error("[MG-mod] WebSocket send hook failed:", error);
    }
    if (frame === null) return;
    return originalSend.call(this, frame, ...rest);
  };
  proto.__qwsSendPatched = true;
}

function hasSharedQuinoaWS() {
  return !!readSharedGlobal<WebSocket | null>("quinoaWS");
}

/** Falls back on the room connection's own socket when no frame identified it. */
function scheduleRoomConnectionFallback() {
  const FALLBACK_DELAY_MS = 5000;
  pageWindow.setTimeout(() => {
    try {
      if (hasSharedQuinoaWS()) return;
      const conn =
        (pageWindow as any).MagicCircle_RoomConnection ||
        readSharedGlobal<any>("MagicCircle_RoomConnection");
      const ws: WebSocket | undefined = conn?.currentWebSocket;
      if (ws && ws.readyState === NativeWS.OPEN) {
        setQWS(ws, "room-connection-fallback");
      }
    } catch (error) {
      console.warn("[MagicGarden] Room connection WS fallback failed", error);
    }
  }, FALLBACK_DELAY_MS);
}

function WrappedWebSocket(this: any, url: string | URL, protocols?: string | string[]) {
  const ws: WebSocket =
    protocols !== undefined ? new NativeWS(url as any, protocols) : new NativeWS(url as any);
  sockets.push(ws);

  ws.addEventListener("open", () => {
    setTimeout(() => {
      if ((ws as any).readyState === NativeWS.OPEN) setQWS(ws, "open-fallback");
    }, 800);
  });

  ws.addEventListener("message", async (ev: MessageEvent) => {
    const j = await parseWSData(ev.data);
    if (!j) return;
    // Welcome carries the last sequence the server executed; the next command
    // must be that plus one. Re-seeding on every Welcome is also what makes
    // reconnects work without any special handling.
    if (j.type === "Welcome") seedCommandSequence(j.executedCommandSequence);
    if (!hasSharedQuinoaWS() && (j.type === "Welcome" || j.type === "Config" || j.fullState || j.config)) {
      setQWS(ws, "message:" + (j.type || "state"));
    }
  });

  ws.addEventListener("close", (ev: CloseEvent) => {
    // The numbering is per connection: drop it so a socket that closes before
    // the next Welcome can never leak a stale sequence into the new session.
    resetCommandSequence();
    notifyWebSocketClose(ev, ws);
  });
  return ws;
}

/**
 * Replaces the page's WebSocket so every socket the game opens is tracked, and
 * puts the outgoing rules (`outgoing.ts`) in front of both ways the game sends.
 * Runs at document-start, before the game opens its first socket.
 */
export function installPageWebSocketHook() {
  if (!pageWindow || !NativeWS) return;

  patchSocketSend();

  const wrapped = WrappedWebSocket as any;
  wrapped.prototype = NativeWS.prototype;
  for (const state of ["OPEN", "CLOSED", "CLOSING", "CONNECTING"] as const) {
    try { wrapped[state] = (NativeWS as any)[state]; } catch {}
  }

  (pageWindow as any).WebSocket = wrapped;
  if (pageWindow !== window) {
    try { (window as any).WebSocket = wrapped; } catch {}
  }

  scheduleRoomConnectionFallback();
  hookRoomConnectionSendMessage();
}
