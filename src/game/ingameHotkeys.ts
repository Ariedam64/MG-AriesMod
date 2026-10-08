// Keyboard layer in front of the game: remap a key to another, block one,
// move an action to a new key, and rapid fire (holding a key repeats another).
// Synthetic events carry flags so the layer never feeds on its own output.
// Also published as `inGameHotkeys` on the page window for the console.

import { pageWindow, shareGlobal } from "../platform/pageContext";
import {
  codeToKey,
  eventToCombo,
  formatCombo,
  isEditableTarget,
  keyCodeOf,
  normalizeCombo,
  parseCombo,
  parseComboSpec,
  type Combo,
  type ComboSpec,
  type RemapSpec,
} from "./keyCombos";

type MapDict = Record<Combo, Combo>; // e.g. { "KeyP": "Space" }
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

interface RapidFireOptions {
  trigger: Combo;        // physical key to hold (e.g. "KeyP")
  emit?: Combo;          // key to emit (defaults to the trigger)
  rateHz?: number;       // rate (default 12 Hz)
  mode?: Mode;           // "tap" (keydown and keyup each tick) or "hold" (repeated keydowns)
  keyupDelayMs?: number; // delay between keydown and keyup in "tap" mode (default 20 ms)
}

export interface InGameHotkeysAPI {
  // remapper on/off
  enable(flag?: boolean): void;
  disable(): void;
  isEnabled(): boolean;

  // remaps
  setMap(m: MapDict): void;
  add(from: Combo, to: Combo): void;
  remove(from: Combo): void;
  clear(): void;
  current(): MapDict;

  // blocking
  block(combo: Combo): void;
  unblock(combo: Combo): void;
  blocked(): Combo[];

  // conditional blocking
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

/* ======================== core: remap, rapid fire ======================== */

const REMAP_FLAG = "__inGameHotkeysRemapped__";
const RAPID_SYN_FLAG = "__inGameHotkeysRapidSynthetic__";

class InGameHotkeys implements InGameHotkeysAPI {
  private readonly win: Window & typeof globalThis;
  private readonly doc: Document;
  // remapper
  private enabled = true;
  private map = new Map<string, RemapSpec>();     // normalised combo -> target spec
  private blockedSet = new Set<string>();         // blocked combos
  private eventBlockers = new Set<(event: KeyboardEvent) => boolean>();
  private attachedDocs = new WeakSet<Document>(); // documents already hooked
  private observers: MutationObserver[] = [];
  private handlers = new Map<Document, (e: Event) => void>();
  private passthrough = new Set<string>(["F5","F12"]);

  // rapid-fire manager
  private sessions = new Map<string, {
    trigger: ComboSpec;
    emit:    ComboSpec;
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

  /* --------- remapper on/off --------- */
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
    for (const [k, v] of this.map.entries()) out[k] = formatCombo(v);
    return out;
  }

  /* --------- blocking --------- */
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

  /* --------- binding helpers --------- */
  /** Moves the action bound to oldBase onto newPhysical and disables oldBase. */
  replace(oldBase: Combo, newPhysical: Combo): void {
    const oldN = normalizeCombo(oldBase);
    const newN = normalizeCombo(newPhysical);
    this.blockedSet.add(oldN);
    this.map.set(newN, parseCombo(oldN));
  }
  /** Swaps two keys both ways (blocks neither). */
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
      trigger: parseComboSpec(trigger),
      emit:    parseComboSpec(emit),
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
        emit: formatCombo(s.emit),
        rateHz: Math.round(1000 / s.rateMs),
        mode: s.mode
      });
    }
    return out;
  }

  /* ================= internals ================= */

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

      // Skip events this layer already remapped.
      if ((e as any)[REMAP_FLAG]) return;

      // Rapid fire only reacts to physical events, never to the ones it emits.
      const isRapidSynthetic = !!(e as any)[RAPID_SYN_FLAG];

      // Rapid fire runs whether or not the remapper is enabled.
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

      // Remapper off?
      if (!this.enabled) return;

      // Never remap inside text fields.
      if (isEditableTarget(e.target)) return;

      // Keys left alone.
      if (this.passthrough.has(e.code)) return;

      const combo = eventToCombo(e);

      // Plain block.
      if (this.blockedSet.has(combo)) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }

      // Remapped?
      const spec = this.map.get(combo);
      if (!spec) return;

      // Remap by dispatching a new event.
      e.stopImmediatePropagation();
      e.preventDefault();

      const code = spec.code || "";
      const key  = (spec.key !== undefined) ? spec.key : codeToKey(code, e.shiftKey);
      const ctrl = spec.ctrl ?? e.ctrlKey;
      const shift= spec.shift ?? e.shiftKey;
      const alt  = spec.alt  ?? e.altKey;
      const meta = spec.meta ?? e.metaKey;
      const kc   = keyCodeOf(code, key);

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

  /* ---------- rapid fire internals ---------- */

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

  private matches(e: KeyboardEvent, c: ComboSpec): boolean {
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
      // Synthetic keydown, flagged with RAPID_SYN_FLAG so it never re-triggers rapid fire.
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
      // Release the key cleanly at the end.
      this.dispatchKey(doc, s.lastTarget, "keyup", s.emit, false);
    }
  }

  private restartLoop(s: any): void {
    if (!s.pressed) return;
    // Restart on the main document.
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
    c: ComboSpec,
    repeat: boolean
  ) {
    const code = c.code;
    const key  = codeToKey(code, c.shift);
    const kc   = keyCodeOf(code, key);

    const eventWindow = doc.defaultView || this.win;
    const ev = new eventWindow.KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      key, code,
      ctrlKey: c.ctrl, shiftKey: c.shift, altKey: c.alt, metaKey: c.meta,
      repeat
    });

    // No REMAP_FLAG here, so a remap rule still applies to these events; the
    // rapid fire flag keeps them from re-triggering rapid fire.
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

/* ============================== shared instance ============================== */
const defaultContext = resolveContext();
export const inGameHotkeys: InGameHotkeysAPI = new InGameHotkeys(true, defaultContext);

shareGlobal("inGameHotkeys", inGameHotkeys);
