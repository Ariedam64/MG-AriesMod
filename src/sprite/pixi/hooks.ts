import { waitWithTimeout } from '../utils/async';

export interface PixiHandles {
  app: any | null;
  renderer: any | null;
  pixiVersion: any | null;
  appReady: Promise<any>;
  rendererReady: Promise<any>;
}

/** Build a minimal app-like object from a renderer alone (game may skip Application). */
function mkSyntheticApp(renderer: any): any {
  // Prefer renderer's last rendered object as stage; fall back to null.
  const stage = renderer?.lastObjectRendered ?? renderer?.stage ?? null;
  // Minimal ticker backed by requestAnimationFrame so processJobs can run.
  const listeners = new Set<(delta: number) => void>();
  let rafId = 0;
  let last = 0;
  const tick = (now: number) => {
    const delta = last ? (now - last) / (1000 / 60) : 1;
    last = now;
    for (const fn of listeners) { try { fn(delta); } catch { /* ignore */ } }
    rafId = requestAnimationFrame(tick);
  };
  const ticker = {
    add(fn: (delta: number) => void) { if (!listeners.size) { rafId = requestAnimationFrame(tick); } listeners.add(fn); },
    remove(fn: (delta: number) => void) { listeners.delete(fn); if (!listeners.size) { cancelAnimationFrame(rafId); } },
    deltaMS: 16.67,
  };
  return { renderer, stage, ticker };
}

export function createPixiHooks(): PixiHandles {
  let appResolver: (v: any) => void;
  let rdrResolver: (v: any) => void;
  const appReady = new Promise<any>(resolve => (appResolver = resolve));
  const rendererReady = new Promise<any>(resolve => (rdrResolver = resolve));

  let APP: any = null;
  let RDR: any = null;
  let PIXI_VER: any = null;

  const resolveApp = (a: any) => { if (!APP) { APP = a; appResolver(a); } };
  const resolveRdr = (r: any, v?: any) => {
    if (!RDR) { RDR = r; if (v) PIXI_VER = v; rdrResolver(r); }
    // Game may use Renderer without Application — synthesize a minimal app.
    resolveApp(APP ?? mkSyntheticApp(r));
  };

  const hook = (name: string, cb: (...args: any[]) => void) => {
    const root: any = (globalThis as any).unsafeWindow || globalThis;
    const prev = root[name];
    root[name] = function () {
      try {
        cb.apply(this, arguments as any);
      } finally {
        if (typeof prev === 'function') {
          try {
            prev.apply(this, arguments as any);
          } catch {
            /* ignore */
          }
        }
      }
    };
  };

  hook('__PIXI_APP_INIT__', (a: any, v: any) => {
    if (v) PIXI_VER = v;
    resolveApp(a);
  });
  hook('__PIXI_RENDERER_INIT__', (r: any, v: any) => resolveRdr(r, v));

  // Fallback: if PIXI is already initialized before we hook, try to detect it.
  const tryResolveExisting = () => {
    const root: any = (globalThis as any).unsafeWindow || globalThis;

    // PIXI v8 always populates __PIXI_DEVTOOLS__ when a renderer is created.
    const devtools = root.__PIXI_DEVTOOLS__;
    if (devtools?.renderers?.size > 0) {
      const rdr = [...(devtools.renderers as Set<any>)][0];
      if (rdr) resolveRdr(rdr);
    }

    if (!APP) {
      const maybeApp = root.__PIXI_APP__ || root.PIXI_APP || root.app;
      if (maybeApp?.renderer) resolveApp(maybeApp);
    }
    if (!RDR) {
      const maybeRdr = root.__PIXI_RENDERER__ || root.renderer || APP?.renderer;
      if (maybeRdr) resolveRdr(maybeRdr);
    }
  };
  tryResolveExisting();
  // Poll until both are found.
  let fallbackPolls = 0;
  const fallbackInterval = setInterval(() => {
    if (APP && RDR) {
      clearInterval(fallbackInterval);
      return;
    }
    tryResolveExisting();
    fallbackPolls += 1;
    if (fallbackPolls >= 50) {
      clearInterval(fallbackInterval);
    }
  }, 100);

  return {
    get app() {
      return APP;
    },
    get renderer() {
      return RDR;
    },
    get pixiVersion() {
      return PIXI_VER;
    },
    appReady,
    rendererReady,
  };
}

export async function waitForPixi(handles: PixiHandles, timeoutMs = 15000) {
  const app = await waitWithTimeout(handles.appReady, timeoutMs, 'PIXI app');
  const renderer = await waitWithTimeout(handles.rendererReady, timeoutMs, 'PIXI renderer');
  return { app, renderer, version: handles.pixiVersion };
}
