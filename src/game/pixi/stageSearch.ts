// Finding nodes on the game's Pixi stage by their `.label`.
//
// Labels are plain string literals the game gives its containers
// (`GardenInfoCardSystem`, `RightSideRail`, `ActionHud`...), so they survive
// the game's builds where minified names do not.
import { pageWindow } from "../../platform/pageContext";
import { getReadySpriteState } from "../sprites/context";
import type { SpriteState } from "../sprites/types";

/** How often a missing node is looked for again. A stage walk is not cheap. */
const SEARCH_RETRY_MS = 1000;
const SEARCH_LOG_EVERY = 30;

export function getStage(state: SpriteState): any {
  return state.renderer.lastObjectRendered ?? state.renderer.stage ?? state.app?.stage ?? null;
}

export function findByLabel(root: any, label: string, limit = 25000): any {
  if (!root) return null;
  const stack = [root];
  const seen = new Set<any>();
  let n = 0;
  while (stack.length && n++ < limit) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    if (node.label === label) return node;
    const children = node.children;
    if (Array.isArray(children)) for (const child of children) stack.push(child);
  }
  return null;
}

/**
 * Same walk as findByLabel, but gives each top-level branch of `root` its
 * own search budget instead of pooling one `limit` across the whole tree.
 * The game's world/tile layer alone can hold tens of thousands of sprite
 * nodes: a single shared budget starting there exhausts before ever
 * reaching sibling UI layers, making anything only found there (the card
 * system) unreachable once the world grows large enough. That's a race
 * against world size, not a real "not found".
 */
export function findAcrossBranches(root: any, pred: (node: any) => boolean, limitPerBranch = 25000): any {
  if (!root) return null;
  if (pred(root)) return root;
  const children = root.children;
  if (!Array.isArray(children)) return null;
  for (const child of children) {
    const stack = [child];
    const seen = new Set<any>();
    let n = 0;
    while (stack.length && n++ < limitPerBranch) {
      const node = stack.pop();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      if (pred(node)) return node;
      const kids = node.children;
      if (Array.isArray(kids)) for (const kid of kids) stack.push(kid);
    }
  }
  return null;
}

// `roundRect`/`clear` are public PIXI.Graphics API methods, so unlike
// minified identifiers they survive the game's build unchanged, so they are used to
// borrow the game's own Graphics constructor for our own drawn elements.
//
// Cached at module level once found: it's a stable class reference for the
// whole page session, never per-card state. Callers used to re-derive it on
// every card change, which re-walks the whole stage (including the
// world/tile layer), and with multiple consumers each doing that on every
// tooltip open/close while the player walks around, that was visible lag.
let cachedGraphicsCtor: any = null;
export function findGraphicsCtor(root: any): any {
  if (cachedGraphicsCtor) return cachedGraphicsCtor;
  const found = findAcrossBranches(
    root,
    (node: any) => typeof node?.roundRect === "function" && typeof node?.clear === "function",
  )?.constructor ?? null;
  if (found) cachedGraphicsCtor = found;
  return found;
}

export interface StageNodeWatch {
  /** The node currently found, or null while searching. */
  readonly node: any;
  /** Treats the current node as lost (it fell off the stage without a "destroyed" event) and searches again. */
  reset(): void;
  stop(): void;
}

/**
 * Keeps one labelled node of the stage found. Looks for it right away, then
 * at most once a second until it shows up; once found nothing runs until the
 * game destroys it, and the search starts again (the game rebuilds its whole
 * tree after a WebGL context loss, for one).
 *
 * The retries ride the page's own requestAnimationFrame: timers can be
 * throttled until the node is never found, and the userscript sandbox's
 * frame callbacks are not tied to the page's rendering.
 */
export function watchStageNode(opts: {
  label: string;
  /** Prefix of the log lines, e.g. "[PixiBell]". */
  logTag: string;
  onFound(node: any): void;
  onLost(): void;
  /** Search attempts so far, for debug status. */
  onSearch?(attempts: number): void;
}): StageNodeWatch {
  const raf: (cb: (t: number) => void) => number = (pageWindow as any).requestAnimationFrame.bind(pageWindow);
  const cancelRaf: (id: number) => void = (pageWindow as any).cancelAnimationFrame.bind(pageWindow);

  let running = true;
  let node: any = null;
  let attempts = 0;
  let rafId: number | null = null;
  let lastCheckAt = 0;

  const lose = (lost: any) => {
    if (node !== lost) return;
    node = null;
    opts.onLost();
    search();
  };

  const attach = (found: any) => {
    node = found;
    found.once("destroyed", () => lose(found));
    console.info(`${opts.logTag} attached to ${opts.label} after ${attempts} attempt(s)`);
    opts.onFound(found);
  };

  // No attempt cap: the sprite catalog can take any time to be ready, and
  // searching stops costing anything once found.
  const tryFind = () => {
    if (!running || node) return;
    const state = getReadySpriteState();
    if (!state) return;
    const found = findAcrossBranches(getStage(state), (n: any) => n?.label === opts.label);
    if (found) {
      attach(found);
      return;
    }
    attempts += 1;
    opts.onSearch?.(attempts);
    if (attempts % SEARCH_LOG_EVERY === 0) {
      console.info(`${opts.logTag} still searching for ${opts.label} (${attempts} attempts so far)`);
    }
  };

  const tick = (now: number) => {
    rafId = null;
    if (!running || node) return;
    if (now - lastCheckAt >= SEARCH_RETRY_MS) {
      lastCheckAt = now;
      tryFind();
    }
    if (running && !node) rafId = raf(tick);
  };

  const search = () => {
    tryFind();
    if (running && !node && rafId == null) rafId = raf(tick);
  };
  search();

  return {
    get node() {
      return node;
    },
    reset() {
      if (node) lose(node);
    },
    stop() {
      running = false;
      if (rafId != null) cancelRaf(rafId);
      rafId = null;
    },
  };
}
