// The weather recipe editor: rows of weather tags, where a crop matches a row
// when it carries every tag of it, and the filter matches when any row does.

import { button } from "../../ui/kit/button";
import { weatherIcon } from "./menuIcons";
import type { SettingsDraft } from "./settingsDraft";
import { weatherGrid, weatherTile, type WeatherTile } from "./weatherPicker";
import { normalizeRecipe, recipeRivals, weatherMutations } from "./weatherTags";

export type RecipeEditor = {
  root: HTMLElement;
  /** Redraws the rows from the settings, and the title from the lock mode. */
  refresh(): void;
};

/** The row's tags, in catalog order. */
function showSummary(summary: HTMLElement, selection: Set<string>): HTMLElement {
  summary.className = "lk-recipe__summary";
  summary.replaceChildren();
  const tags = weatherMutations().filter((info) => selection.has(info.key));
  for (const { key, label } of tags) {
    const tag = document.createElement("div");
    tag.className = "lk-tag";
    const text = document.createElement("span");
    text.textContent = label;
    tag.append(weatherIcon(key, 20), text);
    summary.appendChild(tag);
  }
  if (!tags.length) {
    const empty = document.createElement("div");
    empty.className = "lk-empty";
    empty.textContent = "No weather mutation selected.";
    summary.appendChild(empty);
  }
  return summary;
}

export function weatherRecipeEditor(state: SettingsDraft, onChange: () => void): RecipeEditor {
  const root = document.createElement("div");
  root.className = "lk-recipes";

  const title = document.createElement("div");
  title.className = "lk-recipes__title";
  const addButton = button("+ Recipe", { size: "sm", onClick: () => startEditing(state.weatherRecipes.length) });
  const head = document.createElement("div");
  head.className = "lk-recipes__head";
  head.append(title, addButton);

  const list = document.createElement("div");
  list.className = "lk-recipes__list";
  root.append(head, list);

  /** The row being edited (`state.weatherRecipes.length` for a new one) and its working copy. */
  let editingIndex: number | null = null;
  let draft = new Set<string>();

  const startEditing = (index: number) => {
    editingIndex = index;
    draft = new Set(state.weatherRecipes[index] ?? []);
    normalizeRecipe(draft);
    repaint();
  };

  const stopEditing = () => {
    editingIndex = null;
    draft = new Set();
    repaint();
  };

  const commit = () => {
    if (editingIndex === null) return;
    const recipe = new Set(draft);
    normalizeRecipe(recipe);
    if (editingIndex === state.weatherRecipes.length) state.weatherRecipes.push(recipe);
    else if (editingIndex >= 0 && editingIndex < state.weatherRecipes.length) state.weatherRecipes[editingIndex] = recipe;
    stopEditing();
    onChange();
  };

  const remove = (index: number) => {
    if (index < 0) return;
    if (index < state.weatherRecipes.length) state.weatherRecipes.splice(index, 1);
    if (editingIndex !== null) {
      if (index === editingIndex) {
        editingIndex = null;
        draft = new Set();
      } else if (index < editingIndex) {
        editingIndex -= 1;
      }
    }
    repaint();
    onChange();
  };

  /** Picking a tag drops the other tags of its kind: a row holds one condition and one lighting. */
  function editingRow(index: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "lk-recipe is-editing";
    const summary = showSummary(document.createElement("div"), draft);

    const tiles = new Map<string, WeatherTile>();
    const grid = weatherGrid(true);
    for (const info of weatherMutations()) {
      const tile = weatherTile(info, true, (checked) => {
        if (checked) {
          for (const rival of recipeRivals(info.key)) {
            if (draft.delete(rival)) tiles.get(rival)?.setChecked(false);
          }
          draft.add(info.key);
        } else {
          draft.delete(info.key);
        }
        showSummary(summary, draft);
      });
      tile.setChecked(draft.has(info.key));
      tiles.set(info.key, tile);
      grid.appendChild(tile.root);
    }

    const actions = document.createElement("div");
    actions.className = "lk-recipe__actions";
    actions.append(
      button("❌", { size: "sm", tooltip: "Cancel", onClick: stopEditing }),
      button("✔️", { size: "sm", tooltip: "Save", onClick: commit }),
    );
    if (index < state.weatherRecipes.length) {
      actions.append(button("🗑️", { size: "sm", tooltip: "Delete", ariaLabel: "Delete", onClick: () => remove(index) }));
    }
    row.append(summary, grid, actions);
    return row;
  }

  function savedRow(recipe: Set<string>, index: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "lk-recipe";
    const actions = document.createElement("div");
    actions.className = "lk-recipe__actions";
    actions.append(
      button("✏️", { size: "xs", tooltip: "Edit", ariaLabel: "Edit", onClick: () => startEditing(index) }),
      button("🗑️", { size: "xs", tooltip: "Delete", ariaLabel: "Delete", onClick: () => remove(index) }),
    );
    row.append(showSummary(document.createElement("div"), recipe), actions);
    return row;
  }

  function repaint() {
    title.textContent = `${state.lockMode === "ALLOW" ? "Allow" : "Lock"} when any recipe row matches (OR between rows)`;
    addButton.setEnabled(editingIndex === null);
    list.replaceChildren();
    state.weatherRecipes.forEach((recipe, index) => {
      normalizeRecipe(recipe);
      list.appendChild(index === editingIndex ? editingRow(index) : savedRow(recipe, index));
    });
    if (editingIndex !== null && editingIndex === state.weatherRecipes.length) {
      list.appendChild(editingRow(editingIndex));
    }
    if (!list.childElementCount) {
      const empty = document.createElement("div");
      empty.className = "lk-empty";
      empty.textContent = "No recipe rows yet.";
      list.appendChild(empty);
    }
  }

  repaint();
  return { root, refresh: repaint };
}
