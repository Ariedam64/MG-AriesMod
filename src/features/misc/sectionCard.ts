// The Misc menu's cards fold, and remember it: the menu reopens the way it
// was left.

import { getAriesStorage, updateAriesStorage } from "../../platform/storage";
import { collapsibleCard } from "../../ui/kit/layout";

export function isSectionCollapsed(sectionId: string): boolean {
  return getAriesStorage().misc?.collapsed?.[sectionId] === true;
}

export function setSectionCollapsed(sectionId: string, collapsed: boolean): void {
  updateAriesStorage(current => {
    const misc = (current.misc ??= {});
    const map = (misc.collapsed ??= {});
    if (collapsed) map[sectionId] = true;
    else delete map[sectionId];
  });
}

/** A section card wired to its saved fold state. */
export function sectionCard(id: string, title: string, description?: string) {
  return collapsibleCard({
    title,
    description,
    collapsed: isSectionCollapsed(id),
    onToggle: collapsed => setSectionCollapsed(id, collapsed),
  });
}
