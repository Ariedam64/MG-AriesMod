// inGameHotkeys.ts — remap + block + replace + rapid-fire (TypeScript, Tampermonkey ready)

import { pageWindow, shareGlobal } from "../utils/page-context";

type Combo = string;                 // ex: "KeyE", "Shift+Space", "Ctrl+KeyQ"
type MapDict = Record<Combo, Combo>; // ex: { "KeyP": "Space" }
type Mode = "tap" | "hold";

interface HotkeysContext {
  window: Window & typeof globalThis;
  document: Document;
}

const resolveContext = (context?: HotkeysContext): HotkeysContext => {
  if (context) return context;
  const win = pageWindow ?? window;
  const doc = win.document ?? document;
  return { window: win, document: doc };
};

interface RemapSpec {
  code?: string;
  key?: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

interface RapidFireOptions {
  trigger: Combo;        // touche physique à maintenir (ex: "KeyP")
  emit?: Combo;          // touche à émettre (défaut = trigger)
  rateHz?: number;       // cadence (défaut 12 Hz)
  mode?: Mode;           // "tap" (keydown+keyup à chaque tick) ou "hold" (keydown répétés)
  keyupDelayMs?: number; // délai entre keydown et keyup en mode "tap" (défaut 20 ms)
}

export interface InGameHotkeysAPI {
  // on/off remapper
  enable(flag?: boolean): void;
  disable(): void;
  isEnabled(): boolean;

  // remaps
  setMap(m: MapDict): void;
  add(from: Combo, to: Combo): void;
  remove(from: Combo): void;
  clear(): void;
  current(): MapDict;

  // blocages
  block(combo: Combo): void;
  unblock(combo: Combo): void;
  blocked(): Combo[];

  // blocages conditionnels
  addEventBlocker(blocker: (event: KeyboardEvent) => boolean): () => void;

  // helpers
  replace(oldBase: Combo, newPhysical: Combo): void;
  swap(a: Combo, b: Combo): void;

  // frames & cleanup
  attachAllFrames(): void;
  destroy(): void;

  // rapid-fire
  startRapidFire(opts: RapidFireOptions): void;
  stopRapidFire(trigger?: Combo): void;
  stopAllRapidFires(): void;
  isRapidFireActive(trigger: Combo): boolean;
  setRapidFireRate(trigger: Combo, hz: number): void;
  setRapidFireMode(trigger: Combo, mode: Mode): void;
  listRapidFires(): Array<{ trigger: Combo; emit: Combo; rateHz: number; mode: Mode }>;
}

/* ====================== utils clavier ====================== */

const KEYCODE_TABLE: Record<string, number> = {
  KeyA:65,KeyB:66,KeyC:67,KeyD:68,KeyE:69,KeyF:70,KeyG:71,KeyH:72,KeyI:73,KeyJ:74,KeyK:75,KeyL:76,KeyM:77,
  KeyN:78,KeyO:79,KeyP:80,KeyQ:81,KeyR:82,KeyS:83,KeyT:84,KeyU:85,KeyV:86,KeyW:87,KeyX:88,KeyY:89,KeyZ:90,
  Digit0:48,Digit1:49,Digit2:50,Digit3:51,Digit4:52,Digit5:53,Digit6:54,Digit7:55,Digit8:56,Digit9:57,
  Space:32, Enter:13, Escape:27, Tab:9, Backspace:8, Delete:46, Insert:45,
  ArrowLeft:37, ArrowUp:38, ArrowRight:39, ArrowDown:40,
};

const codeToKey = (code?: string, shift = false): string => {
  if (!code) return "";
  if (/^Key[A-Z]$/.test(code)) return shift ? code.slice(3).toUpperCase() : code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code === "Space") return " ";
  return code;
};

const isEditableTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  const ce = el.getAttribute && el.getAttribute("contenteditable");
  return !!(ce && ce !== "false");
};

const normalizeCombo = (c: Combo): string => {
  const parts = String(c).split("+").map(s => s.trim()).filter(Boolean);
  const mods: string[] = []; let code = "";
  for (const p of parts) {
    const P = p.toLowerCase();
    if (P === "ctrl" || P === "control") mods.push("ctrl");
    else if (P === "shift") mods.push("shift");
    else if (P === "alt") mods.push("alt");
    else if (P === "meta" || P === "cmd" || P === "command" || P === "win") mods.push("meta");
    else code = p;
  }
  mods.sort((a,b)=>["ctrl","shift","alt","meta"].indexOf(a)-["ctrl","shift","alt","meta"].indexOf(b));
  return (mods.length ? mods.join("+") + "+" : "") + code;
};

const parseCombo = (c: Combo): RemapSpec => {
  const parts = String(c).split("+").map(s => s.trim()).filter(Boolean);
  const spec: RemapSpec = {};
  for (const p of parts) {
    const P = p.toLowerCase();
    if (P === "ctrl" || P === "control") spec.ctrl = true;
    else if (P === "shift") spec.shift = true;
    else if (P === "alt") spec.alt = true;
    else if (P === "meta" || P === "cmd" || P === "command" || P === "win") spec.meta = true;
    else spec.code = p;
  }
  if (spec.code && spec.key === undefined) spec.key = codeToKey(spec.code, !!spec.shift);
  return spec;
};

const evToCombo = (e: KeyboardEvent): string => {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("ctrl");
  if (e.shiftKey) mods.push("shift");
  if (e.altKey) mods.push("alt");
  if (e.metaKey) mods.push("meta");
  mods.sort((a,b)=>["ctrl","shift","alt","meta"].indexOf(a)-["ctrl","shift","alt","meta"].indexOf(b));
  return (mods.length ? mods.join("+") + "+" : "") + (e.code || "");
};

/* ================== cœur : remap + rapid-fire ================== */

const REMAP_FLAG = "__inGameHotkeysRemapped__";
const RAPID_SYN_FLAG = "__inGameHotkeysRapidSynthetic__";

class InGameHotkeys implements InGameHotkeysAPI {
  private readonly win: Window & typeof globalThis;
  private readonly doc: Document;
  // remapper
  private enabled = true;
  private map = new Map<string, RemapSpec>();     // combo normalisé -> spec destination
  private blockedSet = new Set<string>();         // combos bloqués
  private eventBlockers = new Set<(event: KeyboardEvent) => boolean>();
  private attachedDocs = new WeakSet<Document>(); // docs déjà hookés
  private observers: MutationObserver[] = [];
  private handlers = new Map<Document, (e: Event) => void>();
  private passthrough = new Set<string>(["F5","F12"]);

  // rapid-fire manager
  private sessions = new Map<string, {
    trigger: { code: string; ctrl:boolean; shift:boolean; alt:boolean; meta:boolean };
    emit:    { code: string; ctrl:boolean; shift:boolean; alt:boolean; meta:boolean };
    rateMs: number;
    mode: Mode;
    keyupDelayMs: number;
    pressed: boolean;
    lastTarget: EventTarget | null;
    tickTimer: number | null;
    upTimer: number | null;
  }>();

  constructor(autoAttach = true, context?: HotkeysContext) {
    const ctx = resolveContext(context);
    this.win = ctx.window;
    this.doc = ctx.document;
    if (autoAttach) {
      this.attachDoc(this.doc);
      this.attachAllFrames();
      if (this.win.MutationObserver) {
        const mo = new this.win.MutationObserver(() => this.attachAllFrames());
        mo.observe(this.doc.documentElement || this.doc, { childList: true, subtree: true });
        this.observers.push(mo);
      }
    }
  }

  /* --------- on/off remapper --------- */
  enable(flag = true): void { this.enabled = !!flag; }
  disable(): void { this.enabled = false; }
  isEnabled(): boolean { return this.enabled; }

  /* --------- remaps --------- */
  setMap(m: MapDict): void {
    this.map.clear();
    for (const [from, to] of Object.entries(m || {})) this.map.set(normalizeCombo(from), parseCombo(to));
  }
  add(from: Combo, to: Combo): void { this.map.set(normalizeCombo(from), parseCombo(to)); }
  remove(from: Combo): void { this.map.delete(normalizeCombo(from)); }
  clear(): void { this.map.clear(); }

  current(): MapDict {
    const out: MapDict = {};
    for (const [k, v] of this.map.entries()) {
      const mods: string[] = [];
      if (v.ctrl) mods.push("Ctrl");
      if (v.shift) mods.push("Shift");
      if (v.alt) mods.push("Alt");
      if (v.meta) mods.push("Meta");
      out[k] = (mods.length ? mods.join("+") + "+" : "") + (v.code || "");
    }
    return out;
  }

  /* --------- blocages --------- */
  block(combo: Combo): void { this.blockedSet.add(normalizeCombo(combo)); }
  unblock(combo: Combo): void { this.blockedSet.delete(normalizeCombo(combo)); }
  blocked(): Combo[] { return Array.from(this.blockedSet); }

  addEventBlocker(blocker: (event: KeyboardEvent) => boolean): () => void {
    if (typeof blocker !== "function") {
      return () => {};
    }
    this.eventBlockers.add(blocker);
    return () => {
      this.eventBlockers.delete(blocker);
    };
  }

  /* --------- helpers de binding --------- */
  /** Déplace l’action bindée sur oldBase vers newPhysical et désactive oldBase. */
  replace(oldBase: Combo, newPhysical: Combo): void {
    const oldN = normalizeCombo(oldBase);
    const newN = normalizeCombo(newPhysical);
    this.blockedSet.add(oldN);
    this.map.set(newN, parseCombo(oldN));
  }
  /** Échange réciproquement deux touches (ne bloque pas). */
  swap(a: Combo, b: Combo): void {
    const an = normalizeCombo(a), bn = normalizeCombo(b);
    this.map.set(an, parseCombo(bn));
    this.map.set(bn, parseCombo(an));
  }

  /* --------- frames & cleanup --------- */
  attachAllFrames(): void {
    this.doc.querySelectorAll("iframe").forEach(f => {
      try {
        const d = f.contentDocument;
        const origin = d?.location?.origin;
        if (d && origin && origin === this.win.location.origin) this.attachDoc(d);
      } catch { /* cross-origin */ }
    });
  }
  destroy(): void {
    for (const [doc, handler] of this.handlers.entries()) {
      try {
        const win = doc.defaultView || this.win;
        win.removeEventListener("keydown", handler, true);
        win.removeEventListener("keypress", handler, true);
        win.removeEventListener("keyup", handler, true);
      } catch {}
    }
    this.handlers.clear();
    this.attachedDocs = new WeakSet();
    for (const mo of this.observers) mo.disconnect();
    this.observers = [];
    this.stopAllRapidFires();
    this.eventBlockers.clear();
  }

  /* --------- rapid-fire (API) --------- */
  startRapidFire(opts: RapidFireOptions): void {
    const trigger = normalizeCombo(opts.trigger);
    const emit = normalizeCombo(opts.emit ?? opts.trigger);
    const rateMs = 1000 / Math.max(1, opts.rateHz ?? 12);
    const mode: Mode = opts.mode ?? "tap";
    const keyupDelayMs = opts.keyupDelayMs ?? 20;

    this.sessions.set(trigger, {
      trigger: parseRapid(trigger),
      emit:    parseRapid(emit),
      rateMs, mode, keyupDelayMs,
      pressed: false, lastTarget: null,
      tickTimer: null, upTimer: null
    });
  }

  stopRapidFire(trigger?: Combo): void {
    if (!trigger) { this.stopAllRapidFires(); return; }
    const key = normalizeCombo(trigger);
    const s = this.sessions.get(key);
    if (!s) return;
    this.endSession(s);
    this.sessions.delete(key);
  }

  stopAllRapidFires(): void {
    for (const s of this.sessions.values()) this.endSession(s);
    this.sessions.clear();
  }

  isRapidFireActive(trigger: Combo): boolean {
    const s = this.sessions.get(normalizeCombo(trigger));
    return !!(s && s.pressed);
  }

  setRapidFireRate(trigger: Combo, hz: number): void {
    const s = this.sessions.get(normalizeCombo(trigger));
    if (!s) return;
    s.rateMs = 1000 / Math.max(1, hz);
    if (s.pressed) this.restartLoop(s);
  }

  setRapidFireMode(trigger: Combo, mode: Mode): void {
    const s = this.sessions.get(normalizeCombo(trigger));
    if (!s) return;
    s.mode = mode;
  }

  listRapidFires(): Array<{ trigger: Combo; emit: Combo; rateHz: number; mode: Mode }> {
    const out: Array<{ trigger: Combo; emit: Combo; rateHz: number; mode: Mode }> = [];
    for (const [key, s] of this.sessions.entries()) {
      out.push({
        trigger: key,
        emit: joinRapid(s.emit),
        rateHz: Math.round(1000 / s.rateMs),
        mode: s.mode
      });
    }
    return out;
  }

  /* ================= internes ================= */

  private attachDoc(doc: Document): void {
    if (!doc || this.attachedDocs.has(doc)) return;
    const handler = this.makeHandler(doc);
    const win = doc.defaultView || this.win;
    win.addEventListener("keydown", handler, true);
    win.addEventListener("keypress", handler, true);
    win.addEventListener("keyup", handler, true);
    this.handlers.set(doc, handler);
    this.attachedDocs.add(doc);
  }

  private makeHandler(doc: Document) {
    return (evt: Event) => {
      const e = evt as KeyboardEvent;

      // Ignore les events déjà remappés par nous
      if ((e as any)[REMAP_FLAG]) return;

      // Rapid-fire : on n’utilise que les événements **physiques** (pas ceux émis par le RF)
      const isRapidSynthetic = !!(e as any)[RAPID_SYN_FLAG];

      // gestion RF (indépendant de this.enabled)
      if (!isRapidSynthetic) this.handleRapidFireInput(doc, e);

      if (!isRapidSynthetic && this.eventBlockers.size) {
        for (const blocker of Array.from(this.eventBlockers)) {
          let shouldBlock = false;
          try {
            shouldBlock = blocker(e);
          } catch {
            shouldBlock = false;
          }
          if (shouldBlock) {
            e.stopImmediatePropagation();
            e.preventDefault();
            return;
          }
        }
      }

      // remapper désactivé ?
      if (!this.enabled) return;

      // pas de remap dans les inputs
      if (isEditableTarget(e.target)) return;

      // touches à laisser tranquilles
      if (this.passthrough.has(e.code)) return;

      const combo = evToCombo(e);

      // blocage pur
      if (this.blockedSet.has(combo)) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }

      // remap ?
      const spec = this.map.get(combo);
      if (!spec) return;

      // remap (redispatch)
      e.stopImmediatePropagation();
      e.preventDefault();

      const code = spec.code || "";
      const key  = (spec.key !== undefined) ? spec.key : codeToKey(code, e.shiftKey);
      const ctrl = spec.ctrl ?? e.ctrlKey;
      const shift= spec.shift ?? e.shiftKey;
      const alt  = spec.alt  ?? e.altKey;
      const meta = spec.meta ?? e.metaKey;
      const kc   = KEYCODE_TABLE[code] ?? (key && key.length===1 ? key.toUpperCase().charCodeAt(0) : 0);

      const eventWindow = doc.defaultView || this.win;
      const ne = new eventWindow.KeyboardEvent(e.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        key, code,
        ctrlKey: ctrl, shiftKey: shift, altKey: alt, metaKey: meta,
        repeat: e.repeat,
        location: e.location
      });

      Object.defineProperties(ne, {
        keyCode:  { get: () => kc },
        which:    { get: () => kc },
        charCode: { get: () => kc },
        [REMAP_FLAG]: { value: true }
      });

      const target = (e.target as Node) || doc;
      target.dispatchEvent(ne);
    };
  }

  /* ---------- Rapid-fire internes ---------- */

  private handleRapidFireInput(doc: Document, e: KeyboardEvent): void {
    if (isEditableTarget(e.target)) return;

    if (e.type === "keydown" && !e.repeat) {
      for (const s of this.sessions.values()) {
        if (this.matches(e, s.trigger)) {
          s.pressed = true;
          s.lastTarget = (e.target as EventTarget) || doc;
          this.startLoop(doc, s);
        }
      }
    } else if (e.type === "keyup") {
      for (const s of this.sessions.values()) {
        if (this.matches(e, s.trigger)) {
          s.pressed = false;
          this.stopLoop(doc, s);
        }
      }
    }
  }

  private matches(e: KeyboardEvent, c: { code: string; ctrl:boolean; shift:boolean; alt:boolean; meta:boolean }): boolean {
    return (e.code === c.code) &&
           (!!e.ctrlKey === !!c.ctrl) &&
           (!!e.shiftKey === !!c.shift) &&
           (!!e.altKey === !!c.alt) &&
           (!!e.metaKey === !!c.meta);
  }

  private startLoop(doc: Document, s: any): void {
    this.stopLoop(doc, s);

    const tick = () => {
      if (!s.pressed) return;
      // keydown synthétique (marqué RAPID_SYN_FLAG, pour ne pas ré-alimenter la détection de RF)
      this.dispatchKey(doc, s.lastTarget || doc, "keydown", s.emit, true);
      if (s.mode === "tap") {
        if (s.upTimer) this.win.clearTimeout(s.upTimer);
        s.upTimer = this.win.setTimeout(() => {
          this.dispatchKey(doc, s.lastTarget || doc, "keyup", s.emit, false);
        }, s.keyupDelayMs) as unknown as number;
      }
    };

    tick();
    s.tickTimer = this.win.setInterval(tick, s.rateMs) as unknown as number;
  }

  private stopLoop(doc: Document, s: any): void {
    if (s.tickTimer) { this.win.clearInterval(s.tickTimer); s.tickTimer = null; }
    if (s.upTimer)   { this.win.clearTimeout(s.upTimer);   s.upTimer   = null; }
    if (s.mode === "hold" && s.lastTarget) {
      // relâche proprement à la fin
      this.dispatchKey(doc, s.lastTarget, "keyup", s.emit, false);
    }
  }

  private restartLoop(s: any): void {
    if (!s.pressed) return;
    // redémarre sur le doc principal
    const anyDoc = this.doc;
    this.startLoop(anyDoc, s);
  }

  private endSession(s: any): void {
    this.stopLoop(this.doc, s);
    s.pressed = false;
    s.lastTarget = null;
  }

  private dispatchKey(
    doc: Document,
    target: EventTarget,
    type: "keydown" | "keyup",
    c: { code: string; ctrl:boolean; shift:boolean; alt:boolean; meta:boolean },
    repeat: boolean
  ) {
    const code = c.code;
    const key  = codeToKey(code, c.shift);
    const kc   = KEYCODE_TABLE[code] ?? (key && key.length===1 ? key.toUpperCase().charCodeAt(0) : 0);

    const eventWindow = doc.defaultView || this.win;
    const ev = new eventWindow.KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      key, code,
      ctrlKey: c.ctrl, shiftKey: c.shift, altKey: c.alt, metaKey: c.meta,
      repeat
    });

    // – on **NE MET PAS** REMAP_FLAG ici → ces events pourront être remappés si une règle existe.
    // – on marque l'événement comme synthétique rapid-fire pour ne pas relancer la détection RF.
    Object.defineProperties(ev, {
      keyCode:  { get: () => kc },
      which:    { get: () => kc },
      charCode: { get: () => kc },
      [RAPID_SYN_FLAG]: { value: true }
    });

    try { (target as Node).dispatchEvent(ev); }
    catch { doc.dispatchEvent(ev); }
  }
}

/* ==== helpers RF ==== */
function parseRapid(c: string): { code: string; ctrl:boolean; shift:boolean; alt:boolean; meta:boolean } {
  const parts = String(c).split("+").map(s => s.trim()).filter(Boolean);
  let code = ""; let ctrl=false, shift=false, alt=false, meta=false;
  for (const p of parts) {
    const P = p.toLowerCase();
    if (P==="ctrl"||P==="control") ctrl=true;
    else if (P==="shift") shift=true;
    else if (P==="alt") alt=true;
    else if (P==="meta"||P==="cmd"||P==="command"||P==="win") meta=true;
    else code = p;
  }
  return { code, ctrl, shift, alt, meta };
}
function joinRapid(c: { code:string; ctrl:boolean; shift:boolean; alt:boolean; meta:boolean }): Combo {
  const mods = [];
  if (c.ctrl) mods.push("Ctrl");
  if (c.shift) mods.push("Shift");
  if (c.alt) mods.push("Alt");
  if (c.meta) mods.push("Meta");
  mods.push(c.code);
  return mods.join("+");
}

/* ===== instance globale exportée ===== */
const defaultContext = resolveContext();
export const inGameHotkeys: InGameHotkeysAPI = new InGameHotkeys(true, defaultContext);

shareGlobal("inGameHotkeys", inGameHotkeys);
try { (window as any).inGameHotkeys = inGameHotkeys; } catch {}

/* ================= EXEMPLES D’USAGE =================

import { inGameHotkeys } from './inGameHotkeys';

// Remap simple : appuyer sur P => le jeu reçoit "Space"
inGameHotkeys.add('KeyP', 'Space');

// Remplacer : l'action Space passe sur P ET Space ne marche plus
inGameHotkeys.replace('Space', 'KeyP');

// Bloquer totalement une touche
inGameHotkeys.block('KeyE');

// Échanger deux touches
inGameHotkeys.swap('KeyQ','KeyR');

// Rapid-fire (maintenir P pour spammer P à 15 Hz)
inGameHotkeys.startRapidFire({ trigger: 'KeyP', emit: 'KeyP', rateHz: 15, mode: 'tap' });

// Rapid-fire (maintenir P, émettre Space à 20 Hz ; utile si Space a été remappé ailleurs)
inGameHotkeys.startRapidFire({ trigger: 'KeyP', emit: 'Space', rateHz: 20, mode: 'tap' });

// Ajuster un profil RF existant
inGameHotkeys.setRapidFireRate('KeyP', 25);
inGameHotkeys.setRapidFireMode('KeyP', 'hold');

// Stopper RF pour P (ou tout stopper)
inGameHotkeys.stopRapidFire('KeyP');
inGameHotkeys.stopAllRapidFires();

// Voir les règles & RF actifs
console.log(inGameHotkeys.current());
console.log(inGameHotkeys.listRapidFires());

// Pause/reprise du remapper (RF continue d'émettre même si remap OFF)
inGameHotkeys.disable();
inGameHotkeys.enable(true);

// Re-attacher si des iframes same-origin arrivent ensuite
inGameHotkeys.attachAllFrames();

// Nettoyage complet
inGameHotkeys.destroy();

====================================================== */
