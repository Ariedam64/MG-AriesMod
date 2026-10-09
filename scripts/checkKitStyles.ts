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
check("the menu grid scrolls when the screen is short", /\.qws-dock-grid\s*\{[^}]*overflow-y:\s*auto/.test(css));
check("windows and the launcher follow the menu size", /\.qws-win\s*\{[^}]*scale:\s*var\(--qmm-scale/.test(css) && /\.qws-dock\s*\{[^}]*scale:\s*var\(--qmm-scale/.test(css));
check("the menu grid holds three icons per row", /\.qws-dock-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/.test(css));
check("cards never grow past their cell", /\.qmm-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/.test(css) && /\.qmm-card__body\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/.test(css));
check("card actions sit beside the title, the subtitle below", /\.qmm-card__subtitle\s*\{[^}]*order:\s*2/.test(css) && /\.qmm-card__actions\s*\{[^}]*order:\s*1/.test(css));
check("the window's field width only applies to bare inputs", css.includes('.qws-win input[type="text"]:not([class])') && !/\.qws-win input\[type="text"\],/.test(css));
check("setting rows wrap in a narrow window", /\.qmm-setting-row\s*\{[^}]*flex-wrap:\s*wrap/.test(css));
check("sliders paint their filled part in Chrome", /-webkit-slider-runnable-track[^}]*--qmm-range-fill/.test(css));
check("a full-width segmented control shares its width", /\.qmm-seg--full \.qmm-seg__btn\s*\{[^}]*flex:\s*1/.test(css));
check("a single tab hides the tab bar", /\.qmm-tabs\.is-single\s*\{[^}]*display:\s*none/.test(css));
done();
