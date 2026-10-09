// Detail view: back button, the tool's header, its links, the About card and
// the screenshot carousel.

import { renderMarkdown } from "../../lib/markdown";
import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import type { ExternalTool, ExternalToolCreator } from "./fetchTools";
import { openLink } from "./openLink";
import { renderCarousel } from "./carousel";
import { createIconTile, loadImageInto } from "./image";
import { createTagRow } from "./tag";

function createCreatorChip(creator: ExternalToolCreator): HTMLElement {
  const chip = h("span", "mgt-creator");

  if (creator.avatar) {
    const avatar = h("img");
    avatar.alt = "";
    loadImageInto(avatar, creator.avatar);
    chip.appendChild(avatar);
  }

  chip.appendChild(h("span", undefined, creator.name));
  return chip;
}

/** Icon, title, creators and tags, straight on the page with no frame around them. */
function createHero(tool: ExternalTool): HTMLElement {
  const hero = h("div", "mgt-hero");
  if (tool.icon) hero.appendChild(createIconTile(tool.icon, "lg"));

  const titles = h("div", "mgt-hero__titles");
  titles.appendChild(h("h2", "mgt-hero__title", tool.title));

  if (tool.creators?.length) {
    const creators = h("div", "mgt-creators");
    creators.appendChild(h("span", "mgt-creators__label", "Made by"));
    tool.creators.forEach((creator) => creators.appendChild(createCreatorChip(creator)));
    titles.appendChild(creators);
  }

  if (tool.tags?.length) titles.appendChild(createTagRow(tool.tags));

  hero.appendChild(titles);
  return hero;
}

function createActions(actions: ExternalTool["actions"]): HTMLElement | null {
  if (!actions?.length) return null;

  const row = h("div", "mgt-actions");
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
  const root = h("div", "mgt-detail");

  const back = button("All tools", { icon: "‹", size: "sm", variant: "ghost", onClick: onBack });
  back.classList.add("mgt-back");
  root.appendChild(back);

  root.appendChild(createHero(tool));

  const actions = createActions(tool.actions);
  if (actions) root.appendChild(actions);

  const about = card("About");
  const description = h("div", "mgt-md");
  description.innerHTML = renderMarkdown(tool.description);
  about.body.appendChild(description);
  root.appendChild(about.root);

  if (tool.images?.length) {
    root.appendChild(renderCarousel(tool.images).root);
  }

  return { root };
}
