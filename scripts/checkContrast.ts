// Every text/background pair the theme declares reaches its WCAG contrast ratio.
import { check, done } from "./_check";
import { contrastPairs } from "../src/ui/kit/theme";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

check("the theme declares its text pairs", contrastPairs.length >= 10);
for (const { fg, bg, min, use } of contrastPairs) {
  const r = ratio(fg, bg);
  check(`${use}: ${fg} on ${bg} reaches ${min}`, r >= min, r.toFixed(2));
}
done();
