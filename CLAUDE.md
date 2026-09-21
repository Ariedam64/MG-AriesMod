# Arie's Mod

Userscript (Tampermonkey) that hooks the Magic Garden client at runtime. TypeScript, esbuild, no framework.

## The two repos

| | |
|---|---|
| `magicGarden - Copie` | **this one.** Arie's Mod, remote `MG-AriesMod.git`. Source of truth. |
| `magicGarden` | MG-mod, remote `MG-mod.git`. A fork carrying its own extra work. |

Fixes land here first, then get ported. The fork is **not** a mirror: it has features this repo does not (ReplenishPotion in `services/pets.ts`, its own `chat/gardenRead.ts`), so a blind file copy breaks it. `/port` handles this. Never `cp` a file into the fork without checking whether it diverged.

## Commands

```bash
npm run build          # -> dist/quinoa-ws.min.user.js
npm run watch
npm run check:<name>   # see below
```

There is **no `tsconfig.json` and no typecheck script.** esbuild does the build without type checking, so a type error only shows up in the editor or via `npx tsc --noEmit` on a single file. The check scripts are the real safety net.

Check suites, all of which must pass before shipping:

`stats` `identity` `commands` `sprites` `cropsize` `harvestfilters` `locker` `abilitylogs` `growslot` `tilecapture` `deleters` `chat` `companion` `dialogue` `storage`

Each is `scripts/check<Name>.ts`, bundled by esbuild and run in node against a DOM stub (`scripts/_nodeStub.cjs` for the ones that pull in UI code). They print `ok`/`FAIL` lines and exit non-zero on failure.

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

All of it lives in `src/utils/cropSize.ts` and nowhere else. `readCropSize` understands both the current `size` field and the pre-rework `targetScale`. The pre-rework names (`targetScale` on the slot, `maxScale` on the catalog) are dead **for crops** but still live **for pets**, so do not rename them blindly.

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
