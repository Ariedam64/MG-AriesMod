// Part of the portable bug report core: this folder is copied as it is into
// the other mods (Community Hub, Gemini, MG-mod), so it must stay
// self-contained. No import from outside it, no game or userscript manager
// global, no UI.
//
// The last console errors and warnings, uncaught errors and rejected
// promises, plus a trail of what the player did (breadcrumbs), kept in memory
// so a bug report can say what went wrong just before it was sent.
//
// Everything here runs inside other code's console calls, so it must never
// throw and never call itself: a capture that logs while capturing would loop.

import { clipLine } from "./limits";
import type { Breadcrumb, LogEntry, LogLevel } from "./types";

/** A list that keeps only its newest `max` items. */
export class RingBuffer<T> {
  private items: T[] = [];

  constructor(readonly max: number) {}

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
  }

  /** The newest item, to fold a repeat into it. */
  last(): T | undefined {
    return this.items[this.items.length - 1];
  }

  toArray(): T[] {
    return this.items.slice();
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}

const MAX_DEPTH = 3;
const MAX_KEYS = 15;
const MAX_ITEMS = 10;
const STACK_FRAMES = 4;

type ErrorLike = { name?: unknown; message?: unknown; stack?: unknown };

/** Duck-typed, so an Error from another realm (the page, an iframe) counts too. */
function isErrorLike(value: unknown): value is ErrorLike {
  if (!value || typeof value !== "object") return false;
  const v = value as ErrorLike;
  return typeof v.message === "string" && (typeof v.stack === "string" || value instanceof Error);
}

function describeError(error: ErrorLike): string {
  const name = typeof error.name === "string" && error.name ? error.name : "Error";
  const head = `${name}: ${String(error.message)}`;
  const stack = typeof error.stack === "string" ? error.stack : "";
  // Chrome's stack repeats the message on its first line, Firefox's does not.
  const frames = stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(head))
    .slice(0, STACK_FRAMES);
  return frames.length ? `${head} @ ${frames.join(" | ")}` : head;
}

/**
 * JSON-like text for an object, bounded in depth, keys, items and length, so
 * a huge game object logged by mistake costs next to nothing. A getter that
 * throws reads as "[throws]", a cycle as "[circular]".
 */
function boundedJson(root: unknown, budget: number): string {
  let out = "";
  const ancestors = new Set<object>();
  const write = (text: string) => {
    out += text;
    return out.length < budget;
  };

  const visit = (value: unknown, depth: number): boolean => {
    if (typeof value === "string") return write(JSON.stringify(value.length > budget ? value.slice(0, budget) : value));
    if (typeof value === "function") return write('"[function]"');
    if (value === null || typeof value !== "object") return write(String(value));
    if (ancestors.has(value)) return write('"[circular]"');
    if (depth >= MAX_DEPTH) return write(Array.isArray(value) ? "[...]" : "{...}");

    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (!write("[")) return false;
        const count = Math.min(value.length, MAX_ITEMS);
        for (let i = 0; i < count; i++) {
          if (i && !write(",")) return false;
          if (!visit(value[i], depth + 1)) return false;
        }
        if (value.length > count && !write(`,"+${value.length - count} more"`)) return false;
        return write("]");
      }
      if (!write("{")) return false;
      const keys = Object.keys(value);
      const count = Math.min(keys.length, MAX_KEYS);
      for (let i = 0; i < count; i++) {
        if (!write(`${i ? "," : ""}${JSON.stringify(keys[i])}:`)) return false;
        let item: unknown;
        try {
          item = (value as Record<string, unknown>)[keys[i]];
        } catch {
          item = "[throws]";
        }
        if (!visit(item, depth + 1)) return false;
      }
      if (keys.length > count && !write(`,"...":"+${keys.length - count} keys"`)) return false;
      return write("}");
    } finally {
      ancestors.delete(value);
    }
  };

  visit(root, 0);
  return out;
}

/** One console argument as text, within `budget` characters. Never throws. */
export function describeLogValue(value: unknown, budget = 500): string {
  try {
    if (typeof value === "string") return value.length > budget ? value.slice(0, budget) : value;
    if (isErrorLike(value)) return describeError(value);
    if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;
    if (value === null || typeof value !== "object") return String(value);
    const node = value as { nodeType?: unknown; tagName?: unknown };
    if (typeof node.nodeType === "number" && typeof node.tagName === "string") return `<${node.tagName.toLowerCase()}>`;
    return boundedJson(value, budget);
  } catch {
    return "[unprintable]";
  }
}

/** A console call's arguments as one line of at most `max` characters. */
export function formatLogArgs(args: readonly unknown[], max = 500): string {
  let out = "";
  for (const arg of args) {
    if (out.length >= max) break;
    const part = describeLogValue(arg, max - out.length);
    out = out ? `${out} ${part}` : part;
  }
  return clipLine(out, max);
}

export type LogCaptureOptions = {
  maxLogs?: number;
  maxBreadcrumbs?: number;
  /** Characters kept per log line. */
  maxMessage?: number;
  /** Characters kept per breadcrumb. */
  maxBreadcrumb?: number;
  now?: () => number;
};

type ConsoleLike = { error?: (...args: any[]) => void; warn?: (...args: any[]) => void };

/** A window, or anything shaped like one: its console and its error events. */
export type LogCaptureTarget = {
  console?: ConsoleLike;
  addEventListener?: (type: string, listener: (event: any) => void) => void;
  removeEventListener?: (type: string, listener: (event: any) => void) => void;
};

export interface LogCapture {
  /** Adds a log line, as a wrapped console call does. */
  record(level: LogLevel, args: readonly unknown[]): void;
  /** Notes something the player did or the session went through. */
  breadcrumb(message: string): void;
  logs(): LogEntry[];
  breadcrumbs(): Breadcrumb[];
  clear(): void;
  /**
   * Wraps `target.console.error` and `.warn` (the originals still run) and
   * listens to its `error` and `unhandledrejection` events. Installing twice
   * on the same console or target does nothing more. Returns the undo.
   */
  install(target: LogCaptureTarget): () => void;
}

const WRAPPED_LEVELS = ["error", "warn"] as const;

export function createLogCapture(options: LogCaptureOptions = {}): LogCapture {
  const maxMessage = options.maxMessage ?? 500;
  const maxBreadcrumb = options.maxBreadcrumb ?? 200;
  const now = options.now ?? (() => Date.now());
  const logs = new RingBuffer<LogEntry>(options.maxLogs ?? 200);
  const crumbs = new RingBuffer<Breadcrumb>(options.maxBreadcrumbs ?? 100);
  const consoles = new WeakSet<object>();
  const targets = new WeakSet<object>();
  // Set while this capture is working: a console call made from inside it
  // (a getter on a logged object, a broken console) is passed through but not
  // recorded again.
  let busy = false;

  /** Folds the same line logged again and again into one entry with a count. */
  const pushFolded = <T extends { msg: string; repeat?: number }>(buffer: RingBuffer<T>, entry: T, same: (a: T) => boolean) => {
    const last = buffer.last();
    if (last && same(last)) last.repeat = (last.repeat ?? 1) + 1;
    else buffer.push(entry);
  };

  const record = (level: LogLevel, args: readonly unknown[]) => {
    try {
      const msg = formatLogArgs(args, maxMessage);
      pushFolded(logs, { t: now(), level, msg }, (last) => last.level === level && last.msg === msg);
    } catch {}
  };

  const guarded = (fn: () => void) => {
    if (busy) return;
    busy = true;
    try {
      fn();
    } catch {
      // A capture that fails loses one line, never the caller's work.
    } finally {
      busy = false;
    }
  };

  const wrapConsole = (con: ConsoleLike, undo: Array<() => void>) => {
    for (const level of WRAPPED_LEVELS) {
      const original = con[level];
      if (typeof original !== "function") continue;
      const replacement = function (this: unknown, ...args: unknown[]) {
        const self = this ?? con;
        if (busy) {
          try {
            return original.apply(self, args);
          } catch {
            return undefined;
          }
        }
        busy = true;
        try {
          record(level, args);
          return original.apply(self, args);
        } catch {
          return undefined;
        } finally {
          busy = false;
        }
      };
      con[level] = replacement;
      undo.push(() => {
        if (con[level] === replacement) con[level] = original;
      });
    }
  };

  const listen = (target: LogCaptureTarget, undo: Array<() => void>) => {
    const onError = (event: any) =>
      guarded(() => {
        if (event?.error) {
          record("error", ["Uncaught", event.error]);
          return;
        }
        const where = event?.filename ? ` (${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0})` : "";
        record("error", [`Uncaught ${event?.message ?? "error"}${where}`]);
      });
    const onRejection = (event: any) => guarded(() => record("error", ["Unhandled rejection:", event?.reason]));
    target.addEventListener!("error", onError);
    target.addEventListener!("unhandledrejection", onRejection);
    undo.push(() => {
      target.removeEventListener?.("error", onError);
      target.removeEventListener?.("unhandledrejection", onRejection);
    });
  };

  return {
    record: (level, args) => guarded(() => record(level, args)),
    breadcrumb(message) {
      guarded(() => {
        const msg = clipLine(String(message), maxBreadcrumb);
        pushFolded(crumbs, { t: now(), msg }, (last) => last.msg === msg);
      });
    },
    logs: () => logs.toArray().map((entry) => ({ ...entry })),
    breadcrumbs: () => crumbs.toArray().map((entry) => ({ ...entry })),
    clear() {
      logs.clear();
      crumbs.clear();
    },
    install(target) {
      const undo: Array<() => void> = [];
      try {
        const con = target.console;
        if (con && typeof con === "object" && !consoles.has(con)) {
          consoles.add(con);
          wrapConsole(con, undo);
          undo.push(() => consoles.delete(con));
        }
        if (typeof target.addEventListener === "function" && !targets.has(target)) {
          targets.add(target);
          listen(target, undo);
          undo.push(() => targets.delete(target));
        }
      } catch {}
      return () => {
        for (const step of undo.splice(0).reverse()) {
          try {
            step();
          } catch {}
        }
      };
    },
  };
}
