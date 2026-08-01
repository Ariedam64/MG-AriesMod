// Detail view: back button, hero header, markdown description, carousel, actions.
// Styling lives in styles.ts (`.mgt-detail`, `.mgt-hero`, `.mgt-md`, ...).
import type { ExternalTool, ExternalToolCreator } from "../../../services/tools";
import { openLink } from "../../../services/tools";
import { renderMarkdown } from "../../../utils/markdown";
import { renderCarousel } from "./carousel";
import { createIconTile, loadImageInto } from "./image";
import { createTagRow } from "./tag";

function createCreatorChip(creator: ExternalToolCreator): HTMLElement {
  const chip = document.createElement("div");
  chip.className = creator.avatar ? "mgt-creator" : "mgt-creator mgt-creator--plain";

  if (creator.avatar) {
    const avatar = document.createElement("img");
    avatar.alt = creator.name;
    loadImageInto(avatar, creator.avatar);
    chip.appendChild(avatar);
  }

  const name = document.createElement("span");
  name.textContent = creator.name;
  chip.appendChild(name);

  return chip;
}

/** Icon + title + tags on one line, creators below a divider. */
function createHero(tool: ExternalTool): HTMLElement {
  const hero = document.createElement("div");
  hero.className = "mgt-hero";

  const top = document.createElement("div");
  top.className = "mgt-hero__top";

  if (tool.icon) {
    top.appendChild(createIconTile(tool.icon, "lg"));
  }

  const titles = document.createElement("div");
  titles.className = "mgt-hero__titles";

  const title = document.createElement("h2");
  title.className = "mgt-hero__title";
  title.textContent = tool.title;
  titles.appendChild(title);

  if (tool.tags?.length) {
    titles.appendChild(createTagRow(tool.tags));
  }

  top.appendChild(titles);
  hero.appendChild(top);

  if (tool.creators?.length) {
    const divider = document.createElement("div");
    divider.className = "mgt-divider";
    hero.appendChild(divider);

    const meta = document.createElement("div");
    meta.className = "mgt-meta";

    const label = document.createElement("span");
    label.className = "mgt-label";
    label.textContent = tool.creators.length > 1 ? "Created by" : "Creator";
    meta.appendChild(label);

    tool.creators.forEach((creator) => meta.appendChild(createCreatorChip(creator)));
    hero.appendChild(meta);
  }

  return hero;
}

function createActions(actions: ExternalTool["actions"]): HTMLElement | null {
  if (!actions?.length) return null;

  const row = document.createElement("div");
  row.className = "mgt-actions";

  actions.forEach((action, index) => {
    const button = document.createElement("button");
    button.type = "button";
    // The first action is the primary one; the rest stay secondary.
    button.className = index === 0 ? "mgt-action is-primary" : "mgt-action";
    button.textContent = action.label;
    button.title = `Open ${action.label}`;
    button.onclick = () => {
      if (!openLink(action.url)) {
        console.warn("[Tools] Failed to open link:", action.url);
      }
    };
    row.appendChild(button);
  });

  return row;
}

export function renderDetailView(
  tool: ExternalTool,
  onBack: () => void
): { root: HTMLElement } {
  const root = document.createElement("div");
  root.className = "mgt-detail";

  const back = document.createElement("button");
  back.type = "button";
  back.className = "mgt-back";
  back.onclick = onBack;

  const backArrow = document.createElement("span");
  backArrow.className = "mgt-back__arrow";
  backArrow.textContent = "←";
  backArrow.setAttribute("aria-hidden", "true");
  back.append(backArrow, document.createTextNode("All tools"));
  root.appendChild(back);

  root.appendChild(createHero(tool));

  const description = document.createElement("div");
  description.className = "mgt-panel mgt-md";
  description.innerHTML = renderMarkdown(tool.description);
  root.appendChild(description);

  if (tool.images?.length) {
    root.appendChild(renderCarousel(tool.images).root);
  }

  const actions = createActions(tool.actions);
  if (actions) root.appendChild(actions);

  return { root };
}
