// List view: a short header, the tag filter chips and one clickable card per tool.

import { markdownToPlainText } from "../../lib/markdown";
import { pill } from "../../ui/kit/badges";
import { button, type KitButton } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import type { ExternalTool } from "./fetchTools";
import { createIconTile } from "./image";
import { createTagRow } from "./tag";

const ALL_FILTER_LABEL = "All";

const countLabel = (count: number) => (count === 1 ? "1 tool" : `${count} tools`);

function createCard(tool: ExternalTool, onSelect: () => void): HTMLElement {
  // A <div role="button"> rather than a real <button>: the card holds block
  // content (paragraph, tag row), which a <button> is not allowed to contain.
  const card = h("div", "mgt-card");
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.title = tool.title;
  card.onclick = onSelect;
  card.onkeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect();
  };

  const head = h("div", "mgt-card__head");
  if (tool.icon) head.appendChild(createIconTile(tool.icon));
  head.appendChild(h("span", "mgt-card__title", tool.title));
  const arrow = h("span", "mgt-card__arrow", "›");
  arrow.setAttribute("aria-hidden", "true");
  head.appendChild(arrow);
  card.appendChild(head);

  // CSS clamps this to two lines, so the full text can be handed over as-is.
  card.appendChild(h("p", "mgt-card__desc", markdownToPlainText(tool.description)));

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
  const root = h("div", "mgt-list");

  const allTags = Array.from(new Set(tools.flatMap((tool) => tool.tags ?? [])));
  const selectedTags = new Set<string>();

  const count = pill(countLabel(tools.length));
  const introText = h("div", "mgt-intro__text");
  introText.append(
    h("div", "mgt-intro__title", "Community tools"),
    h("div", "mgt-intro__sub", "Sites and apps made by players."),
  );
  const intro = h("div", "mgt-intro");
  intro.append(introText, count);
  root.appendChild(intro);

  const grid = h("div", "mgt-grid");

  const renderCards = () => {
    const filtered = selectedTags.size
      ? tools.filter((tool) => tool.tags?.some((tag) => selectedTags.has(tag)))
      : tools;
    count.textContent = countLabel(filtered.length);

    if (!filtered.length) {
      const empty = h("div", "mgt-state");
      empty.appendChild(h("p", "mgt-state__text", "No tools match the selected tags."));
      grid.replaceChildren(empty);
      return;
    }

    grid.replaceChildren(...filtered.map((tool) => createCard(tool, () => onSelectTool(tool))));
  };

  // The filter chips are only worth showing when there is something to filter on.
  if (allTags.length) {
    const filters = h("div", "mgt-filters");
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "Filter by tag");

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
