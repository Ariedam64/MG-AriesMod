import { pageWindow, readSharedGlobal, shareGlobal } from "../../platform/pageContext";
import { runOutgoing } from "./outgoing";

/**
 * The older way out: `MagicCircle_RoomConnection.sendMessage`, which the game
 * still uses for the messages it sends flat. The outgoing rules are applied
 * here too, except to QuinoaCommand envelopes, which the socket send hook
 * already handles, so no rule ever runs twice for one command.
 */

type SendMessage = (message: unknown, ...rest: any[]) => unknown;
type ConnectionCtor = { sendMessage?: SendMessage; prototype?: ConnectionCtor };

const INSTALLED_FLAG = "__tmMessageHookInstalled";
const POLL_MS = 200;
const GIVE_UP_MS = 20_000;

let status: "idle" | "installing" | "installed" = readSharedGlobal<boolean>(INSTALLED_FLAG)
  ? "installed"
  : "idle";

function resolveSendMessage(conn: ConnectionCtor): { owner: ConnectionCtor; fn: SendMessage } | null {
  if (typeof conn.sendMessage === "function") return { owner: conn, fn: conn.sendMessage.bind(conn) };
  const proto = conn.prototype;
  if (proto && typeof proto.sendMessage === "function") return { owner: proto, fn: proto.sendMessage };
  return null;
}

function tryInstall(): boolean {
  const conn: ConnectionCtor | undefined =
    (pageWindow as any).MagicCircle_RoomConnection ||
    readSharedGlobal<ConnectionCtor>("MagicCircle_RoomConnection");
  if (!conn) return false;

  const original = resolveSendMessage(conn);
  if (!original) return false;

  original.owner.sendMessage = function (this: unknown, message: any, ...rest: any[]) {
    let current = message;
    try {
      const isEnvelope =
        message?.type === "QuinoaCommand" && message?.command && typeof message.command === "object";
      if (!isEnvelope && message?.type) {
        current = runOutgoing(message);
        if (current === null) return;
      }
    } catch (error) {
      console.error("[MG-mod] sendMessage hook failed:", error);
      current = message;
    }
    return original.fn.call(this, current, ...rest);
  };

  status = "installed";
  shareGlobal(INSTALLED_FLAG, true);
  return true;
}

/**
 * Wraps RoomConnection.sendMessage as soon as the game defines it, polling for
 * up to 20 seconds. Safe to call more than once.
 */
export function hookRoomConnectionSendMessage(): void {
  if (status !== "idle") return;
  status = "installing";
  if (tryInstall()) return;

  const poll = window.setInterval(() => {
    if (tryInstall()) {
      clearInterval(poll);
      clearTimeout(giveUp);
    }
  }, POLL_MS);
  const giveUp = window.setTimeout(() => {
    clearInterval(poll);
    if (status !== "installed") status = "idle";
  }, GIVE_UP_MS);
}
