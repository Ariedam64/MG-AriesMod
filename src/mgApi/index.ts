// mgApi/index.ts
// Public entrypoint for the "Magic Garden API" client (mg-api.ariedam.fr):
// game sprite/audio assets, unrelated to ariesModAPI (the mod's social backend).

export { API_BASE_URL } from "./config";
export { mgApiGetJson, mgApiGetBinary, buildMgApiUrl } from "./client/http";
export {
  fetchSpriteCatalog,
  composedSpriteUrl,
  isComposableCategory,
  type SpriteCatalogEntry,
  type SpriteCatalogResponse,
} from "./endpoints/sprites";
export {
  fetchAudioCatalog,
  type AudioTheme,
  type AudioSfxItem,
  type AudioCatalogResponse,
} from "./endpoints/audio";
