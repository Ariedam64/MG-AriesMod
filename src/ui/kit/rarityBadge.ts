// A rarity as the game draws it: its icon from the API (`sprite/ui/Rarity*`),
// named in a tooltip, with the name as text only where a caller asks for it.

import { raritySprite } from "../../data";
import { h } from "./dom";
import { iconBox } from "./icons";
import { ensureKitStyles } from "./styles";

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

export function rarityBadge(raw: string, opts: { size?: number; label?: boolean } = {}): HTMLSpanElement {
  ensureKitStyles();
  const name = rarityLabel(raw);
  const el = h("span", "qmm-rarity");
  el.setAttribute("title", name);

  const frame = raritySprite(name);
  if (frame) {
    const icon = iconBox(frame, opts.size ?? 18, "rarity");
    // Until the sprite arrives (or if it never does), the initial stands in.
    icon.appendChild(h("span", "qmm-rarity__fallback", name.charAt(0)));
    el.appendChild(icon);
  }
  if (opts.label || !frame) el.appendChild(h("span", "qmm-rarity__label", name));
  else {
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", name);
  }
  return el;
}
