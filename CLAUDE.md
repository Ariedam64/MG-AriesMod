# Arie's Mod

Userscript (Tampermonkey) that hooks the Magic Garden client at runtime. TypeScript, esbuild, no framework.

## The two repos

| | |
|---|---|
| `magicGarden - Copie` | **this one.** Arie's Mod, remote `MG-AriesMod.git`. Source of truth. |
| `magicGarden` | MG-mod, remote `MG-mod.git`. A fork carrying its own extra work. |

Fixes land here first, then get ported. The fork is **not** a mirror: it has features this repo does not (ReplenishPotion in `services/pets.ts`, its own `chat/gardenRead.ts`), so a blind file copy breaks it. `/port` handles this. Never `cp` a file into the fork without checking whether it diverged.

## Layout

`src/` is organised by feature. A bug in the locker lives in `features/locker/`, logic and menu together.

| Folder | Holds |
|---|---|
| `lib/` | helpers that know nothing about the game |
| `platform/` | the userscript environment: GM requests, `aries_mod` storage, Discord, the mod's own APIs |
| `game/` | access to the running game: socket hook and commands (`ws/`), jotai store (`store/`), Pixi sprites and tiles, modals, the local player |
| `data/` | catalogs (live API over the bundled copy) and the shared game rules in `data/rules/` |
| `features/` | one folder per player-facing feature |
| `ui/` | HUD, toasts, and the component kit in `ui/kit/` |

`lib/`, `platform/`, `game/` and `data/` never import from `features/` or `ui/`. Features build on them and on `ui/kit/`, and `main.ts` with `ui/hud.ts` puts the features together.

## Code style

- Comments, identifiers and log messages in English. Text shown to players stays as it is.
- No path banner at the top of a file (`// src/utils/x.ts`): it goes stale on the first move.
- One responsibility per file, and a file past about 400 lines is a sign it holds two.
- Reuse `lib/` before writing a helper: `sleep`, `waitUntil`, `debounce` (`lib/async`), `clamp` (`lib/math`), `pickOne`, `chance`, `Random` (`lib/random`), `Emitter`, `Subscriptions` (`lib/emitter`), `formatInteger`, `formatPrice`, `pad2` (`lib/format`).
- Settings go through `platform/storage` (`readAriesPath`/`writeAriesPath`), never raw `localStorage`.
- Read catalogs inside functions, never into a module-level constant (see below).
- A watcher keeps its unsubscribers in a `Subscriptions` and undoes them in its `stop`.
- Strings the game owns (atom labels, message types, field names) are never renamed, even when they read badly.
- `any` is fine at the boundary with the minified game; inside the mod, give things types.
- Menus use the components in `ui/kit/` and its colour tokens, not hand-rolled buttons or literal colours.

## Commands

```bash
npm run build          # -> dist/quinoa-ws.min.user.js
npm run watch
npm run typecheck      # strict tsc over src/, esbuild itself never type checks
npm run check          # every check suite
npm run check:<name>   # one suite
```

Each suite is `scripts/check<Name>.ts`, bundled by esbuild and run in node against a DOM stub (`scripts/_nodeStub.cjs` for the ones that pull in UI code). They print `ok`/`FAIL` lines and exit non-zero on failure. All of them, and the typecheck, must pass before shipping.

## Releasing

The version lives in **`meta.userscript.js`** only, and `dist/quinoa-ws.min.user.js` is **committed**. So a bump that is not followed by a build ships the old code under a new number. Always confirm the `@version` inside the built `dist/` before committing. `/ship` does this; a hook blocks the commit if `dist/` is older than `src/`.

## Working against the game

The mod patches a minified bundle, so almost every bug is "the game renamed something".

**Always re-check the live version before diagnosing.** `curl -L https://magicgarden.gg/` gives `/version/NNNN/`. A locally crawled bundle in `C:/tmp/mgNNNN` goes stale in days (1125 to 1169 in five, 1169 to 1206 in three). A conclusion drawn from the wrong build looks perfectly well evidenced and is simply wrong. Full crawl procedure: memory `live-game-bundle-download`.

Grep the bundle for **string literals** (message names, jotai `debugLabel`s, field names), never for minified identifiers.

Two failure modes that are silent and have both bitten this repo:

- **A jotai atom resolved by a label the game no longer has.** `set`/`subscribe` become no-ops, so a whole feature dies without an error. `makeAliasedAtom([...])` exists for this.
- **A catalog read at import time.** `src/data/index.ts` serves the live API first and the bundled copy as a fallback, but at `document-start` the API has not answered. Anything captured into a module-level `const` is pinned to the stale bundled copy for the session. Read catalogs lazily.

Never hardcode game data. It comes from the catalogs in `src/data/`, which merge the live API over the bundled fallback.

## Crop Size

Whole number in `[50, 100]`. `multiplier = 1 + (maxSizeMultiplier - 1) * (size - 50) / 50`.

All of it lives in `src/data/rules/cropSize.ts` and nowhere else. `readCropSize` understands both the current `size` field and the pre-rework `targetScale`. The pre-rework names (`targetScale` on the slot, `maxScale` on the catalog) are dead **for crops** but still live **for pets**, so do not rename them blindly.

## Fixing a bug

Root cause before any fix, every time. The last four reports all turned out to be something other than what was described:

- "crop price not displaying" was the wrong mod build installed
- "editor does nothing" was the engine capture predicate matching nothing after a game refactor
- "can't harvest Aloe" was everything being blocked, all species
- "Double Hatch missing from logs" was a frozen module constant dropping 19 abilities

Write the failing check **before** the fix, register it in `package.json`, and confirm it fails on the old behaviour before keeping it.

## Writing

No em dashes, anywhere: not in the UI, not in comments, not in commit messages. Write sentences as they would be said.

Commit messages: a subject line saying what changed for the player, then what was actually wrong and why, in prose. Not a bullet list of files.
