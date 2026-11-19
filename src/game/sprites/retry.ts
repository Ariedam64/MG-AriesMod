/**
 * Bounded retries for the sprite catalog boot. Kept free of Pixi and of the
 * catalog module, which installs its hooks on import, so it can be checked on
 * its own.
 */

const FIRST_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;

/** Delay before the attempt that follows failure number `attempt` (0-based): doubles from 2 s, capped at 60 s. */
export function retryDelayMs(attempt: number): number {
  return Math.min(FIRST_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}

export interface BackoffOptions {
  /** Failures allowed before giving up for the session. */
  maxAttempts?: number;
  /** An error no retry can fix: stop right away. */
  isFatal?: (error: unknown) => boolean;
  sleep: (ms: number) => Promise<unknown>;
  /** Called after every failure, before any wait. */
  onError?: (error: unknown) => void;
}

/**
 * Runs `task` until it succeeds, waiting longer after each failure. Gives up,
 * with a single warning, after `maxAttempts` failures or on a fatal error.
 * Never rejects.
 */
export async function runWithBackoff(task: () => Promise<unknown>, options: BackoffOptions): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 6;
  for (let attempt = 0; ; attempt++) {
    try {
      await task();
      return;
    } catch (error) {
      options.onError?.(error);
      if (options.isFatal?.(error)) {
        console.warn('[MG SpriteCatalog] giving up, this error will not go away by retrying', error);
        return;
      }
      if (attempt + 1 >= maxAttempts) {
        console.warn(`[MG SpriteCatalog] giving up after ${maxAttempts} failed attempts`, error);
        return;
      }
      const delay = retryDelayMs(attempt);
      console.error(`[MG SpriteCatalog] failed, retrying in ${delay} ms`, error);
      await options.sleep(delay);
    }
  }
}
