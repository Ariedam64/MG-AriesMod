# Activity Log Pixi Filter + 500-Entry History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the "filter activity log by action" mod feature under the game's now-Pixi-rendered Activity Log modal, and keep the existing 500-entry history feature working through it, without touching individual Pixi row nodes.

**Architecture:** Filtering happens entirely at the data layer — the mod re-patches the same `Atoms.data.myData.activityLogs` atom it already patches for the 500-entry history, with a classified/filtered subset, and lets the modal's own reactive Pixi rendering (unchanged, untouched) redraw itself. The only new Pixi UI is a filter-button toolbar injected into the live modal's container (found by its `.label`), positioned between the title and the divider.

**Tech Stack:** TypeScript (strict, no `any` beyond the untyped Pixi/game-internal boundary — consistent with how the rest of `src/utils/*Pixi.ts` already treats Pixi nodes as `any`), esbuild bundling, no test runner (this repo has none — see Global Constraints).

## Global Constraints

- This repo has **no automated test framework** (no `jest`/`vitest` in `package.json`, no `*.test.ts` files, no `test` script). Every task's verification step is `npm run build` (esbuild — catches syntax errors, not type errors, since there's no `tsc`/typecheck script either) plus **manual verification in the running game** via the existing local dev workflow (`npm run watch` + the Tampermonkey loader). Do not introduce a test framework as part of this feature — out of scope.
- Follow existing file conventions: Pixi-integration modules live in `src/utils/*Pixi.ts` (see `src/utils/sellAllPetsPixi.ts`, `src/utils/gardenInfoCardPixi.ts`), reuse `getSpriteState()`/`getStage()`/`findAcrossBranches()`/`findGraphicsCtor()` from `src/utils/gardenInfoCardPixi.ts` rather than re-deriving Pixi hooking.
- Storage keys go through `readAriesPath`/`writeAriesPath` (`src/utils/localStorage.ts`), never raw `GM_getValue`/`GM_setValue`.
- No hardcoded pixel constants scraped from the minified game bundle — all positioning must be derived from live node positions/sizes read at runtime (`title.position`, `title.textHeight`, etc.), not copied numeric literals from `docs/main-Brp3BbpW.js`.

---

### Task 1: Extract classification logic into a pure module

**Files:**
- Create: `src/utils/activityLogClassification.ts`
- Modify: none (the old `src/utils/activityLogFilter.ts` is deleted in Task 5, after Task 2 stops needing to reference it)

**Interfaces:**
- Produces: `ActionKey` (type), `ACTION_ORDER: ActionKey[]`, `ACTION_LABELS: Record<string, string>`, `classifyEntryAction(action: string | null | undefined): ActionKey`, `getActionLabel(action: ActionKey): string`, `mergeActions(actions: ActionKey[]): ActionKey[]`.

This is a pure, DOM-free, Pixi-free module — the entry classification logic from the old DOM-based `src/utils/activityLogFilter.ts`, simplified: the old code had a `PATTERNS` regex fallback that guessed a category from *rendered text* when no `data-action` attribute was present in the DOM. That fallback is no longer needed — every activity log entry already carries a real `.action` string in its data (confirmed in `src/services/activityLogHistory.ts`'s `ActivityLogEntry` type and in the game's own `kV(e,t)` switch-on-`e.action` seen in `docs/main-Brp3BbpW.js`), so classification is always exact.

- [ ] **Step 1: Write `src/utils/activityLogClassification.ts`**

```typescript
// src/utils/activityLogClassification.ts
// Pure classification of activity-log entries into filter categories, keyed
// off the entry's own `.action` field (the game's own action-dispatch
// identifier, e.g. "harvest", "sellPet", "EggGrowthBoostII"). No DOM, no
// Pixi, no text/sprite parsing — every entry already carries this field, so
// classification is always exact.

export type ActionKey =
  | "all"
  | "found"
  | "buy"
  | "sell"
  | "harvest"
  | "plant"
  | "feed"
  | "hatch"
  | "water"
  | "coinFinder"
  | "seedFinder"
  | "double"
  | "eggGrowth"
  | "plantGrowth"
  | "granter"
  | "kisser"
  | "refund"
  | "boost"
  | "remove"
  | "other"
  | string;

export const ACTION_ORDER: ActionKey[] = [
  "all",
  "found",
  "buy",
  "sell",
  "harvest",
  "plant",
  "feed",
  "hatch",
  "water",
  "coinFinder",
  "seedFinder",
  "double",
  "eggGrowth",
  "plantGrowth",
  "granter",
  "kisser",
  "refund",
  "boost",
  "remove",
  "other",
];

export const ACTION_LABELS: Record<string, string> = {
  all: "All",
  found: "Finds",
  buy: "Purchases",
  sell: "Sold",
  harvest: "Harvests",
  plant: "Planted",
  feed: "Feed",
  hatch: "Hatch",
  water: "Water",
  coinFinder: "Coin Finder",
  seedFinder: "Seed Finder",
  double: "Double",
  eggGrowth: "Egg Growth",
  plantGrowth: "Plant Growth",
  granter: "Granters",
  kisser: "Kissers",
  refund: "Refunds",
  boost: "Boosts",
  remove: "Remove",
  other: "Other",
};

const ACTION_MAP: Record<string, ActionKey> = {
  purchaseDecor: "buy",
  purchaseSeed: "buy",
  purchaseEgg: "buy",
  purchaseTool: "buy",
  upgradePetHutch: "buy",
  upgradeDecorShed: "buy",
  upgradeSeedSilo: "buy",
  waterPlant: "water",
  plantSeed: "plant",
  plantGardenPlant: "plant",
  potPlant: "plant",
  removeGardenObject: "remove",
  preserve: "remove",
  harvest: "harvest",
  feedPet: "feed",
  feedPetFromTrough: "feed",
  plantEgg: "hatch",
  hatchEgg: "hatch",
  instaGrow: "boost",
  customRestock: "boost",
  spinSlotMachine: "boost",
  sellAllCrops: "sell",
  sellPet: "sell",
  logItems: "boost",
  mutationPotion: "boost",
  cropCleanser: "boost",
  dawnCapture: "boost",
  openDawnCapsule: "boost",
  thundercharge: "boost",
  replenishPotion: "boost",
  xpPotion: "boost",
  ProduceScaleBoost: "boost",
  ProduceScaleBoostII: "boost",
  ProduceScaleBoostIII: "boost",
  DoubleHarvest: "double",
  DoubleHatch: "double",
  ProduceEater: "boost",
  SellBoostI: "boost",
  SellBoostII: "boost",
  SellBoostIII: "boost",
  SellBoostIV: "boost",
  ProduceRefund: "boost",
  PlantGrowthBoost: "plantGrowth",
  PlantGrowthBoostII: "plantGrowth",
  PlantGrowthBoostIII: "plantGrowth",
  SnowyPlantGrowthBoost: "plantGrowth",
  DawnPlantGrowthBoost: "plantGrowth",
  AmberPlantGrowthBoost: "plantGrowth",
  ThunderPlantGrowthBoost: "plantGrowth",
  HungerRestore: "boost",
  HungerRestoreII: "boost",
  HungerRestoreIII: "boost",
  SnowyHungerRestore: "boost",
  GoldGranter: "granter",
  RainbowGranter: "granter",
  RainDance: "granter",
  SnowGranter: "granter",
  FrostGranter: "granter",
  DawnlitGranter: "granter",
  AmberlitGranter: "granter",
  ThunderstruckGranter: "granter",
  PetXpBoost: "boost",
  PetXpBoostII: "boost",
  PetXpBoostIII: "boost",
  SnowyPetXpBoost: "boost",
  DawnXpBoost: "boost",
  ThunderXpBoost: "boost",
  SnowyEggGrowthBoost: "eggGrowth",
  EggGrowthBoost: "eggGrowth",
  EggGrowthBoostII_NEW: "eggGrowth",
  EggGrowthBoostII: "eggGrowth",
  ThunderEggGrowthBoost: "eggGrowth",
  PetAgeBoost: "boost",
  PetAgeBoostII: "boost",
  PetAgeBoostIII: "boost",
  CoinFinderI: "coinFinder",
  CoinFinderII: "coinFinder",
  CoinFinderIII: "coinFinder",
  SnowyCoinFinder: "coinFinder",
  DawnCoinFinder: "coinFinder",
  ThunderCoinFinder: "coinFinder",
  SnowyCropSizeBoost: "boost",
  SnowyHungerBoost: "boost",
  SeedFinderI: "seedFinder",
  SeedFinderII: "seedFinder",
  SeedFinderIII: "seedFinder",
  SeedFinderIV: "seedFinder",
  PetHatchSizeBoost: "boost",
  PetHatchSizeBoostII: "boost",
  PetHatchSizeBoostIII: "boost",
  MoonKisser: "kisser",
  DawnKisser: "kisser",
  PetRefund: "refund",
  PetRefundII: "refund",
};

const ACTION_MAP_LOWER: Record<string, ActionKey> = Object.fromEntries(
  Object.entries(ACTION_MAP).map(([key, value]) => [key.toLowerCase(), value])
) as Record<string, ActionKey>;

/** Strips known ability-name suffixes/prefixes (Snowy/_NEW/roman numerals) to find a shared bucket for tiered abilities. */
export function normalizeAbilityAction(raw: string): ActionKey | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  let key = trimmed.replace(/^Snowy/i, "");
  key = key.replace(/_NEW$/i, "");
  key = key.replace(/(?:[_-]?(?:I|II|III|IV|V|VI|VII|VIII|IX|X)|\d+)$/i, "");
  key = key.replace(/[_-]+$/g, "");
  return key ? (key as ActionKey) : null;
}

/** Classifies an activity-log entry's `.action` field into a filter bucket. */
export function classifyEntryAction(action: string | null | undefined): ActionKey {
  const raw = String(action ?? "").trim();
  if (!raw) return "other";

  const lowered = raw.toLowerCase();
  const mapped = ACTION_MAP[raw];
  const mappedLower = ACTION_MAP_LOWER[lowered];
  const abilityKey = normalizeAbilityAction(raw);

  if (mapped) return mapped === "boost" && abilityKey ? abilityKey : mapped;
  if (mappedLower) return mappedLower === "boost" && abilityKey ? abilityKey : mappedLower;
  if (abilityKey) return abilityKey;
  return lowered || "other";
}

export function getActionLabel(action: ActionKey): string {
  const preset = ACTION_LABELS[action];
  if (preset) return preset;
  const spaced = String(action || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return String(action || "");
  return spaced
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Orders a set of present action keys per ACTION_ORDER; unknown keys are appended in encounter order. Never includes "all". */
export function mergeActions(actions: ActionKey[]): ActionKey[] {
  const seen = new Set<ActionKey>();
  const ordered: ActionKey[] = [];
  for (const key of ACTION_ORDER) {
    if (key === "all") continue;
    if (actions.includes(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  for (const action of actions) {
    if (action === "all") continue;
    if (!seen.has(action)) {
      seen.add(action);
      ordered.push(action);
    }
  }
  return ordered;
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: succeeds with no new errors (this file has no external dependencies beyond plain TypeScript, so failures would indicate a typo).

- [ ] **Step 3: Commit**

```bash
git add src/utils/activityLogClassification.ts
git commit -m "$(cat <<'EOF'
Add pure activity-log action classification module

Extracted from the old DOM-based activityLogFilter.ts, simplified to
classify directly from the entry's own .action field instead of
guessing from rendered text.
EOF
)"
```

---

### Task 2: Export `ActivityLogEntry` and build the filter data layer

**Files:**
- Modify: `src/services/activityLogHistory.ts:11` (export the entry type)
- Create: `src/utils/activityLogFilterPixi.ts`

**Interfaces:**
- Consumes: `classifyEntryAction(action)`, `ActionKey` from Task 1's `src/utils/activityLogClassification.ts`; `readAriesPath<T>(path, fallback?)` / `writeAriesPath<T>(path, value)` from `src/utils/localStorage.ts`; `shareGlobal(name, value)` from `src/utils/page-context.ts`; `getActivityLogHistory(): ActivityLogEntry[]` from `src/services/activityLogHistory.ts`; `fakeActivityLogShow(payload?, opts?)` from `src/services/fakeModal.ts`; `Atoms.ui.activeModal.get()/.onChange(cb)` from `src/store/atoms.ts`.
- Produces: `getActiveFilter(): ActionKey`, `setActiveFilter(filter: ActionKey): void`, `computeFilteredHistory(filter: ActionKey): ActivityLogEntry[]`, `getFilteredHistoryForReopen(): ActivityLogEntry[]`, `startActivityLogFilterPixi(): void` — all consumed by Task 4 (toolbar UI) and Task 5 (wiring).

This task builds the entire *data* side of the feature — filtering by re-patching the atom the modal already reads from — with **no Pixi UI yet**. It's independently verifiable: a developer can call the exposed debug functions from the browser console while the Activity Log modal is open and watch the rendered list actually narrow, proving the core mechanism works before any button exists.

- [ ] **Step 1: Export `ActivityLogEntry` from `activityLogHistory.ts`**

In `src/services/activityLogHistory.ts:11`, change:

```typescript
type ActivityLogEntry = {
```

to:

```typescript
export type ActivityLogEntry = {
```

- [ ] **Step 2: Write `src/utils/activityLogFilterPixi.ts` (data layer only)**

```typescript
// src/utils/activityLogFilterPixi.ts
// Restores the "filter activity log by action" mod feature under the game's
// Pixi-rendered Activity Log modal.
//
// Filtering happens at the data layer, not by touching individual Pixi rows:
// the modal reads its entries from `Atoms.data.myData.activityLogs` (the
// same atom `activityLogHistory.ts` already patches for the 500-entry
// history) and reactively rebuilds itself whenever that atom's value
// changes, including its own native "Show more" pagination. So filtering is
// just "patch that atom with a classified subset of the local history" —
// see docs/superpowers/specs/2026-07-30-activity-log-pixi-filter-design.md.
import { readAriesPath, writeAriesPath } from "./localStorage";
import { shareGlobal } from "./page-context";
import { classifyEntryAction, type ActionKey } from "./activityLogClassification";
import { getActivityLogHistory, type ActivityLogEntry } from "../services/activityLogHistory";
import { fakeActivityLogShow } from "../services/fakeModal";
import { Atoms } from "../store/atoms";

const FILTER_STORAGE_KEY = "activityLog.filter";
const ACTIVITY_LOG_MODAL_ID = "activityLog";

let activeFilter: ActionKey = loadPersistedFilter();
let modalOpen = false;

function loadPersistedFilter(): ActionKey {
  try {
    const stored = readAriesPath<string>(FILTER_STORAGE_KEY);
    return stored || "all";
  } catch {
    return "all";
  }
}

function persistFilter(filter: ActionKey): void {
  try {
    writeAriesPath(FILTER_STORAGE_KEY, String(filter));
  } catch {
  }
}

export function getActiveFilter(): ActionKey {
  return activeFilter;
}

/** Full local history (up to 500 entries) narrowed to the given filter. "all" returns it unfiltered. */
export function computeFilteredHistory(filter: ActionKey): ActivityLogEntry[] {
  const history = getActivityLogHistory();
  if (filter === "all") return history;
  return history.filter((entry) => classifyEntryAction(entry.action) === filter);
}

/** What activityLogHistory.ts's reopen flow should push: the persisted filter applied to the full history. */
export function getFilteredHistoryForReopen(): ActivityLogEntry[] {
  return computeFilteredHistory(activeFilter);
}

async function applyActiveFilter(): Promise<void> {
  if (!modalOpen) return;
  try {
    await fakeActivityLogShow(computeFilteredHistory(activeFilter), { open: false });
  } catch {
  }
}

export function setActiveFilter(filter: ActionKey): void {
  if (filter === activeFilter) return;
  activeFilter = filter;
  debugState.activeFilter = filter;
  persistFilter(filter);
  void applyActiveFilter();
}

const debugState = {
  activeFilter,
  get modalOpen() {
    return modalOpen;
  },
  getActiveFilter,
  setActiveFilter,
  computeFilteredHistory,
};
shareGlobal("__MG_ACTIVITY_LOG_FILTER_DEBUG__", debugState);

export function startActivityLogFilterPixi(): void {
  void (async () => {
    try {
      const current = await Atoms.ui.activeModal.get();
      modalOpen = current === ACTIVITY_LOG_MODAL_ID;
    } catch {
    }
    try {
      await Atoms.ui.activeModal.onChange((next: string | null) => {
        modalOpen = next === ACTIVITY_LOG_MODAL_ID;
      });
    } catch {
    }
  })();
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds. If it fails on the `ActivityLogEntry` import, confirm Step 1's `export` was actually added and saved.

- [ ] **Step 4: Manual verification in the running game**

Load the dev build in the browser (existing local workflow: `npm run watch`, Tampermonkey pointed at the local `dist` output). Join a room with some varied activity log entries (harvest, sell, buy, etc.) so the local history has variety. Open the Activity Log modal, then in the browser DevTools console:

```js
window.__MG_ACTIVITY_LOG_FILTER_DEBUG__.setActiveFilter("harvest");
```

Expected: the modal's visible list immediately narrows to only harvest entries (the game's own Pixi rebuild reacts to the atom patch). Then run:

```js
window.__MG_ACTIVITY_LOG_FILTER_DEBUG__.setActiveFilter("all");
```

Expected: the full list returns. Close and reopen the modal — Expected: it reopens already filtered to `"all"` (or whatever was last set, since `setActiveFilter` persisted it) via the *existing* `reopenFakeActivityLogFromHistory` flow (which at this point in the plan still pushes the *unfiltered* history — full filtering-on-reopen composition lands in Task 5 — so at this checkpoint, only confirm that manually calling `setActiveFilter` while the modal is open works; reopen behavior is verified again in Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/services/activityLogHistory.ts src/utils/activityLogFilterPixi.ts
git commit -m "$(cat <<'EOF'
Add activity-log filter data layer (Pixi-era)

Re-patches the same myData.activityLogs atom the 500-entry history
feature already uses, with a classified/filtered subset, instead of
manipulating DOM nodes (which no longer exist since the modal moved to
native Pixi rendering). No toolbar UI yet — verified via a console
debug global.
EOF
)"
```

---

### Task 3: Live-game reconnaissance checkpoint (manual, no code changes)

**Files:** none (diagnostic only — nothing in this task is committed)

**Interfaces:** none

This task exists because the exact internal Pixi structure of the modal can only be fully confirmed by inspecting the live tree — static analysis of `docs/main-Brp3BbpW.js` gives strong evidence (documented below) but Task 4's positioning and click-handling code depends on confirming it before writing code that assumes it.

**What static analysis already found** (for reference while running this check):
- The base modal class (`Vz` in the bundle) constructs `this.container` (outer, gets `.label = "ActivityLogModal"` from the `KV` subclass) with exactly two children: `[0] = this.modalContainer`, `[1] = this.closeButton.view`. `this.modalContainer.eventMode = "static"` is set by the base class itself — meaning Pixi's own event system is already active for this modal's content (unlike the keyboard-only `ActionHud` in `sellAllPetsPixi.ts`, which needed a manual hit-test fallback), which is why the native `pointertap` path is expected to work here.
- Inside `modalContainer`, the `KV` subclass adds exactly 5 children in this order: `[0] backgroundSprite`, `[1] title` (a Text-like node with `.textWidth`/`.textHeight`/`.position`), `[2] infoTooltip.container`, `[3] divider` (a `Graphics`-like node, drawn via `roundRect`/`fill`), `[4] scrollView.container` (the scrollable list).

- [ ] **Step 1: Build and load the current `main` branch dev bundle, open the Activity Log modal with at least one entry present.**

- [ ] **Step 2: In the browser DevTools console, run this diagnostic script and record its output:**

```js
(() => {
  const state = window.__MG_SPRITE_STATE__;
  const stage = state?.renderer?.lastObjectRendered ?? state?.renderer?.stage ?? state?.app?.stage;
  const stack = [stage];
  const seen = new Set();
  let modalNode = null;
  while (stack.length) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    if (node.label === "ActivityLogModal") { modalNode = node; break; }
    const kids = node.children;
    if (Array.isArray(kids)) for (const kid of kids) stack.push(kid);
  }
  if (!modalNode) { console.log("NOT FOUND"); return; }
  const modalContainer = modalNode.children?.[0];
  console.log("outer children:", modalNode.children?.map(c => c?.constructor?.name));
  console.log("modalContainer eventMode:", modalContainer?.eventMode);
  console.log("modalContainer children:", modalContainer?.children?.map((c, i) => ({
    index: i,
    ctor: c?.constructor?.name,
    label: c?.label,
    hasText: typeof c?.text === "string" || typeof c?.text === "number",
    hasRoundRect: typeof c?.roundRect === "function",
    x: c?.position?.x,
    y: c?.position?.y,
    width: c?.width,
    height: c?.height,
  })));
  window.__MG_DEBUG_MODAL_NODE__ = modalNode; // kept around for step 3
})();
```

Expected: `modalContainer.children` has 5 entries; index 1 has `hasText: true` (the title), index 3 has `hasRoundRect: true` (the divider), index 4 is the scroll view. **If the indices or count differ from this, adjust Task 4's `locateModalAnchors` accordingly before writing it** — the function's job is only to find "the title", "the divider", and "the scroll view container", by whatever combination of index/duck-typing actually matches this output.

- [ ] **Step 3: Test native Pixi click routing on an injected node, using the node captured in Step 2:**

```js
(() => {
  const modalNode = window.__MG_DEBUG_MODAL_NODE__;
  const modalContainer = modalNode.children?.[0];
  const state = window.__MG_SPRITE_STATE__;
  const ContainerCtor = modalContainer.constructor;
  const test = new ContainerCtor();
  test.eventMode = "static";
  test.cursor = "pointer";
  test.hitArea = new PIXI.Rectangle(0, 0, 60, 24); // if `PIXI` isn't global, borrow a Rectangle ctor from state.ctors.Rectangle instead
  test.position.set(20, 20);
  test.on("pointertap", () => console.log("NATIVE CLICK FIRED"));
  modalContainer.addChild(test);
})();
```

Click on the resulting test area (top-left of the modal, roughly under the close button). Expected: `"NATIVE CLICK FIRED"` logs. If it does **not** fire after a few attempts, Task 4 must use the manual canvas hit-test fallback (the same `pointerdown` + `toGlobal` technique already implemented in `src/utils/sellAllPetsPixi.ts`) instead of native `pointertap`.

- [ ] **Step 4: Record the outcome** (children structure confirmed/adjusted, native click works or needs fallback) — this determines which variant of Task 4 to implement.

---

### Task 4: Build and inject the filter toolbar

**Files:**
- Modify: `src/utils/activityLogFilterPixi.ts` (adds to the file from Task 2 — do not remove anything written there)

**Interfaces:**
- Consumes: everything Task 2 produced in the same file (`getActiveFilter`, `setActiveFilter`, `computeFilteredHistory`), plus `getActivityLogHistory` (already imported), `classifyEntryAction`, `ActionKey`, `mergeActions`, `getActionLabel` from `src/utils/activityLogClassification.ts`; `getSpriteState`, `getStage`, `findAcrossBranches`, `findGraphicsCtor` from `src/utils/gardenInfoCardPixi.ts`; `pageWindow` from `src/utils/page-context.ts`.
- Produces: the same `startActivityLogFilterPixi(): void` from Task 2, now additionally finding the live modal and attaching the toolbar (same exported signature — Task 5 wires it up once, unchanged by this task).

This task assumes Task 3 confirmed the structural layout (5 children, title/divider/scroll-view at indices 1/3/4). Adjust indices inline if Task 3 found otherwise — the rest of this task's logic is unaffected by *which* index each anchor is at, only by *how `locateModalAnchors` finds them*.

- [ ] **Step 1: Add the toolbar constants and modal-finding state to `activityLogFilterPixi.ts`**

Add these imports at the top (alongside the existing ones from Task 2):

```typescript
import { getSpriteState, getStage, findAcrossBranches, findGraphicsCtor } from "./gardenInfoCardPixi";
import { pageWindow } from "./page-context";
import { mergeActions, getActionLabel, ACTION_ORDER } from "./activityLogClassification";
```

Add these constants after `ACTIVITY_LOG_MODAL_ID`:

```typescript
const ACTIVITY_LOG_MODAL_LABEL = "ActivityLogModal";
const FIND_RETRY_MS = 1000;
const BUTTON_HEIGHT = 26;
const BUTTON_PADDING_X = 10;
const BUTTON_GAP = 6;
const TOOLBAR_GAP_ABOVE = 4;
const TOOLBAR_GAP_BELOW = 6;
const BUTTON_FILL_INACTIVE = 0x7b5a38;
const BUTTON_FILL_ACTIVE = 0xe3a23d;
const BUTTON_ALPHA_INACTIVE = 0.55;
const BUTTON_ALPHA_ACTIVE = 0.95;
const BUTTON_TEXT_STYLE = { fontFamily: "Arial", fontSize: 12, fontWeight: "700", fill: "#FFFFFF" };
const BUTTON_RADIUS = 8;

const raf: (cb: (t: number) => void) => number = (pageWindow as any).requestAnimationFrame.bind(pageWindow);
const cancelRaf: (id: number) => void = (pageWindow as any).cancelAnimationFrame.bind(pageWindow);
```

- [ ] **Step 2: Add the anchor-locating helper**

```typescript
interface ModalAnchors {
  modalContainer: any;
  title: any;
  divider: any;
  scrollViewContainer: any;
}

// Confirmed via Task 3's live console check: `this.container` (found by
// label) always has [modalContainer, closeButton.view] as its own two
// children (set by the base modal class), and modalContainer always has
// [backgroundSprite, title, infoTooltip.container, divider,
// scrollView.container] in that order (set by the ActivityLogModal
// subclass's constructor). If a future game build changes this order, this
// is the one place to update.
function locateModalAnchors(modalNode: any): ModalAnchors | null {
  const modalContainer = modalNode?.children?.[0];
  if (!modalContainer || modalContainer.destroyed) return null;
  const children = modalContainer.children;
  if (!Array.isArray(children) || children.length < 5) return null;
  const title = children[1];
  const divider = children[3];
  const scrollViewContainer = children[4];
  if (!title || !divider || !scrollViewContainer) return null;
  return { modalContainer, title, divider, scrollViewContainer };
}
```

- [ ] **Step 3: Add the toolbar builder**

```typescript
interface ToolbarButton {
  container: any;
  bg: any;
  key: ActionKey;
}

interface ToolbarState {
  container: any;
  buttons: ToolbarButton[];
  height: number;
}

function buildToolbar(anchors: ModalAnchors, graphicsCtor: any, textCtor: any, containerCtor: any): ToolbarState {
  const history = getActivityLogHistory();
  const counts = new Map<ActionKey, number>();
  for (const entry of history) {
    const key = classifyEntryAction(entry.action);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys: ActionKey[] = ["all", ...mergeActions(Array.from(counts.keys()))];

  const toolbar = new containerCtor();
  const buttons: ToolbarButton[] = [];
  let x = 0;
  const active = getActiveFilter();

  for (const key of keys) {
    const count = key === "all" ? history.length : counts.get(key) ?? 0;
    const label = `${getActionLabel(key)}${count ? ` (${count})` : ""}`;

    const text = new textCtor({ text: label, style: BUTTON_TEXT_STYLE });
    const width = text.width + BUTTON_PADDING_X * 2;

    const bg = new graphicsCtor();
    bg.roundRect(0, 0, width, BUTTON_HEIGHT, BUTTON_RADIUS)
      .fill({ color: key === active ? BUTTON_FILL_ACTIVE : BUTTON_FILL_INACTIVE, alpha: key === active ? BUTTON_ALPHA_ACTIVE : BUTTON_ALPHA_INACTIVE });

    text.position.set(BUTTON_PADDING_X, (BUTTON_HEIGHT - text.height) / 2);

    const button = new containerCtor();
    button.addChild(bg);
    button.addChild(text);
    button.position.set(x, 0);
    button.eventMode = "static";
    button.cursor = "pointer";
    button.on("pointertap", () => setActiveFilter(key));

    toolbar.addChild(button);
    buttons.push({ container: button, bg, key });
    x += width + BUTTON_GAP;
  }

  return { container: toolbar, buttons, height: BUTTON_HEIGHT };
}

function refreshToolbarHighlight(toolbarState: ToolbarState): void {
  const active = getActiveFilter();
  for (const button of toolbarState.buttons) {
    if (button.bg.destroyed) continue;
    const isActive = button.key === active;
    const bounds = button.bg.getLocalBounds();
    button.bg.clear();
    button.bg
      .roundRect(0, 0, bounds.width, BUTTON_HEIGHT, BUTTON_RADIUS)
      .fill({ color: isActive ? BUTTON_FILL_ACTIVE : BUTTON_FILL_INACTIVE, alpha: isActive ? BUTTON_ALPHA_ACTIVE : BUTTON_ALPHA_INACTIVE });
  }
}
```

- [ ] **Step 4: Add the attach/find/sync loop, replacing the body of the existing `startActivityLogFilterPixi` from Task 2**

Replace the `startActivityLogFilterPixi` function body from Task 2 with this (keep the two `try { ... } catch {}` blocks for `Atoms.ui.activeModal` exactly as they were — only add the parts below):

```typescript
let modalNode: any = null;
let toolbarState: ToolbarState | null = null;
let appliedOffset = 0;
let lastNativeDividerY = 0;
let findRafId: number | null = null;
let lastFindCheckAt = 0;

function teardownToolbar(): void {
  if (toolbarState) {
    try { toolbarState.container.destroy({ children: true }); } catch {}
  }
  toolbarState = null;
  appliedOffset = 0;
  lastNativeDividerY = 0;
}

function syncToolbar(): void {
  if (!modalNode || modalNode.destroyed) { teardownToolbar(); modalNode = null; return; }
  const anchors = locateModalAnchors(modalNode);
  if (!anchors) return;

  if (!toolbarState) {
    const state = getSpriteState();
    if (!state?.ctors?.Text) return;
    const stage = getStage(state);
    const graphicsCtor = findGraphicsCtor(stage);
    if (!graphicsCtor) return;
    const containerCtor = anchors.modalContainer.constructor;
    toolbarState = buildToolbar(anchors, graphicsCtor, state.ctors.Text, containerCtor);
    anchors.modalContainer.addChild(toolbarState.container);
  }

  const currentDividerY = anchors.divider.position.y;
  if (Math.abs(currentDividerY - (lastNativeDividerY + appliedOffset)) > 0.5) {
    lastNativeDividerY = currentDividerY;
    appliedOffset = 0;
  }

  const toolbarTopY = anchors.title.position.y + anchors.title.textHeight + TOOLBAR_GAP_ABOVE;
  const desiredOffset = Math.max(0, toolbarTopY + toolbarState.height + TOOLBAR_GAP_BELOW - lastNativeDividerY);
  if (desiredOffset !== appliedOffset) {
    anchors.divider.position.y = lastNativeDividerY + desiredOffset;
    anchors.scrollViewContainer.position.y += desiredOffset - appliedOffset;
    appliedOffset = desiredOffset;
  }
  toolbarState.container.position.set(anchors.title.position.x, toolbarTopY);
  refreshToolbarHighlight(toolbarState);
}

function tryFindModal(): void {
  if (!modalOpen || modalNode) return;
  const state = getSpriteState();
  if (!state) return;
  const stage = getStage(state);
  const found = findAcrossBranches(stage, (node: any) => node?.label === ACTIVITY_LOG_MODAL_LABEL);
  if (!found) return;
  modalNode = found;
  found.once("destroyed", () => {
    if (modalNode === found) {
      modalNode = null;
      teardownToolbar();
    }
  });
}

function scheduleFind(now: number): void {
  findRafId = null;
  if (modalOpen && !modalNode && now - lastFindCheckAt >= FIND_RETRY_MS) {
    lastFindCheckAt = now;
    tryFindModal();
  }
  if (modalNode) syncToolbar();
  if (!modalOpen && modalNode) {
    // Modal closed without the underlying node being destroyed — drop our
    // toolbar and go back to searching next time it opens.
    modalNode = null;
    teardownToolbar();
  }
  findRafId = raf(scheduleFind);
}
```

Then, inside the existing `startActivityLogFilterPixi` function (from Task 2), after the two existing `try { ... } catch {}` blocks that set up `modalOpen` tracking, add:

```typescript
  if (findRafId == null) findRafId = raf(scheduleFind);
```

(keep this line inside the same `void (async () => { ... })()` IIFE, after both `try` blocks, so the RAF loop starts once `modalOpen` has its initial value.)

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual verification in the running game**

Reload the dev build, open the Activity Log modal. Expected:
- A row of filter buttons appears between the title and the divider, with the divider/list visibly pushed down to make room.
- Each button label shows the category name and count (e.g. "Harvests (12)").
- Clicking a button (per Task 3's finding — native tap, or note if the fallback hit-test needs to be added instead) narrows the list to that category and highlights the active button.
- Clicking "All" restores the full list.
- Resize the browser window (or toggle a breakpoint-affecting layout change) while a button is active — expected: toolbar stays correctly positioned under the title, divider/list stay pushed down by the same amount (no drift/snowballing gap over repeated resizes).
- **If Task 3 found that native `pointertap` does not fire on injected nodes in this modal**, replace the `button.on("pointertap", ...)` wiring in Step 3 with the manual canvas hit-test pattern from `src/utils/sellAllPetsPixi.ts` (`onCanvasPointerDown`/`hitTestButton` via `toGlobal`), scoped to the toolbar's buttons, before re-running this verification step.

- [ ] **Step 7: Commit**

```bash
git add src/utils/activityLogFilterPixi.ts
git commit -m "$(cat <<'EOF'
Inject the activity-log filter toolbar into the live Pixi modal

Finds the ActivityLogModal node by its Pixi label, builds a button per
present action category, and repositions the native divider/scroll
view to make room, recalculated every frame from the title's own live
position (no hardcoded pixel offsets).
EOF
)"
```

---

### Task 5: Wire up, compose with reopen flow, and delete the old DOM filter

**Files:**
- Modify: `src/ui/hud.ts` (swap the import/call)
- Modify: `src/services/activityLogHistory.ts` (compose the reopen flow with the active filter)
- Delete: `src/utils/activityLogFilter.ts`

**Interfaces:**
- Consumes: `startActivityLogFilterPixi()`, `getFilteredHistoryForReopen()` from `src/utils/activityLogFilterPixi.ts`.

- [ ] **Step 1: Swap the import in `src/ui/hud.ts`**

Find (around line 36):

```typescript
import { startActivityLogFilter } from "../utils/activityLogFilter";
```

Replace with:

```typescript
import { startActivityLogFilterPixi } from "../utils/activityLogFilterPixi";
```

Find (around line 1127):

```typescript
      startActivityLogFilter();
```

Replace with:

```typescript
      startActivityLogFilterPixi();
```

- [ ] **Step 2: Compose the reopen flow with the active filter in `src/services/activityLogHistory.ts`**

Add this import near the top of the file (alongside the existing imports):

```typescript
import { getFilteredHistoryForReopen } from "../utils/activityLogFilterPixi";
```

Find the `reopenFakeActivityLogFromHistory` function:

```typescript
async function reopenFakeActivityLogFromHistory() {
  try {
    const history = loadHistory();
    await fakeActivityLogShow(history, { open: true });
  } catch {
  }
}
```

Replace its body so it pushes the already-filtered history instead of the raw one:

```typescript
async function reopenFakeActivityLogFromHistory() {
  try {
    const filtered = getFilteredHistoryForReopen();
    await fakeActivityLogShow(filtered, { open: true });
  } catch {
  }
}
```

- [ ] **Step 3: Delete the old DOM-based filter**

```bash
git rm src/utils/activityLogFilter.ts
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: succeeds, with no remaining references to `activityLogFilter` (the old file) or `startActivityLogFilter` (the old function name) anywhere in `src/`. Double check with a search:

```bash
grep -rn "activityLogFilter\"" src/ ; grep -rn "startActivityLogFilter(" src/
```

Expected: no output (the only matches should be `activityLogFilterPixi` / `startActivityLogFilterPixi`, which won't match these exact patterns).

- [ ] **Step 5: Full manual end-to-end verification in the running game**

Reload the dev build. With varied activity in the local history:
1. Open the Activity Log modal, click a filter button (e.g. "Sold"), confirm the list narrows and the 500-entry history's "Show more" pagination still works correctly against the *filtered* count (not the full 500).
2. Close the modal, reopen it — Expected: it reopens already showing the "Sold" filter applied (no flash of the full unfiltered list first).
3. Switch to "All" — Expected: full (up to 500) history shows again.
4. Trigger a few new in-game actions while the modal is open, close and reopen — Expected: new entries are present and still respect the active filter.

- [ ] **Step 6: Commit**

```bash
git add src/ui/hud.ts src/services/activityLogHistory.ts
git commit -m "$(cat <<'EOF'
Wire up the Pixi activity-log filter, remove the dead DOM version

Swaps hud.ts over to startActivityLogFilterPixi, makes the 500-entry
reopen flow push the already-filtered history instead of the raw one
(avoiding a flash of unfiltered content), and deletes the old
DOM/Chakra-based filter that stopped finding anything once the modal
moved to native Pixi rendering.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** classification extraction (Task 1) ✓, data-layer filtering re-patching the shared atom (Task 2) ✓, toolbar placement between title/divider with no hardcoded pixels (Task 4) ✓, native-click-first with documented fallback (Task 3 + Task 4 Step 6) ✓, persisted filter reapplied on reopen (Task 5 Step 2) ✓, old file deleted after extraction (Task 5 Step 3) ✓.
- **Type consistency:** `ActionKey` is defined once in Task 1 and imported everywhere else; `ActivityLogEntry` is exported once in Task 2 Step 1 and imported by Task 2's own new file and Task 5's `activityLogHistory.ts` (same file, no import needed there); `startActivityLogFilterPixi()` keeps the same zero-arg `void` signature from Task 2 through Task 4 through its Task 5 call site.
- **No placeholders:** every step has complete, real code; Task 3 is intentionally a manual diagnostic task (no code produced), which is why it has no "Files" changes and is explicitly called out as such rather than disguised as a coding task.
