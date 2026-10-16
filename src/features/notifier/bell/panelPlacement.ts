import { clampToViewport, type ScreenPosition } from "../../../ui/kit/floating";
import type { ScreenRect } from "./ring";

/** Space between the bell and its panel, and between the panel and the window edges. */
const PANEL_GAP = 8;

/**
 * Where the buy panel opens: beside the bell, on the side with room (the
 * rail's bell sits on the right edge, a floating bell can be anywhere),
 * top-aligned with it and kept inside the window.
 */
export function panelPositionBeside(
  bell: ScreenRect,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
): ScreenPosition {
  const onRightHalf = bell.left + bell.width / 2 > viewport.width / 2;
  const left = onRightHalf ? bell.left - PANEL_GAP - panel.width : bell.right + PANEL_GAP;
  return clampToViewport({ left, top: bell.top }, panel, PANEL_GAP, viewport);
}
