// src/ui/menus/tools.ts - Community Tools menu orchestrator
// Fetches tools from remote JSON and renders list/detail views with animations

import { Menu } from "../menu";
import { fetchTools, type ExternalTool } from "../../services/tools";
import { renderListView } from "./tools/list-view";
import { renderDetailView } from "./tools/detail-view";
import { swapViews } from "./tools/transition";

export async function renderToolsMenu(container: HTMLElement) {
  const ui = new Menu({ id: "tools", compact: true });
  ui.mount(container);

  const view = ui.root.querySelector(".qmm-views") as HTMLElement;
  view.innerHTML = "";
  view.style.display = "flex";
  view.style.flexDirection = "column";
  view.style.gap = "12px";
  view.style.alignItems = "center";
  view.style.padding = "8px";
  view.style.width = "100%";
  view.style.maxHeight = "70vh";
  view.style.overflowY = "auto";
  view.style.overflowX = "auto";

  const WRAPPER_WIDTH = 720;
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "12px";
  wrapper.style.width = `${WRAPPER_WIDTH}px`;
  wrapper.style.minWidth = `${WRAPPER_WIDTH}px`;
  wrapper.style.maxWidth = `${WRAPPER_WIDTH}px`;
  wrapper.style.boxSizing = "border-box";
  wrapper.style.alignSelf = "center";

  // Intro card
  const intro = ui.card("🧰 Community Tools", { tone: "muted", align: "stretch" });
  intro.root.style.borderColor = "#2d8cff44";
  intro.root.style.background = "linear-gradient(135deg, #0f1318 0%, #1a2332 100%)";
  const introText = document.createElement("p");
  introText.textContent = "Discover community-made helpers to plan, calculate, and simplify your Magic Garden adventures.";
  introText.style.margin = "0";
  introText.style.fontSize = "13px";
  introText.style.lineHeight = "1.6";
  introText.style.opacity = "0.88";
  introText.style.textAlign = "left";
  intro.body.appendChild(introText);
  wrapper.appendChild(intro.root);

  // View container
  const viewContainer = document.createElement("div");
  viewContainer.style.position = "relative";
  viewContainer.style.width = "100%";
  viewContainer.style.flex = "1";

  wrapper.appendChild(viewContainer);
  view.appendChild(wrapper);

  // Loading state
  const showLoading = () => {
    viewContainer.innerHTML = "";
    const loadingCard = ui.card("Loading...", { tone: "muted", align: "stretch" });
    loadingCard.body.style.textAlign = "center";
    const spinner = document.createElement("div");
    spinner.textContent = "Fetching tools...";
    spinner.style.opacity = "0.75";
    spinner.style.fontSize = "13px";
    loadingCard.body.appendChild(spinner);
    viewContainer.appendChild(loadingCard.root);
  };

  // Error state
  const showError = (error: Error) => {
    viewContainer.innerHTML = "";
    const errorCard = ui.card("Error", { tone: "muted", align: "stretch" });
    const errorText = document.createElement("p");
    errorText.textContent = error.message || "Failed to load tools.";
    errorText.style.margin = "0 0 12px 0";
    errorText.style.opacity = "0.9";
    errorText.style.fontSize = "13px";
    errorCard.body.appendChild(errorText);

    const retryBtn = ui.btn("Retry", { variant: "primary", fullWidth: true });
    retryBtn.onclick = () => {
      void init();
    };
    errorCard.body.appendChild(retryBtn);

    viewContainer.appendChild(errorCard.root);
  };

  let tools: ExternalTool[] = [];
  let listViewRoot: HTMLElement | null = null;
  let detailViewRoot: HTMLElement | null = null;

  const showListView = async () => {
    if (listViewRoot) {
      // List already rendered, just swap to it
      if (detailViewRoot && detailViewRoot.parentNode === viewContainer) {
        await swapViews(viewContainer, detailViewRoot, listViewRoot, "back");
      }
      return;
    }

    // Render list for the first time
    const listView = renderListView(ui, tools, showDetailView);
    listViewRoot = listView.root;
    viewContainer.appendChild(listViewRoot);
  };

  const showDetailView = async (tool: ExternalTool) => {
    const detailView = renderDetailView(ui, tool, showListView);
    detailViewRoot = detailView.root;

    if (listViewRoot && listViewRoot.parentNode === viewContainer) {
      viewContainer.appendChild(detailViewRoot);
      await swapViews(viewContainer, listViewRoot, detailViewRoot, "forward");
    } else {
      viewContainer.appendChild(detailViewRoot);
    }
  };

  const init = async () => {
    showLoading();

    try {
      tools = await fetchTools();

      if (!tools.length) {
        showError(new Error("No tools available."));
        return;
      }

      viewContainer.innerHTML = "";
      listViewRoot = null;
      detailViewRoot = null;

      await showListView();
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      showError(err);
    }
  };

  // Start
  await init();
}
