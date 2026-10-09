// A player's own accent colour, on any theme, still gives readable buttons,
// title bands and selected labels.
import { check, done } from "./_check";
import { contrastRatio } from "../src/lib/color";
import { deriveAccent } from "../src/ui/kit/accent";
import { contrastPairs, themes } from "../src/ui/kit/theme";

const SAMPLES = ["#ff0000", "#00ff00", "#ffff00", "#0000ff", "#00ffff", "#ff00ff", "#808080", "#ffffff", "#000000", "#8f6236"];

for (const [id, theme] of Object.entries(themes)) {
  for (const sample of SAMPLES) {
    const swatches = { ...theme.swatches, ...deriveAccent(sample, theme.swatches) };
    const failing = contrastPairs(swatches).filter(({ fg, bg, min }) => contrastRatio(fg, bg) < min);
    check(`${id} with ${sample} stays readable`, failing.length === 0, failing.map((p) => p.use).join(", "));
  }
  check(`${id}: a colour that is not one is ignored`, Object.keys(deriveAccent("red", theme.swatches)).length === 0);
}
done();
