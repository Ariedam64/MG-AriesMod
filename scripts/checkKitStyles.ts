// The kit's stylesheet in the Garden Paper look: font, window skin, no dark leftovers.
import { check, done } from "./_check";
import { kitCss } from "../src/ui/kit/styles";

const css = kitCss();
check("the kit text uses the theme font", /font-family:\s*var\(--qmm-font\)/.test(css));
check("the font stack ends on a generic family", /--qmm-font:[^;]*sans-serif;/.test(css));
check("windows use the raised shadow", /\.qws-win\s*\{[^}]*var\(--qmm-shadow-raise\)/.test(css));
check("the window title band is sepia", /\.qws-win \.w-head\s*\{[^}]*var\(--qmm-sepia\)/.test(css));
check("no translucent white surfaces are left", !/rgba\(255,\s*255,\s*255/.test(css));
check("no backdrop blur is left", !/backdrop-filter/.test(css));
check("the dock scrolls when the screen is short", /\.qws-dock\s*\{[^}]*overflow-y:\s*auto/.test(css));
done();
