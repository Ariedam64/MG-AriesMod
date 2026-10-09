// The HUD mounts the dock: menus open from it, open-panel events mark it, and
// hiding with Insert is remembered.
import { installFakeDom } from "./_fakeDom";
installFakeDom();
import { check, checkEqual, done } from "./_check";
import { mountHUD } from "../src/ui/hud";
import { readAriesPath } from "../src/platform/storage";

const rendered: string[] = [];
mountHUD({
  onRegister(register) {
    register("pets", "Pets", (el) => {
      rendered.push("pets");
      el.textContent = "pets body";
    });
    register("alerts", "Alerts", () => rendered.push("alerts"));
  },
});

const doc = document as unknown as { querySelector(sel: string): any };
const dock = doc.querySelector(".qws-dock");
check("the dock is mounted", !!dock);
check("the old launcher box is gone", !doc.querySelector(".qws2"));

const pets = dock?.querySelector('.qws-dock-btn[data-id="pets"]');
pets?.click();
checkEqual("clicking a dock button opens its window", rendered, ["pets"]);
check("its button shows as open", !!pets?.classList.contains("open"));
pets?.click();
check("clicking it again closes the window", !pets?.classList.contains("open"));

const event = (type: string, extra: Record<string, unknown> = {}) =>
  ({ type, preventDefault() {}, stopPropagation() {}, ...extra }) as unknown as Event;

window.dispatchEvent(event("qws:open-panel", { detail: { id: "alerts" } }));
check(
  "an open-panel event marks the menu's dock button",
  !!dock?.querySelector('.qws-dock-btn[data-id="alerts"]')?.classList.contains("open"),
);

window.dispatchEvent(event("keydown", { code: "Insert", key: "Insert" }));
window.dispatchEvent(event("keyup", { code: "Insert", key: "Insert" }));
check("a tap on Insert hides the dock", !!dock?.classList.contains("hidden"));
checkEqual("hiding is remembered", readAriesPath("hud.hidden"), true);
done();
