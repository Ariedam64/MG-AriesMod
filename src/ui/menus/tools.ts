// src/ui/menus/tools.ts - Community Tools menu orchestrator
// Fetches tools from remote JSON and renders list/detail views with animations

import { Menu } from "../menu";
import { fetchTools, type ExternalTool } from "../../services/tools";
import { renderListView } from "./tools/list-view";
import { renderDetailView } from "./tools/detail-view";
import { ensureToolsStyles } from "./tools/styles";
import { swapViews } from "./tools/transition";

const WRAPPER_WIDTH_PX = 720;

export async function renderToolsMenu(container: HTMLElement) {
  ensureToolsStyles();

  const ui = new Menu({ id: "tools", compact: true });
  ui.mount(container);

  const view = ui.root.querySelector(".qmm-views") as HTMLElement;
  view.innerHTML = "";
  view.style.display = "flex";
  view.style.flexDirection = "column";
  view.style.alignItems = "center";
  view.style.padding = "8px";
  view.style.width = "100%";
  view.style.maxHeight = "70vh";
  view.style.overflowY = "auto";

  const wrapper = document.createElement("div");
  wrapper.className = "mgt-wrap";
  wrapper.style.width = `${WRAPPER_WIDTH_PX}px`;
  wrapper.style.minWidth = `${WRAPPER_WIDTH_PX}px`;
  wrapper.style.maxWidth = "100%";
  wrapper.style.boxSizing = "border-box";

  const viewContainer = document.createElement("div");
  viewContainer.className = "mgt-views";
  wrapper.appendChild(viewContainer);
  view.appendChild(wrapper);

  const showLoading = () => {
    viewContainer.innerHTML = "";
    const state = document.createElement("div");
    state.className = "mgt-state";

    const spinner = document.createElement("div");
    spinner.className = "mgt-spinner";

    const text = document.createElement("p");
    text.className = "mgt-state__text";
    text.textContent = "Fetching the latest tools...";

    state.append(spinner, text);
    viewContainer.appendChild(state);
  };

  const showError = (message: string) => {
    viewContainer.innerHTML = "";
    const state = document.createElement("div");
    state.className = "mgt-state";

    const title = document.createElement("span");
    title.className = "mgt-state__title";
    title.textContent = "Couldn't load the tools";

    const text = document.createElement("p");
    text.className = "mgt-state__text";
    text.textContent = message;

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "mgt-action is-primary";
    retry.textContent = "Retry";
    retry.onclick = () => void init();

    state.append(title, text, retry);
    viewContainer.appendChild(state);
  };

  let tools: ExternalTool[] = [];
  let listViewRoot: HTMLElement | null = null;
  let detailViewRoot: HTMLElement | null = null;

  const showListView = async () => {
    if (listViewRoot) {
      // The list stays mounted, so returning to it only needs the animation.
      if (detailViewRoot && detailViewRoot.parentNode === viewContainer) {
        await swapViews(viewContainer, detailViewRoot, listViewRoot, "back");
      }
      return;
    }

    listViewRoot = renderListView(tools, showDetailView).root;
    viewContainer.appendChild(listViewRoot);
  };

  const showDetailView = async (tool: ExternalTool) => {
    detailViewRoot = renderDetailView(tool, showListView).root;
    viewContainer.appendChild(detailViewRoot);

    if (listViewRoot && listViewRoot.parentNode === viewContainer) {
      await swapViews(viewContainer, listViewRoot, detailViewRoot, "forward");
    }
  };

  const init = async () => {
    showLoading();

    try {
      tools = await fetchTools();

      if (!tools.length) {
        showError("No tools are available right now.");
        return;
      }

      viewContainer.innerHTML = "";
      listViewRoot = null;
      detailViewRoot = null;

      await showListView();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unknown error.");
    }
  };

  await init();
}
