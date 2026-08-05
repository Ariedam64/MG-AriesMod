// Console probes for the skin system, exposed on `__MG_SKINS_DEBUG__`.
//
// These exist because a skin that applies "successfully" and changes nothing on
// screen is otherwise undiagnosable: the failure can be a missing texture, an
// object that is simply not on screen, a derived texture instance carrying no
// label, or a baked composite. Each probe separates those cases.

import { getSpriteState } from '../sprite/index';
import { collectGameMatches, type LabelMatch } from './applier';
import { findRenderTextureCache, rebakeStats } from './gameCaches';

const frameRectOf = (texture: any) => texture?.frame ?? texture?._frame ?? null;
const sourceOf = (texture: any) =>
  texture?.source ?? texture?._source ?? texture?.baseTexture ?? null;
const rectKey = (x: number, y: number, w: number, h: number) => `${x}|${y}|${w}|${h}`;

/**
 * Describes every node on stage drawing a given frame, by label and by atlas
 * rectangle.
 */
function inspectFrame(
  frameKey: string,
  occupiedRect?: { x: number; y: number; w: number; h: number },
) {
  const state = getSpriteState();
  const stage = collectGameMatches();
  const catalogTexture = state.tex.get(frameKey);
  const atlasSource = sourceOf(catalogTexture);

  const describe = (match: LabelMatch | undefined) =>
    (match?.nodes ?? []).map((node: any) => ({
      ctor: node?.constructor?.name,
      renderPipeId: node?.renderPipeId,
      label: node?.label,
      textureLabel: node?.texture?.label,
      sameAtlasSource: sourceOf(node?.texture) === atlasSource,
      frame: (() => {
        const rect = frameRectOf(node?.texture);
        return rect ? rectKey(rect.x, rect.y, rect.width, rect.height) : null;
      })(),
      visible: node?.visible,
      renderable: node?.renderable,
      worldX: node?.worldTransform?.tx,
      worldY: node?.worldTransform?.ty,
    }));

  const rect = occupiedRect ?? (catalogTexture ? frameRectOf(catalogTexture) : null);
  const key = rect
    ? rectKey(
        (rect as any).x,
        (rect as any).y,
        (rect as any).w ?? (rect as any).width,
        (rect as any).h ?? (rect as any).height,
      )
    : null;

  return {
    frameKey,
    hasCatalogTexture: !!catalogTexture,
    rectKey: key,
    byLabel: describe(stage.byLabel.get(frameKey)),
    byRect: key ? describe(stage.byRect.get(key)) : [],
    totalLabels: stage.byLabel.size,
    totalRects: stage.byRect.size,
  };
}

/**
 * Lists what the stage is actually drawing right now.
 *
 * Answers the question the other probes assume: is the object even on screen,
 * and under which frame key. `unlabelledRects` exposes textures drawn with no
 * label — derived instances a label lookup can never find, and baked composites
 * (recognisable by a rectangle starting at `0|0`).
 */
function findOnStage(substring = '') {
  const state = getSpriteState();
  const stage = collectGameMatches();
  const needle = substring.toLowerCase();

  const labels = [...stage.byLabel.keys()]
    .filter(label => label.toLowerCase().includes(needle))
    .sort();

  const labelledTextures = new Set<unknown>();
  for (const match of stage.byLabel.values()) {
    for (const texture of match.textures) labelledTextures.add(texture);
  }

  const unlabelled: { rect: string; nodes: number; ctor: string | undefined }[] = [];
  for (const [key, match] of stage.byRect) {
    const anonymous = match.textures.filter(texture => !labelledTextures.has(texture));
    if (!anonymous.length) continue;
    unlabelled.push({
      rect: key,
      nodes: match.nodes.length,
      ctor: match.nodes[0]?.constructor?.name,
    });
  }

  return {
    matchingLabels: labels,
    totalLabels: stage.byLabel.size,
    totalRects: stage.byRect.size,
    unlabelledRects: unlabelled.slice(0, 40),
    unlabelledRectCount: unlabelled.length,
    catalogRect: (() => {
      const rect = frameRectOf(state.tex.get(substring));
      return rect ? rectKey(rect.x, rect.y, rect.width, rect.height) : null;
    })(),
  };
}

/** Which of the game's derived-artwork caches the mod can reach. */
function describeGameCaches() {
  return {
    renderTextureCache: !!findRenderTextureCache(),
    stats: rebakeStats(),
  };
}

/** Idempotent: attaches the probes to the page-context debug object. */
export function installSkinsDebug(): void {
  const root: any = (globalThis as any).unsafeWindow || (globalThis as any);
  const target = root.__MG_SKINS_DEBUG__;
  if (!target) return;
  target.inspect = inspectFrame;
  target.find = findOnStage;
  target.caches = describeGameCaches;
}
