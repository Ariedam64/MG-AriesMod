# Activity Log filter + 500-entry history on the Pixi-rendered modal

## Context

Two mod features existed for the Activity Log modal:

1. **500-entry history**: the game's own Activity Log only keeps the last ~25 entries server-side. `src/services/activityLogHistory.ts` watches the `myActivityLog`/`myData.activityLogs` atom, merges new entries into a locally persisted history (capped at 500), and re-patches `Atoms.data.myData.activityLogs` (via `fakeActivityLogShow` in `src/services/fakeModal.ts`) whenever the modal opens, so the modal renders the extended history instead of the game's own truncated list.
2. **Filter by action**: `src/utils/activityLogFilter.ts` let the user filter the displayed entries by action category (buy/sell/harvest/...) via injected DOM buttons.

The game migrated the Activity Log modal from React/Chakra DOM rendering to native Pixi rendering (confirmed via static analysis of `docs/main-Brp3BbpW.js`, the current exported game bundle). The modal is class `KV` (extends a base modal class), with `this.container.label = "ActivityLogModal"`. Each row is class `CV` with `this.label = "ActivityLogRow"`. Rows are **not virtualized** — `rebuildList()` eagerly creates a real `new CV(...)` per visible entry and appends it to `scrollView.content`.

Crucially, the modal reads from a derived atom (`dy` in the bundle) sourced from `myData.activityLogs` — the exact same atom the 500-entry feature already patches. The modal reactively re-renders (`addOpenSubscription(dy, e => { this.sortedLogs = ...; this.rebuildList() })`, including its own native "Show more" pagination) whenever that atom's value changes.

This means:
- The 500-entry history feature already works unchanged — it operates purely at the atom/data layer, agnostic to how the modal renders.
- The filter feature is dead: it depended on DOM structure (Chakra classes `McGrid`/`McFlex`) that no longer exists.

The codebase already has an established pattern for reaching into the live Pixi scene graph and injecting mod UI (`src/sprite/pixi/hooks.ts`, `src/sprite/utils/pixi.ts`, `src/utils/sellAllPetsPixi.ts`): hook `__PIXI_APP_INIT__`/`__PIXI_RENDERER_INIT__` to get the live `app`/`renderer`/`stage`, walk the tree to find a node by `.label`, attach new `Container`/`Graphics`/`Text` children, and hand-roll canvas pointer hit-testing when Pixi's own event system doesn't route clicks to injected nodes (observed necessary for the keyboard-only `ActionHud`).

## Goal

Restore both features under Pixi rendering, reusing the existing atom-patching mechanism for filtering (not per-row Pixi manipulation), and building only the filter toolbar itself as native Pixi UI.

## Design

### 1. `src/utils/activityLogClassification.ts` (new, pure — no DOM, no Pixi)

Extracted from the old `src/utils/activityLogFilter.ts`:
- `ACTION_ORDER`, `ACTION_LABELS`, `ACTION_MAP`, `normalizeAbilityAction`.
- `classifyEntryAction(action: string): ActionKey` — classifies directly from the entry's `.action` field.

Simplification vs. the old code: the text-pattern regex fallback (`PATTERNS`, matching rendered strings like "harvest"/"bought") is dropped. It existed only because the old DOM approach sometimes had no reliable `data-action` attribute to read. Every activity log entry already carries a proper `.action` string in the data model, so classification is always exact — no guessing from rendered text.

### 2. `src/services/activityLogHistory.ts` (existing, small change)

`reopenFakeActivityLogFromHistory()` currently pushes the full 500-entry history unconditionally on modal open. It will instead call a helper exposed by the new Pixi filter module (`getFilteredHistoryForReopen()`) that applies the persisted active filter before pushing, so there's no flash of unfiltered content before the filter module re-asserts itself.

### 3. `src/utils/activityLogFilterPixi.ts` (new)

Responsibilities:
- **Finding the modal**: RAF-driven find/retry loop (same idiom as `sellAllPetsPixi.ts`) using `getSpriteState()`/`getStage()`/`findAcrossBranches` to locate the live node with `label === "ActivityLogModal"`.
- **Locating layout anchors**: once found, walks the modal's children to identify the title text node, the divider (`Graphics` instance), and the scroll view container — identified structurally (position/type), not by label, since only the modal and its rows carry labels.
- **Injecting the toolbar**: builds a button bar (`Container` + one `Graphics` background + `Text` label per action category) and inserts it between the title and the divider. Since there's no native space reserved for it, the module recalculates every active frame: toolbar position anchored under the title's real position/height, and the divider + scroll view (position and height) are shifted down by exactly the toolbar's height. All values are read from the live nodes' current positions/sizes (no hardcoded pixels), matching the reactive `toGlobal`/`toLocal` anchoring already used in `sellAllPetsPixi.ts`.
- **Interaction**: buttons first try native Pixi interactivity (`eventMode: 'static'` + `pointertap`) since this modal is normally mouse-driven (close button, scrollbar), unlike the keyboard-only `ActionHud`. If live testing shows clicks aren't routed, fall back to the hand-rolled canvas `pointerdown` + `toGlobal` hit-test pattern from `sellAllPetsPixi.ts`.
- **Filter state**: persisted via `readAriesPath`/`writeAriesPath` at key `activityLog.filter`, reapplied automatically on every modal reopen (matches prior behavior).
- **Applying a filter**: `filtered = activeFilter === 'all' ? history : history.filter(e => classifyEntryAction(e.action) === activeFilter)`, then `fakeActivityLogShow(filtered, { open: false })` (modal already open — just re-patch the data atom). The modal's own reactive subscription re-renders correctly, including its native "Show more" pagination recalculated against the filtered array length. No direct Pixi row manipulation is needed for filtering.
- **Button labels/counts**: computed from the full local history (not just the currently-rendered slice), same as before.
- **Robustness**: listens for the found node's `destroyed` event (WebGL context loss, full Pixi tree rebuild) to drop references and restart the find loop; gates on `Atoms.ui.activeModal` so the toolbar only exists/attaches while the Activity Log modal is actually open.

### Cleanup

Delete `src/utils/activityLogFilter.ts` entirely (dead DOM-based code) once its classification logic has been extracted.

## Known risk

Whether Pixi's native event system routes pointer events to injected buttons in this specific part of the tree is unconfirmed until tested against the live game (the existing `ActionHud` precedent needed a manual hit-test fallback, but that HUD element is keyboard-only by default, whereas the Activity Log modal is normally mouse-interactive). The implementation will try the native path first and fall back to manual hit-testing if needed.

## Testing

- Manual verification in the running game (Tampermonkey dev build): open Activity Log, confirm 500-entry history still populates, confirm filter buttons appear between title and divider, confirm each filter button correctly narrows the list and updates counts, confirm persisted filter survives modal close/reopen, confirm toolbar/list recovers after a simulated Pixi context loss if feasible to trigger.
- No automated test harness exists for Pixi UI in this repo; `npm run typecheck` must pass.
