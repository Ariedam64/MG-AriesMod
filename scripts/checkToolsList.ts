// The Tools list: one card per tool, the tag chips filter it, and the count
// next to the title follows the filter.
import { check, checkEqual, done } from "./_check";
import { installFakeDom } from "./_fakeDom";
import { renderListView } from "../src/features/tools/listView";
import type { ExternalTool } from "../src/features/tools/fetchTools";

installFakeDom();

const tools: ExternalTool[] = [
  { id: "a", title: "Planner", description: "Plans **gardens**.", tags: ["Garden"] },
  { id: "b", title: "Tracker", description: "Tracks shops.", tags: ["Shop", "Garden"] },
  { id: "c", title: "Wiki", description: "Reads the wiki." },
];

let picked: string | null = null;
const { root } = renderListView(tools, (tool) => (picked = tool.id));

// The fake DOM matches single selectors only, so lookups go one level at a time.
const all = (from: Element, selector: string) => Array.from(from.querySelectorAll<HTMLElement>(selector));
const cards = () => all(root, ".mgt-card");
const titles = () => cards().map((card) => card.querySelector(".mgt-card__title")?.textContent);
const count = () => root.querySelector(".qmm-pill")?.textContent;
const chips = () => all(root.querySelector(".mgt-filters")!, ".qmm-btn");
const chip = (label: string) => chips().find((btn) => btn.textContent === label)!;

checkEqual("every tool gets a card", titles(), ["Planner", "Tracker", "Wiki"]);
checkEqual("the count says how many are shown", count(), "3 tools");
checkEqual("one chip per tag, after All", chips().map((btn) => btn.textContent), ["All", "Garden", "Shop"]);
check("All starts active", chip("All").classList.contains("active"));
checkEqual("the description is plain text on the card", cards()[0].querySelector(".mgt-card__desc")?.textContent, "Plans gardens.");

chip("Shop").click();
checkEqual("a tag keeps only the tools carrying it", titles(), ["Tracker"]);
checkEqual("and the count follows", count(), "1 tool");
check("the tag chip is active and All is not", chip("Shop").classList.contains("active") && !chip("All").classList.contains("active"));

chip("Garden").click();
checkEqual("two tags show tools with either", titles(), ["Planner", "Tracker"]);

chip("All").click();
checkEqual("All clears the filter", titles(), ["Planner", "Tracker", "Wiki"]);
check("and is active again", chip("All").classList.contains("active") && !chip("Shop").classList.contains("active"));

cards()[2].click();
checkEqual("clicking a card opens that tool", picked, "c");

const untagged = renderListView([tools[2]], () => {}).root;
checkEqual("no tags, no filter chips", untagged.querySelector(".mgt-filters"), null);

done();
