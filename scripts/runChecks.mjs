// Runs every `check:*` script from package.json and reports which ones failed.
//
// `npm run check` is the one command to run before shipping. Each suite still
// runs on its own with `npm run check:<name>`.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
const names = Object.keys(scripts).filter((name) => name.startsWith("check:"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const failed = [];
for (const name of names) {
  const result = spawnSync(npm, ["run", "-s", name], { encoding: "utf8", shell: process.platform === "win32" });
  if (result.status === 0) {
    console.log(`ok    ${name}`);
  } else {
    failed.push(name);
    console.log(`FAIL  ${name}`);
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
}

console.log(`\n${names.length - failed.length}/${names.length} suites passed`);
if (failed.length) {
  console.log(`failed: ${failed.join(", ")}`);
  process.exit(1);
}
