// No literal colour in mod UI code outside the theme, data tables and Pixi drawing.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { check, done } from "./_check";

// Files whose colours are data, the theme itself, or drawn on the game's canvas.
const ALLOWED = new Set([
  "src/ui/kit/theme.ts",
  "src/data/live/abilityColors.ts",
  "src/features/pets/abilityChipColors.ts",
  "src/ui/kit/rarityBadge.ts",
  "src/ui/kit/sprites/mutationTint.ts",
  "src/features/cropPrice/badge.ts",
  "src/features/locker/indicator.ts",
  "src/features/sellAllPets/pixiButton.ts",
  "src/features/activityLog/filterToolbar.ts",
  "src/features/notifier/bell/pixiBell.ts",
  "src/game/pixi/tileFlash.ts",
  // Each mutation's own colour, as the game shows it.
  "src/features/editor/ui/mutationPicker.ts",
  // Written into the game's own inventory and bell, so they take its Chakra
  // colours (with the game's values as fallbacks), not the mod's.
  "src/features/inventory/strengthBadge.ts",
  "src/features/inventory/valueDisplay.ts",
  "src/features/notifier/overlay.ts",
]);
const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g;
const DARK_TRICKS = /mix-blend-mode:\s*screen/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });
}

for (const file of walk("src")) {
  const rel = file.replace(/\\/g, "/");
  if (ALLOWED.has(rel)) continue;
  const hits = readFileSync(file, "utf8").match(COLOR) ?? [];
  check(`${rel} uses theme colours only`, hits.length === 0, `${hits.length} literal(s): ${hits.slice(0, 5).join(" ")}`);
  // Screen blending lightens artwork against a dark panel; on paper it turns it white.
  const tricks = readFileSync(file, "utf8").match(DARK_TRICKS) ?? [];
  check(`${rel} has no dark-theme blend tricks`, tricks.length === 0, tricks.join(" "));
}
done();
