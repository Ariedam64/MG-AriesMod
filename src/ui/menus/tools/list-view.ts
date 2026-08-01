// List view: filter bar + clickable tool cards
import { Menu } from "../../menu";
import type { ExternalTool } from "../../../services/tools";

export function renderListView(
  ui: Menu,
  tools: ExternalTool[],
  onSelectTool: (tool: ExternalTool) => void
): { root: HTMLElement } {
  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.gap = "12px";
  root.style.width = "100%";

  // Filter section
  const allTags = Array.from(new Set(tools.flatMap((t) => t.tags ?? [])));
  const selectedTags = new Set<string>();

  const filterSection = document.createElement("div");
  filterSection.style.display = "flex";
  filterSection.style.flexDirection = "column";
  filterSection.style.gap = "10px";
  filterSection.style.background = "linear-gradient(135deg, #0f1318 0%, #1a232d 100%)";
  filterSection.style.border = "1px solid #2d8cff22";
  filterSection.style.borderRadius = "12px";
  filterSection.style.padding = "14px";

  const filterTitle = document.createElement("span");
  filterTitle.textContent = "Filter by tags";
  filterTitle.style.fontSize = "11px";
  filterTitle.style.letterSpacing = "0.06em";
  filterTitle.style.textTransform = "uppercase";
  filterTitle.style.opacity = "0.8";
  filterTitle.style.fontWeight = "700";
  filterTitle.style.background = "linear-gradient(135deg, #2d8cff, #00d9ff)";
  filterTitle.style.backgroundClip = "text";
  filterTitle.style.webkitBackgroundClip = "text";
  filterTitle.style.webkitTextFillColor = "transparent";

  const filterControls = document.createElement("div");
  filterControls.style.display = "flex";
  filterControls.style.flexWrap = "wrap";
  filterControls.style.gap = "8px";

  const filterBtnBaseStyle = (btn: HTMLButtonElement) => {
    btn.type = "button";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.padding = "6px 12px";
    btn.style.borderRadius = "6px";
    btn.style.border = "1px solid";
    btn.style.background = "#ffffff0a";
    btn.style.borderColor = "#ffffff18";
    btn.style.fontSize = "10px";
    btn.style.fontWeight = "600";
    btn.style.letterSpacing = "0.04em";
    btn.style.textTransform = "uppercase";
    btn.style.color = "inherit";
    btn.style.opacity = "0.8";
    btn.style.cursor = "pointer";
    btn.style.transition = "all 140ms ease";
  };

  const setActiveState = (btn: HTMLButtonElement, active: boolean) => {
    if (active) {
      btn.style.background = "linear-gradient(135deg, #2d8cff22, #00d9ff11)";
      btn.style.borderColor = "#2d8cff77";
      btn.style.opacity = "1";
      btn.style.boxShadow = "0 0 12px rgba(45, 140, 255, 0.2)";
    } else {
      btn.style.background = "#ffffff0a";
      btn.style.borderColor = "#ffffff18";
      btn.style.opacity = "0.8";
      btn.style.boxShadow = "";
    }
  };

  const tagButtons = new Map<string, HTMLButtonElement>();
  let allButton: HTMLButtonElement;

  const renderCardsContainer = () => {
    cardsContainer.innerHTML = "";
    const filtered = selectedTags.size
      ? tools.filter((tool) => tool.tags?.some((tag) => selectedTags.has(tag)))
      : tools;

    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No tools match the selected tags yet.";
      empty.style.margin = "12px 0 0";
      empty.style.fontSize = "13px";
      empty.style.opacity = "0.75";
      empty.style.textAlign = "center";
      empty.style.gridColumn = "1 / -1";
      cardsContainer.appendChild(empty);
      return;
    }

    filtered.forEach((tool) => {
      const card = ui.card("", { tone: "muted", align: "stretch" });
      card.root.style.width = "100%";
      card.root.style.transition = "all 200ms ease";
      card.root.style.borderColor = "#ffffff18";
      card.root.style.cursor = "pointer";
      card.root.onmouseenter = () => {
        card.root.style.borderColor = "#2d8cff44";
        card.root.style.boxShadow = "0 8px 32px rgba(45, 140, 255, 0.12)";
      };
      card.root.onmouseleave = () => {
        card.root.style.borderColor = "#ffffff18";
        card.root.style.boxShadow = "";
      };
      card.root.onclick = () => onSelectTool(tool);

      const body = card.body;
      body.style.display = "grid";
      body.style.gap = "10px";

      // Header with icon and title
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.gap = "10px";

      if (tool.icon) {
        const iconSpan = document.createElement("span");
        iconSpan.textContent = tool.icon;
        iconSpan.style.fontSize = "18px";
        header.appendChild(iconSpan);
      }

      const titleText = document.createElement("span");
      titleText.textContent = tool.title;
      titleText.style.fontSize = "15px";
      titleText.style.fontWeight = "700";
      titleText.style.background = "linear-gradient(135deg, #2d8cff, #00d9ff)";
      titleText.style.backgroundClip = "text";
      titleText.style.webkitBackgroundClip = "text";
      titleText.style.webkitTextFillColor = "transparent";
      header.appendChild(titleText);

      body.appendChild(header);

      // Description preview (plain text, stripped of markdown)
      const descPreview = document.createElement("p");
      descPreview.textContent = tool.description.split("\n")[0].substring(0, 120) + "...";
      descPreview.style.margin = "0";
      descPreview.style.fontSize = "13px";
      descPreview.style.lineHeight = "1.5";
      descPreview.style.opacity = "0.85";
      descPreview.style.color = "#e8e8e8";
      body.appendChild(descPreview);

      // Tags
      if (tool.tags?.length) {
        const tagsRow = document.createElement("div");
        tagsRow.style.display = "flex";
        tagsRow.style.flexWrap = "wrap";
        tagsRow.style.gap = "6px";
        tagsRow.style.opacity = "0.85";

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

        body.appendChild(tagsRow);
      }

      cardsContainer.appendChild(card.root);
    });
  };

  // All button
  allButton = document.createElement("button");
  allButton.textContent = "All";
  filterBtnBaseStyle(allButton);
  allButton.onclick = () => {
    if (selectedTags.size === 0) return;
    selectedTags.clear();
    refreshButtonStates();
    renderCardsContainer();
  };
  filterControls.appendChild(allButton);

  // Tag buttons
  allTags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.textContent = tag;
    filterBtnBaseStyle(btn);
    btn.onclick = () => {
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
      } else {
        selectedTags.add(tag);
      }
      refreshButtonStates();
      renderCardsContainer();
    };
    filterControls.appendChild(btn);
    tagButtons.set(tag, btn);
  });

  const refreshButtonStates = () => {
    tagButtons.forEach((btn, tag) => {
      setActiveState(btn, selectedTags.has(tag));
    });
    setActiveState(allButton, selectedTags.size === 0);
  };

  filterSection.append(filterTitle, filterControls);
  root.appendChild(filterSection);

  // Cards container
  const cardsContainer = document.createElement("div");
  cardsContainer.style.display = "grid";
  cardsContainer.style.gridTemplateColumns = "repeat(auto-fit, minmax(280px, 1fr))";
  cardsContainer.style.gap = "14px";

  renderCardsContainer();
  refreshButtonStates();

  root.appendChild(cardsContainer);

  return { root };
}
