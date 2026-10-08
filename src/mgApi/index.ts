// mgApi/index.ts
// Public entrypoint for the "Magic Garden API" client (mg-api.ariedam.fr):
// game sprite/audio assets, unrelated to ariesModAPI (the mod's social backend).

;
export { mgApiGetBinary } from "./client/http";
export {
  fetchSpriteCatalog,
  composedSpriteUrl,
  
  
  type SpriteCatalogResponse,
} from "./endpoints/sprites";
export {
  fetchAudioCatalog,
  
  type AudioSfxItem,
  type AudioCatalogResponse,
} from "./endpoints/audio";
