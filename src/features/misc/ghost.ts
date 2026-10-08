import { PlayerService } from "../../game/player";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { readStoredFlag, writeStoredFlag } from "./storedFlag";

/**
 * Ghost mode: the mod takes over the movement keys and walks the player one
 * tile at a time through `PlayerService.move`, which the server accepts
 * whatever stands in the way. The game never sees those keys, so its own
 * collision checks never run.
 */

const PATH_GHOST_MODE = "misc.ghostMode";
const PATH_GHOST_DELAY = "misc.ghostDelayMs";
const DEFAULT_DELAY_MS = 50;
const MIN_DELAY_MS = 5;

export const readGhostEnabled = (): boolean => readStoredFlag(PATH_GHOST_MODE);
export const writeGhostEnabled = (on: boolean): void => writeStoredFlag(PATH_GHOST_MODE, on);

const normalizeDelay = (value: unknown): number => {
  const n = Math.floor(Number(value || DEFAULT_DELAY_MS));
  return Number.isFinite(n) ? Math.max(MIN_DELAY_MS, n) : DEFAULT_DELAY_MS;
};

/** Milliseconds between two steps. */
export function readGhostDelayMs(): number {
  try {
    return normalizeDelay(readAriesPath<unknown>(PATH_GHOST_DELAY));
  } catch {
    return DEFAULT_DELAY_MS;
  }
}

function writeGhostDelayMs(ms: number): void {
  try {
    writeAriesPath(PATH_GHOST_DELAY, normalizeDelay(ms));
  } catch {}
}

export type GhostController = {
  start(): void;
  stop(): void;
  setSpeed(ms: number): void;
};

/** Movement keys, by `KeyboardEvent.key` lowercased: ZQSD, WASD and the arrows. */
const UP = ["z", "w", "arrowup"];
const DOWN = ["s", "arrowdown"];
const LEFT = ["q", "a", "arrowleft"];
const RIGHT = ["d", "arrowright"];
const MOVE_KEYS = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT]);

export function createGhostController(): GhostController {
  let delayMs = readGhostDelayMs();
  const held = new Set<string>();

  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!MOVE_KEYS.has(key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    held.add(key);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!MOVE_KEYS.has(key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    held.delete(key);
  };
  const onBlur = () => held.clear();
  const onVisibility = () => {
    if (document.hidden) held.clear();
  };

  const anyHeld = (keys: string[]) => keys.some((key) => held.has(key));

  function direction(): { dx: number; dy: number } {
    const dx = (anyHeld(RIGHT) ? 1 : 0) - (anyHeld(LEFT) ? 1 : 0);
    const dy = (anyHeld(DOWN) ? 1 : 0) - (anyHeld(UP) ? 1 : 0);
    return { dx, dy };
  }

  async function step(dx: number, dy: number) {
    let current: { x: number; y: number } | undefined;
    try {
      current = await PlayerService.getPosition();
    } catch {}
    const x = Math.round(current?.x ?? 0);
    const y = Math.round(current?.y ?? 0);
    try {
      await PlayerService.move(x + dx, y + dy);
    } catch {}
  }

  // Time accumulates frame by frame and one step is spent per `delayMs`. The
  // budget is capped so a long pause does not turn into a burst of steps.
  let rafId: number | null = null;
  let lastTs = 0;
  let budgetMs = 0;
  let stepping = false;

  function frame(ts: number) {
    if (!lastTs) lastTs = ts;
    budgetMs += ts - lastTs;
    lastTs = ts;

    const { dx, dy } = direction();
    if ((dx !== 0 || dy !== 0) && budgetMs >= delayMs && !stepping) {
      budgetMs -= delayMs;
      stepping = true;
      void step(dx, dy).finally(() => {
        stepping = false;
      });
    }
    budgetMs = Math.min(budgetMs, delayMs * 4);
    rafId = requestAnimationFrame(frame);
  }

  const CAPTURE: AddEventListenerOptions = { capture: true };

  return {
    start() {
      if (rafId !== null) return;
      lastTs = 0;
      budgetMs = 0;
      stepping = false;
      window.addEventListener("keydown", onKeyDown, CAPTURE);
      window.addEventListener("keyup", onKeyUp, CAPTURE);
      window.addEventListener("blur", onBlur);
      document.addEventListener("visibilitychange", onVisibility);
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      held.clear();
      window.removeEventListener("keydown", onKeyDown, CAPTURE);
      window.removeEventListener("keyup", onKeyUp, CAPTURE);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    },
    setSpeed(ms: number) {
      delayMs = normalizeDelay(ms);
      writeGhostDelayMs(delayMs);
    },
  };
}
