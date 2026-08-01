// List view: tag filter bar + clickable tool cards.
// Styling lives in styles.ts (`.mgt-list`, `.mgt-grid`, `.mgt-card`, ...).
import type { ExternalTool } from "../../../services/tools";
import { markdownToPlainText } from "../../../utils/markdown";
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
    grid.innerHTML = "";

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

  // Filter bar — only worth showing when there is something to filter on.
  if (allTags.length) {
    const filters = document.createElement("div");
    filters.className = "mgt-filters";

    const label = document.createElement("span");
    label.className = "mgt-label";
    label.textContent = "Filter";
    filters.appendChild(label);

    const tagButtons = new Map<string, HTMLButtonElement>();

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = "mgt-chip";
    allButton.textContent = ALL_FILTER_LABEL;

    const refreshStates = () => {
      allButton.classList.toggle("is-active", selectedTags.size === 0);
      tagButtons.forEach((button, tag) => {
        button.classList.toggle("is-active", selectedTags.has(tag));
      });
    };

    allButton.onclick = () => {
      if (selectedTags.size === 0) return;
      selectedTags.clear();
      refreshStates();
      renderCards();
    };
    filters.appendChild(allButton);

    allTags.forEach((tag) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mgt-chip";
      button.textContent = tag;
      button.onclick = () => {
        if (selectedTags.has(tag)) {
          selectedTags.delete(tag);
        } else {
          selectedTags.add(tag);
        }
        refreshStates();
        renderCards();
      };
      filters.appendChild(button);
      tagButtons.set(tag, button);
    });

    refreshStates();
    root.appendChild(filters);
  }

  renderCards();
  root.appendChild(grid);

  return { root };
}
