// Every text/background pair of every theme reaches its WCAG contrast ratio.
import { check, done } from "./_check";
import { contrastRatio } from "../src/lib/color";
import { contrastPairs, themes } from "../src/ui/kit/theme";

for (const [id, theme] of Object.entries(themes)) {
  const pairs = contrastPairs(theme.swatches);
  check(`${id}: the theme declares its text pairs`, pairs.length >= 10);
  for (const { fg, bg, min, use } of pairs) {
    const r = contrastRatio(fg, bg);
    check(`${id}, ${use}: ${fg} on ${bg} reaches ${min}`, r >= min, r.toFixed(2));
  }
}
done();
