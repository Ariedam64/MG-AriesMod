export type Listener<T> = (value: T) => void;
export type Unsubscribe = () => void;

/**
 * A set of listeners. A listener that throws is logged and does not stop the
 * others, and one that unsubscribes while being notified is safe.
 */
export class Emitter<T = void> {
  private readonly listeners = new Set<Listener<T>>();

  on(listener: Listener<T>): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(value: T): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(value);
      } catch (error) {
        console.error("[Aries] listener failed", error);
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }

  clear(): void {
    this.listeners.clear();
  }
}

/**
 * Collects unsubscribe functions so a watcher can undo everything it started
 * in one call. Each one may also be a promise of an unsubscriber, which is
 * what the store's `onChange` returns.
 */
export class Subscriptions {
  private readonly pending: Array<Unsubscribe | Promise<Unsubscribe | void> | void> = [];

  add(unsubscribe: Unsubscribe | Promise<Unsubscribe | void> | void): void {
    this.pending.push(unsubscribe);
  }

  dispose(): void {
    for (const entry of this.pending.splice(0)) {
      Promise.resolve(entry)
        .then((off) => off?.())
        .catch(() => {});
    }
  }
}
