# Garden Paper Menus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every mod menu and floating surface the light Garden Paper look, and replace the HUD launcher by a vertical dock on the left edge.

**Architecture:** The look lives in the kit: `src/ui/kit/theme.ts` holds the tokens, and `src/ui/kit/styles/*` holds every rule under the existing class names, so most menus change without edits. A new kit `dock` component replaces the launcher box in `src/ui/hud.ts`. A small kit emitter (`menuBadges`) lets features put a count on a dock button. Two checks keep the theme honest: a contrast table and a ban on literal colours outside data and Pixi files.

**Tech Stack:** TypeScript, esbuild, plain DOM, CSS custom properties, node check suites in `scripts/` (`_check.ts`, `_fakeDom.ts`, `runChecks.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-09-garden-paper-menus-design.md`

## Global Constraints

- Palette, verbatim from the spec:
  - paper #fbf4e4, paperDeep #f6ecd5, sand #efe3c6, sandEdge #e3d3b0, sandShade #c9b48a, card #ffffff
  - leaf #57a05f, leafStrong #40844c, leafShade #2f6638, leafSoft #e7f2df, leafInk #2f7a3d
  - bark #3b2f22, barkSoft #6b5537, barkDim #76634a, clay #c24a2a, amber #d18a1a
- Text contrast: 4.5:1, or 3:1 for text of 18 px and up or 14 px bold.
- Font: Nunito 600/700/800/900 from Google Fonts, with the system UI font as fallback.
- Dock: vertical, on the left edge, vertically centred; 48 px buttons; menus in the order registered in `main.ts`.
- Windows keep their drag, stacking, position memory and min/close behaviour; only their skin changes.
- Data colours (rarity, ability, mutation) and Pixi-drawn colours keep their values.
- Repo rules (CLAUDE.md): English comments, no em dashes anywhere, no path banners, reuse `lib/`, never rename game-owned strings, commit format with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` line, `npm run build` before each commit (`dist/` is committed).
- Every new check suite: a line in `SUITES` in `scripts/runChecks.mjs` and `"check:<name>": "node scripts/runChecks.mjs <name>"` in `package.json`.

## Review Focus

1. **A window taller than a short screen** (a laptop in Discord). The dock scrolls inside the viewport, and a window body scrolls, never pushing its title band off screen. Owned by Task 2 (window rule) and Task 3 (dock rule). Pinned in Task 3's check through the `qws-dock` scroll style.
2. **Hidden HUD.** The hide-HUD hotkey and Insert hide the dock, and the hidden state survives a reload. Owned by Task 4, pinned in its check.
3. **Menu opened from elsewhere.** `qws:open-panel` (used by the instant feed widget) opens the window and marks its dock button open. Owned by Task 4, pinned in its check.
4. **Feature CSS written for the dark theme.** Feature stylesheets that set `color: #fff`-like text or translucent white backgrounds turn invisible on paper. `check:themecolors` bans literal colours outside the allowlist. Owned by Task 5.
5. **Google Fonts blocked** (Discord CSP, offline). Text still renders in the fallback font and nothing waits on the font. The kit adds the `<link>` without awaiting it. Owned by Task 2 and pinned in `check:kitstyles`, which asserts the `font-family` stack ends with a generic family.

---

### Task 1: Theme tokens and contrast check

**Files:**
- Modify: `src/ui/kit/theme.ts`
- Create: `scripts/checkContrast.ts`
- Modify: `scripts/runChecks.mjs`, `package.json`

**Interfaces:**
- Produces:
  - `color` keeps its existing keys (`accent`, `accentSoft`, `accentHover`, `accentBorder`, `accentBorderHover`, `text`, `textSoft`, `textDim`, `border`, `borderHover`, `borderStrong`, `cardBg`, `hoverBg`, `mutedBg`, `fieldBg`, `fieldBorder`, `track`, `sunken`, `surface`, `panelBg`, `scrollbar`, `scrim`, `danger*`, `warn*`, `gold`, `rainbow`), repointed to the palette.
  - New keys: `paper`, `paperDeep`, `sand`, `sandEdge`, `sandShade`, `card`, `leaf`, `leafStrong`, `leafShade`, `leafSoft`, `leafInk`, `bark`, `barkSoft`, `barkDim`, `clay`, `amber`, `onLeaf` (#ffffff).
  - `shadow.raise = "0 8px 0 #c9b48a, 0 20px 40px rgba(59,47,34,0.28)"` and `shadow.raiseSmall = "0 4px 0 #c9b48a"`.
  - `export const fontFamily = "'Nunito', ui-rounded, system-ui, sans-serif"`, emitted as `--qmm-font`.
  - `export const contrastPairs: Array<{ fg: string; bg: string; min: number; use: string }>`.

- [ ] **Step 1: Write the failing check `scripts/checkContrast.ts`**

```ts
// Every text/background pair the theme declares reaches its WCAG contrast ratio.
import { check, done } from "./_check";
import { contrastPairs } from "../src/ui/kit/theme";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

check("the theme declares its text pairs", contrastPairs.length >= 10);
for (const { fg, bg, min, use } of contrastPairs) {
  const r = ratio(fg, bg);
  check(`${use}: ${fg} on ${bg} reaches ${min}`, r >= min, r.toFixed(2));
}
done();
```

Register it as `contrast: ["checkContrast"]` in `SUITES`, and add `"check:contrast": "node scripts/runChecks.mjs contrast"` to `package.json`.

- [ ] **Step 2: Run it to see it fail**

Run: `npm run check:contrast`
Expected: bundling fails with "No matching export ... contrastPairs".

- [ ] **Step 3: Rewrite the tokens in `src/ui/kit/theme.ts`**

Map the existing semantic keys onto the palette:
- `accent` = leafStrong
- `accentSoft` = leafSoft
- `accentHover` = #d7ebcd
- `accentBorder` = #8cc68f
- `accentBorderHover` = leaf
- `text` = bark
- `textSoft` = barkSoft
- `textDim` = barkDim
- `border` = sandEdge
- `borderHover` = #d6c193
- `borderStrong` = sandEdge
- `cardBg` = card
- `hoverBg` = sand
- `mutedBg` = paperDeep
- `fieldBg` = card
- `fieldBorder` = sandEdge
- `track` = sandEdge
- `sunken` = paperDeep
- `surface` = paper
- `panelBg` = paper
- `scrollbar` = #d6c193
- `scrim` = rgba(59,47,34,0.45)
- `danger` = clay
- `dangerSoft` = #f6ddd5
- `dangerHover` = #f0cbbf
- `dangerBorder` = #e2a493
- `dangerBorderHover` = clay
- `warn` = amber
- `warnSoft` = #f6e7c6
- `warnBorder` = #e2bf7a
- `gold` and `rainbow` keep their values

Add the new keys listed under Interfaces. Gradients become the flat colours:
- `panel` = paper
- `tabBar` = paper
- `head` = leaf

Shadows:
- `panel` = `shadow.raise`
- `window` = `shadow.raise`
- `modal` = `"0 10px 0 #c9b48a, 0 28px 60px rgba(59,47,34,0.35)"`
- `raise` and `raiseSmall` as listed under Interfaces

Radii: `sm` 8, `md` 12, `lg` 16, `xl` 24, `pill` 999.

`themeVariables()` also emits `--qmm-font:${fontFamily};`.

`contrastPairs` declares at least these pairs:
- bark, barkSoft and barkDim on paper, paperDeep, sand and card, at 4.5 each
- leafInk on leafSoft and on paper, at 4.5
- onLeaf on leafStrong at 4.5, and onLeaf on leaf at 3 (title band, 20 px bold)
- onLeaf on clay at 4.5
- paper on bark at 4.5 (active tab)
- barkSoft on sand at 4.5

- [ ] **Step 4: Run the check and the typecheck**

Run: `npm run check:contrast && node <tsc> -p .`
Expected: PASS. The typecheck will flag nothing new, because the keys are kept.

- [ ] **Step 5: Commit**

Subject: "Garden Paper theme tokens, with a contrast check". Run `npm run build` first.

### Task 2: Kit stylesheet in the Garden Paper look

**Files:**
- Modify: `src/ui/kit/styles/chrome.ts`, `src/ui/kit/styles/controls.ts`, `src/ui/kit/styles/containers.ts`, `src/ui/kit/styles/index.ts`
- Create: `scripts/checkKitStyles.ts`, `scripts/kitPreview.mjs`
- Modify: `scripts/runChecks.mjs`, `package.json`

**Interfaces:**
- Consumes: the Task 1 tokens as `var(--qmm-*)` (`--qmm-paper`, `--qmm-leaf`, `--qmm-shadow-raise`, `--qmm-font`...).
- Produces:
  - `ensureKitStyles()` (same name); it also adds `<link id="qmm-kit-font" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap">` once.
  - `export function kitCss(): string` (the full sheet, for the preview and the check).
  - Class names are unchanged.

- [ ] **Step 1: Write the failing check `scripts/checkKitStyles.ts`**

```ts
// The kit's stylesheet in the Garden Paper look: font, window skin, no dark leftovers.
import { check, done } from "./_check";
import { kitCss } from "../src/ui/kit/styles";

const css = kitCss();
check("the kit text uses the theme font", /font-family:\s*var\(--qmm-font\)/.test(css));
check("the font stack ends on a generic family", /--qmm-font:[^;]*sans-serif;/.test(css));
check("windows use the raised shadow", /\.qws-win\s*\{[^}]*var\(--qmm-shadow-raise\)/.test(css));
check("the window title band is leaf green", /\.qws-win \.w-head\s*\{[^}]*var\(--qmm-leaf\)/.test(css));
check("no translucent white surfaces are left", !/rgba\(255,\s*255,\s*255/.test(css));
check("no backdrop blur is left", !/backdrop-filter/.test(css));
check("the dock scrolls when the screen is short", /\.qws-dock\s*\{[^}]*overflow-y:\s*auto/.test(css));
done();
```

Register `kitstyles: ["checkKitStyles"]` in `SUITES` and in `package.json`.

- [ ] **Step 2: Run it to see it fail**

Run: `npm run check:kitstyles`
Expected: FAIL. `kitCss` is not exported; once exported, the font, shadow, band and dock cases fail.

- [ ] **Step 3: Rewrite the three style modules**

Keep every selector the current files define. Apply the spec's look:
- **Base:** `.qmm, .qws-win, .qws-dock` set `font-family: var(--qmm-font); color: var(--qmm-text)`.
- **`.qws-win`:**
  - `background: var(--qmm-paper); border: 3px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-xl); box-shadow: var(--qmm-shadow-raise); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh`
  - `.w-head`: `min-height: 56px; padding: 0 12px 0 18px; background: var(--qmm-leaf); color: var(--qmm-on-leaf); font-weight: 900; font-size: 18px`
  - `.w-btn` in the head: `width: 34px; height: 34px; border-radius: 12px; background: var(--qmm-leaf-shade); color: var(--qmm-on-leaf); box-shadow: none`
  - `.w-body`: `padding: 16px; overflow: auto; min-height: 0`
- **`.qmm-tabs`:**
  - `background: transparent; border: 0; gap: 6px; padding: 0 0 12px`
  - `.qmm-tab`: `flex: 0 0 auto; height: 36px; padding: 0 16px; border-radius: 999px; background: var(--qmm-sand); color: var(--qmm-text-soft); font-weight: 800`
  - `.active`: `background: var(--qmm-bark); color: var(--qmm-paper)`
- **`.qmm-views`:** `background: transparent; border: 0; box-shadow: none; padding: 0`
- **Buttons (`.qmm-btn`):**
  - `border: 0; border-radius: 12px; font-weight: 800; box-shadow: inset 0 -3px 0 var(--qmm-sand-shade); background: var(--qmm-sand); color: var(--qmm-text-soft)`
  - primary: `background: var(--qmm-leaf-strong); color: var(--qmm-on-leaf); box-shadow: inset 0 -3px 0 var(--qmm-leaf-shade)`
  - danger: `background: var(--qmm-clay); color: var(--qmm-on-leaf); box-shadow: inset 0 -3px 0 #8f3620`
  - ghost: `background: transparent; box-shadow: none`
  - `:active { transform: translateY(2px); box-shadow: none }`
- **Switch:** 46×26, track `var(--qmm-sand-edge)`, checked `var(--qmm-leaf)`, knob #fff 20 px.
- **Slider:** track 10 px `var(--qmm-sand-edge)`, fill `var(--qmm-leaf)`, thumb 22 px, white with a 3 px leaf border.
- **Fields:** `background: var(--qmm-card); border: 2px solid var(--qmm-sand-edge); border-radius: 12px; color: var(--qmm-text)`; `:focus` sets `border-color: var(--qmm-leaf); box-shadow: 0 0 0 3px var(--qmm-leaf-soft)`.
- **Cards:** `background: var(--qmm-card); border: 3px solid var(--qmm-sand-edge); border-radius: 18px`; the selected or active one gets `border-color: var(--qmm-accent-border)`.
- **Segmented control:** a sand track; the selected option is bark on paper.
- **VTabs:** the list is items on sand; the selected item is `leafSoft` with a `leafInk` label.
- **Pills and badges:** `leafSoft`/`leafInk` (ok), `warnSoft`/`#7a4f0a` (warn), `dangerSoft`/`clay` (bad).
- **Scrollbars:** thumb `var(--qmm-scrollbar)`.
- **`.qws-dock`** (used by Task 3):
  - `position: fixed; left: 12px; top: 50%; transform: translateY(-50%); z-index: <layer.hud>; display: flex; flex-direction: column; gap: 6px; padding: 8px; max-height: calc(100vh - 24px); overflow-y: auto`
  - `background: var(--qmm-paper); border: 3px solid var(--qmm-sand-edge); border-radius: 22px; box-shadow: var(--qmm-shadow-raise-small)`
  - `.qws-dock.hidden { display: none }`
  - `.qws-dock-btn`: `position: relative; width: 48px; height: 48px; flex: none; border: 0; border-radius: 16px; background: var(--qmm-sand); color: var(--qmm-text-soft); box-shadow: inset 0 -4px 0 var(--qmm-border-hover); display: flex; align-items: center; justify-content: center; cursor: pointer`
  - `.qws-dock-btn.open`: `background: var(--qmm-leaf-strong); color: var(--qmm-on-leaf); box-shadow: inset 0 -4px 0 var(--qmm-leaf-shade)`
  - `.qws-dock-badge`: `position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; border-radius: 999px; background: var(--qmm-clay); color: #fff; font: 900 11px var(--qmm-font); border: 2px solid var(--qmm-paper)`
  - `.qws-dock-status`: a 10 px dot, in leaf, amber or clay by `data-tone`
  - `.qws-dock-tip`: absolutely positioned at `left: 60px`, bark background, paper text, shown on hover and focus
- **Old launcher:** remove the `.qws2` and `.qws-launch` rules, which Task 4 stops using.

In `index.ts`:
- export `kitCss()`, returning `[themeVariables(), chromeCss, controlsCss, containersCss].join("\n")`;
- have `ensureKitStyles()` use `kitCss()` and append the font `<link>` once by id.

- [ ] **Step 4: Build the preview script `scripts/kitPreview.mjs`**

The script bundles `scripts/kitPreviewEntry.ts` with esbuild (iife) into `node_modules/.cache/kitPreview.js`. It then writes `node_modules/.cache/kit-preview.html`:
- the garden backdrop CSS (`background: #3f6b3a` with the 64 px grid lines);
- an inline `<script>` holding the bundle.

`scripts/kitPreviewEntry.ts` builds, with the real kit functions:
- a dock (from Task 3, so it is added in Task 3);
- one `.qws-win` with tabs;
- primary, secondary and danger buttons;
- a switch, a slider, a number field and a select;
- a segmented control, a card list, pills and a VTabs.

- [ ] **Step 5: Run the checks, the typecheck and a build**

Run: `npm run check:kitstyles && npm run check && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

Subject: "Every menu takes the Garden Paper look".

### Task 3: Menu icons and the dock component

**Files:**
- Create: `src/ui/kit/menuIcons.ts`, `src/ui/kit/dock.ts`, `src/ui/kit/menuBadges.ts`, `scripts/checkDock.ts`
- Modify: `scripts/kitPreviewEntry.ts`, `scripts/runChecks.mjs`, `package.json`

**Interfaces:**
- Produces:
  - `menuIcon(id: string): SVGSVGElement`: a 22 px stroke icon keyed by `pets`, `locker`, `alerts`, `calculator`, `room`, `editor`, `skins`, `misc`, `keybinds`, `tools`, `settings`, `companion` and `debug-data`. An unknown id gets a leaf icon.
  - `type DockItem = { id: string; label: string }`
  - `type Dock = { root: HTMLElement; add(item: DockItem): void; setOpen(id: string, open: boolean): void; setBadge(id: string, count: number): void; setStatus(tone: "ok" | "warn" | "bad", text: string): void; setHidden(hidden: boolean): void; isHidden(): boolean }`
  - `createDock(onSelect: (id: string) => void): Dock`
  - `menuBadges`: `setMenuBadge(id: string, count: number): void` and `onMenuBadge(cb: (id: string, count: number) => void): () => void`. It is backed by an `Emitter` from `lib/emitter`, and the last count per id is replayed to late subscribers.

- [ ] **Step 1: Write the failing check `scripts/checkDock.ts`**

```ts
// The dock: one labelled button per menu, open state and badges on the right button.
import { installFakeDom } from "./_fakeDom";
installFakeDom();
import { check, checkEqual, done } from "./_check";
import { createDock } from "../src/ui/kit/dock";
import { onMenuBadge, setMenuBadge } from "../src/ui/kit/menuBadges";

const picked: string[] = [];
const dock = createDock((id) => picked.push(id));
dock.add({ id: "pets", label: "Pets" });
dock.add({ id: "alerts", label: "Alerts" });

const buttons = dock.root.querySelectorAll(".qws-dock-btn");
checkEqual("one button per menu", buttons.length, 2);
checkEqual("each button is labelled", buttons.map((b: any) => b.getAttribute("aria-label")), ["Pets", "Alerts"]);

buttons[1].click();
checkEqual("a click selects that menu", picked, ["alerts"]);

dock.setOpen("pets", true);
check("an open menu's button is marked open", buttons[0].classList.contains("open") && !buttons[1].classList.contains("open"));

dock.setBadge("alerts", 3);
checkEqual("the badge shows on its menu", buttons[1].querySelector(".qws-dock-badge")?.textContent, "3");
dock.setBadge("alerts", 0);
check("a zero badge hides", buttons[1].querySelector(".qws-dock-badge")?.hidden === true);

const seen: string[] = [];
setMenuBadge("alerts", 2);
const off = onMenuBadge((id, n) => seen.push(`${id}:${n}`));
setMenuBadge("alerts", 5);
off();
checkEqual("menu badges replay the last count, then follow", seen, ["alerts:2", "alerts:5"]);

dock.setHidden(true);
check("the dock hides", dock.isHidden() && dock.root.classList.contains("hidden"));
done();
```

Register `dock: ["checkDock", "dom-stub"]` in `SUITES` and in `package.json`.

- [ ] **Step 2: Run it to see it fail**

Run: `npm run check:dock`
Expected: bundling fails ("Could not resolve ../src/ui/kit/dock").

- [ ] **Step 3: Implement the three modules**

- **`menuBadges.ts`:** `const counts = new Map<string, number>(); const changed = new Emitter<[string, number]>()`. `setMenuBadge` stores the count and emits. `onMenuBadge` replays every stored count, then subscribes.
- **`menuIcons.ts`:** one entry per id in a `Record<string, string>` of SVG path markup. Use the shapes from the mockup: paw, lock, bell, calculator, house, pencil, palette, puzzle, keyboard, wrench, gear, robot, bug. Build the element with `document.createElementNS("http://www.w3.org/2000/svg", "svg")`, with `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2.2"`, `stroke-linecap="round"` and `stroke-linejoin="round"`, and set the paths with `innerHTML`, a static string the mod owns.
- **`dock.ts`:**
  - Call `ensureKitStyles()`.
  - `root = h("nav", "qws-dock")` with `aria-label="Aries Mod menus"`, then a status dot `h("span", "qws-dock-status")`.
  - Each item is a `<button class="qws-dock-btn" aria-label=label data-id=id>` holding `menuIcon(id)`, a tooltip `<span class="qws-dock-tip">` and a badge `<span class="qws-dock-badge" hidden>`.
  - `setBadge` writes the text and toggles `hidden` (shown when the count is above 0).
  - `setStatus` sets `data-tone` and `title` on the dot.
  - `setHidden` toggles `hidden` on the root.
  - Subscribe once to `onMenuBadge` so features reach the dock.

Add the dock with three items to `scripts/kitPreviewEntry.ts`.

- [ ] **Step 4: Run the check, all checks and the typecheck**

Run: `npm run check:dock && npm run check && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

Subject: "A dock of menu icons for the left edge of the screen". Run `npm run build` first.

### Task 4: The HUD uses the dock

**Files:**
- Modify:
  - `src/ui/hud.ts` (replace the HUD box and launcher)
  - `src/ui/hudStatus.ts` (`startStatusLoop` targets the dock)
  - `src/main.ts` (titles without emoji)
  - `src/features/settings/infosTab.ts` (version check badge)
  - `src/features/notifier/overlay.ts` (alerts badge)
- Create: `scripts/checkHudDock.ts`
- Modify: `scripts/runChecks.mjs`, `package.json`

**Interfaces:**
- Consumes: `createDock`, `Dock`, `setMenuBadge`; `initVersionBadge(badge: HTMLElement)` from `src/ui/hudStatus.ts`.
- Produces:
  - `mountHUD(opts)` keeps its signature. It mounts the dock in place of `.qws2`.
  - `startStatusLoop(dock: Dock): void` drives `dock.setStatus(...)`.
  - Storage keys: `HUD_HIDDEN_PATH` is kept, so the hidden state survives the update. `HUD_POS_PATH` and `HUD_COLLAPSED_PATH` are no longer read; leave them in the storage shape, unused.

- [ ] **Step 1: Write the failing check `scripts/checkHudDock.ts`**

```ts
// The HUD mounts the dock: menus open from it, hiding survives, open-panel events mark it.
import { installFakeDom } from "./_fakeDom";
const { localStorage } = installFakeDom();
import { check, checkEqual, done } from "./_check";
import { mountHUD } from "../src/ui/hud";

const rendered: string[] = [];
mountHUD({ onRegister(register) {
  register("pets", "Pets", (el) => { rendered.push("pets"); el.textContent = "pets body"; });
  register("alerts", "Alerts", () => rendered.push("alerts"));
}});

const dock = (document as any).querySelector(".qws-dock");
check("the dock is mounted", !!dock);
check("the old launcher box is gone", !(document as any).querySelector(".qws2"));
const pets = dock.querySelector('.qws-dock-btn[data-id="pets"]');
pets.click();
checkEqual("clicking a dock button opens its window", rendered, ["pets"]);
check("its button shows as open", pets.classList.contains("open"));
pets.click();
check("clicking again closes it", !pets.classList.contains("open"));

window.dispatchEvent(Object.assign(new (globalThis as any).Event("qws:open-panel"), { detail: { id: "alerts" } }));
check("an open-panel event marks the dock button", dock.querySelector('.qws-dock-btn[data-id="alerts"]').classList.contains("open"));

window.dispatchEvent(Object.assign(new (globalThis as any).Event("keyup"), { code: "Insert", key: "Insert" }));
check("Insert hides the dock", dock.classList.contains("hidden"));
check("hiding is remembered", JSON.stringify(localStorage).includes("hidden"));
done();
```

If `_fakeDom` lacks `Event`, `window.dispatchEvent` or `CustomEvent`, extend `scripts/_fakeDom.ts` minimally in this step: a `FakeEvent` class with `type` and `detail`, and window listeners kept in a map.

Register `huddock: ["checkHudDock", "dom-stub"]` in `SUITES` and in `package.json`.

- [ ] **Step 2: Run it to see it fail**

Run: `npm run check:huddock`
Expected: FAIL. "the dock is mounted" is false, and `.qws2` exists.

- [ ] **Step 3: Replace the launcher in `hud.ts`**

- Delete the HUD box: `statusMini`, `btnMin`, `btnHide`, `header`, `statusRow`, `launch`, `box`, the box drag and collapse, and `saveHUDPos`.
- Create `const dock = createDock((id) => toggleWindow(id))` and append `dock.root` to `document.documentElement`.
- Read the hidden state with `dock.setHidden(isOn(readAriesPath(HUD_HIDDEN_PATH)))`. `setHUDHidden` calls `dock.setHidden` and writes `HUD_HIDDEN_PATH`; `toggleHUDHidden` uses `dock.isHidden()`.
- `register(id, title, render)` pushes to `registry` and calls `dock.add({ id, label: title })`.
- `setLaunchState(id, open)` becomes `dock.setOpen(id, open)`.
- `toggleWindow(id)`: if the window is shown, hide it and `dock.setOpen(id, false)`; else `showWindow`.
- The modifier drag keeps working on `.qws-win`; drop `.qws2` from its selector.
- Replace `initVersionBadge(versionPill)` and `startStatusLoop(box, statusFull, statusMini)` with `startStatusLoop(dock)`.
- The hide-hotkey title moves to the dock root's `title`.

In `hudStatus.ts`:
- `startStatusLoop(dock)` computes the same health. Its tones are ok, warn and bad, mapped from the current `setTone` calls.
- Call `dock.setStatus(tone, text)`.
- Keep `refreshWhileVisible(dock.root, update, 800)`.
- Export `initVersionBadge`, unchanged.

In `src/features/settings/infosTab.ts`, pass the version pill (`pill(\`v${getLocalVersion() ?? "unknown"}\`, "ok")`) to `initVersionBadge`, so it shows the update check and its download link.

In `src/features/notifier/overlay.ts`, where `alerts.onChange((items) => this.show(items))` is registered, also call `setMenuBadge("alerts", items.length)`.

In `src/main.ts`, register titles without emoji: `'Pets'`, `'Locker'`, `'Alerts'`, `'Calculator'`, `'Room'`, `'Editor'`, `'Skins'`, `'Misc'`, `'Keybinds'`, `'Tools'`, `'Settings'`, `'Companion'`, `'Debug'`.

- [ ] **Step 4: Run the check, all checks, the typecheck and knip**

Run: `npm run check:huddock && npm run check && npm run typecheck`, then knip.
Expected: PASS. knip may flag `HUD_POS_PATH` and `HUD_COLLAPSED_PATH` if they are exported; drop their exports.

- [ ] **Step 5: Commit**

Subject: "The HUD launcher becomes a dock on the left edge". Run `npm run build` first.

### Task 5: Dark-theme leftovers in feature UI

**Files:**
- Create: `scripts/checkThemeColors.ts`
- Modify: every DOM UI file the check lists, expected to be:
  - `src/features/pets/feedWidget.ts`, `src/features/tools/styles.ts`, `src/features/locker/menuStyles.ts`
  - `src/features/pets/teamEditor.ts`, `teamList.ts`, `teamStatsView.ts`, `teamBuilderTab.ts`, `abilityChips.ts`
  - `src/features/notifier/overlay.ts`, `src/features/debug/styles.ts`, `src/features/changelog/notice.ts`
  - `src/features/room/privacyNotice.ts`, `src/features/autoReco/dialog.ts`
  - `src/features/editor/ui/mutationPicker.ts`, `src/features/editor/decorRotation.ts`
  - `src/features/inventory/strengthBadge.ts`, `src/features/inventory/valueDisplay.ts`
  - `src/features/locker/overridesTab.ts`, `src/ui/kit/vtabs.ts`

**Interfaces:**
- Consumes: the `color.*` tokens and the `var(--qmm-*)` variables from Task 1.

- [ ] **Step 1: Write the failing check `scripts/checkThemeColors.ts`**

```ts
// No literal colour in mod UI code outside the theme, data tables and Pixi drawing.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { check, done } from "./_check";

// Files whose colours are data, the theme itself, or drawn on the game's canvas.
const ALLOWED = new Set([
  "src/ui/kit/theme.ts",
  "src/data/live/abilityColors.ts",
  "src/features/pets/abilityChipColors.ts",
  "src/ui/kit/rarityBadge.ts",
  "src/ui/kit/sprites/mutationTint.ts",
  "src/features/cropPrice/badge.ts",
  "src/features/locker/indicator.ts",
  "src/features/sellAllPets/pixiButton.ts",
  "src/features/activityLog/filterToolbar.ts",
  "src/features/notifier/bell/pixiBell.ts",
  "src/game/pixi/tileFlash.ts",
]);
const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });
}

for (const file of walk("src")) {
  const rel = file.replace(/\\/g, "/");
  if (ALLOWED.has(rel)) continue;
  const hits = readFileSync(file, "utf8").match(COLOR) ?? [];
  check(`${rel} uses theme colours only`, hits.length === 0, hits.slice(0, 5).join(" "));
}
done();
```

White counts as a literal too: use `color.onLeaf` (or `var(--qmm-on-leaf)`) for white text.

Register `themecolors: ["checkThemeColors"]` in `SUITES` and in `package.json`.

- [ ] **Step 2: Run it to see it fail**

Run: `npm run check:themecolors`
Expected: FAIL, listing the files above.

- [ ] **Step 3: Replace each literal with the token of the same role**

- Text on dark becomes `var(--qmm-text)` or `color.text`; dim text becomes `--qmm-text-dim`.
- Translucent white backgrounds become `--qmm-card` or `--qmm-hover-bg`; dark panels become `--qmm-paper`.
- Teal accents become `--qmm-accent`; red becomes `--qmm-danger`; yellow becomes `--qmm-warn`.

In files that write inline styles from TS, import `color` from `src/ui/kit/theme`. Keep sizes, spacing and layout as they are.

A literal that is data rather than UI goes in `ALLOWED`, with a comment saying why. An example would be a fixed sprite tint drawn on the canvas.

- [ ] **Step 4: Run all checks, the typecheck and a build**

Run: `npm run check && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

Subject: "Feature menus and widgets drop their dark-theme colours".

### Task 6: Preview for the owner and final verification

**Files:**
- Use: `scripts/kitPreview.mjs`, `scripts/kitPreviewEntry.ts`

- [ ] **Step 1: Generate the preview**

Run: `node scripts/kitPreview.mjs`
Expected: it writes `node_modules/.cache/kit-preview.html`.

- [ ] **Step 2: Publish it**

Copy the HTML into the scratchpad as a page and publish it as an Artifact (private), so the owner can look before testing in game.

- [ ] **Step 3: Run the whole-branch verification**

Run: `npm run check && npm run typecheck && npm run build`, knip, and `node scripts/auditGameLabels.mjs C:/tmp/mg1449`.
Expected: all clean.

- [ ] **Step 4: Update CLAUDE.md**

In "Code style", replace the line about menus with: "Menus use the components in `ui/kit/`, its colour tokens and `--qmm-font`; a literal colour outside the data and Pixi files fails `check:themecolors`."

Commit with the subject "Note the theme colour rule in CLAUDE.md".
