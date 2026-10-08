// Every toast the mod raises reads as intended.
//
// `toastSimple(title, description, variant)` takes the variant third. The
// room menu's "Save player garden" passed "success" second, so the toast body
// read the word "success" in the default info colour. This reads every
// `toastSimple(...)` call in src/ and fails on a variant name in the
// description slot with no variant after it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : `: ${detail}`}`);
};

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

const misplaced: string[] = [];
let calls = 0;
for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, "utf8");
  const re = /\btoastSimple\s*\(/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (/function\s+$/.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;
    calls++;
    const args = callArguments(text, m.index + m[0].length - 1);
    if (args.length === 2 && variantLiteral(args[1])) {
      const line = text.slice(0, m.index).split("\n").length;
      misplaced.push(`${relative(process.cwd(), file)}:${line}`);
    }
  }
}

check("toastSimple calls were found (sanity)", calls > 10, String(calls));
check("no toast passes its variant as the description", misplaced.length === 0, misplaced.join(", "));

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall toast call checks passed");
