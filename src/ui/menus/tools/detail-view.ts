// Detail view: back button, full description (with markdown), carousel, and actions
import { Menu } from "../../menu";
import type { ExternalTool } from "../../../services/tools";
import { openLink } from "../../../services/tools";
import { renderMarkdown } from "../../../utils/markdown";
import { renderCarousel } from "./carousel";

export function renderDetailView(
  ui: Menu,
  tool: ExternalTool,
  onBack: () => void
): { root: HTMLElement } {
  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.gap = "20px";
  root.style.width = "100%";
  root.style.maxHeight = "70vh";
  root.style.overflowY = "auto";

  // Back button
  const backBtn = ui.btn("Back", {
    icon: "←",
    variant: "ghost",
    size: "sm",
  });
  backBtn.style.alignSelf = "flex-start";
  backBtn.onclick = onBack;
  root.appendChild(backBtn);

  // Header card (icon + title + creators)
  const headerCard = ui.card(tool.title, {
    tone: "muted",
    align: "stretch",
    icon: tool.icon || undefined,
  });
  headerCard.root.style.borderColor = "#2d8cff44";
  headerCard.root.style.background = "linear-gradient(135deg, #0f1318 0%, #1a2332 100%)";

  // Creators
  if (tool.creators?.length) {
    const creatorsRow = document.createElement("div");
    creatorsRow.style.display = "flex";
    creatorsRow.style.flexWrap = "wrap";
    creatorsRow.style.gap = "8px";
    creatorsRow.style.marginTop = "8px";

    tool.creators.forEach((creator) => {
      const chip = document.createElement("div");
      chip.style.display = "inline-flex";
      chip.style.alignItems = "center";
      chip.style.gap = "8px";
      chip.style.padding = "4px 8px";
      chip.style.background = "#ffffff0c";
      chip.style.border = "1px solid #ffffff18";
      chip.style.borderRadius = "999px";

      if (creator.avatar) {
        const avatar = document.createElement("img");
        avatar.src = creator.avatar;
        avatar.alt = creator.name;
        avatar.style.width = "26px";
        avatar.style.height = "26px";
        avatar.style.borderRadius = "999px";
        avatar.style.objectFit = "cover";
        avatar.style.border = "1px solid #ffffff22";
        chip.appendChild(avatar);
      }

      const name = document.createElement("span");
      name.textContent = creator.name;
      name.style.fontSize = "12px";
      name.style.fontWeight = "600";
      chip.appendChild(name);

      creatorsRow.appendChild(chip);
    });

    headerCard.body.appendChild(creatorsRow);
  }

  root.appendChild(headerCard.root);

  // Markdown description
  const descCard = ui.card("", { tone: "muted", align: "stretch" });
  const descHtml = renderMarkdown(tool.description);
  const descDiv = document.createElement("div");
  descDiv.innerHTML = descHtml;
  descDiv.style.fontSize = "13px";
  descDiv.style.lineHeight = "1.6";
  descCard.body.appendChild(descDiv);
  root.appendChild(descCard.root);

  // Carousel (if images exist)
  if (tool.images?.length) {
    const carouselCmp = renderCarousel(tool.images);
    root.appendChild(carouselCmp.root);
  }

  // Tags
  if (tool.tags?.length) {
    const tagsRow = document.createElement("div");
    tagsRow.style.display = "flex";
    tagsRow.style.flexWrap = "wrap";
    tagsRow.style.gap = "6px";
    tagsRow.style.opacity = "0.85";
    tagsRow.style.justifyContent = "flex-start";

    tool.tags.forEach((tag) => {
      const tagSpan = document.createElement("span");
      tagSpan.textContent = tag;
      tagSpan.style.display = "inline-flex";
      tagSpan.style.alignItems = "center";
      tagSpan.style.justifyContent = "center";
      tagSpan.style.padding = "3px 10px";
      tagSpan.style.borderRadius = "6px";
      tagSpan.style.background = "linear-gradient(135deg, #2d8cff11, #00d9ff11)";
      tagSpan.style.border = "1px solid #2d8cff33";
      tagSpan.style.fontSize = "10px";
      tagSpan.style.letterSpacing = "0.03em";
      tagSpan.style.textTransform = "uppercase";
      tagSpan.style.fontWeight = "500";
      tagsRow.appendChild(tagSpan);
    });

    root.appendChild(tagsRow);
  }

  // Actions row
  const actionsRow = ui.flexRow({ gap: 8, justify: "end", fullWidth: true });
  actionsRow.style.marginTop = "8px";

  if (tool.actions?.length) {
    actionsRow.style.display = "grid";
    actionsRow.style.width = "100%";
    actionsRow.style.gridTemplateColumns = "repeat(auto-fit, minmax(120px, 1fr))";
    actionsRow.style.alignItems = "stretch";

    tool.actions.forEach((action) => {
      const actionBtn = ui.btn(action.label, {
        variant: "primary",
        title: `Open ${action.label}`,
      });
      actionBtn.style.flex = "1 1 0";
      actionBtn.style.minWidth = "0";
      actionBtn.onclick = () => {
        const ok = openLink(action.url);
        if (!ok) {
          console.warn("[Tools] Failed to open link:", action.url);
        }
      };
      actionsRow.append(actionBtn);
    });
  } else {
    // Fallback: Open tool button (no actions defined)
    const openBtn = ui.btn("Visit", {
      variant: "primary",
      fullWidth: true,
      title: "Open the tool",
    });
    openBtn.onclick = () => {
      const ok = openLink(tool.url);
      if (!ok) {
        console.warn("[Tools] Failed to open tool URL:", tool.url);
      }
    };
    actionsRow.append(openBtn);
  }

  root.appendChild(actionsRow);

  return { root };
}
