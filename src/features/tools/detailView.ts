// Detail view: back button, hero header, markdown description, carousel and
// the tool's links.

import { renderMarkdown } from "../../lib/markdown";
import { button } from "../../ui/kit/button";
import type { ExternalTool, ExternalToolCreator } from "./fetchTools";
import { openLink } from "./openLink";
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
    row.appendChild(
      button(action.label, {
        // The first link is the main one; the rest stay secondary.
        variant: index === 0 ? "primary" : "default",
        title: `Open ${action.label}`,
        onClick: () => {
          if (!openLink(action.url)) console.warn("[Tools] Failed to open link:", action.url);
        },
      }),
    );
  });

  return row;
}

export function renderDetailView(
  tool: ExternalTool,
  onBack: () => void
): { root: HTMLElement } {
  const root = document.createElement("div");
  root.className = "mgt-detail";

  const back = button("All tools", { icon: "←", size: "sm", onClick: onBack });
  back.classList.add("mgt-back");
  root.appendChild(back);

  root.appendChild(createHero(tool));

  if (tool.images?.length) {
    root.appendChild(renderCarousel(tool.images).root);
  }

  const actions = createActions(tool.actions);
  if (actions) root.appendChild(actions);

  return { root };
}
