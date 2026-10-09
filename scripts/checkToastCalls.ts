// Every toast the mod raises reads as intended.
//
// `toastSimple(title, description, variant)` takes the variant third. The
// room menu's "Save player garden" passed "success" second, so the toast body
// read the word "success" in the default info colour. This reads every
// `toastSimple(...)` call in src/ and fails on a variant name in the
// description slot with no variant after it.
//
// The debug menu called `window.toastSimple`, which nothing has ever exposed,
// so its "Copied" toast and its warnings never appeared. Toasts come from the
// `ui/toast` import, never from a global.

import { check, done } from "./_check";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");
const VARIANTS = new Set(["success", "error", "info", "warn"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

/** The top-level arguments of the call whose `(` is at `open`, as source text. */
function callArguments(text: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = open + 1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        args.push(text.slice(start, i).trim());
        return args.filter(Boolean);
      }
    } else if (c === "," && depth === 1) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  return args;
}

const variantLiteral = (arg: string | undefined) => {
  const m = /^["'`](\w+)["'`]$/.exec(arg ?? "");
  return !!m && VARIANTS.has(m[1]);
};

const where = (file: string, text: string, index: number) =>
  `${relative(process.cwd(), file)}:${text.slice(0, index).split("\n").length}`;

const misplaced: string[] = [];
const throughWindow: string[] = [];
let calls = 0;
for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, "utf8");

  const global = /\bwindow(?:\s+as\s+\w+\))?\??\.\s*toastSimple\b/g;
  for (let m = global.exec(text); m; m = global.exec(text)) throughWindow.push(where(file, text, m.index));

  const re = /\btoastSimple\s*\(/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (/function\s+$/.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;
    calls++;
    const args = callArguments(text, m.index + m[0].length - 1);
    if (args.length === 2 && variantLiteral(args[1])) misplaced.push(where(file, text, m.index));
  }
}

check("toastSimple calls were found (sanity)", calls > 10, String(calls));
check("no toast passes its variant as the description", misplaced.length === 0, misplaced.join(", "));
check("no code looks for toastSimple on window", throughWindow.length === 0, throughWindow.join(", "));

done();
