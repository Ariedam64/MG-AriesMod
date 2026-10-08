import { h } from "../../ui/kit/dom";

/** The tag chips under a tool, on its list card and in its detail header. */
export function createTagRow(tags: string[]): HTMLElement {
  const row = h("div", "mgt-tags");
  for (const tag of tags) row.appendChild(h("span", "mgt-tag", tag));
  return row;
}
