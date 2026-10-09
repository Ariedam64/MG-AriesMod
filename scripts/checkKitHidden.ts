// Every kit element honours the `hidden` attribute.
//
// The browser hides `[hidden]` through its own stylesheet, and any author rule
// that sets `display` wins over it. `.qmm-btn` sets `display: inline-flex`, so
// the deleter's Pause, Resume and Stop buttons, which toggle `hidden`, were all
// on screen at once. The kit stylesheet has to restate `display: none` for
// hidden kit elements, strongly enough to beat its own compound selectors.

import { check, done } from "./_check";
import { chromeCss } from "../src/ui/kit/styles/chrome";
import { containersCss } from "../src/ui/kit/styles/containers";
import { controlsCss } from "../src/ui/kit/styles/controls";

type Rule = { selectors: string[]; body: string };

function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    rules.push({ selectors: m[1].split(",").map((s) => s.trim()).filter(Boolean), body: m[2] });
  }
  return rules;
}

const rules = parseRules([chromeCss, controlsCss, containersCss].join("\n"));

// The kit elements a rule gives a visible `display` to, each as the classes
// the element carries: every one of them would override the browser's
// `[hidden]` rule.
const isKitClass = (cls: string) => /^(qmm|qws)/.test(cls);
const displayed = new Map<string, string[]>();
for (const rule of rules) {
  const display = /(?:^|;)\s*display\s*:\s*([^;!]+)/.exec(rule.body)?.[1]?.trim();
  if (!display || display === "none") continue;
  for (const selector of rule.selectors) {
    const last = selector.split(/\s+|>/).filter(Boolean).pop() ?? "";
    const classes = (last.match(/\.[\w-]+/g) ?? []).map((cls) => cls.slice(1));
    if (classes.some(isKitClass)) displayed.set(last, classes);
  }
}

// The rules that hide a `[hidden]` element whatever else applies to it.
const hiders = rules
  .filter((rule) => /display\s*:\s*none\s*!important/.test(rule.body))
  .flatMap((rule) => rule.selectors)
  .filter((selector) => selector.includes("[hidden]"));

function hiddenRuleCovers(cls: string): boolean {
  return hiders.some((selector) => {
    if (selector === `.${cls}[hidden]`) return true;
    const contains = /^\[class\*="([^"]+)"\]\[hidden\]$/.exec(selector);
    return !!contains && cls.includes(contains[1]);
  });
}

check("the kit gives some classes a display (sanity)", displayed.has(".qmm-btn"));
check("there is a forced rule for hidden kit elements", hiders.length > 0);
const uncovered = [...displayed]
  .filter(([, classes]) => !classes.some(hiddenRuleCovers))
  .map(([compound]) => compound);
check("every kit class with a display hides when [hidden]", uncovered.length === 0, uncovered.join(", "));
check("a hidden .qmm-btn is hidden", hiddenRuleCovers("qmm-btn"));

done();
