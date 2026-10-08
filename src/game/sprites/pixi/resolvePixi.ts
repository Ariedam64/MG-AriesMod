import { pageWindow } from "../../../platform/pageContext";
import { waitForPixi, type PixiHandles } from "./hooks";
import { getCtors } from "../utils/pixi";
import { sleep } from "../utils/async";

/** Finding the game's Pixi app, renderer and constructors at boot. */

type PixiBundle = { app: any; renderer: any; version: any };

/**
 * The app and renderer, from the raw Pixi globals if the game set them (polled
 * for 5 seconds), else from the init hooks. What happened is kept in
 * `__MG_RESOLVE_PIXI_DEBUG__` for the console.
 */
export async function resolvePixiFast(hooks: PixiHandles): Promise<PixiBundle> {
  const root: any = pageWindow;
  const debugInfo: { startedAt: number; resolvedVia: string | null; resolvedAt: number | null } = {
    startedAt: Date.now(),
    resolvedVia: null,
    resolvedAt: null,
  };
  root.__MG_RESOLVE_PIXI_DEBUG__ = debugInfo;
  const resolved = (via: string, bundle: PixiBundle) => {
    debugInfo.resolvedVia = via;
    debugInfo.resolvedAt = Date.now();
    return bundle;
  };

  const check = (): PixiBundle | null => {
    const app = root.__PIXI_APP__ || root.PIXI_APP || root.app || null;
    const renderer = root.__PIXI_RENDERER__ || root.PIXI_RENDERER__ || root.renderer || app?.renderer || null;
    return app && renderer ? { app, renderer, version: root.__PIXI_VERSION__ || null } : null;
  };

  const hit = check();
  if (hit) return resolved("fast-check-immediate", hit);

  const start = performance.now();
  while (performance.now() - start < 5_000) {
    await sleep(50);
    const retry = check();
    if (retry) return resolved("fast-check-retry", retry);
  }

  const waited = await waitForPixi(hooks);
  return resolved("waitForPixi-fallback", { app: waited.app, renderer: waited.renderer, version: waited.version });
}

/** A rough census of the stage, for the ctors debug log. */
function inspectStage(root: any) {
  const stack = [root];
  const seen = new Set<any>();
  let totalNodes = 0;
  let spriteLikeCount = 0;
  let textLikeCount = 0;
  let n = 0;
  while (stack.length && n++ < 25000) {
    const cur = stack.pop();
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    totalNodes++;
    if (cur?.texture?.frame && cur?.constructor && cur?.texture?.constructor && cur?.texture?.frame?.constructor) spriteLikeCount++;
    if ((typeof cur?.text === "string" || typeof cur?.text === "number") && cur?.style) textLikeCount++;
    const children = cur.children;
    if (Array.isArray(children)) {
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
  }
  const topChildLabels = Array.isArray(root?.children)
    ? root.children.map((c: any) => c?.label || c?.constructor?.name || typeof c)
    : [];
  return { totalNodes, spriteLikeCount, textLikeCount, topChildLabels };
}

/**
 * The Pixi constructors, borrowed from the game's stage. They need at least one
 * rendered frame (lastObjectRendered) when the game uses a bare Renderer
 * without an Application, so this retries for up to 10 seconds, logging each
 * attempt in `__MG_CTORS_DEBUG__`, and throws if the stage never fills.
 */
export async function waitForCtors(app: any, renderer: any): Promise<any> {
  const attempts: any[] = [];
  (pageWindow as any).__MG_CTORS_DEBUG__ = attempts;
  let iteration = 0;
  const snapshot = () => {
    const stage = app?.stage;
    const lor = renderer?.lastObjectRendered;
    const rStage = renderer?.stage;
    const walkRoot = stage || lor || rStage || null;
    attempts.push({
      at: Date.now(),
      hasAppStage: !!stage,
      appStageChildren: Array.isArray(stage?.children) ? stage.children.length : -1,
      hasLastObjectRendered: !!lor,
      lastObjectRenderedChildren: Array.isArray(lor?.children) ? lor.children.length : -1,
      hasRendererStage: !!rStage,
      rendererStageChildren: Array.isArray(rStage?.children) ? rStage.children.length : -1,
      documentHidden: typeof document !== "undefined" ? document.hidden : false,
      visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
      hasFocus: typeof document !== "undefined" ? document.hasFocus() : false,
      // The deep walk is costly: about once a second, not every 100 ms.
      inspect: walkRoot && iteration % 10 === 0 ? inspectStage(walkRoot) : null,
    });
    iteration += 1;
  };

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    snapshot();
    try { return getCtors(app); } catch { /* stage not ready yet */ }
    // Point the synthetic app at the renderer's stage so the next try finds it.
    if (app && !app.stage && renderer?.lastObjectRendered) {
      app.stage = renderer.lastObjectRendered;
    }
    await sleep(100);
  }
  snapshot();
  return getCtors(app);
}
