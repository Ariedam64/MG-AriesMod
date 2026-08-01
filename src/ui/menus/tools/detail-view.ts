// Detail view: hero header, full description (with markdown), carousel, and actions
import { Menu } from "../../menu";
import type { ExternalTool, ExternalToolCreator } from "../../../services/tools";
import { openLink } from "../../../services/tools";
import { renderMarkdown } from "../../../utils/markdown";
import { renderCarousel } from "./carousel";
import { createToolIcon, loadImageInto } from "./image";
import { createTagRow } from "./tag";

const HERO_ICON_SIZE_PX = 44;
const AVATAR_SIZE_PX = 22;

function createSectionLabel(text: string): HTMLElement {
  const label = document.createElement("span");
  label.textContent = text;
  label.style.fontSize = "10px";
  label.style.fontWeight = "700";
  label.style.letterSpacing = "0.08em";
  label.style.textTransform = "uppercase";
  label.style.opacity = "0.55";
  return label;
}

function createCreatorChip(creator: ExternalToolCreator): HTMLElement {
  const chip = document.createElement("div");
  chip.style.display = "inline-flex";
  chip.style.alignItems = "center";
  chip.style.gap = "7px";
  chip.style.padding = "3px 10px 3px 3px";
  chip.style.background = "#ffffff0c";
  chip.style.border = "1px solid #ffffff18";
  chip.style.borderRadius = "999px";

  if (creator.avatar) {
    const avatar = document.createElement("img");
    avatar.alt = creator.name;
    loadImageInto(avatar, creator.avatar);
    avatar.style.width = `${AVATAR_SIZE_PX}px`;
    avatar.style.height = `${AVATAR_SIZE_PX}px`;
    avatar.style.borderRadius = "999px";
    avatar.style.objectFit = "cover";
    avatar.style.border = "1px solid #ffffff22";
    avatar.style.flexShrink = "0";
    chip.appendChild(avatar);
  } else {
    // Keeps the pill shape consistent when there is no avatar to show.
    chip.style.padding = "5px 10px";
  }

  const name = document.createElement("span");
  name.textContent = creator.name;
  name.style.fontSize = "12px";
  name.style.fontWeight = "600";
  chip.appendChild(name);

  return chip;
}

/** Icon + title + tags on one line, creators underneath a divider. */
function createHero(ui: Menu, tool: ExternalTool): HTMLElement {
  const card = ui.card("", { tone: "muted", align: "stretch" });
  card.header.style.display = "none";
  card.root.style.borderColor = "#2d8cff44";
  card.root.style.background = "linear-gradient(135deg, #0f1318 0%, #1a2332 100%)";
  card.body.style.display = "flex";
  card.body.style.flexDirection = "column";
  card.body.style.gap = "14px";

  const titleRow = document.createElement("div");
  titleRow.style.display = "flex";
  titleRow.style.alignItems = "center";
  titleRow.style.gap = "14px";

  if (tool.icon) {
    const icon = createToolIcon(tool.icon);
    icon.style.width = `${HERO_ICON_SIZE_PX}px`;
    icon.style.height = `${HERO_ICON_SIZE_PX}px`;
    icon.style.fontSize = `${HERO_ICON_SIZE_PX - 8}px`;
    icon.style.display = "flex";
    icon.style.alignItems = "center";
    icon.style.justifyContent = "center";
    icon.style.flexShrink = "0";
    titleRow.appendChild(icon);
  }

  const titleColumn = document.createElement("div");
  titleColumn.style.display = "flex";
  titleColumn.style.flexDirection = "column";
  titleColumn.style.gap = "7px";
  titleColumn.style.minWidth = "0";

  const title = document.createElement("h2");
  title.textContent = tool.title;
  title.style.margin = "0";
  title.style.fontSize = "20px";
  title.style.fontWeight = "700";
  title.style.lineHeight = "1.2";
  title.style.background = "linear-gradient(135deg, #2d8cff, #00d9ff)";
  title.style.backgroundClip = "text";
  title.style.webkitBackgroundClip = "text";
  title.style.webkitTextFillColor = "transparent";
  titleColumn.appendChild(title);

  if (tool.tags?.length) {
    titleColumn.appendChild(createTagRow(tool.tags));
  }

  titleRow.appendChild(titleColumn);
  card.body.appendChild(titleRow);

  if (tool.creators?.length) {
    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.background = "#ffffff14";
    card.body.appendChild(divider);

    const creatorsBlock = document.createElement("div");
    creatorsBlock.style.display = "flex";
    creatorsBlock.style.alignItems = "center";
    creatorsBlock.style.flexWrap = "wrap";
    creatorsBlock.style.gap = "10px";
    creatorsBlock.appendChild(createSectionLabel("Created by"));

    const chips = document.createElement("div");
    chips.style.display = "flex";
    chips.style.flexWrap = "wrap";
    chips.style.gap = "8px";
    tool.creators.forEach((creator) => chips.appendChild(createCreatorChip(creator)));
    creatorsBlock.appendChild(chips);

    card.body.appendChild(creatorsBlock);
  }

  return card.root;
}

export function renderDetailView(
  ui: Menu,
  tool: ExternalTool,
  onBack: () => void
): { root: HTMLElement } {
  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.gap = "16px";
  root.style.width = "100%";
  root.style.maxHeight = "70vh";
  root.style.overflowY = "auto";

  const backBtn = ui.btn("Back", { icon: "←", variant: "ghost", size: "sm" });
  backBtn.style.alignSelf = "flex-start";
  backBtn.onclick = onBack;
  root.appendChild(backBtn);

  root.appendChild(createHero(ui, tool));

  // Markdown description
  const descCard = ui.card("", { tone: "muted", align: "stretch" });
  descCard.header.style.display = "none";
  const descDiv = document.createElement("div");
  descDiv.innerHTML = renderMarkdown(tool.description);
  descDiv.style.fontSize = "13px";
  descDiv.style.lineHeight = "1.6";
  descCard.body.appendChild(descDiv);
  root.appendChild(descCard.root);

  if (tool.images?.length) {
    const carousel = renderCarousel(tool.images);
    root.appendChild(carousel.root);
  }

  if (tool.actions?.length) {
    const actionsRow = document.createElement("div");
    actionsRow.style.display = "grid";
    actionsRow.style.width = "100%";
    actionsRow.style.gridTemplateColumns = "repeat(auto-fit, minmax(120px, 1fr))";
    actionsRow.style.alignItems = "stretch";
    actionsRow.style.gap = "8px";
    actionsRow.style.marginTop = "4px";

    tool.actions.forEach((action) => {
      const actionBtn = ui.btn(action.label, {
        variant: "primary",
        title: `Open ${action.label}`,
      });
      actionBtn.style.minWidth = "0";
      actionBtn.onclick = () => {
        if (!openLink(action.url)) {
          console.warn("[Tools] Failed to open link:", action.url);
        }
      };
      actionsRow.appendChild(actionBtn);
    });

    root.appendChild(actionsRow);
  }

  return { root };
}
