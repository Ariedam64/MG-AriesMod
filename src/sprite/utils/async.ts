// Timers must be bound to the real page window, not Tampermonkey's isolated
// sandbox global — the sandbox realm isn't tied to the page's own rendering
// and its setTimeout/setInterval/requestAnimationFrame can be throttled far
// more aggressively (observed: retry loops silently getting almost no real
// attempts without DevTools open, even though a 10s wall-clock deadline
// looked like it should allow plenty).
const pageWin: any = (globalThis as any).unsafeWindow || globalThis;

export const sleep = (ms: number) => new Promise(resolve => pageWin.setTimeout(resolve, ms));
export const raf = (fn: FrameRequestCallback) => pageWin.requestAnimationFrame(fn);
export const nextFrame = () => new Promise<void>(resolve => pageWin.requestAnimationFrame(() => resolve()));

export async function waitWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    // Poll promise completion without blocking long frames
    const result = await Promise.race([p, sleep(50).then(() => null as unknown as T)]);
    if (result !== null) return result;
  }
  throw new Error(`${label} timeout`);
}
