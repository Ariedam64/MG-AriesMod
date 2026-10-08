// audioPlayer.ts
// Scanner + Player + Groupes (harvest, toast, etc.)
// - Volume = valeur brute localStorage.soundEffectsVolumeAtom (0.001..0.2) × Howler master.
// - Réutilise un Howl existant si possible (préserve atténuations natives).

// ----------------- Types Howler (minimaux) -----------------
interface IHowl {
  play(id?: number): number;
  stop(id?: number): void;
  mute?(m?: boolean): boolean;
  volume(v?: number): number;
  playing?(id?: number): boolean;
  stereo?(v?: number): number;
  rate?(v?: number): number;
  _src?: string;
  _urls?: string[];
  _sounds?: any[];
  _sprite?: Record<string, [number, number, boolean?]>;
  _muted?: boolean;
  _loop?: boolean;
  _volume?: number;
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

// ----------------- Interfaces publiques -----------------
interface AudioPlayerOptions {
  atomKey?: string;   // clé localStorage (par défaut: "soundEffectsVolumeAtom")
  min?: number;       // 0.001
  max?: number;       // 0.2000000000000001
  gainFactor?: number;// 1.0 (micro-ajustement global)
  autoScan?: boolean; // lance un scan initial dans init()
  minVariantsPerAutoGroup?: number; // 2
}

interface SfxInfo {
  url: string;
  name?: string;
  logicalName?: string;
  sources?: string; // provenance(s): "perf, howler, cache:xxx, ref:xxx, dom, html"
}

interface VolumeInfo {
  raw: number | null;
  clamped: number;
  vol: number; // final = (clamped → 0 si ~min) × Howler master × gainFactor
}

// ----------------- Implémentation -----------------
class AudioPlayer {
  private found = new Set<string>();
  private meta = new Map<string, { from: Set<string>; name: string; logicalName: string }>();
  private groupsMap = new Map<string, Set<string>>();

  // config volume
  private atomKey: string;
  private min: number;
  private max: number;
  private gainFactor: number;

  // Howler cache local
  private howler: IHowlerGlobal | null = null;

  // options
  private minVariantsPerAutoGroup: number;

  constructor(opts: AudioPlayerOptions = {}) {
    this.atomKey = opts.atomKey ?? "soundEffectsVolumeAtom";
    this.min = opts.min ?? 0.001;
    this.max = opts.max ?? 0.2000000000000001;
    this.gainFactor = opts.gainFactor ?? 1.0;
    this.minVariantsPerAutoGroup = opts.minVariantsPerAutoGroup ?? 2;

    if (opts.autoScan) void this.init();
  }

  /** Lance un scan initial et reconstruit les groupes auto. */
  async init(): Promise<void> {
    await this.scanAll();
  }

  // ----------------- Utils -----------------
  private abs(u: string): string {
    try { return new URL(u, location.href).href; } catch { return u; }
  }
  private isMP3(u: string): boolean {
    return /\.mp3(?:[\?#][^\s'"]*)?$/i.test(u);
  }
  private fileName(u: string): string {
    try { return new URL(u, location.href).pathname.split("/").pop() || u; }
    catch { return String(u); }
  }
  private logicalName(fileName: string): string {
    return fileName.replace(/-[A-Za-z0-9_=-]{6,}(?=\.mp3$)/i, "");
  }
  private clamp(x: number, a: number, b: number): number {
    return Math.max(a, Math.min(b, x));
  }
  private choose<T>(arr: T[]): T | undefined {
    return arr && arr.length ? arr[(Math.random() * arr.length) | 0] : undefined;
  }
  private toKey(name: string): string {
    return String(name || "").trim().toLowerCase();
  }

  private add(u: string, sourceTag: string): void {
    if (!u || !this.isMP3(u)) return;
    const url = this.abs(u);
    if (!this.found.has(url)) {
      this.found.add(url);
      const name = this.fileName(url);
      this.meta.set(url, { from: new Set([sourceTag]), name, logicalName: this.logicalName(name) });
    } else {
      this.meta.get(url)?.from.add(sourceTag);
    }
  }

  private refreshHowler(): IHowlerGlobal | null {
    this.howler = (window.Howler && Array.isArray(window.Howler._howls)) ? window.Howler : null;
    return this.howler;
  }

  private sameAsset(a: string, b: string): boolean {
    try {
      const A = new URL(a, location.href).href;
      const B = new URL(b, location.href).href;
      if (A === B) return true;
      const fn = (p: string) => new URL(p, location.href).pathname.split("/").pop()!;
      const la = this.logicalName(fn(A));
      const lb = this.logicalName(fn(B));
      return la === lb;
    } catch { return a === b; }
  }

  private readAtomRaw(): number | null {
    const raw = localStorage.getItem(this.atomKey);
    if (raw == null) return null;
    try {
      const val = JSON.parse(raw);
      if (typeof val === "number") return val;
      const m = JSON.stringify(val).match(/-?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : null;
    } catch {
      const m = String(raw).match(/-?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : null;
    }
  }

  private howlerMaster(): number {
    try { return (window.Howler && typeof window.Howler.volume === "function") ? window.Howler.volume() : 1; }
    catch { return 1; }
  }

  // 0.001 est considéré comme un vrai mute (→ 0)
  private finalVolumeObj(): VolumeInfo {
    let raw = this.readAtomRaw();
    if (raw == null) raw = this.max;
    const clamped = this.clamp(raw, this.min, this.max);
    const nearMute = Math.abs(clamped - this.min) < 1e-6 ? 0 : clamped;
    const vol = nearMute * this.howlerMaster() * this.gainFactor;
    return { raw, clamped, vol };
  }

  // ----------------- Scanners -----------------
  private async scanPerformance(): Promise<void> {
    performance.getEntriesByType("resource")
      .map((e: PerformanceEntry) => (e as PerformanceResourceTiming).name)
      .filter(Boolean)
      .forEach((u: string) => this.add(u, "perf"));
  }

  private async scanHowler(): Promise<void> {
    this.refreshHowler();
    if (!this.howler) return;
    this.howler._howls.forEach((h) => {
      const src = h && (h._src || (h._urls && h._urls[0]));
      if (src) this.add(src, "howler");
    });
  }

  private async scanCaches(): Promise<void> {
    if (!("caches" in window)) return;
    try {
      const keys = await caches.keys();
      for (const k of keys) {
        const c = await caches.open(k);
        const reqs = await c.keys();
        for (const r of reqs) {
          const u = r.url;
          if (this.isMP3(u)) this.add(u, `cache:${k}`);
        }
      }
    } catch { /* silent */ }
  }

  private async fetchText(u: string): Promise<string> {
    try {
      const res = await fetch(u, { mode: "same-origin", credentials: "same-origin" });
      if (!res.ok) return "";
      const ct = res.headers.get("content-type") || "";
      if (!/javascript|ecmascript|css|html/i.test(ct)) return "";
      return await res.text();
    } catch { return ""; }
  }

  private extractMp3s(text: string): string[] {
    if (!text) return [];
    const re = /["'`](\/?[^"'`)\s]+?\.mp3(?:\?[^"'`\s]*)?)["'`]/ig;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push(m[1]);
    return out;
  }

  private async scanResourcesForRefs(): Promise<void> {
    const urls = new Set<string>();
    document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src],link[rel=\"stylesheet\"][href]")
      .forEach((el) => {
        const u = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href;
        try {
          const url = new URL(u, location.href);
          if (url.origin === location.origin) urls.add(url.href);
        } catch { /* ignore */ }
      });
    urls.add(location.href); // HTML courant
    const texts = await Promise.all([...urls].map((u) => this.fetchText(u)));
    texts.forEach((t, i) => {
      for (const match of this.extractMp3s(t)) this.add(match, `ref:${[...urls][i]}`);
    });
  }

  private async scanDOM(): Promise<void> {
    document.querySelectorAll<HTMLAudioElement>("audio[src]")
      .forEach((a) => this.add(a.getAttribute("src") || "", "dom"));
    document.querySelectorAll<HTMLSourceElement>("source[src]")
      .forEach((s) => this.add(s.getAttribute("src") || "", "dom"));
    const html = document.documentElement?.outerHTML || "";
    for (const m of this.extractMp3s(html)) this.add(m, "html");
  }

  async scanAll(): Promise<string[]> {
    this.found.clear();
    this.meta.clear();
    await Promise.all([
      this.scanPerformance(),
      this.scanHowler(),
      this.scanCaches(),
      this.scanDOM(),
    ]);
    await this.scanResourcesForRefs();
    this.autoGroups({ overwrite: true }); // ← utilise l'unique méthode publique
    return this.urls();
  }

  // ----------------- Groupes -----------------
  private inferGroupKey(logicalName: string): string {
    const base = String(logicalName || "").replace(/\.mp3$/i, "");
    let m = base.match(/^([A-Za-z]+)[_\-]/);     // Harvest_01 -> harvest
    if (m) return m[1].toLowerCase();
    m = base.match(/^([A-Za-z]+)\d+$/);          // Harvest01  -> harvest
    if (m) return m[1].toLowerCase();
    m = base.match(/^([A-Za-z]+)/);              // fallback premier mot
    return m ? m[1].toLowerCase() : base.toLowerCase();
  }

  defineGroup(
    name: string,
    matcher: RegExp | string | ((url: string, meta?: { name: string; logicalName: string }) => boolean)
  ): string[] {
    const key = this.toKey(name);
    const set = new Set<string>();
    const items = this.urls().map((u) => [u, this.meta.get(u)] as const);

    const test = (url: string, meta?: { name: string; logicalName: string }): boolean => {
      if (!matcher) return false;
      if (typeof matcher === "function") return !!matcher(url, meta);
      const ln = meta?.logicalName || meta?.name || url;
      if (matcher instanceof RegExp) return matcher.test(ln) || matcher.test(url);
      const txt = String(matcher).toLowerCase();
      return ln.toLowerCase().startsWith(txt) || url.toLowerCase().includes("/" + txt);
    };

    for (const [url, meta] of items)
      if (test(url, meta && { name: meta.name, logicalName: meta.logicalName })) set.add(url);

    this.groupsMap.set(key, set);
    return [...set];
  }

  undefineGroup(name: string): void {
    this.groupsMap.delete(this.toKey(name));
  }

  // --- Unique implémentation publique ---
  autoGroups({ overwrite = false, minVariants = this.minVariantsPerAutoGroup } = {}): Record<string, string[]> {
    this.rebuildAutoGroups(overwrite, minVariants);
    return this.groups();
  }

  // Helper privé appelé par autoGroups()
  private rebuildAutoGroups(overwrite: boolean, minVariants: number): void {
    const tmp = new Map<string, Set<string>>();
    for (const [url, m] of this.meta.entries()) {
      const grp = this.inferGroupKey(m?.logicalName || m?.name || url);
      if (!tmp.has(grp)) tmp.set(grp, new Set<string>());
      tmp.get(grp)!.add(url);
    }
    for (const [grp, set] of tmp.entries()) {
      if (set.size < minVariants) continue;
      if (overwrite || !this.groupsMap.has(grp)) this.groupsMap.set(grp, set);
    }
  }

  groups(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [k, set] of this.groupsMap.entries()) out[k] = [...set];
    return out;
  }

  getGroup(name: string): string[] {
    const set = this.groupsMap.get(this.toKey(name));
    return set ? [...set] : [];
  }

  pick(name: string): string | undefined {
    const g = this.getGroup(name);
    return this.choose(g);
  }

  // ----------------- Lecture -----------------
  private findExistingHowlByUrl(url: string): IHowl | null {
    this.refreshHowler();
    if (!this.howler) return null;
    for (const h of this.howler._howls) {
      const src = h && (h._src || (h._urls && h._urls[0]));
      if (src && this.sameAsset(src, url)) return h;
    }
    return null;
  }

  /** Volume calculé selon config + atom du jeu. */
  getGameSfxVolume(): VolumeInfo { return this.finalVolumeObj(); }

  /** Ajoute un offset global (sans toucher à l’atom du jeu). */
  setGainFactor(g: number = 1): void { this.gainFactor = +g || 1; }

  /** Permet d’adapter la clé et la plage de l’atom si ça change côté jeu. */
  setAtomConfig(key = "soundEffectsVolumeAtom", min = 0.001, max = 0.2000000000000001): void {
    this.atomKey = key; this.min = min; this.max = max;
  }

  /** Joue une URL en respectant le volume du jeu et Howler si dispo. */
  playUrl(url: string): IHowl | HTMLAudioElement | null {
    const { vol } = this.finalVolumeObj();

    const existing = this.findExistingHowlByUrl(url);
    if (existing) { try { existing.play(); return existing; } catch { /* ignore */ } }

    const Howl = (window.Howl && window.Howler) ? window.Howl : null;
    if (Howl) { try { const h = new Howl({ src: [url], volume: vol }); h.play(); return h; } catch { /* ignore */ } }

    try {
      const a = new Audio(url);
      a.volume = Math.max(0, Math.min(1, vol));
      void a.play().catch(() => {});
      return a;
    } catch { return null; }
  }

  /** Joue par motif (RegExp ou texte partiel). */
  playBy(matcher: RegExp | string): IHowl | HTMLAudioElement | null {
    const list = this.urls();
    const re = (matcher instanceof RegExp)
      ? matcher
      : new RegExp(String(matcher).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const hit = list.find((u) => re.test(u));
    return hit ? this.playUrl(hit) : null;
  }

  /** Joue par nom logique exact si possible, sinon via motif. */
  play(nameOrRegex: string | RegExp): IHowl | HTMLAudioElement | null {
    if (typeof nameOrRegex === "string") {
      const m = this.map();
      if (m[nameOrRegex]?.[0]) return this.playUrl(m[nameOrRegex][0]);
    }
    return this.playBy(nameOrRegex as RegExp);
  }

  /** Joue une entrée d’un groupe (index fixe, ou aléatoire). */
  playGroup(
    name: string,
    opts: { index?: number; random?: boolean; filter?: (url: string, meta?: { name: string; logicalName: string }) => boolean } = {}
  ): IHowl | HTMLAudioElement | null {
    const { index, random = true, filter } = opts;
    let list = this.getGroup(name);
    if (!list.length) return null;
    if (typeof filter === "function") {
      list = list.filter((u) => {
        const m = this.meta.get(u);
        return filter(u, m && { name: m.name, logicalName: m.logicalName });
      });
      if (!list.length) return null;
    }
    const url = (typeof index === "number")
      ? list[(index % list.length + list.length) % list.length]
      : (random ? this.choose(list)! : list[0]);
    return this.playUrl(url);
  }

  /** Alias pratique pour jouer une variation aléatoire d’un groupe (ex: "harvest"). */
  playRandom(name: string): IHowl | HTMLAudioElement | null {
    return this.playGroup(name, { random: true });
  }

  // ----------------- Tables & export -----------------
  urls(): string[] { return [...this.found]; }

  map(): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const [url, m] of this.meta.entries()) {
      const key = m.logicalName || m.name;
      (map[key] ||= []).push(url);
    }
    return map;
  }

  info(): SfxInfo[] {
    return this.urls().map((u) => {
      const m = this.meta.get(u);
      return { url: u, name: m?.name, logicalName: m?.logicalName, sources: [...(m?.from || [])].join(",") };
    });
  }

  /** Exporte JSON (URLs + groupes). Retourne la string. */
  exportJSON(): string {
    return JSON.stringify({ urls: this.info(), groups: this.groups() }, null, 2);
  }

  /** Scan public de commodité. */
  async scan(): Promise<string[]> { return this.scanAll(); }

  /* Helpers */

  playHarvest(): IHowl | HTMLAudioElement | null {
    return this.playGroup("harvest");
  }

  playPlantSeed(): IHowl | HTMLAudioElement | null {
    return this.playGroup("plantseed");
  }

  playWaterPlant(): IHowl | HTMLAudioElement | null {
    return this.playBy("water");
  }

  playDestroyPlant(): IHowl | HTMLAudioElement | null {
    return this.playBy("Break_Dirt")
  }

  playDestroyStone(): IHowl | HTMLAudioElement | null {
    return this.playBy("Break_Stone")
  }

  /** Joue une URL à un volume fixe (0-1), indépendamment du volume SFX du jeu. */
  playAt(url: string, volume: number): void {
    const clampedVol = Math.max(0, Math.min(1, volume));
    try {
      const a = new Audio(url);
      a.volume = clampedVol;
      void a.play().catch(() => {});
    } catch { /* ignore */ }
  }

  playSellNotification(): IHowl | HTMLAudioElement | null {
    return this.playBy("Score_PlusOne")
  }

  playInfoNotification(): IHowl | HTMLAudioElement | null {
    return this.playBy("Keyboard_Enter_01")
  }

  playBuy(): IHowl | HTMLAudioElement | null {
    return this.playGroup("coinbuy")
  }

}

export const audioPlayer = new AudioPlayer({ autoScan: true });
