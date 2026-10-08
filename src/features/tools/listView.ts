// List view: the tag filter bar and one clickable card per tool.

import { markdownToPlainText } from "../../lib/markdown";
import { button, type KitButton } from "../../ui/kit/button";
import type { ExternalTool } from "./fetchTools";
import { createIconTile } from "./image";
import { createTagRow } from "./tag";

const ALL_FILTER_LABEL = "All";

function createCard(tool: ExternalTool, onSelect: () => void): HTMLElement {
  // A <div role="button"> rather than a real <button>: the card holds block
  // content (paragraph, tag row), which a <button> is not allowed to contain.
  const card = document.createElement("div");
  card.className = "mgt-card";
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.title = tool.title;
  card.onclick = onSelect;
  card.onkeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect();
  };

  const head = document.createElement("div");
  head.className = "mgt-card__head";

  if (tool.icon) {
    head.appendChild(createIconTile(tool.icon));
  }

  const title = document.createElement("span");
  title.className = "mgt-card__title";
  title.textContent = tool.title;
  head.appendChild(title);

  const arrow = document.createElement("span");
  arrow.className = "mgt-card__arrow";
  arrow.textContent = "→";
  arrow.setAttribute("aria-hidden", "true");
  head.appendChild(arrow);

  card.appendChild(head);

  // CSS clamps this to two lines, so the full text can be handed over as-is.
  const desc = document.createElement("p");
  desc.className = "mgt-card__desc";
  desc.textContent = markdownToPlainText(tool.description);
  card.appendChild(desc);

  if (tool.tags?.length) {
    const foot = createTagRow(tool.tags);
    foot.classList.add("mgt-card__foot");
    card.appendChild(foot);
  }

  return card;
}

export function renderListView(
  tools: ExternalTool[],
  onSelectTool: (tool: ExternalTool) => void
): { root: HTMLElement } {
  const root = document.createElement("div");
  root.className = "mgt-list";

  const allTags = Array.from(new Set(tools.flatMap((tool) => tool.tags ?? [])));
  const selectedTags = new Set<string>();

  const grid = document.createElement("div");
  grid.className = "mgt-grid";

  const renderCards = () => {
    grid.replaceChildren();

    const filtered = selectedTags.size
      ? tools.filter((tool) => tool.tags?.some((tag) => selectedTags.has(tag)))
      : tools;

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "mgt-state";
      empty.style.gridColumn = "1 / -1";
      const text = document.createElement("p");
      text.className = "mgt-state__text";
      text.textContent = "No tools match the selected tags.";
      empty.appendChild(text);
      grid.appendChild(empty);
      return;
    }

    filtered.forEach((tool) => {
      grid.appendChild(createCard(tool, () => onSelectTool(tool)));
    });
  };

  // The filter bar is only worth showing when there is something to filter on.
  if (allTags.length) {
    const filters = document.createElement("div");
    filters.className = "mgt-filters";

    const label = document.createElement("span");
    label.className = "mgt-label";
    label.textContent = "Filter";
    filters.appendChild(label);

    const tagButtons = new Map<string, KitButton>();

    const refreshStates = () => {
      allButton.setActive(selectedTags.size === 0);
      tagButtons.forEach((tagButton, tag) => tagButton.setActive(selectedTags.has(tag)));
    };

    const allButton = button(ALL_FILTER_LABEL, {
      size: "xs",
      onClick: () => {
        if (selectedTags.size === 0) return;
        selectedTags.clear();
        refreshStates();
        renderCards();
      },
    });
    filters.appendChild(allButton);

    for (const tag of allTags) {
      const tagButton = button(tag, {
        size: "xs",
        onClick: () => {
          if (selectedTags.has(tag)) selectedTags.delete(tag);
          else selectedTags.add(tag);
          refreshStates();
          renderCards();
        },
      });
      filters.appendChild(tagButton);
      tagButtons.set(tag, tagButton);
    }

    refreshStates();
    root.appendChild(filters);
  }

  renderCards();
  root.appendChild(grid);

  return { root };
}
