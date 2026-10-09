// Bundles and runs the check suites.
//
//   node scripts/runChecks.mjs              every suite (what `npm run check` does)
//   node scripts/runChecks.mjs cropsize     one suite (what `npm run check:cropsize` does)
//   node scripts/runChecks.mjs lib chat     several
//
// Each suite is bundled by esbuild into node_modules/.cache and run in its own
// node process from the repo root. A new suite goes in SUITES below and gets a
// `check:<name>` entry in package.json; a full run fails if the two disagree
// or if a scripts/check*.ts file is in neither.

import esbuild from "esbuild";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "node_modules", ".cache");

/**
 * What a suite needs in place before its bundle loads:
 * - "dom-stub": scripts/_nodeStub.cjs, an inert window, document and storage, for suites that pull in UI code
 * - "window": `window` aliased to the global and an empty `document`
 * - "window-storage": the same, plus a `localStorage` that stores nothing
 */
const PRELUDES = {
  window: "globalThis.window=globalThis;globalThis.document={};",
  "window-storage":
    "globalThis.window=globalThis;globalThis.document={};globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};",
};

/** name -> [suite file in scripts/ without .ts, environment] */
const SUITES = {
  stats: ["checkTeamStats", "window"],
  identity: ["checkPlayerIdentity"],
  commands: ["checkQuinoaCommands", "dom-stub"],
  sprites: ["checkSpriteResolver"],
  cropsize: ["checkCropSize", "window"],
  harvestfilters: ["checkHarvestFilters", "window"],
  locker: ["checkLockerDefaults", "window-storage"],
  lockerrules: ["checkLockerRules", "window-storage"],
  lockerslot: ["checkLockerSlot", "dom-stub"],
  lockermenu: ["checkLockerMenu"],
  sellallpetsconfirm: ["checkSellAllPetsConfirm"],
  abilitylogs: ["checkAbilityLogIds", "dom-stub"],
  growslot: ["checkGrowSlot"],
  tilecapture: ["checkTileCapture", "window"],
  deleters: ["checkDeleterSources", "window"],
  chat: ["checkCompanionChat", "dom-stub"],
  companion: ["checkCompanionMovement"],
  reactions: ["checkCompanionReactions"],
  wander: ["checkCompanionWander"],
  mirror: ["checkCompanionMirror"],
  afk: ["checkCompanionAfk"],
  watch: ["checkCompanionWatch", "dom-stub"],
  batch: ["checkCompanionBatch"],
  dialogue: ["checkCompanionDialogue"],
  storage: ["checkCompanionStorage"],
  croppricetoggle: ["checkCropPriceSetting"],
  teamsync: ["checkPetTeamSync"],
  shoppurchases: ["checkShopPurchases"],
  shopmessage: ["checkShopPurchaseMessage"],
  moveitem: ["checkMoveItemMessage"],
  modalstate: ["checkModalState"],
  activitylogmodal: ["checkActivityLogModal"],
  discordframes: ["checkDiscordFrames"],
  menutabs: ["checkMenuTabs", "dom-stub"],
  lib: ["checkLib"],
  environment: ["checkEnvironment"],
  storagesections: ["checkStorageSections"],
  cataloglive: ["checkCatalogLive", "dom-stub"],
  abilitycolors: ["checkAbilityChipColors", "dom-stub"],
  outgoing: ["checkOutgoingRules", "dom-stub"],
  calculator: ["checkCalculator", "window"],
  inventorysort: ["checkInventorySort", "dom-stub"],
  petteamhotkeys: ["checkPetTeamHotkeys", "dom-stub"],
  editor: ["checkEditorModel", "dom-stub"],
  editorpanels: ["checkEditorPanels", "dom-stub"],
  shopalerts: ["checkShopAlerts", "dom-stub"],
  alertsounds: ["checkAlertSounds"],
  kithidden: ["checkKitHidden"],
  toastcalls: ["checkToastCalls"],
  spawntiles: ["checkSpawnTiles", "dom-stub"],
  inventoryfriends: ["checkInventoryFriendBonus", "dom-stub"],
  debugsockets: ["checkDebugSocketCapture"],
  ghostmode: ["checkGhostMode"],
  inventorysummary: ["checkInventoryValueSummary", "dom-stub"],
  floating: ["checkFloating", "dom-stub"],
  speech: ["checkCompanionSpeech", "dom-stub"],
  gametoasts: ["checkGameToasts", "dom-stub"],
  liveatoms: ["checkLiveAtoms", "dom-stub"],
  stagewatch: ["checkStageWatch", "dom-stub"],
  visiblerefresh: ["checkVisibleRefresh", "dom-stub"],
  contrast: ["checkContrast"],
  kitstyles: ["checkKitStyles"],
  dock: ["checkDock", "dom-stub"],
  huddock: ["checkHudDock", "dom-stub"],
  themecolors: ["checkThemeColors"],
  modversion: ["checkModVersion"],
  accent: ["checkAccent"],
  appearance: ["checkAppearance", "dom-stub"],
  keybindsmenu: ["checkKeybindsMenu", "dom-stub"],
  toolslist: ["checkToolsList", "dom-stub"],
};

/** Problems with how suites are registered: a file with no entry, or package.json out of step. */
function registrationProblems() {
  const problems = [];
  const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts ?? {};
  const files = new Set(Object.values(SUITES).map(([file]) => file));
  for (const name of readdirSync(join(ROOT, "scripts"))) {
    const match = /^(check\w+)\.ts$/.exec(name);
    if (match && !files.has(match[1])) problems.push(`scripts/${name} is not in SUITES in scripts/runChecks.mjs`);
  }
  for (const name of Object.keys(SUITES)) {
    const want = `node scripts/runChecks.mjs ${name}`;
    if (scripts[`check:${name}`] !== want) problems.push(`package.json needs "check:${name}": "${want}"`);
  }
  for (const key of Object.keys(scripts)) {
    if (key.startsWith("check:") && !(key.slice(6) in SUITES)) problems.push(`package.json has ${key}, which is not in SUITES`);
  }
  return problems;
}

async function bundle(name) {
  const [file] = SUITES[name];
  const outfile = join(CACHE, `${file}.cjs`);
  await esbuild.build({
    entryPoints: [join(ROOT, "scripts", `${file}.ts`)],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    logLevel: "error",
  });
  return outfile;
}

function nodeArgs(name, outfile) {
  const env = SUITES[name][1];
  if (env === "dom-stub") return ["-r", join(ROOT, "scripts", "_nodeStub.cjs"), outfile];
  if (env in PRELUDES) return ["-e", `${PRELUDES[env]}require(${JSON.stringify(outfile)})`];
  if (env) throw new Error(`unknown environment "${env}" for suite ${name}`);
  return [outfile];
}

/** Runs one suite. With `inherit`, its output goes straight to the terminal; otherwise it is collected. */
async function runSuite(name, inherit) {
  let outfile;
  try {
    outfile = await bundle(name);
  } catch (error) {
    return { name, code: 1, output: `bundling failed: ${error.message}\n` };
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, nodeArgs(name, outfile), {
      cwd: ROOT,
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.stderr?.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ name, code: code ?? 1, output }));
  });
}

async function runAll(names) {
  const results = [];
  const queue = [...names];
  const workers = Array.from({ length: Math.min(availableParallelism(), names.length) }, async () => {
    for (let name = queue.shift(); name; name = queue.shift()) results.push(await runSuite(name, false));
  });
  await Promise.all(workers);

  const failed = [];
  for (const name of names) {
    const result = results.find((r) => r.name === name);
    if (result.code === 0) {
      console.log(`ok    ${name}`);
    } else {
      failed.push(name);
      console.log(`FAIL  ${name}`);
      process.stdout.write(result.output);
    }
  }
  console.log(`\n${names.length - failed.length}/${names.length} suites passed`);
  if (failed.length) console.log(`failed: ${failed.join(", ")}`);
  return failed.length === 0;
}

const requested = process.argv.slice(2);
const unknown = requested.filter((name) => !(name in SUITES));
if (unknown.length) {
  console.error(`unknown suite: ${unknown.join(", ")}\nknown: ${Object.keys(SUITES).join(", ")}`);
  process.exit(2);
}

if (requested.length === 1) {
  const { code } = await runSuite(requested[0], true);
  process.exit(code);
}

const names = requested.length ? requested : Object.keys(SUITES);
let ok = await runAll(names);
if (!requested.length) {
  const problems = registrationProblems();
  for (const problem of problems) console.log(`FAIL  ${problem}`);
  if (problems.length) ok = false;
}
process.exit(ok ? 0 : 1);
