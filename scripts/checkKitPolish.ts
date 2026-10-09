// Kit behaviour the menus rely on: a slider paints its filled part, and a
// menu with a single tab hides its tab bar.
import { installFakeDom } from "./_fakeDom";
installFakeDom();
import { check, checkEqual, done } from "./_check";
import { slider } from "../src/ui/kit/sliders";
import { Menu } from "../src/ui/kit/menu";

const range = slider(0, 200, 1, 50);
checkEqual("a slider paints its starting fill", range.style.getPropertyValue?.("--qmm-range-fill") ?? (range.style as any)["--qmm-range-fill"], "25%");
range.value = "100";
range.dispatchEvent({ type: "input" } as Event);
checkEqual("dragging it repaints the fill", (range.style as any)["--qmm-range-fill"], "50%");

const host = document.createElement("div");
const menu = new Menu({ id: "polish" });
menu.mount(host);
menu.addTab("only", "Only", () => {});
const bar = host.querySelector(".qmm-tabs");
check("a single tab hides the tab bar", !!bar?.classList.contains("is-single"));
menu.addTab("second", "Second", () => {});
check("a second tab shows it again", !bar?.classList.contains("is-single"));
done();
