import { Subscriptions, type Unsubscribe } from "../../lib/emitter";

/** What a watcher's setup receives. Everything registered on it is undone by `stop`. */
export interface WatchScope {
  /** Keeps an unsubscriber, or the promise of one that the store hands back. */
  add(unsubscribe: Unsubscribe | Promise<Unsubscribe | void> | void): void;
  /** Runs `tick` every `ms` until the watcher stops. A tick that throws is skipped. */
  every(ms: number, tick: () => void): void;
  /**
   * Wraps a callback so it does nothing once this run has stopped.
   *
   * A store subscription resolves asynchronously: one that lands after `stop`
   * is undone by `add`, but it may have fired once in between.
   */
  live<A extends unknown[]>(callback: (...args: A) => void): (...args: A) => void;
  /** False once this run has stopped, even if the watcher was started again since. */
  readonly active: boolean;
}

export interface Watcher {
  /** Starts the watcher. Calling it while it runs does nothing. */
  start(): void;
  /** Undoes everything the current run registered. */
  stop(): void;
  readonly running: boolean;
}

/**
 * A start/stop pair around `setup`.
 *
 * Each start is a run of its own: its subscriptions, timers and `live`
 * callbacks belong to it alone, so a subscription that resolves after a stop
 * can never leak into the next start.
 */
export function defineWatcher(name: string, setup: (scope: WatchScope) => void): Watcher {
  let current: { subscriptions: Subscriptions; alive: boolean } | null = null;

  return {
    start() {
      if (current) return;
      const run = { subscriptions: new Subscriptions(), alive: true };
      current = run;
      const scope: WatchScope = {
        // A subscription that fails is simply absent: the watcher works without it.
        add: (unsubscribe) =>
          run.subscriptions.add(unsubscribe instanceof Promise ? unsubscribe.catch(() => undefined) : unsubscribe),
        every(ms, tick) {
          const id = setInterval(() => {
            if (!run.alive) return;
            try {
              tick();
            } catch (error) {
              console.warn(`[companion] ${name} tick failed`, error);
            }
          }, ms);
          run.subscriptions.add(() => clearInterval(id));
        },
        live: (callback) => (...args) => {
          if (run.alive) callback(...args);
        },
        get active() {
          return run.alive;
        },
      };
      try {
        setup(scope);
      } catch (error) {
        console.warn(`[companion] ${name} failed to start`, error);
      }
    },
    stop() {
      const run = current;
      if (!run) return;
      current = null;
      run.alive = false;
      run.subscriptions.dispose();
    },
    get running() {
      return current !== null;
    },
  };
}
