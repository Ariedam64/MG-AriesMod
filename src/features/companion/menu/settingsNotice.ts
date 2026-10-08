// The warning on an action whose settings were never opened.
//
// It blocks nothing: the action works fine with its defaults, and barring the
// way of someone who just wants to try would be a nuisance. It says what the
// companion will do without instructions and puts the settings screen one click
// away, then goes for good once that screen has been opened.

import { button } from "../../../ui/kit/button";
import { color } from "../../../ui/kit/theme";
import { isUnreviewed, type SettingsGroup } from "../state";
import { styled } from "./dom";

/**
 * A banner, or an empty element if the group was already looked at.
 *
 * The caller adds it unconditionally: deciding here rather than at the call
 * site keeps three popups from each forgetting to ask.
 */
export function settingsNotice(group: SettingsGroup, what: string, onOpen: () => void): HTMLElement {
  if (!isUnreviewed(group)) {
    // An empty element still counts in a flex column: without this it would
    // leave a gap the size of `gap` at the top of every popup.
    return styled("div", { display: "none" });
  }

  const root = styled("div", {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    borderRadius: "12px",
    background: color.warnSoft,
    border: `1px solid ${color.border}`,
    flex: "0 0 auto",
  });
  const open = button("Set up", { size: "sm", onClick: onOpen });
  open.style.flex = "0 0 auto";
  root.append(styled("div", { fontSize: "11.5px", lineHeight: "1.5", color: color.text, flex: "1", minWidth: "0" }, what), open);
  return root;
}
