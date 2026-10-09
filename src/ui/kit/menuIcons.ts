// The dock's icons: stroke drawings on a 24 px grid, one per menu id.

const SVG_NS = "http://www.w3.org/2000/svg";

const PATHS: Record<string, string> = {
  pets: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 2-4 2s-4 0-4-2z"/>',
  locker: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  alerts: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  calculator: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>',
  room: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  editor: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  skins: '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="10" r="1"/><circle cx="14" cy="9" r="1"/><circle cx="15" cy="13" r="1"/><path d="M12 20a3 3 0 0 1 0-5"/>',
  misc: '<path d="M5 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H5z"/>',
  keybinds: '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 11h.01M11 11h.01M15 11h.01M7 14h10"/>',
  tools: '<path d="M14.5 6.5a4 4 0 0 0 4.6 4.6L11 19.2 8.8 17l-1.8-1.8z"/><path d="M14.5 6.5L17 4l3 3-2.5 2.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  companion: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M10 16h4"/>',
  "debug-data": '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M4 12h4M16 12h4M5 7l3 2M19 7l-3 2M5 18l3-2M19 18l-3-2M10 4l1 2M14 4l-1 2"/>',
};

/** A leaf, for a menu with no icon of its own. */
const FALLBACK = '<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z"/><path d="M5 19l8-8"/>';

export function menuIcon(id: string): Element {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  // Static markup the mod owns, never data from the game or a player.
  svg.innerHTML = PATHS[id] ?? FALLBACK;
  return svg;
}
