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

/**
 * One card holding the whole identity of the tool: icon, title and tags on the
 * left, creators on the right, then the description under a divider. Keeping
 * them together avoids stacking two near-identical panels.
 */
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

  if (tool.creators?.length) {
    const meta = document.createElement("div");
    meta.className = "mgt-meta";

    const label = document.createElement("span");
    label.className = "mgt-label";
    label.textContent = tool.creators.length > 1 ? "Created by" : "Creator";
    meta.appendChild(label);

    tool.creators.forEach((creator) => meta.appendChild(createCreatorChip(creator)));
    top.appendChild(meta);
  }

  hero.appendChild(top);

  const divider = document.createElement("div");
  divider.className = "mgt-divider";
  hero.appendChild(divider);

  const description = document.createElement("div");
  description.className = "mgt-md";
  description.innerHTML = renderMarkdown(tool.description);
  hero.appendChild(description);

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

  if (tool.images?.length) {
    root.appendChild(renderCarousel(tool.images).root);
  }

  const actions = createActions(tool.actions);
  if (actions) root.appendChild(actions);

  return { root };
}
