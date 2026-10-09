// Settings, Appearance: the saved look is read safely, applied over the kit's
// own variables, and remembered.
import { installFakeDom } from "./_fakeDom";
installFakeDom();
import { check, checkEqual, done } from "./_check";
import { readAppearance, saveAppearance } from "../src/features/settings/appearance";
import { readAriesPath, writeAriesPath } from "../src/platform/storage";
import { color } from "../src/ui/kit/theme";

checkEqual("inline colours follow the theme", color.text, "var(--qmm-text)");
checkEqual("the default look is the Night theme", readAppearance(), { theme: "night", accent: null, scale: 1 });

writeAriesPath("ui.appearance", { theme: "neon", accent: "red", scale: 9 });
checkEqual("unknown or broken values fall back", readAppearance(), { theme: "night", accent: null, scale: 1.3 });

saveAppearance({ theme: "night", accent: "#3366cc", scale: 1.15 });
const css = (document.getElementById("qmm-appearance") as HTMLElement | null)?.textContent ?? "";
check("the chosen theme's colours are applied", css.includes("--qmm-paper:#2b2520"));
check("the accent colour replaces the theme's", /--qmm-sepia-strong:#[0-9a-f]{6};/.test(css) && !css.includes("--qmm-sepia-strong:#8a5a2c"));
check("the menu size is applied", css.includes("--qmm-scale:1.15;"));
check("it outranks the kit's own variables", css.startsWith(":root:root{"));
checkEqual("the choice is saved", readAriesPath("ui.appearance"), { theme: "night", accent: "#3366cc", scale: 1.15 });
done();
