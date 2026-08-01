// Shared tag chip used by both the list cards and the detail hero.

export function createTagChip(tag: string): HTMLElement {
  const chip = document.createElement("span");
  chip.textContent = tag;
  chip.style.display = "inline-flex";
  chip.style.alignItems = "center";
  chip.style.justifyContent = "center";
  chip.style.padding = "3px 10px";
  chip.style.borderRadius = "6px";
  chip.style.background = "linear-gradient(135deg, #2d8cff11, #00d9ff11)";
  chip.style.border = "1px solid #2d8cff33";
  chip.style.fontSize = "10px";
  chip.style.letterSpacing = "0.03em";
  chip.style.textTransform = "uppercase";
  chip.style.fontWeight = "500";
  chip.style.whiteSpace = "nowrap";
  return chip;
}

export function createTagRow(tags: string[]): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.flexWrap = "wrap";
  row.style.gap = "6px";
  row.style.opacity = "0.85";
  tags.forEach((tag) => row.appendChild(createTagChip(tag)));
  return row;
}
