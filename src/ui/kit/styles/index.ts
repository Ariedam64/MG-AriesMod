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
let injected = false;

export function ensureKitStyles(): void {
  if (injected) return;
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  injected = true;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [themeVariables(), chromeCss, controlsCss, containersCss].join("\n");
  (document.head || document.documentElement).appendChild(style);
}
