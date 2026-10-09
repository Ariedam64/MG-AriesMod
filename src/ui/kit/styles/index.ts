// The kit's one stylesheet: theme variables plus every component rule.
//
// Components call `ensureKitStyles()` when they build their first element, so
// a menu that only ever uses a slider still gets styled, and nothing is
// injected at import time (document-start, before there is a head).

import { themeVariables } from "../theme";
import { chromeCss } from "./chrome";
import { containersCss } from "./containers";
import { controlsCss } from "./controls";

const STYLE_ID = "qmm-kit-css";
const FONT_ID = "qmm-kit-font";
const FONT_URL = "https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap";
let injected = false;

/** The whole kit stylesheet. */
export function kitCss(): string {
  return [themeVariables(), chromeCss, controlsCss, containersCss].join("\n");
}

export function ensureKitStyles(): void {
  if (injected) return;
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  injected = true;
  const parent = document.head || document.documentElement;
  // The font loads on its own; until it does, or if a page blocks it, the
  // system font in the stack stands in and nothing waits for it.
  if (!document.getElementById(FONT_ID)) {
    const link = document.createElement("link");
    link.id = FONT_ID;
    link.rel = "stylesheet";
    link.href = FONT_URL;
    parent.appendChild(link);
  }
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = kitCss();
  parent.appendChild(style);
}
