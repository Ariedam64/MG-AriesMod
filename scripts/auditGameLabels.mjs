// Lists the game names the mod relies on that a downloaded game bundle no longer has.
//
//   node scripts/auditGameLabels.mjs C:/tmp/mg1449
//
// The mod finds jotai atoms by their debugLabel, and a missing label fails
// silently: `get` returns undefined and `onChange` never fires. This reads
// every label the mod asks for in src/ and checks it against the bundle.
// An aliased atom (`makeAliasedAtom([...])`) passes when any of its names
// is there. Not a check suite: it needs a crawled bundle, see the memory note
// `live-game-bundle-download` for how to fetch one.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const bundleDir = process.argv[2];
if (!bundleDir) {
  console.error("usage: node scripts/auditGameLabels.mjs <crawled bundle dir>");
  process.exit(2);
}

const bundle = readdirSync(bundleDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => readFileSync(join(bundleDir, name), "utf8"))
  .join("\n");
const liveLabels = new Set([...bundle.matchAll(/debugLabel\s*=\s*[`"']([^`"']+)[`"']/g)].map((m) => m[1]));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });
}

const missing = [];
for (const file of walk(join(process.cwd(), "src"))) {
  const text = readFileSync(file, "utf8");
  const rel = file.slice(process.cwd().length + 1).replace(/\\/g, "/");
  // Aliased atoms: one of the names is enough.
  for (const m of text.matchAll(/makeAliasedAtom[^(]*\(\s*\[([^\]]*)\]/g)) {
    const names = [...m[1].matchAll(/["'`]([A-Za-z0-9_]+Atom)["'`]/g)].map((x) => x[1]);
    if (names.length && !names.some((n) => liveLabels.has(n))) missing.push(`${rel}: none of ${names.join(", ")}`);
  }
  const withoutAliases = text.replace(/makeAliasedAtom[^(]*\(\s*\[[^\]]*\]/g, "");
  for (const m of withoutAliases.matchAll(/(?:makeAtom|makeView|getAtomByLabel|waitForAtom|hasAtom)[^(]*\(\s*["'`]([A-Za-z0-9_]+Atom)["'`]/g)) {
    if (!liveLabels.has(m[1])) missing.push(`${rel}: ${m[1]}`);
  }
}

console.log(`${liveLabels.size} labels in the bundle`);
if (missing.length) {
  console.log(`${missing.length} names the mod uses are missing:`);
  for (const line of [...new Set(missing)].sort()) console.log(`  ${line}`);
  process.exit(1);
}
console.log("every label the mod uses is in the bundle");
