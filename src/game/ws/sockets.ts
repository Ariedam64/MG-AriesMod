import { pageWindow, shareGlobal } from "../../platform/pageContext";

/** The page's own WebSocket constructor, captured before the hook replaces it. */
export const NativeWS = pageWindow.WebSocket;

/** Every socket the page opened since the hook went in. */
export const sockets: WebSocket[] = [];

/** The game's room socket, once one of the sockets has been recognised as it. */
export let quinoaWS: WebSocket | null = null;

export function setQWS(ws: WebSocket, why: string) {
  if (quinoaWS) return;
  quinoaWS = ws;
  shareGlobal("quinoaWS", ws);
  try {
    console.log("[QuinoaWS] selected ->", why);
  } catch {}
}

/**
 * Whether the socket was found inside a worker. The mod no longer instruments
 * workers, so this stays false; the HUD and the debug menu still show it.
 */
export const workerFound = false;

/** A readyState as the name WebSocket gives it. */
export function label(rs: number | undefined) {
  return ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][rs ?? -1] || "none";
}
