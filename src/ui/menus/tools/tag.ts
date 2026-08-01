// Shared tag chip used by both the list cards and the detail hero.
// Styling lives in styles.ts (`.mgt-tag` / `.mgt-tags`).

export function createTagChip(tag: string): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "mgt-tag";
  chip.textContent = tag;
  return chip;
}

export function createTagRow(tags: string[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "mgt-tags";
  tags.forEach((tag) => row.appendChild(createTagChip(tag)));
  return row;
}
