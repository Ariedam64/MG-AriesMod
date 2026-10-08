/**
 * Plays the game's own sound effects at the game's own volume.
 *
 * The mp3 URLs are not known in advance (they carry a build hash), so at boot
 * the page is scanned for them: loaded resources, Howler's sounds, the cache
 * storage, the DOM, and the text of the page's same-origin scripts and styles.
 * Sounds whose names share a prefix (Harvest_01, Harvest_02, ...) form a group
 * a random variation can be picked from.
 *
 * Volume is the game's sound effects setting times Howler's master volume. An
 * existing Howl for the same asset is reused when there is one, which keeps the
 * game's own attenuation.
 */

interface IHowl {
  play(id?: number): number;
  volume(v?: number): number;
  _src?: string;
  _urls?: string[];
}

interface IHowlerGlobal {
  _howls: IHowl[];
  volume(v?: number): number;
}

type HowlCtor = new (opts: { src: string[]; volume?: number }) => IHowl;

declare global {
  interface Window {
    Howler?: IHowlerGlobal;
    Howl?: HowlCtor;
  }
}

type Played = IHowl | HTMLAudioElement | null;

/**
 * The game's sound effects volume. It lives in the game's own localStorage
 * entry (a jotai atomWithStorage), not in the mod's storage, so it is read
 * straight from localStorage.
 */
const VOLUME_STORAGE_KEY = "soundEffectsVolumeAtom";
const VOLUME_MIN = 0.001;
const VOLUME_MAX = 0.2000000000000001;
const MIN_VARIANTS_PER_GROUP = 2;

const MP3_URL = /\.mp3(?:[\?#][^\s'"]*)?$/i;
const MP3_IN_TEXT = /["'`](\/?[^"'`)\s]+?\.mp3(?:\?[^"'`\s]*)?)["'`]/ig;

const absolute = (u: string): string => {
  try { return new URL(u, location.href).href; } catch { return u; }
};

const fileName = (u: string): string => {
  try { return new URL(u, location.href).pathname.split("/").pop() || u; } catch { return String(u); }
};

/** A file name without its build hash: `Harvest_01-a1B2c3.mp3` -> `Harvest_01.mp3`. */
const logicalName = (name: string): string => name.replace(/-[A-Za-z0-9_=-]{6,}(?=\.mp3$)/i, "");

/** The group a sound belongs to: Harvest_01 and Harvest01 both go to "harvest". */
function groupKeyOf(name: string): string {
  const base = String(name || "").replace(/\.mp3$/i, "");
  const m = base.match(/^([A-Za-z]+)[_\-]/) ?? base.match(/^([A-Za-z]+)\d+$/) ?? base.match(/^([A-Za-z]+)/);
  return m ? m[1].toLowerCase() : base.toLowerCase();
}

function extractMp3s(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  let m: RegExpExecArray | null;
  MP3_IN_TEXT.lastIndex = 0;
  while ((m = MP3_IN_TEXT.exec(text))) out.push(m[1]);
  return out;
}

function sameAsset(a: string, b: string): boolean {
  try {
    const A = new URL(a, location.href).href;
    const B = new URL(b, location.href).href;
    return A === B || logicalName(fileName(A)) === logicalName(fileName(B));
  } catch {
    return a === b;
  }
}

function howler(): IHowlerGlobal | null {
  return window.Howler && Array.isArray(window.Howler._howls) ? window.Howler : null;
}

function readGameVolume(): number | null {
  const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
  if (raw == null) return null;
  let text = raw;
  try {
    const val = JSON.parse(raw);
    if (typeof val === "number") return val;
    text = JSON.stringify(val);
  } catch {}
  const m = String(text).match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** The volume to play at: the game's setting (the minimum counts as muted) times Howler's master. */
function effectiveVolume(): number {
  const raw = readGameVolume() ?? VOLUME_MAX;
  const clamped = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, raw));
  const setting = Math.abs(clamped - VOLUME_MIN) < 1e-6 ? 0 : clamped;
  let master = 1;
  try {
    if (window.Howler && typeof window.Howler.volume === "function") master = window.Howler.volume();
  } catch {}
  return setting * master;
}

async function fetchText(u: string): Promise<string> {
  try {
    const res = await fetch(u, { mode: "same-origin", credentials: "same-origin" });
    if (!res.ok) return "";
    if (!/javascript|ecmascript|css|html/i.test(res.headers.get("content-type") || "")) return "";
    return await res.text();
  } catch {
    return "";
  }
}

class AudioPlayer {
  /** Every mp3 found, by absolute URL, with its name without the hash. */
  private found = new Map<string, string>();
  private groupsMap = new Map<string, string[]>();

  constructor() {
    void this.scanAll();
  }

  private add(u: string): void {
    if (!u || !MP3_URL.test(u)) return;
    const url = absolute(u);
    if (!this.found.has(url)) this.found.set(url, logicalName(fileName(url)));
  }

  private scanPerformance(): void {
    for (const entry of performance.getEntriesByType("resource")) {
      this.add((entry as PerformanceResourceTiming).name);
    }
  }

  private scanHowler(): void {
    for (const h of howler()?._howls ?? []) {
      const src = h && (h._src || h._urls?.[0]);
      if (src) this.add(src);
    }
  }

  private async scanCaches(): Promise<void> {
    if (!("caches" in window)) return;
    try {
      for (const k of await caches.keys()) {
        const cache = await caches.open(k);
        for (const r of await cache.keys()) this.add(r.url);
      }
    } catch {}
  }

  private scanDOM(): void {
    document.querySelectorAll<HTMLAudioElement>("audio[src]").forEach((a) => this.add(a.getAttribute("src") || ""));
    document.querySelectorAll<HTMLSourceElement>("source[src]").forEach((s) => this.add(s.getAttribute("src") || ""));
    for (const m of extractMp3s(document.documentElement?.outerHTML || "")) this.add(m);
  }

  /** The mp3 paths named in the page itself and its same-origin scripts and stylesheets. */
  private async scanResourcesForRefs(): Promise<void> {
    const urls = new Set<string>();
    document
      .querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"][href]')
      .forEach((el) => {
        const u = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href;
        try {
          const url = new URL(u, location.href);
          if (url.origin === location.origin) urls.add(url.href);
        } catch {}
      });
    urls.add(location.href);
    const texts = await Promise.all([...urls].map(fetchText));
    for (const text of texts) for (const m of extractMp3s(text)) this.add(m);
  }

  private async scanAll(): Promise<void> {
    this.found.clear();
    this.scanPerformance();
    this.scanHowler();
    this.scanDOM();
    await this.scanCaches();
    await this.scanResourcesForRefs();

    const groups = new Map<string, string[]>();
    for (const [url, name] of this.found) {
      const key = groupKeyOf(name);
      groups.set(key, [...(groups.get(key) ?? []), url]);
    }
    for (const [key, list] of groups) {
      if (list.length >= MIN_VARIANTS_PER_GROUP) this.groupsMap.set(key, list);
    }
  }

  private findExistingHowl(url: string): IHowl | null {
    for (const h of howler()?._howls ?? []) {
      const src = h && (h._src || h._urls?.[0]);
      if (src && sameAsset(src, url)) return h;
    }
    return null;
  }

  /** Plays a URL at the game's volume, through Howler when it is there. */
  private playUrl(url: string): Played {
    const vol = effectiveVolume();

    const existing = this.findExistingHowl(url);
    if (existing) {
      try { existing.play(); return existing; } catch {}
    }

    const Howl = window.Howl && window.Howler ? window.Howl : null;
    if (Howl) {
      try { const h = new Howl({ src: [url], volume: vol }); h.play(); return h; } catch {}
    }

    try {
      const a = new Audio(url);
      a.volume = Math.max(0, Math.min(1, vol));
      void a.play().catch(() => {});
      return a;
    } catch {
      return null;
    }
  }

  /** Plays the first sound whose URL matches (a RegExp, or text matched case-insensitively). */
  playBy(matcher: RegExp | string): Played {
    const re = matcher instanceof RegExp
      ? matcher
      : new RegExp(String(matcher).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const hit = [...this.found.keys()].find((u) => re.test(u));
    return hit ? this.playUrl(hit) : null;
  }

  /** Plays a random variation of a group ("harvest", "plantseed", ...), or null if there is none. */
  playGroup(name: string): Played {
    const list = this.groupsMap.get(String(name || "").trim().toLowerCase()) ?? [];
    if (!list.length) return null;
    return this.playUrl(list[(Math.random() * list.length) | 0]);
  }

  playSellNotification(): Played {
    return this.playBy("Score_PlusOne");
  }
}

export const audioPlayer = new AudioPlayer();
