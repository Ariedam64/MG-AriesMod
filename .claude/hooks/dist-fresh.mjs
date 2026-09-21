// Blocks a commit whose dist/ is older than the sources that built it.
//
// The version lives in meta.userscript.js and dist/quinoa-ws.min.user.js is
// committed, so a bump that is not followed by a build ships the old code under
// a new number. That is easy to do and invisible afterwards: the commit looks
// complete, and the userscript updates to a build that does not contain the fix.
//
// Runs as a PreToolUse hook on Bash. Exit 2 blocks the call and hands stderr
// back to Claude; anything else lets it through.

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

// Resolve against the repo, not whatever directory the hook was spawned in.
// Without this a shifted cwd makes every path missing, and the check would wave
// the commit through while looking like it ran.
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const DIST = join(ROOT, "dist/quinoa-ws.min.user.js");
const WATCHED = ["src", "meta.userscript.js"].map((path) => join(ROOT, path));

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/** Newest mtime under a file or directory, skipping node_modules. */
function newestMtime(path) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;

  let newest = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const found = newestMtime(join(path, entry.name));
    if (found > newest) newest = found;
  }
  return newest;
}

function allow() {
  process.exit(0);
}

const raw = readStdin();
let command = "";
try {
  command = JSON.parse(raw)?.tool_input?.command ?? "";
} catch {
  allow();
}

// Only a real commit. `git commit` appearing inside a heredoc body, a -m string
// or a `git log` format is not one, so require it at the start of a statement.
if (!/(^|[;&|]\s*|\n\s*)git\s+(-[^\s]+\s+)*commit(\s|$)/.test(command)) allow();

// Amending metadata or committing with nothing staged in dist is not a release.
if (/--amend/.test(command)) allow();

const distMtime = newestMtime(DIST);
// No dist at all means this repo does not ship one; not our business.
if (distMtime === 0) allow();

const stale = WATCHED.map((path) => ({ path, mtime: newestMtime(path) }))
  .filter((entry) => entry.mtime > distMtime);

if (stale.length === 0) allow();

const ages = stale
  .map((entry) => `  ${relative(ROOT, entry.path)} is ${Math.round((entry.mtime - distMtime) / 1000)}s newer`)
  .join("\n");

process.stderr.write(
  `Commit blocked: ${relative(ROOT, DIST)} is older than the sources.\n\n${ages}\n\n` +
    `The version lives in meta.userscript.js and dist/ is committed, so committing now\n` +
    `would ship the previous build under the new number.\n\n` +
    `Run "npm run build", check the @version inside ${relative(ROOT, DIST)}, then commit again.\n`,
);
process.exit(2);
