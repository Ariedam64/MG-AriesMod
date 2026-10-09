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
const head = dock?.querySelector(".qws-dock-head");
check("the panel is headed with the mod's name", !!head?.querySelector(".qws-dock-title") && head.querySelector(".qws-dock-title").textContent === "Arie's Mod");
check("the header shows the mod version", !!head?.querySelector(".qmm-pill"));
check("the menu buttons sit in the grid", !!dock?.querySelector(".qws-dock-grid")?.querySelector('.qws-dock-btn[data-id="pets"]'));

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

const fold = dock?.querySelector(".qws-dock-fold");
check("the hide hint sits on the fold button, not on every menu button", !dock?.getAttribute("title") && !!fold?.getAttribute("title"));
fold?.click();
check("the fold button folds the dock without a keyboard", !!dock?.classList.contains("folded"));
checkEqual("folding is remembered", readAriesPath("hud.dockFolded"), true);
fold?.click();
check("a second click unfolds it", !dock?.classList.contains("folded"));
checkEqual("unfolding is remembered", readAriesPath("hud.dockFolded"), false);

const grip = head;
const pointer = (type: string, x: number, y: number) => event(type, { pointerId: 1, button: 0, clientX: x, clientY: y });
grip?.dispatchEvent(pointer("pointerdown", 20, 300));
(document as unknown as { dispatchEvent(e: Event): void }).dispatchEvent(pointer("pointermove", 320, 500));
(document as unknown as { dispatchEvent(e: Event): void }).dispatchEvent(pointer("pointerup", 320, 500));
check("dragging the header moves the panel", dock?.style.left === "300px" && dock?.style.top === "200px" && !!dock?.classList.contains("placed"));
checkEqual("the dock's place is remembered", readAriesPath("hud.dockPos"), { left: 300, top: 200 });

window.dispatchEvent(event("keydown", { code: "Insert", key: "Insert" }));
window.dispatchEvent(event("keyup", { code: "Insert", key: "Insert" }));
check("a tap on Insert hides the dock", !!dock?.classList.contains("hidden"));
checkEqual("hiding is remembered", readAriesPath("hud.hidden"), true);
done();
