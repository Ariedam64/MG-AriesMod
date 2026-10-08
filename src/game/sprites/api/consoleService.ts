import { pageWindow } from "../../../platform/pageContext";
import * as spriteApi from "./spriteApi";
import type { SpriteContext } from "../types";

/**
 * Sprite helpers published on the page window for console use
 * (`MG_SPRITE_HELPERS`, `getSpriteWithMutations`, `renderSpriteToCanvas`, ...).
 * Nothing in the mod calls them; they exist for debugging and for scripts run
 * from the devtools.
 */

const OVERLAY_ID = "mg-sprite-overlay";

function ensureOverlayHost() {
  let host = document.getElementById(OVERLAY_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = OVERLAY_ID;
    host.style.cssText =
      "position:fixed;top:8px;left:8px;z-index:2147480000;display:flex;flex-wrap:wrap;gap:8px;pointer-events:auto;background:transparent;align-items:flex-start;";
    document.body.appendChild(host);
  }
  return host;
}

function getSpriteDim(tex: any, key: "width" | "height"): number | null {
  for (const src of [tex?.orig, tex?._orig, tex?.frame, tex?._frame, tex]) {
    const value = src?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/** Pads an extracted canvas back to the sprite's untrimmed size, at its trim offset. */
function padCanvasToSpriteBounds(source: HTMLCanvasElement, tex: any): HTMLCanvasElement {
  const rawW = source.width || 1;
  const rawH = source.height || 1;
  const baseW = Math.max(rawW, Math.round(getSpriteDim(tex, "width") ?? rawW) || rawW);
  const baseH = Math.max(rawH, Math.round(getSpriteDim(tex, "height") ?? rawH) || rawH);

  const trim = tex?.trim ?? tex?._trim ?? null;
  let offsetX = trim && typeof trim.x === "number" ? Math.round(trim.x) : Math.round((baseW - rawW) / 2);
  let offsetY = trim && typeof trim.y === "number" ? Math.round(trim.y) : Math.round((baseH - rawH) / 2);
  offsetX = Math.max(0, Math.min(baseW - rawW, offsetX));
  offsetY = Math.max(0, Math.min(baseH - rawH, offsetY));

  if (baseW === rawW && baseH === rawH && offsetX === 0 && offsetY === 0) return source;

  const canvas = document.createElement("canvas");
  canvas.width = baseW;
  canvas.height = baseH;
  const ctx2 = canvas.getContext("2d");
  if (!ctx2) return source;
  ctx2.imageSmoothingEnabled = false;
  ctx2.clearRect(0, 0, baseW, baseH);
  ctx2.drawImage(source, offsetX, offsetY);
  return canvas;
}

/** Builds the helpers and publishes them, with the catalog state and config, on the page window. */
export function exposeSpriteService(ctx: SpriteContext): void {
  const renderTextureToCanvas = (tex: any) => {
    try {
      const spr = new ctx.state.ctors.Sprite(tex);
      const extracted = ctx.state.renderer.extract.canvas(spr, { resolution: 1 });
      spr.destroy?.({ children: true, texture: false, baseTexture: false });
      return padCanvasToSpriteBounds(extracted, tex);
    } catch {
      return null;
    }
  };

  const service = {
    ready: Promise.resolve(),
    state: ctx.state,
    cfg: ctx.cfg,
    list(category: any = "any") {
      return spriteApi.listItemsByCategory(ctx.state, category);
    },
    getBaseSprite(params: any) {
      return spriteApi.getBaseSprite(params, ctx.state);
    },
    getSpriteWithMutations(params: any) {
      return spriteApi.getSpriteWithMutations(params, ctx.state, ctx.cfg);
    },
    buildVariant(mutations: any[]) {
      return spriteApi.buildVariant(mutations as any);
    },
    renderToCanvas(arg: any) {
      const tex = arg?.isTexture || arg?.frame ? arg : service.getSpriteWithMutations(arg);
      if (!tex) return null;
      return renderTextureToCanvas(tex);
    },
    async renderToDataURL(arg: any, type: string = "image/png", quality?: number) {
      const c = service.renderToCanvas(arg);
      if (!c) return null;
      return c.toDataURL(type, quality);
    },
    /** Renders into a fixed overlay, each sprite in its own wrapper. */
    renderOnCanvas(arg: any, opts: { maxWidth?: number; maxHeight?: number; allowScaleUp?: boolean } = {}) {
      const c = service.renderToCanvas(arg);
      if (!c) return null;
      c.style.background = "transparent";
      c.style.display = "block";
      // Mutated size, scaled down toward the base sprite's footprint, then into the optional max box.
      const mutW = c.width || c.clientWidth;
      const mutH = c.height || c.clientHeight;
      let baseW = mutW;
      let baseH = mutH;
      if (arg && !arg.isTexture && !arg.frame) {
        const baseTex: any = service.getBaseSprite(arg);
        if (baseTex) {
          baseW = baseTex?.orig?.width ?? baseTex?._orig?.width ?? baseTex?.frame?.width ?? baseTex?._frame?.width ?? baseTex?.width ?? baseW;
          baseH = baseTex?.orig?.height ?? baseTex?._orig?.height ?? baseTex?.frame?.height ?? baseTex?._frame?.height ?? baseTex?.height ?? baseH;
        }
      }
      const scaleToBase = Math.min(baseW / mutW, baseH / mutH, 1);
      let logicalW = mutW * scaleToBase;
      let logicalH = mutH * scaleToBase;
      const { maxWidth, maxHeight, allowScaleUp } = opts;
      if (maxWidth || maxHeight) {
        const scaleW = maxWidth ? maxWidth / logicalW : 1;
        const scaleH = maxHeight ? maxHeight / logicalH : 1;
        let scale = Math.min(scaleW || 1, scaleH || 1);
        if (!allowScaleUp) scale = Math.min(scale, 1);
        logicalW = Math.floor(logicalW * scale);
        logicalH = Math.floor(logicalH * scale);
      }
      if (logicalW) c.style.width = `${logicalW}px`;
      if (logicalH) c.style.height = `${logicalH}px`;
      const wrap = document.createElement("div");
      wrap.style.cssText =
        "display:inline-flex;align-items:flex-start;justify-content:flex-start;padding:0;margin:0;background:transparent;border:none;flex:0 0 auto;";
      wrap.appendChild(c);
      ensureOverlayHost().appendChild(wrap);
      return { wrap, canvas: c };
    },
    clearOverlay() {
      document.getElementById(OVERLAY_ID)?.remove();
    },
    renderAnimToCanvases(params: any) {
      const item = ctx.state.items.find((it) => it.key === `sprite/${params.category}/${params.id}` || it.key === params.id);
      if (!item) return [];
      if (item.isAnim && item.frames?.length) {
        const texes = params?.mutations?.length ? [service.getSpriteWithMutations(params)] : item.frames;
        return texes.map((t) => renderTextureToCanvas(t)).filter(Boolean) as HTMLCanvasElement[];
      }
      const t = service.getSpriteWithMutations(params);
      return t ? [renderTextureToCanvas(t) as HTMLCanvasElement] : [];
    },
  };

  const uw: any = pageWindow;
  uw.__MG_SPRITE_STATE__ = ctx.state;
  uw.__MG_SPRITE_CFG__ = ctx.cfg;
  uw.__MG_SPRITE_API__ = spriteApi;
  uw.__MG_SPRITE_SERVICE__ = service;
  uw.getSpriteWithMutations = service.getSpriteWithMutations;
  uw.getBaseSprite = service.getBaseSprite;
  uw.buildSpriteVariant = service.buildVariant;
  uw.listSpritesByCategory = service.list;
  uw.renderSpriteToCanvas = service.renderToCanvas;
  uw.renderSpriteToDataURL = service.renderToDataURL;
  uw.MG_SPRITE_HELPERS = service;
}
