// The dock: one labelled button per menu, open state and badges on the right button.
import { installFakeDom } from "./_fakeDom";
installFakeDom();
import { check, checkEqual, done } from "./_check";
import { createDock } from "../src/ui/kit/dock";
import { onMenuBadge, setMenuBadge } from "../src/ui/kit/menuBadges";

const picked: string[] = [];
const dock = createDock((id) => picked.push(id));
dock.add({ id: "pets", label: "Pets" });
dock.add({ id: "alerts", label: "Alerts" });

const buttons = dock.root.querySelectorAll(".qws-dock-btn") as unknown as HTMLElement[];
checkEqual("one button per menu", buttons.length, 2);
checkEqual("each button is labelled", buttons.map((b) => b.getAttribute("aria-label")), ["Pets", "Alerts"]);

buttons[1].click();
checkEqual("a click selects that menu", picked, ["alerts"]);

dock.setOpen("pets", true);
check("an open menu's button is marked open", buttons[0].classList.contains("open") && !buttons[1].classList.contains("open"));

dock.setBadge("alerts", 3);
checkEqual("the badge shows on its menu", buttons[1].querySelector(".qws-dock-badge")?.textContent, "3");
dock.setBadge("alerts", 0);
checkEqual("a zero badge hides", (buttons[1].querySelector(".qws-dock-badge") as HTMLElement | null)?.hidden, true);

setMenuBadge("alerts", 7);
checkEqual("a feature's badge reaches the dock", buttons[1].querySelector(".qws-dock-badge")?.textContent, "7");

const seen: string[] = [];
const off = onMenuBadge((id, n) => seen.push(`${id}:${n}`));
setMenuBadge("alerts", 5);
off();
setMenuBadge("alerts", 1);
checkEqual("menu badges replay the last count, then follow until unsubscribed", seen, ["alerts:7", "alerts:5"]);

dock.setStatus("bad", "Socket lost");
const dot = dock.root.querySelector(".qws-dock-status") as HTMLElement | null;
checkEqual("the status dot carries its tone", dot?.dataset.tone, "bad");
checkEqual("the status text is its tooltip", dot?.getAttribute("title"), "Socket lost");

dock.setHidden(true);
check("the dock hides", dock.isHidden() && dock.root.classList.contains("hidden"));
done();
