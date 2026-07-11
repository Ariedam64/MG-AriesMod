// mgApi/endpoints/audio.ts

import { mgApiGetJson } from "../client/http";

export type AudioTheme = { name: string; ambience?: string; music?: string };
export type AudioSfxItem = { name: string; start: number; end: number; duration: number };

export type AudioCatalogResponse = {
  baseUrl: string;
  themes: AudioTheme[];
  sfx: { url: string; items: AudioSfxItem[] };
};

/** Full audio catalog: per-area music/ambience themes + the SFX atlas (single mp3 + timing slices). */
export async function fetchAudioCatalog(): Promise<AudioCatalogResponse | null> {
  return mgApiGetJson<AudioCatalogResponse>("/assets/audios");
}
