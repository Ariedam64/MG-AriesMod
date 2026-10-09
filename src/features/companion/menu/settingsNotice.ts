// The warning on an action whose settings were never opened.
//
// It blocks nothing: the action works fine with its defaults, and barring the
// way of someone who just wants to try would be a nuisance. It says what the
// companion will do without instructions and puts the settings screen one click
// away, then goes for good once that screen has been opened.

import { button } from "../../../ui/kit/button";
import { isUnreviewed, type SettingsGroup } from "../state";
import { part } from "./dom";

/**
 * A banner, or a hidden element if the group was already looked at.
 *
 * The caller adds it unconditionally: deciding here rather than at the call
 * site keeps three popups from each forgetting to ask.
 */
export function settingsNotice(group: SettingsGroup, what: string, onOpen: () => void): HTMLElement {
  const root = part("div", "qws-cmp-notice");
  // Hidden rather than empty: an empty element still counts in a flex column
  // and would leave a gap at the top of every popup.
  if (!isUnreviewed(group)) {
    root.hidden = true;
    return root;
  }
  root.append(part("div", "qws-cmp-notice__text", what), button("Set up", { size: "sm", onClick: onOpen }));
  return root;
}
