// The Community Tools menu: fetches the tool list from the repo and slides
// between the list and one tool's detail page.

import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import { Menu } from "../../ui/kit/menu";
import { fetchTools, type ExternalTool } from "./fetchTools";
import { renderListView } from "./listView";
import { renderDetailView } from "./detailView";
import { ensureToolsStyles } from "./styles";
import { swapViews } from "./transition";

const WRAPPER_WIDTH_PX = 720;

export async function renderToolsMenu(container: HTMLElement) {
  ensureToolsStyles();

  const ui = new Menu({ id: "tools", compact: true });
  ui.mount(container);

  const view = ui.root.querySelector(".qmm-views") as HTMLElement;
  view.replaceChildren();
  Object.assign(view.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "8px",
    width: "100%",
    maxHeight: "70vh",
    overflowY: "auto",
  });

  const wrapper = h("div", "mgt-wrap");
  Object.assign(wrapper.style, {
    width: `${WRAPPER_WIDTH_PX}px`,
    minWidth: `${WRAPPER_WIDTH_PX}px`,
    maxWidth: "100%",
    boxSizing: "border-box",
  });

  const viewContainer = h("div", "mgt-views");
  wrapper.appendChild(viewContainer);
  view.appendChild(wrapper);

  const showLoading = () => {
    const state = h("div", "mgt-state");
    state.append(h("div", "mgt-spinner"), h("p", "mgt-state__text", "Fetching the latest tools..."));
    viewContainer.replaceChildren(state);
  };

  const showError = (message: string) => {
    const state = h("div", "mgt-state");
    state.append(
      h("span", "mgt-state__title", "Couldn't load the tools"),
      h("p", "mgt-state__text", message),
      button("Retry", { variant: "primary", onClick: () => init() }),
    );
    viewContainer.replaceChildren(state);
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

      viewContainer.replaceChildren();
      listViewRoot = null;
      detailViewRoot = null;

      await showListView();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unknown error.");
    }
  };

  await init();
}
