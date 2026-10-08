// src/core/state.ts
import { pageWindow, shareGlobal } from "../../platform/pageContext";

export const NativeWS = pageWindow.WebSocket;

// sockets créées dans la page
export const sockets: WebSocket[] = [];

// page socket retenue (si trouvée)
export let quinoaWS: WebSocket | null = null;
export function setQWS(ws: WebSocket, why: string) {
  if (!quinoaWS) {
    quinoaWS = ws;
    shareGlobal("quinoaWS", ws);
    try {
      console.log("[QuinoaWS] selected ->", why);
    } catch {}
  }
}

// drapeau: WS détectée dans un worker instrumenté
export let workerFound = false;

// petit Set compatible anciens navigateurs
type SimpleSet<T> = Set<T> & {
  _a?: T[];
  add?(v: T): any;
  delete?(v: T): any;
  forEach?(fn: (v: T) => void): any;
};

export const Workers: SimpleSet<Worker> = (typeof Set !== "undefined")
  ? new Set<Worker>() as SimpleSet<Worker>
  : {
      _a: [],
      add(w: Worker) { (this._a as Worker[]).push(w); },
      delete(w: Worker) {
        const i = (this._a as Worker[]).indexOf(w);
        if (i >= 0) (this._a as Worker[]).splice(i, 1);
      },
      forEach(fn: (w: Worker)=>void) { for (let i=0;i<(this._a as Worker[]).length;i++) fn((this._a as Worker[])[i]); }
    } as any;

export function label(rs: number | undefined) {
  return ['CONNECTING','OPEN','CLOSING','CLOSED'][rs ?? -1] || 'none';
}
