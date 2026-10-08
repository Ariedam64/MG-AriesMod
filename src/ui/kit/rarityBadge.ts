import { h } from "./dom";

/** The game's rarity colours. Celestial has none: it gets an animated gradient. */
const RARITY_COLORS: Record<string, string> = {
  Common: "#E7E7E7",
  Uncommon: "#67BD4D",
  Rare: "#0071C6",
  Legendary: "#FFC734",
  Mythical: "#9944A7",
  Divine: "#FF7835",
};

/** Rarities light enough to need dark text on top. */
const DARK_TEXT = new Set(["Common", "Uncommon", "Legendary", "Divine"]);

const CELESTIAL_KEYFRAMES_ID = "qws-celestial-kf";

/** The display name of a rarity, whichever spelling the catalog used. */
function rarityLabel(raw: string): string {
  const rarity = String(raw || "").trim();
  switch (rarity.toLowerCase()) {
    // The live API says "Mythic" where the bundled catalog says "Mythical".
    case "mythic":
    case "mythical":
      return "Mythical";
    case "celestial":
      return "Celestial";
    case "divine":
      return "Divine";
    case "legendary":
      return "Legendary";
    case "rare":
      return "Rare";
    case "uncommon":
      return "Uncommon";
    case "common":
      return "Common";
    default:
      return rarity || "-";
  }
}

function ensureCelestialKeyframes(): void {
  if (document.getElementById(CELESTIAL_KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = CELESTIAL_KEYFRAMES_ID;
  style.textContent = `
@keyframes qwsCelestialShift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}`;
  document.head.appendChild(style);
}

/** A rarity chip in the game's colours. */
export function rarityBadge(raw: string): HTMLDivElement {
  const label = rarityLabel(raw);
  const el = h("div", undefined, label);
  Object.assign(el.style, {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: "5px",
    fontSize: "12px",
    fontWeight: "700",
    margin: "2px auto",
    color: DARK_TEXT.has(label) ? "#0b0b0b" : "#ffffff",
    boxShadow: "0 0 0 1px #0006 inset",
    lineHeight: "1.1",
    whiteSpace: "nowrap",
  } as Partial<CSSStyleDeclaration>);

  if (label === "Celestial") {
    ensureCelestialKeyframes();
    el.style.background = `linear-gradient(130deg,
      rgb(0,180,216) 0%,
      rgb(124,42,232) 40%,
      rgb(160,0,126) 60%,
      rgb(255,215,0) 100%)`;
    el.style.backgroundSize = "200% 200%";
    el.style.animation = "qwsCelestialShift 4s linear infinite";
  } else {
    el.style.background = RARITY_COLORS[label] || "#444";
  }
  return el;
}
