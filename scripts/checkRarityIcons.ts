// Rarities show the game's own rarity icons from the API, named in a tooltip,
// with the name as text only where it is asked for or no icon exists.
import { installFakeDom } from "./_fakeDom";
installFakeDom();
import { check, checkEqual, done } from "./_check";
import { rarityBadge } from "../src/ui/kit/rarityBadge";

const rare = rarityBadge("Rare");
check("a rarity shows an icon", !!rare.querySelector(".qmm-icon-box"));
checkEqual("the icon is named in a tooltip", rare.getAttribute("title"), "Rare");
check("without asking, no text label", !rare.querySelector(".qmm-rarity__label"));

const mythic = rarityBadge("mythic", { label: true });
checkEqual("asked for, the label uses the display name", mythic.querySelector(".qmm-rarity__label")?.textContent, "Mythical");
check("and still shows the icon", !!mythic.querySelector(".qmm-icon-box"));

const unknown = rarityBadge("Shiny");
check("an unknown rarity falls back to its name", !unknown.querySelector(".qmm-icon-box") && unknown.querySelector(".qmm-rarity__label")?.textContent === "Shiny");
done();
