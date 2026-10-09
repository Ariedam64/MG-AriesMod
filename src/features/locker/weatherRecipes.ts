// The weather recipe editor: rows of weather tags, where a crop matches a row
// when it carries every tag of it, and the filter matches when any row does.

import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
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
    const tag = h("div", "lk-tag");
    tag.append(weatherIcon(key, 18), h("span", undefined, label));
    summary.appendChild(tag);
  }
  if (!tags.length) summary.appendChild(h("div", "lk-empty", "Pick at least one effect below."));
  return summary;
}

export function weatherRecipeEditor(state: SettingsDraft, onChange: () => void): RecipeEditor {
  const root = h("div", "lk-recipes");

  const title = h("div", "lk-hint");
  const addButton = button("Add recipe", {
    size: "sm",
    variant: "primary",
    onClick: () => startEditing(state.weatherRecipes.length),
  });
  const head = h("div", "lk-recipes__head");
  head.append(title, addButton);

  const list = h("div", "lk-recipes__list");
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
    const row = h("div", "lk-recipe is-editing");
    const summary = showSummary(h("div"), draft);

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

    const actions = h("div", "lk-recipe__actions");
    if (index < state.weatherRecipes.length) {
      actions.append(button("Delete", { size: "sm", variant: "ghost", onClick: () => remove(index) }));
    }
    actions.append(
      h("div", "qmm-spacer"),
      button("Cancel", { size: "sm", onClick: stopEditing }),
      button("Save", { size: "sm", variant: "primary", onClick: commit }),
    );
    row.append(summary, grid, actions);
    return row;
  }

  function savedRow(recipe: Set<string>, index: number): HTMLElement {
    const row = h("div", "lk-recipe");
    const actions = h("div", "lk-recipe__actions");
    actions.append(
      button("Edit", { size: "xs", onClick: () => startEditing(index) }),
      button("Delete", { size: "xs", variant: "ghost", onClick: () => remove(index) }),
    );
    row.append(showSummary(h("div"), recipe), actions);
    return row;
  }

  function repaint() {
    title.textContent = `A crop with every effect of a recipe is ${state.lockMode === "ALLOW" ? "allowed" : "locked"}.`;
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
      list.appendChild(h("div", "lk-empty-state", "No recipes yet. Add one with the button above."));
    }
  }

  repaint();
  return { root, refresh: repaint };
}
