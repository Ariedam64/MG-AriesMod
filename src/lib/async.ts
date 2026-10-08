export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface WaitUntilOptions {
  /** Give up after this long and resolve with null. 0 waits forever. */
  timeoutMs?: number;
  intervalMs?: number;
}

/**
 * Polls `probe` until it returns something truthy and resolves with it, or
 * with null once `timeoutMs` has passed. A probe that throws counts as a miss.
 */
export async function waitUntil<T>(
  probe: () => T | null | undefined | false | Promise<T | null | undefined | false>,
  { timeoutMs = 10_000, intervalMs = 100 }: WaitUntilOptions = {},
): Promise<T | null> {
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Infinity;
  for (;;) {
    try {
      const value = await probe();
      if (value) return value;
    } catch {
      // Not ready yet.
    }
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

/** Runs `fn` once calls have stopped for `ms`, with the arguments of the last call. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: A) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  }) as Debounced<A>;
  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return debounced;
}
