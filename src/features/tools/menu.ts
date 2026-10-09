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

export async function renderToolsMenu(container: HTMLElement) {
  ensureToolsStyles();

  const ui = new Menu({ id: "tools", compact: true });
  ui.mount(container);

  const view = ui.root.querySelector(".qmm-views") as HTMLElement;
  view.replaceChildren();
  view.classList.add("mgt-host");

  const wrapper = h("div", "mgt-wrap");
  const viewContainer = h("div", "mgt-views");
  wrapper.appendChild(viewContainer);
  view.appendChild(wrapper);

  /** A centred message in place of the list, with one button to try again. */
  const showState = (title: string, text: string, retryLabel: string) => {
    const state = h("div", "mgt-state");
    state.append(
      h("span", "mgt-state__title", title),
      h("p", "mgt-state__text", text),
      button(retryLabel, { variant: "primary", onClick: () => void init() }),
    );
    viewContainer.replaceChildren(state);
  };

  const showLoading = () => {
    const state = h("div", "mgt-state");
    state.append(h("div", "mgt-spinner"), h("p", "mgt-state__text", "Fetching the latest tools..."));
    viewContainer.replaceChildren(state);
  };

  let tools: ExternalTool[] = [];
  let listViewRoot: HTMLElement | null = null;
  let detailViewRoot: HTMLElement | null = null;
  // The window body is what scrolls. The list keeps its place while a tool is open.
  let listScrollTop = 0;
  let swapping = false;

  const showListView = async () => {
    if (listViewRoot) {
      // The list stays mounted, so returning to it only needs the animation.
      const detail = detailViewRoot;
      if (!detail || detail.parentNode !== viewContainer || swapping) return;
      swapping = true;
      try {
        await swapViews(viewContainer, detail, listViewRoot, "back");
        container.scrollTop = listScrollTop;
      } finally {
        detail.remove();
        if (detailViewRoot === detail) detailViewRoot = null;
        swapping = false;
      }
      return;
    }

    listViewRoot = renderListView(tools, showDetailView).root;
    viewContainer.appendChild(listViewRoot);
  };

  const showDetailView = async (tool: ExternalTool) => {
    // A second click during the slide would stack two detail pages.
    if (swapping) return;
    detailViewRoot = renderDetailView(tool, showListView).root;
    viewContainer.appendChild(detailViewRoot);

    if (listViewRoot && listViewRoot.parentNode === viewContainer) {
      swapping = true;
      listScrollTop = container.scrollTop;
      container.scrollTop = 0;
      try {
        await swapViews(viewContainer, listViewRoot, detailViewRoot, "forward");
      } finally {
        swapping = false;
      }
    }
  };

  const init = async () => {
    showLoading();

    try {
      tools = await fetchTools();

      if (!tools.length) {
        showState("No tools yet", "None are listed right now. Check back soon.", "Check again");
        return;
      }

      viewContainer.replaceChildren();
      listViewRoot = null;
      detailViewRoot = null;

      await showListView();
    } catch (error) {
      showState("Couldn't load the tools", error instanceof Error ? error.message : "Unknown error.", "Retry");
    }
  };

  await init();
}
