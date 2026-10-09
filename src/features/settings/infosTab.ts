// The Infos tab: mod and game versions, where the mod runs, and the Ko-fi link.

import { gameVersion } from "../../game/gameVersion";
import { detectEnvironment, type EnvironmentInfo } from "../../platform/environment";
import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { openLink } from "../tools/openLink";
import { ensureSettingsStyles } from "./styles";
import { versionPill } from "./versionPill";

const KOFI_URL = "https://ko-fi.com/E1E11TWTM1";
const KOFI_TITLE = "Buy Me a Coffee at ko-fi.com";

function describeSurface(env: EnvironmentInfo | null): string {
  if (!env) return "n/a";
  return env.surface === "discord" ? "Discord" : "Web";
}

function describePlatform(env: EnvironmentInfo | null, nav: Navigator | null): string {
  if (!env) return "n/a";
  if (env.platform === "desktop") return "Desktop";
  if (env.platform === "mobile") {
    const ua = nav?.userAgent ?? "";
    if (/tablet|ipad|playbook|silk|kindle/i.test(ua)) return "Mobile (Tablet)";
    if (/mobile|iphone|ipod|android/i.test(ua)) return "Mobile (Phone)";
    return "Mobile";
  }
  return env.platform;
}

function detectOsLabel(nav: Navigator | null): string {
  const target = `${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`.toLowerCase();
  if (!target.trim()) return "n/a";
  // Order matters: Android user agents also say "Linux".
  if (/windows/.test(target)) return "Windows";
  if (/mac os|macintosh|darwin/.test(target)) return "macOS";
  if (/android/.test(target)) return "Android";
  if (/iphone|ipad|ipod/.test(target)) return "iOS";
  if (/linux/.test(target)) return "Linux";
  if (/cros/.test(target)) return "Chrome OS";
  if (/freebsd/.test(target)) return "FreeBSD";
  if (/sunos|solaris/.test(target)) return "Solaris";
  return nav?.platform || nav?.userAgent || "Unknown";
}

/**
 * Inside Discord a plain link does not open, so the button opens the page
 * through the userscript manager. Elsewhere it is a real link dressed as a
 * kit button.
 */
function kofiLink(isDiscord: boolean): HTMLElement {
  if (isDiscord) {
    return button("Support on Ko-fi", {
      variant: "primary",
      title: KOFI_TITLE,
      onClick: () => void openLink(KOFI_URL),
    });
  }
  const link = h("a", "qmm-btn qmm-btn--primary qws-set-link-btn", "Support on Ko-fi");
  link.href = KOFI_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = KOFI_TITLE;
  return link;
}

export function renderInfosTab(view: HTMLElement): void {
  ensureSettingsStyles();
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const environment = typeof window !== "undefined" ? detectEnvironment() : null;

  const hero = h("div", "qws-set-hero");
  hero.append(
    h("div", "qws-set-hero__title", "Arie's Mod"),
    versionPill(),
    h("div", "qws-set-hero__sub", "A userscript for Magic Garden"),
  );

  const host = environment?.host || (typeof location !== "undefined" ? location.hostname : "") || "n/a";
  const runtimeRows: Array<[string, string]> = [
    ["Game version", gameVersion ?? "unknown"],
    ["Host", host],
    ["Surface", describeSurface(environment)],
    ["Platform", describePlatform(environment, nav)],
    ["OS", detectOsLabel(nav)],
  ];
  const details = card("Details");
  const list = h("dl", "qws-set-facts");
  for (const [label, value] of runtimeRows) {
    const row = h("div", "qws-set-facts__row");
    row.append(h("dt", "qws-set-facts__label", label), h("dd", "qws-set-facts__value", value));
    list.appendChild(row);
  }
  details.body.appendChild(list);

  const support = card("Support the mod");
  support.body.classList.add("qws-set-stack");
  support.body.append(
    h(
      "div",
      "qws-set-note",
      "Some features rely on paid server hosting. If you enjoy the mod, a coffee is always appreciated!",
    ),
    kofiLink(environment?.surface === "discord"),
  );

  const tab = h("div", "qws-set-tab");
  tab.append(hero, details.root, support.root);
  view.replaceChildren(tab);
}
