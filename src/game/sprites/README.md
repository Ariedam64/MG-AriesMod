# Sprite (proposed split)

Module layout and responsibilities for the sprite catalog. Below is a proposed folder tree (each file can be split further if needed).

```
sprite/
  index.ts                 -> Gemini module entrypoint (bootstrap, provider wiring, start/stop)
  config.ts                -> CFG/mutation metadata (MUT_META, MUT_NAMES...) and UI constants
  types.ts                 -> shared types (Item, AnimGroup, VariantSignature, Job, CacheEntry, Captures...)
  state.ts                 -> central state + selectors (open/loaded, filters, selection, LRU caches, pools)

  utils/
    async.ts               -> sleep/raf/nextFrame, timeout helpers
    path.ts                -> join/dir/rel/split helpers (key -> category/label)
    pixi.ts                -> generic PIXI helpers (getCtors, texGeom, baseTexOf, rememberBaseTex)

  pixi/
    hooks.ts               -> PIXI init hooks (__PIXI_APP_INIT__, __PIXI_RENDERER_INIT__) + destroy probes
    capture.ts             -> global capture (generateTexture hooks, dumpCaptures/globalCaptures)
    variantGenerator.ts    -> variant/mutation generation (Canvas filters, gradients, overlays, tall/short icons)
    atlasBuilder.ts        -> build textures from atlases (buildAtlasTextures/mkSubTex)

  data/
    manifestLoader.ts      -> manifest/atlas download (GM_xmlhttpRequest), blobToImage, buildAllTextures
    itemsBuilder.ts        -> build items/animations, categories, text filters

  runtime/
    jobQueue.ts            -> generation job queue (budget/frame, RAF bursts, resetJobs)
    variantBuilder.ts      -> resolveTexByKey, curVariant, getGenerated/addMutationIcons orchestration

  ui/                      -> HUD separate from logic
    hud.ts                 -> overlay creation (DOM/PIXI Container), show/hide, keyboard/scroll wiring
    controls.ts            -> category/text/filter/mutation inputs, updateCount(), toggle
    grid.ts                -> grid virtualization (pool, makeCell, layout, animations)
    styles.css             -> overlay styles (if CSS is pulled out of inline)

  api/
    expose.ts              -> expose MGSpriteCatalog on unsafeWindow (open/close/toggle, setCategory/filter/mutation, dumps)
```

Notes:
- HUD stays in `ui/*`; asset/mutation logic stays in `pixi/*`, `data/*`, `runtime/*`.
- `index.ts` orchestrates: waits for PIXI hooks, loads assets via `manifestLoader`, builds items, sets up HUD, and exposes API.
- `variantGenerator.ts` groups filters (ColorBlendPreserveAlphaFilter, color matrices, gradients) and icon composition.
- `jobQueue.ts` covers lazy generation scheduling.
- `capture.ts` hosts debug functions (global/local captures) to avoid polluting the normal logic.
