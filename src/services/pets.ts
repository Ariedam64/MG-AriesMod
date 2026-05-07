// src/services/pets.ts
import {
  PlayerService,
  type PetInfo,
  type PetState,
  type CropItem,
  type CropInventoryState,
} from "./player";
import { petCatalog, petAbilities, plantCatalog } from "../data";
import { fakeInventoryShow, closeInventoryPanel, isInventoryOpen } from "./fakeModal.ts";
import { Atoms, myPetHutchPetItems, myNumPetHutchItems, isMyInventoryAtMaxLength } from "../store/atoms";
import { toastSimple } from "../ui/toast";
import { Hotkey, matchHotkey, stringToHotkey } from "../ui/menu.ts";
import {
  getKeybind,
  getPetTeamActionId,
  onKeybindChange,
  setKeybind,
  updatePetKeybinds,
  PET_TEAM_NEXT_ID,
  PET_TEAM_PREV_ID,
} from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";
import { StatsService } from "./stats";
import { readAriesPath, writeAriesPath } from "../utils/localStorage";
import { shareGlobal } from "../utils/page-context";

/* ----------------------------- Types & constants ----------------------------- */

export type PetTeam = {
  id: string;
  name: string;
  slots: (string | null)[];
};

export type InventoryPet = {
  id: string;
  itemType: "Pet";
  petSpecies: string;
  name: string | null;
  xp: number;
  hunger: number;
  mutations: string[];
  targetScale?: number;
  abilities: string[];
};

export type AutofeedTrigger = {
  pet: PetInfo;
  petId: string;
  species: string;
  hungerPct: number;
  thresholdPct: number;
  allowedCrops: string[];
  chosenItem?: CropItem | null;
  didUnfavorite?: boolean;
};

export type PetOverride = {
  enabled: boolean;
  thresholdPct: number;
  crops: Record<string, { allowed: boolean }>;
};

export type PetOverridesMap = Record<string, PetOverride>;

export type InstantFeedOverride = {
  crops: Record<string, { allowed: boolean }>;
};

export type InstantFeedOverridesMap = Record<string, InstantFeedOverride>;

export type PetsUIState = {
  selectedPetId: string | null;
};

type PetImgEntry = { img64?: { normal?: string; gold?: string; rainbow?: string } };
type PetCatalogLoose = Record<string, PetImgEntry>;

const PATH_PETS_OVERRIDES = "pets.overrides";
const PATH_PETS_INSTANT_FEED = "pets.instantFeed";
const PATH_PETS_UI = "pets.ui";
const PATH_PETS_TEAMS = "pets.teams";
const PATH_PETS_TEAM_SEARCH = "pets.teamSearch";
const PATH_PETS_HOTKEYS = "pets.hotkeys";
const PATH_PETS_ABILITY_LOGS = "pets.abilityLogs";

/** Abilities that boost mutation chance based on weather — excluded from the pets logs. */
const WEATHER_MUTATION_BOOST_IDS = new Set([
  "ProduceMutationBoost",
  "ProduceMutationBoostII",
  "ProduceMutationBoostIII",
  "DawnBoost",
  "AmberMoonBoost",
  "SnowyCropMutationBoost",
  "PetMutationBoost",
  "PetMutationBoostII",
  "PetMutationBoostIII",
]);

/* -------------------------------- HOTKEYS ----------------------------------- */

const TEAM_HK_MAP = new Map<string, Hotkey>();
const TEAM_HK_UNSUBS = new Map<string, () => void>();
let hkNextTeam: Hotkey | null = null;
let hkPrevTeam: Hotkey | null = null;
let unsubNextHotkey: (() => void) | null = null;
let unsubPrevHotkey: (() => void) | null = null;
let orderedTeamIds: string[] = [];
let lastUsedTeamId: string | null = null;
let _lastTeamHotkeyAt = 0;

export type TeamLite = { id: string; name?: string | null };

function syncTeamHotkey(teamId: string): void {
  const hk = getKeybind(getPetTeamActionId(teamId));
  if (hk) TEAM_HK_MAP.set(teamId, hk);
  else TEAM_HK_MAP.delete(teamId);
}

function syncNextTeamHotkey(): void {
  hkNextTeam = getKeybind(PET_TEAM_NEXT_ID);
}

function syncPrevTeamHotkey(): void {
  hkPrevTeam = getKeybind(PET_TEAM_PREV_ID);
}

function ensureLegacyTeamHotkeyMigration(teamId: string): void {
  const hotkeys = readAriesPath<Record<string, string>>(PATH_PETS_HOTKEYS) ?? {};
  const legacy = hotkeys[teamId];
  if (!legacy) return;
  const actionId = getPetTeamActionId(teamId);
  const existing = getKeybind(actionId);
  if (!existing) {
    const hk = stringToHotkey(legacy);
    if (hk) {
      setKeybind(actionId, hk);
    }
  }
  const clone = { ...hotkeys };
  delete clone[teamId];
  writeAriesPath(PATH_PETS_HOTKEYS, clone);
}

function normalizeTeamList(teams: TeamLite[]): TeamLite[] {
  if (!Array.isArray(teams)) return [];
  const seen = new Set<string>();
  const out: TeamLite[] = [];
  for (const t of teams) {
    const id = String(t?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: t?.name ?? null });
  }
  return out;
}

function ensureLastUsedTeamIsValid(): void {
  if (!orderedTeamIds.length) {
    lastUsedTeamId = null;
    return;
  }
  if (!lastUsedTeamId || !orderedTeamIds.includes(lastUsedTeamId)) {
    lastUsedTeamId = orderedTeamIds[0] ?? null;
  }
}

function adjacentTeam(direction: 1 | -1): string | null {
  if (!orderedTeamIds.length) return null;
  if (!lastUsedTeamId || !orderedTeamIds.includes(lastUsedTeamId)) {
    return direction === 1
      ? orderedTeamIds[0] ?? null
      : orderedTeamIds[orderedTeamIds.length - 1] ?? null;
  }
  if (orderedTeamIds.length === 1) return orderedTeamIds[0] ?? null;
  const currentIndex = orderedTeamIds.indexOf(lastUsedTeamId);
  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = orderedTeamIds.length - 1;
  if (nextIndex >= orderedTeamIds.length) nextIndex = 0;
  return orderedTeamIds[nextIndex] ?? null;
}

export function markTeamAsUsed(teamId: string | null): void {
  lastUsedTeamId = teamId ? String(teamId) : null;
}

export function setTeamsForHotkeys(rawTeams: TeamLite[]) {
  for (const unsub of TEAM_HK_UNSUBS.values()) {
    try { unsub(); } catch {}
  }
  TEAM_HK_UNSUBS.clear();
  if (unsubNextHotkey) {
    try { unsubNextHotkey(); } catch {}
    unsubNextHotkey = null;
  }
  if (unsubPrevHotkey) {
    try { unsubPrevHotkey(); } catch {}
    unsubPrevHotkey = null;
  }

  const teams = normalizeTeamList(rawTeams);
  updatePetKeybinds(teams);

  orderedTeamIds = teams.map(t => t.id);
  ensureLastUsedTeamIsValid();

  const keep = new Set(orderedTeamIds);
  for (const teamId of Array.from(TEAM_HK_MAP.keys())) {
    if (!keep.has(teamId)) TEAM_HK_MAP.delete(teamId);
  }

  teams.forEach((team) => {
    ensureLegacyTeamHotkeyMigration(team.id);
    syncTeamHotkey(team.id);
    const unsub = onKeybindChange(getPetTeamActionId(team.id), () => syncTeamHotkey(team.id));
    TEAM_HK_UNSUBS.set(team.id, unsub);
  });

  syncNextTeamHotkey();
  syncPrevTeamHotkey();
  unsubNextHotkey = onKeybindChange(PET_TEAM_NEXT_ID, () => syncNextTeamHotkey());
  unsubPrevHotkey = onKeybindChange(PET_TEAM_PREV_ID, () => syncPrevTeamHotkey());
}

export function installPetTeamHotkeysOnce(onUseTeam: (teamId: string) => void) {
  const FLAG = "__qws_pet_team_hk_installed";
  if ((window as any)[FLAG]) return;
  window.addEventListener(
    "keydown",
    async (e) => {
      if (shouldIgnoreKeydown(e)) return;

      const teamsList = orderedTeamIds.slice();
      if (!teamsList.length) return;

      // Anchor the pointer to the actual active team if possible
      const activeTid = await _currentActiveTeamId();
      if (activeTid && teamsList.includes(activeTid)) {
        lastUsedTeamId = activeTid;
      } else if (!lastUsedTeamId || !teamsList.includes(lastUsedTeamId)) {
        lastUsedTeamId = teamsList[0] ?? null;
      }
      ensureLastUsedTeamIsValid();

      const useTeam = (teamId: string | null) => {
        if (!teamId) return;
        markTeamAsUsed(teamId);
        onUseTeam(teamId);
        _lastTeamHotkeyAt = Date.now();
      };

      if (hkPrevTeam && matchHotkey(e, hkPrevTeam)) {
        const baseId = lastUsedTeamId && teamsList.includes(lastUsedTeamId) ? lastUsedTeamId : teamsList[teamsList.length - 1] ?? null;
        const curIdx = baseId ? teamsList.indexOf(baseId) : -1;
        const nextIdx = curIdx >= 0 ? (curIdx - 1 + teamsList.length) % teamsList.length : teamsList.length - 1;
        const target = teamsList[nextIdx] ?? null;
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          useTeam(target);
          return;
        }
      }

      if (hkNextTeam && matchHotkey(e, hkNextTeam)) {
        const baseId = lastUsedTeamId && teamsList.includes(lastUsedTeamId) ? lastUsedTeamId : teamsList[0] ?? null;
        const curIdx = baseId ? teamsList.indexOf(baseId) : -1;
        const nextIdx = curIdx >= 0 ? (curIdx + 1) % teamsList.length : 0;
        const target = teamsList[nextIdx] ?? null;
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          useTeam(target);
          return;
        }
      }

      for (const [teamId, hk] of TEAM_HK_MAP) {
        if (matchHotkey(e, hk)) {
          e.preventDefault();
          e.stopPropagation();
          useTeam(teamId);
          break;
        }
      }
    },
    true
  );
  (window as any)[FLAG] = true;
}

/* --------------------------------- Abilities -------------------------------- */

export function petImg64From(
  species?: string,
  mutation?: string | string[]
): string | undefined {
  // 1) normaliser l’espèce pour matcher les clés du catalog
  const spRaw = String(species || "").trim();
  if (!spRaw) return undefined;
  const sp = _canonicalSpecies(spRaw); // <-- utilise déjà petCatalog

  const entry = (petCatalog as unknown as PetCatalogLoose)[sp];
  const imgs = entry?.img64;
  if (!imgs) {
    return undefined;
  }

  // 2) accepter string[] et déduire la "clé" à partir de la liste
  const toLower = (v: unknown) => String(v || "").toLowerCase();
  const muts = Array.isArray(mutation) ? mutation.map(toLower) : [toLower(mutation)];

  // synonyms : "none"/"aucune" -> normal
  const has = (s: string) => muts.some(m => m.includes(s));
  const key: keyof NonNullable<PetImgEntry["img64"]> =
    has("rainbow") ? "rainbow" :
    has("gold")    ? "gold"    :
    "normal";

  const src = (imgs as any)?.[key] || imgs.normal; // fallback normal
  if (!src) return undefined;
  return String(src).startsWith("data:") ? src : `data:image/png;base64,${src}`;
}

type AbilityDef = { name?: string; description?: string; trigger?: string; baseProbability?: number; baseParameters?: any };
const _AB: Record<string, AbilityDef> = (petAbilities as any) ?? {};

function _abilityName(id: unknown): string {
  const key = String(id ?? "");
  const raw = (typeof _AB?.[key]?.name === "string" && _AB[key]!.name.trim())
    ? _AB[key]!.name
    : key;
  return String(raw);
}
function _abilityNameWithoutLevel(id: unknown): string {
  const key = String(id ?? "");
  const raw = (typeof _AB?.[key]?.name === "string" && _AB[key]!.name.trim())
    ? _AB[key]!.name
    : key;
  return String(raw).replace(/(?:\s+|-)?(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\s*$/,'').trim();
}
function _parseTeamSearch(raw: string): { mode: "ability" | "species" | "text"; value: string } {
  const s = String(raw || "").trim();
  const m = s.match(/^(ab|sp):\s*(.*)$/i);
  if (!m) return { mode: "text", value: s };
  return { mode: m[1].toLowerCase() === "ab" ? "ability" : "species", value: (m[2] || "").trim() };
}
async function _abilityNameToPresentIds(name: string): Promise<Set<string>> {
  await _ensureInventoryWatchersStarted();
  const target = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/(?:\s+|-)?(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*$/i, "");
  const ids = new Set<string>();
  if (!target) return ids;
  for (const p of _invPetsCache) {
    const abs = Array.isArray(p.abilities) ? p.abilities : [];
    for (const id of abs) {
      if (_abilityNameWithoutLevel(id).toLowerCase() === target) ids.add(id);
    }
  }
  return ids;
}

/* --------------------------------- Data utils -------------------------------- */

const _s    = (v?: string | null) => (v ?? "").toLowerCase();
const _sOpt = (v: unknown) => (typeof v === "string" ? v : null);
const _n    = (v: unknown) => (Number.isFinite(v as number) ? (v as number) : 0);
const _sArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

// Normalise une espèce pour matcher les clés du catalog (case-insensitive, support CamelCase)
const _petCatalogKeyByLc = new Map<string, string>(
  Object.keys(petCatalog as any).map(k => [k.toLowerCase(), k])
);
function _canonicalSpecies(s: string): string {
  if (!s) return s;
  if ((petCatalog as any)[s]) return s;
  const lc = s.toLowerCase();
  const found = _petCatalogKeyByLc.get(lc);
  if (found) return found;
  const t = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return (petCatalog as any)[t] ? t : s;
}
function _invPetToRawItem(p: InventoryPet): any {
  return {
    id: p.id,
    itemType: "Pet",
    petSpecies: _canonicalSpecies(p.petSpecies),
    name: p.name ?? null,
    xp: p.xp,
    hunger: p.hunger,
    mutations: Array.isArray(p.mutations) ? p.mutations.slice() : [],
    targetScale: p.targetScale,
    abilities: Array.isArray(p.abilities) ? p.abilities.slice() : [],
  };
}

/* ----------------------------- LS helpers (teams & UI) ----------------------------- */

function _dedupeTeams<T extends { id: string; slots?: (string | null)[]; name?: string | null }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of Array.isArray(arr) ? arr : []) {
    const id = String(t?.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const slots = Array.isArray(t?.slots)
      ? (t.slots.slice(0, 3).map((x: unknown) => (x ? String(x) : null)) as (string | null)[])
      : [null, null, null];
    out.push({ ...(t as any), id, slots });
  }
  return out;
}

function loadTeams(): PetTeam[] {
  const arr = readAriesPath<PetTeam[]>(PATH_PETS_TEAMS) ?? [];
  if (!Array.isArray(arr)) return [];
  const mapped = arr
    .map((t) => ({
      id: String(t?.id || ""),
      name: String(t?.name || "Team"),
      slots: Array.isArray(t?.slots)
        ? (t.slots.slice(0, 3).map((x: unknown) => (x ? String(x) : null)) as (string | null)[])
        : [null, null, null],
    }))
    .filter(t => t.id);
  const unique = _dedupeTeams(mapped);
  if (unique.length !== mapped.length) {
    try { saveTeams(unique); } catch {}
  }
  return unique;
}
function saveTeams(arr: PetTeam[]) {
  writeAriesPath(PATH_PETS_TEAMS, arr);
}
function _uid() {
  try { return crypto.randomUUID(); } catch {
    return `t_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
  }
}
function _loadTeamSearchMap(): Record<string, string> {
  const obj = readAriesPath<Record<string, string>>(PATH_PETS_TEAM_SEARCH);
  return obj && typeof obj === "object" ? obj : {};
}
function _saveTeamSearchMap(map: Record<string, string>) {
  writeAriesPath(PATH_PETS_TEAM_SEARCH, map);
}

/* ----------------------------- Teams state interne ----------------------------- */

let _teams: PetTeam[] = loadTeams();
let _teamSubs = new Set<(teams: PetTeam[]) => void>();
function _notifyTeams() {
  const snap = _teams.slice();
  _teamSubs.forEach(fn => { try { fn(snap); } catch {} });
}
let _teamSearch: Record<string, string> = _loadTeamSearchMap();

function _teamIdFromSlots(ids: string[]): string | null {
  const wanted = new Set(ids.map(id => String(id || "")).filter(Boolean));
  if (!wanted.size) return null;
  for (const team of _teams) {
    const slots = (Array.isArray(team?.slots) ? team.slots : []).map(id => String(id || "")).filter(Boolean);
    if (slots.length !== wanted.size) continue;
    const set = new Set(slots);
    let ok = true;
    for (const id of wanted) { if (!set.has(id)) { ok = false; break; } }
    if (ok) return team.id;
  }
  return null;
}

async function _currentActiveTeamId(): Promise<string | null> {
  try {
    const slots = await _getActivePetSlotIds();
    return _teamIdFromSlots(slots);
  } catch { return null; }
}

async function _syncLastUsedFromActive(): Promise<void> {
  try {
    const slots = await _getActivePetSlotIds();
    const tid = _teamIdFromSlots(slots);
    if (tid) lastUsedTeamId = tid;
  } catch {}
}

/* --------------------------------- Inventory cache/watchers -------------------------------- */

let _invRaw: any = null;      // myInventory snapshot
let _activeRaw: any[] = [];   // active pets snapshot (primitive preferred)
let _hutchRaw: any[] = [];    // myPetHutchPetItems snapshot
let _invPetsCache: InventoryPet[] = [];

let _invUnsub: null | (() => void) = null;
let _activeUnsub: null | (() => void) = null;
let _hutchUnsub: null | (() => void) = null;

let _invSig: Map<string, string> | null = null;
let _activeSig: Map<string, string> | null = null;

function _inventoryItemToPet(x: any): InventoryPet | null {
  if (!x || x.itemType !== "Pet") return null;
  const id = _s(x.id);
  if (!id) return null;
  const speciesRaw = x.petSpecies ?? x.data?.petSpecies;
  return {
    id,
    itemType: "Pet",
    petSpecies: _canonicalSpecies(String(speciesRaw ?? "").trim()),
    name: _sOpt(x.name ?? x.data?.name ?? null),
    xp: _n(x.xp ?? x.data?.xp),
    hunger: _n(x.hunger ?? x.data?.hunger),
    mutations: _sArr(x.mutations ?? x.data?.mutations),
    targetScale: Number.isFinite(x.targetScale ?? x.data?.targetScale)
      ? Number(x.targetScale ?? x.data?.targetScale)
      : undefined,
    abilities: _sArr(x.abilities ?? x.data?.abilities),
  };
}
function _activeSlotToPet(entry: any): InventoryPet | null {
  const slot = entry?.slot ?? entry;
  if (!slot || typeof slot !== "object") return null;
  const id = _s(slot.id);
  if (!id) return null;
  const speciesRaw = slot.petSpecies ?? slot.species;
  return {
    id,
    itemType: "Pet",
    petSpecies: _canonicalSpecies(String(speciesRaw ?? "").trim()),
    name: _sOpt(slot.name ?? null),
    xp: _n(slot.xp),
    hunger: _n(slot.hunger),
    mutations: _sArr(slot.mutations),
    targetScale: Number.isFinite(slot.targetScale) ? Number(slot.targetScale) : undefined,
    abilities: _sArr(slot.abilities),
  };
}
function _petSigStableNoXpNoHunger(p: InventoryPet): string {
  return JSON.stringify({
    id: p.id,
    itemType: "Pet",
    petSpecies: p.petSpecies,
    name: p.name ?? null,
    mutations: Array.isArray(p.mutations) ? p.mutations : [],
    targetScale: Number.isFinite(p.targetScale as number) ? (p.targetScale as number) : null,
    abilities: Array.isArray(p.abilities) ? p.abilities : [],
  });
}

function _buildInvSigFromInventory(inv: any): Map<string, string> {
  const out = new Map<string, string>();
  const items: any[] =
    Array.isArray(inv?.items) ? inv.items :
    Array.isArray(inv) ? inv : [];
  for (const it of items) {
    const p = _inventoryItemToPet(it);
    if (p) out.set(p.id, _petSigStableNoXpNoHunger(p));
  }
  return out;
}
function _buildActiveSig(list: any): Map<string, string> {
  const out = new Map<string, string>();
  const arr = Array.isArray(list) ? list : [];
  for (const e of arr) {
    const p = _activeSlotToPet(e);
    if (p) out.set(p.id, _petSigStableNoXpNoHunger(p));
  }
  return out;
}
function _mapsEqual(a: Map<string, string> | null, b: Map<string, string>): boolean {
  if (!a) return false;
  if (a.size !== b.size) return false;
  for (const [k, v] of b) if (a.get(k) !== v) return false;
  return true;
}
function _rebuildInvPets() {
  const map = new Map<string, InventoryPet>();
  const hutchItems: any[] = Array.isArray(_hutchRaw) ? _hutchRaw : [];
  const invItems: any[] =
    Array.isArray(_invRaw?.items) ? _invRaw.items :
    Array.isArray(_invRaw) ? _invRaw : [];

  // Priority: active > inventory > hutch
  for (const it of hutchItems) {
    const p = _inventoryItemToPet(it);
    if (p && p.id) map.set(p.id, p);
  }
  for (const it of invItems) {
    const p = _inventoryItemToPet(it);
    if (p && p.id) map.set(p.id, p);
  }
  const act = Array.isArray(_activeRaw) ? _activeRaw : [];
  for (const e of act) {
    const p = _activeSlotToPet(e);
    if (p && p.id) map.set(p.id, p);
  }
  _invPetsCache = Array.from(map.values());
}
async function _startInventoryWatcher() {
  const unsub = await (async () => {
    try {
      const cur = await Atoms.inventory.myInventory.get();
      _invSig = _buildInvSigFromInventory(cur);
      _invRaw = cur;
      _rebuildInvPets();
    } catch {}
    return Atoms.inventory.myInventory.onChange((inv: any) => {
      const nextSig = _buildInvSigFromInventory(inv);
      if (_mapsEqual(_invSig, nextSig)) return;
      _invSig = nextSig;
      _invRaw = inv;
      _rebuildInvPets();
    });
  })();
  _invUnsub = () => { try { unsub(); } catch {} };
}
async function _startActivePetsWatcher() {
  const unsub = await (async () => {
    try {
      const curPrim = await Atoms.pets.myPrimitivePetSlots.get();
      if (Array.isArray(curPrim)) {
        _activeSig = _buildActiveSig(curPrim);
        _activeRaw = curPrim;
        _rebuildInvPets();
        return Atoms.pets.myPrimitivePetSlots.onChange((list: any) => {
          const nextSig = _buildActiveSig(list);
          if (_mapsEqual(_activeSig, nextSig)) return;
          _activeSig = nextSig;
          _activeRaw = Array.isArray(list) ? list : [];
          _rebuildInvPets();
        });
      }
    } catch {}
    try {
      const cur = await Atoms.pets.myPetInfos.get();
      _activeSig = _buildActiveSig(cur);
      _activeRaw = Array.isArray(cur) ? cur : [];
      _rebuildInvPets();
    } catch {}
    return Atoms.pets.myPetInfos.onChange((list: any) => {
      const nextSig = _buildActiveSig(list);
      if (_mapsEqual(_activeSig, nextSig)) return;
      _activeSig = nextSig;
      _activeRaw = Array.isArray(list) ? list : [];
      _rebuildInvPets();
    });
  })();
  _activeUnsub = () => { try { unsub(); } catch {} };
}
async function _startHutchWatcher() {
  const unsub = await (async () => {
    try {
      const cur = await myPetHutchPetItems.get();
      _hutchRaw = Array.isArray(cur) ? cur : [];
      _rebuildInvPets();
    } catch {}
    return myPetHutchPetItems.onChange((list: any) => {
      _hutchRaw = Array.isArray(list) ? list : [];
      _rebuildInvPets();
    });
  })();
  _hutchUnsub = () => { try { unsub(); } catch {} };
}
async function _ensureInventoryWatchersStarted() {
  if (!_invUnsub)  await _startInventoryWatcher();
  if (!_activeUnsub) await _startActivePetsWatcher();
  if (!_hutchUnsub) await _startHutchWatcher();

  if (!_invPetsCache.length) {
    try {
      const inv = await Atoms.inventory.myInventory.get();
      let active: any = null;
      try { active = await Atoms.pets.myPrimitivePetSlots.get(); } catch {}
      if (!Array.isArray(active)) {
        try { active = await Atoms.pets.myPetInfos.get(); } catch {}
      }
      const hutch = await myPetHutchPetItems.get();
      _invSig    = _buildInvSigFromInventory(inv);
      _activeSig = _buildActiveSig(active);
      _invRaw    = inv;
      _activeRaw = Array.isArray(active) ? active : [];
      _hutchRaw  = Array.isArray(hutch) ? hutch : [];
      _rebuildInvPets();
    } catch {}
  }
}

/* ------------------------------- UI helpers --------------------------------- */

export async function clearHandSelection(): Promise<void> {
  try { await Atoms.inventory.setSelectedIndexToEnd.set(null); } catch (err) { }
  try { await Atoms.inventory.mySelectedItemId.set(null); } catch (err) { }
  try { await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null); } catch (err) {  }
  try { await PlayerService.setSelectedItem(null); } catch (err) {  }
  try { await PlayerService.dropObject(); } catch (err) {  }
}
async function _waitValidatedInventoryIndex(timeoutMs = 20000): Promise<number | null> {
  await clearHandSelection();
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    try {
      const modalVal = await Atoms.ui.activeModal.get();
      if (!isInventoryOpen(modalVal)) return null;
    } catch { return null; }
    try {
      const v = await Atoms.inventory.myValidatedSelectedItemIndex.get();
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
    } catch {}
    await new Promise(r => setTimeout(r, 80));
  }
  return null;
}

/* -------------------------- Autofeed (per-pet overrides) -------------------------- */

const _lastAutofeedAttemptAt = new Map<string, number>();
const _belowThreshold = new Map<string, boolean>(); // tracks pets that were below their threshold in the last evaluation
const AUTOF_FEED_MIN_INTERVAL_MS = 2000;
const DEFAULT_OVERRIDE: PetOverride = { enabled: false, thresholdPct: 10, crops: {} };
const DEFAULT_UI: PetsUIState = { selectedPetId: null };
const DEFAULT_INSTANT_FEED: InstantFeedOverride = { crops: {} };

let _currentPets: PetInfo[] = [];
let _userTriggerCb: ((t: AutofeedTrigger) => void) | null = null;

function saveOverrides(map: PetOverridesMap) {
  writeAriesPath(PATH_PETS_OVERRIDES, map);
}
function loadOverrides(): PetOverridesMap {
  const obj = readAriesPath<PetOverridesMap>(PATH_PETS_OVERRIDES);
  return obj && typeof obj === "object" ? obj : {};
}
function saveInstantFeedOverrides(map: InstantFeedOverridesMap) {
  writeAriesPath(PATH_PETS_INSTANT_FEED, map);
}
function loadInstantFeedOverrides(): InstantFeedOverridesMap {
  const obj = readAriesPath<InstantFeedOverridesMap>(PATH_PETS_INSTANT_FEED);
  return obj && typeof obj === "object" ? obj : {};
}
function saveUIState(next: PetsUIState) {
  writeAriesPath(PATH_PETS_UI, next);
}
function loadUIState(): PetsUIState {
  const obj = readAriesPath<PetsUIState>(PATH_PETS_UI);
  const merged = { ...DEFAULT_UI, ...(obj || {}) } as PetsUIState;
  return merged;
}
function cloneOverride(o?: PetOverride): PetOverride {
  const src = o ?? DEFAULT_OVERRIDE;
  return {
    enabled: !!src.enabled,
    thresholdPct: Math.min(100, Math.max(1, Number(src.thresholdPct) || DEFAULT_OVERRIDE.thresholdPct)),
    crops: { ...(src.crops || {}) },
  };
}
function cloneInstantFeedOverride(o?: InstantFeedOverride): InstantFeedOverride {
  const src = o ?? DEFAULT_INSTANT_FEED;
  return {
    crops: { ...(src.crops || {}) },
  };
}
function clampPct(n: number) { return Math.max(0, Math.min(100, n)); }

function getCompatibleCropsFromData(species: string): string[] {
  type PetCatalog = Record<string, { diet?: unknown; compatibleCrops?: unknown; crops?: unknown } | undefined>;
  const PC = petCatalog as unknown as PetCatalog;
  const entry = PC?.[species];
  const raw = entry?.diet ?? entry?.compatibleCrops ?? entry?.crops ?? [];
  const arr = Array.isArray(raw) ? raw : [];
  return arr.filter((c: unknown): c is string => typeof c === "string" && c.length > 0);
}
function getMaxHungerFromData(species: string): number {
  type PetCatalog = Record<string, { coinsToFullyReplenishHunger?: unknown } | undefined>;
  const v = (petCatalog as unknown as PetCatalog)?.[species]?.coinsToFullyReplenishHunger;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return 3000; // défaut safe
}
async function findPetById(petId: string): Promise<PetInfo | null> {
  try {
    const list = await PlayerService.getPets();
    const arr = Array.isArray(list) ? list : [];
    return arr.find(p => String(p?.slot?.id || "") === String(petId)) ?? null;
  } catch { return null; }
}
function findFirstCompatibleInvItem(allowed: Set<string>, inv: CropInventoryState): CropItem | null {
  const arr = Array.isArray(inv) ? inv : [];
  for (const it of arr) {
    const species = String((it as any)?.species || "");
    if (species && allowed.has(species)) return it as CropItem;
  }
  return null;
}
function _emitTrigger(payload: AutofeedTrigger) {
  try { _userTriggerCb?.(payload); } catch {}
}

async function _evaluatePet(pet: PetInfo) {
  const petId = String(pet?.slot?.id || "");
  if (!petId) return;

  const ov = PetsService.getOverride(petId);
  if (!ov.enabled) {
    _lastAutofeedAttemptAt.delete(petId);
    return;
  }

  const hungerPct = PetsService.getHungerPctFor(pet);
  const thresholdPct = Math.max(1, Math.min(100, (ov.thresholdPct | 0) || 10));

  const nowBelow = hungerPct < thresholdPct;
  const now = Date.now();
  const lastAttempt = _lastAutofeedAttemptAt.get(petId) || 0;

  if (nowBelow && now - lastAttempt >= AUTOF_FEED_MIN_INTERVAL_MS) {
    // allowed crops for this pet
    let allowedSet: Set<string>;
    try { allowedSet = await PetsService.getPetAllowedCrops(petId); }
    catch {
      const species = String(pet?.slot?.petSpecies || "");
      allowedSet = new Set(PetsService.getCompatibleCropsForSpecies(species));
    }
    const allowed = Array.from(allowedSet);

    // pick NON-FAVORITE compatible item & feed (if API present)
    let chosen: CropItem | null = null;
    let didUnfavorite = false;

    try {
      const [invRaw, favIdsRaw] = await Promise.all([
        PlayerService.getCropInventoryState(),
        (PlayerService as any).getFavoriteIds?.() ?? [],
      ]);
      const inv: any[] = Array.isArray(invRaw) ? invRaw : [];
      const favSet = new Set<string>(Array.isArray(favIdsRaw) ? favIdsRaw : []);
      const invNonFav = inv.filter(it => !favSet.has(String(it?.id)));

      chosen = findFirstCompatibleInvItem(allowedSet, invNonFav);

      if (chosen?.id && (PlayerService as any).feedPet) {
        try { await (PlayerService as any).feedPet(petId, chosen.id); } catch {}
      }
    } catch {}

    _emitTrigger({
      pet,
      petId,
      species: String(pet?.slot?.petSpecies || ""),
      hungerPct,
      thresholdPct,
      allowedCrops: allowed,
      chosenItem: chosen,
      didUnfavorite,
    });
    _lastAutofeedAttemptAt.set(petId, now);
  }

  if (!nowBelow) {
    _lastAutofeedAttemptAt.delete(petId);
  }
}
async function _evaluateAll() {
  const arr = Array.isArray(_currentPets) ? _currentPets : [];
  for (const p of arr) { try { await _evaluatePet(p); } catch {} }
}

/* --------------------------------- Service API -------------------------------- */

export const PetsService = {
  /* --------- Player-facing (UI list/subscribe) --------- */
  getPets(): Promise<PetState> { return PlayerService.getPets(); },
  onPetsChange(cb: (pets: PetState) => void) { return PlayerService.onPetsChange(cb); },
  onPetsChangeNow(cb: (pets: PetState) => void) { return PlayerService.onPetsChangeNow(cb); },

  /* ------------------------- Abilities utils ------------------------- */
  getAbilityName(id: string): string { return _abilityName(id); },
  getAbilityNameWithoutLevel(id: string): string { return _abilityNameWithoutLevel(id); },

  /* ------------------------- Autofeed + per-pet UI state ------------------------- */
  setUIState(next: Partial<PetsUIState>): PetsUIState {
    const cur = loadUIState();
    const merged: PetsUIState = { ...cur, ...(next || {}) };
    saveUIState(merged);
    return merged;
  },
  setSelectedPet(id: string | null): PetsUIState { return this.setUIState({ selectedPetId: id }); },
  getSelectedPetId(): string | null { return loadUIState().selectedPetId ?? null; },

  getOverride(petId: string): PetOverride {
    const all = loadOverrides();
    return cloneOverride(all[petId]);
  },
  setOverride(petId: string, patch: Partial<PetOverride>): PetOverride {
    const all = loadOverrides();
    const cur = cloneOverride(all[petId]);
    const next: PetOverride = {
      enabled: patch.enabled ?? cur.enabled,
      thresholdPct: Number.isFinite(patch.thresholdPct as number)
        ? Math.min(100, Math.max(1, Number(patch.thresholdPct))) : cur.thresholdPct,
      crops: { ...cur.crops, ...(patch.crops || {}) },
    };
    all[petId] = next;
    saveOverrides(all);
    void _evaluateAll();
    return next;
  },
  updateOverride(petId: string, fn: (cur: PetOverride) => PetOverride): PetOverride {
    const all = loadOverrides();
    const cur = cloneOverride(all[petId]);
    const next = cloneOverride(fn(cur));
    all[petId] = next;
    saveOverrides(all);
    void _evaluateAll();
    return next;
  },

  async setPetAutofeedEnabled(petId: string, enabled: boolean): Promise<PetOverride> {
    return this.setOverride(petId, { enabled: !!enabled });
  },
  getPetAutofeedEnabled(petId: string): boolean { return this.getOverride(petId).enabled; },

  async setPetAutofeedThresholdPct(petId: string, pct: number): Promise<PetOverride> {
    const v = Math.min(100, Math.max(1, Math.floor(Number(pct) || 10)));
    return this.setOverride(petId, { thresholdPct: v });
  },
  getPetAutofeedThresholdPct(petId: string): number { return this.getOverride(petId).thresholdPct; },

  async setPetAllowedCrop(petId: string, crop: string, allowed?: boolean): Promise<PetOverride> {
    return this.updateOverride(petId, (cur) => {
      const next = cloneOverride(cur);
      const entry = next.crops[crop] ?? { allowed: true };
      next.crops[crop] = { allowed: allowed ?? entry.allowed };
      return next;
    });
  },
  async getPetAllowedCrops(petId: string): Promise<Set<string>> {
    const ov = this.getOverride(petId);
    const pet = await findPetById(petId);
    const species = pet?.slot?.petSpecies || "";
    const compatibles = this.getCompatibleCropsForSpecies(species);
    const allowed = new Set<string>();
    for (const c of compatibles) {
      const rule = ov.crops[c];
      if (rule ? !!rule.allowed : true) allowed.add(c); // default: allowed
    }
    return allowed;
  },

  /* ------------------------- Instant feed (per-species) ------------------------- */
  getInstantFeedOverride(species: string): InstantFeedOverride {
    const key = _canonicalSpecies(String(species || ""));
    const all = loadInstantFeedOverrides();
    return cloneInstantFeedOverride(all[key]);
  },
  isInstantFeedCropAllowed(species: string, crop: string): boolean {
    const ov = this.getInstantFeedOverride(species);
    const rule = ov.crops[crop];
    return rule ? !!rule.allowed : true;
  },
  setInstantFeedCropAllowed(species: string, crop: string, allowed: boolean): InstantFeedOverride {
    const key = _canonicalSpecies(String(species || ""));
    const all = loadInstantFeedOverrides();
    const cur = cloneInstantFeedOverride(all[key]);
    cur.crops[crop] = { allowed: !!allowed };
    all[key] = cur;
    saveInstantFeedOverrides(all);
    return cloneInstantFeedOverride(cur);
  },
  getInstantFeedAllowedCrops(species: string): Set<string> {
    const key = _canonicalSpecies(String(species || ""));
    const compatibles = this.getCompatibleCropsForSpecies(key);
    const ov = this.getInstantFeedOverride(key);
    const allowed = new Set<string>();
    for (const c of compatibles) {
      const rule = ov.crops[c];
      if (rule ? !!rule.allowed : true) allowed.add(c);
    }
    return allowed;
  },

  getCompatibleCropsForSpecies(species: string): string[] { return getCompatibleCropsFromData(species); },
  getMaxHungerForSpecies(species: string): number { return getMaxHungerFromData(species); },
  getHungerPctFor(pet: PetInfo): number {
    const cur = Number(pet?.slot?.hunger) || 0;
    const species = String(pet?.slot?.petSpecies || "");
    const max = this.getMaxHungerForSpecies(species);
    const pct = (cur / max) * 100;
    return +clampPct(pct).toFixed(1);
  },

  async startAutofeedWatcher(onTrigger?: (t: AutofeedTrigger) => void): Promise<() => void> {
    _userTriggerCb = onTrigger ?? null;
    const stop = await PlayerService.onPetsChangeNow((arr) => {
      _currentPets = Array.isArray(arr) ? arr.slice() : [];
      void _evaluateAll();
    });
    return () => {
      try { stop(); } catch {}
      _currentPets = [];
      _belowThreshold.clear();
      _userTriggerCb = null;
    };
  },

  /* ------------------------- Teams (UI-less core used by UI) ------------------------- */
  _teams: loadTeams(),
  _teamSubs: new Set<(all: PetTeam[]) => void>(),
  _notifyTeamSubs() {
    const snap = this.getTeams();
    this._teamSubs.forEach(fn => { try { fn(snap); } catch {} });
  },
  getTeams(): PetTeam[] {
    return Array.isArray(this._teams) ? this._teams.map(t => ({ ...t, slots: t.slots.slice(0,3) })) : [];
  },
  onTeamsChange(cb: (all: PetTeam[]) => void): () => void {
    this._teamSubs.add(cb);
    try { cb(this.getTeams()); } catch {}
    return () => { this._teamSubs.delete(cb); };
  },
  async onTeamsChangeNow(cb: (all: PetTeam[]) => void): Promise<() => void> {
    const unsub = this.onTeamsChange(cb);
    try { cb(this.getTeams()); } catch {}
    return unsub;
  },
  createTeam(name?: string): PetTeam {
    const t: PetTeam = { id: _uid(), name: name?.trim() || `Team ${this._teams.length + 1}`, slots: [null,null,null] };
    this._teams.push(t);
    saveTeams(this._teams);
    this._notifyTeamSubs();
    return t;
  },
  deleteTeam(teamId: string): boolean {
    const i = this._teams.findIndex(t => t.id === teamId);
    if (i < 0) return false;
    this._teams.splice(i, 1);
    saveTeams(this._teams);
    this._notifyTeamSubs();
    return true;
  },
  saveTeam(patch: { id: string; name?: string; slots?: (string|null)[] }): PetTeam | null {
    const i = this._teams.findIndex(t => t.id === patch.id);
    if (i < 0) return null;
    const cur = this._teams[i];
    const next: PetTeam = {
      id: cur.id,
      name: typeof patch.name === "string" ? patch.name : cur.name,
      slots: Array.isArray(patch.slots) ? (patch.slots.slice(0,3) as (string|null)[]) : cur.slots,
    };
    this._teams[i] = next;
    saveTeams(this._teams);
    this._notifyTeamSubs();
    return next;
  },
  setTeamsOrder(ids: string[]) {
    const byId = new Map(this._teams.map(t => [t.id, t]));
    const next: PetTeam[] = [];
    for (const id of ids) {
      const t = byId.get(id);
      if (t) { next.push(t); byId.delete(id); }
    }
    for (const rest of byId.values()) next.push(rest);
    this._teams = next;
    saveTeams(this._teams);
    this._notifyTeamSubs();
  },
  getTeamById(teamId: string): PetTeam | null {
    const t = this._teams.find(t => t.id === teamId) || null;
    return t ? { ...t, slots: t.slots.slice(0,3) } : null;
  },
  getTeamSearch(teamId: string): string { return _teamSearch[teamId] || ""; },
  setTeamSearch(teamId: string, q: string) {
    _teamSearch[teamId] = (q || "").trim();
    _saveTeamSearchMap(_teamSearch);
  },

  /* ------------------------- Inventory filters + pickers ------------------------- */
  async getInventoryPets(): Promise<InventoryPet[]> {
    await _ensureInventoryWatchersStarted();
    return _invPetsCache.slice();
  },
  async buildFilteredInventoryForTeam(teamId: string, opts?: { excludeIds?: Set<string> }) {
    await _ensureInventoryWatchersStarted();

    const { mode, value } = _parseTeamSearch(this.getTeamSearch(teamId) || "");
    let list = await this.getInventoryPets();

    if (mode === "ability" && value) {
      const idSet = await _abilityNameToPresentIds(value);
      list = idSet.size
        ? list.filter(p => Array.isArray(p.abilities) && p.abilities.some(a => idSet.has(a)))
        : [];
    } else if (mode === "species" && value) {
      const vv = value.toLowerCase();
      list = list.filter(p => (p.petSpecies || "").toLowerCase() === vv);
    } else if (value) {
      const q = value.toLowerCase();
      list = list.filter(p =>
        _s(p.id).includes(q) ||
        _s(p.petSpecies).includes(q) ||
        _s(p.name).includes(q) ||
        (Array.isArray(p.abilities) && p.abilities.some(a => _s(a).includes(q) || _s(_abilityName(a)).includes(q))) ||
        (Array.isArray(p.mutations) && p.mutations.some(m => _s(m).includes(q)))
      );
    }

    if (opts?.excludeIds?.size) {
      const ex = opts.excludeIds;
      list = list.filter(p => !ex.has(p.id));
    }

    const items = list.map(_invPetToRawItem);

    let favoritedItemIds: string[] = [];
    try {
      const favAll = await Atoms.inventory.favoriteIds.get().catch(() => []);
      const keep = new Set(list.map(p => p.id));
      favoritedItemIds = (favAll || []).filter((id: string) => keep.has(id));
    } catch {}

    return { items, favoritedItemIds };
  },
  async buildFilteredInventoryByQuery(
    query: string,
    opts?: { excludeIds?: Set<string> }
  ): Promise<{ items: any[]; favoritedItemIds: string[] }> {
    await _ensureInventoryWatchersStarted();
    const q = (query || "").toLowerCase().trim();

    let list = await this.getInventoryPets();
    if (q) {
      list = list.filter(p =>
        _s(p.id).includes(q) ||
        _s(p.petSpecies).includes(q) ||
        _s(p.name).includes(q) ||
        (Array.isArray(p.abilities) && p.abilities.some(a => _s(a).includes(q) || _s(_abilityName(a)).includes(q))) ||
        (Array.isArray(p.mutations) && p.mutations.some(m => _s(m).includes(q)))
      );
    }

    if (opts?.excludeIds?.size) {
      const ex = opts.excludeIds;
      list = list.filter(p => !ex.has(p.id));
    }

    const items = list.map(_invPetToRawItem);

    let favoritedItemIds: string[] = [];
    try {
      const favAll = await Atoms.inventory.favoriteIds.get().catch(() => []);
      const keep = new Set(list.map(p => p.id));
      favoritedItemIds = (favAll || []).filter((id: string) => keep.has(id));
    } catch {}

    return { items, favoritedItemIds };
  },

  async chooseSlotPet(teamId: string, slotIndex: number, searchOverride?: string): Promise<InventoryPet | null> {
    const idx = Math.max(0, Math.min(2, Math.floor(slotIndex || 0)));
    const team = this.getTeamById(teamId);
    if (!team) return null;

    const exclude = new Set<string>();
    team.slots.forEach((id, i) => { if (i !== idx && id) exclude.add(String(id)); });

    const payload =
      searchOverride && searchOverride.trim().length
        ? await this.buildFilteredInventoryByQuery(searchOverride, { excludeIds: exclude })
        : await this.buildFilteredInventoryForTeam(teamId, { excludeIds: exclude });

      const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
      const teamSearch = this.getTeamSearch(teamId) || "";

      const applyFilters = async (list: InventoryPet[]): Promise<InventoryPet[]> => {
        let out = Array.isArray(list) ? list : [];
        if (searchOverride && searchOverride.trim().length) {
          const q = searchOverride.toLowerCase().trim();
          if (q) {
            out = out.filter(p =>
              _s(p.id).includes(q) ||
              _s(p.petSpecies).includes(q) ||
              _s(p.name).includes(q) ||
              (Array.isArray(p.abilities) && p.abilities.some(a => _s(a).includes(q) || _s(_abilityName(a)).includes(q))) ||
              (Array.isArray(p.mutations) && p.mutations.some(m => _s(m).includes(q)))
            );
          }
        } else if (teamSearch && teamSearch.trim().length) {
          const { mode, value } = _parseTeamSearch(teamSearch);
          if (mode === "ability" && value) {
            const idSet = await _abilityNameToPresentIds(value);
            out = idSet.size
              ? out.filter(p => Array.isArray(p.abilities) && p.abilities.some(a => idSet.has(a)))
              : [];
          } else if (mode === "species" && value) {
            const vv = value.toLowerCase();
            out = out.filter(p => (p.petSpecies || "").toLowerCase() === vv);
          } else if (value) {
            const q = value.toLowerCase();
            out = out.filter(p =>
              _s(p.id).includes(q) ||
              _s(p.petSpecies).includes(q) ||
              _s(p.name).includes(q) ||
              (Array.isArray(p.abilities) && p.abilities.some(a => _s(a).includes(q) || _s(_abilityName(a)).includes(q))) ||
              (Array.isArray(p.mutations) && p.mutations.some(m => _s(m).includes(q)))
            );
          }
        }

        if (exclude.size) out = out.filter(p => !exclude.has(p.id));
        return out;
      };

      // Append Pet Hutch pets to the selection list
      try {
        const rawHutch = await myPetHutchPetItems.get();
        const hutchArr = Array.isArray(rawHutch) ? rawHutch : [];

        // Convert to InventoryPet objects
        let hutchPets: InventoryPet[] = hutchArr
          .map((it: any) => _inventoryItemToPet(it))
          .filter((p: InventoryPet | null): p is InventoryPet => !!p);

        hutchPets = await applyFilters(hutchPets);

        const seen = new Set(items.map(it => String((it as any)?.id ?? "")));
        for (const p of hutchPets) {
          if (!seen.has(p.id)) {
            items.push(_invPetToRawItem(p));
            seen.add(p.id);
          }
        }

        // Append ACTIVE pets (from primitive atom via PlayerService.getPets)
        try {
          const rawActive = await this.getPets();
          const list = Array.isArray(rawActive) ? rawActive : [];
          let activePets: InventoryPet[] = list
            .map((p: any) => _activeSlotToPet(p))
            .filter((p: InventoryPet | null): p is InventoryPet => !!p);

          activePets = await applyFilters(activePets);
          for (const p of activePets) {
            if (!seen.has(p.id)) {
              items.push(_invPetToRawItem(p));
              seen.add(p.id);
            }
          }
        } catch {}
      } catch {}
    if (!items.length) return null;

    await fakeInventoryShow(payload, { open: true });
    const selIndex = await _waitValidatedInventoryIndex(20000);
    await closeInventoryPanel();

    if (selIndex == null || selIndex < 0 || selIndex >= items.length) return null;

    const chosenPet = _inventoryItemToPet(items[selIndex]);
    if (!chosenPet) return null;

    const next = team.slots.slice(0, 3);
    next[idx] = String(chosenPet.id);
    this.saveTeam({ id: team.id, slots: next });

    try { await clearHandSelection(); } catch {}
    return chosenPet;
  },

  async pickPetViaFakeInventory(search?: string): Promise<InventoryPet | null> {
    const payload = await this.buildFilteredInventoryByQuery(search || "");
    const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) return null;

    await fakeInventoryShow(payload, { open: true });
    const selIndex = await _waitValidatedInventoryIndex(20000);
    await closeInventoryPanel();
    if (selIndex == null || selIndex < 0 || selIndex >= items.length) return null;

    await clearHandSelection();
    return _inventoryItemToPet(items[selIndex]);
  },

  /* ------------------------- Team switching ------------------------- */
  async useTeam(teamId: string, opts?: { markUsed?: boolean }): Promise<{ swapped: number; placed: number; skipped: number }> {
    const t = this.getTeams().find(tt => tt.id === teamId) || null;
    if (!t) throw new Error("Team not found");
    const targetInvIds = (t.slots || [])
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .slice(0, 3);
    return _equipPetIds(targetInvIds, { markTeamId: teamId, markUsed: opts?.markUsed });
  },

  async usePetIds(targetInvIds: string[]): Promise<{ swapped: number; placed: number; skipped: number }> {
    return _equipPetIds(targetInvIds, { markTeamId: null });
  },

  async getActivePetIds(): Promise<string[]> {
    return _getActivePetSlotIds();
  },

  /* ------------------------- Ability logs ------------------------- */
  _logs: [] as AbilityLogEntry[],
  _logsMax: 500,
  _seenPerfByPet: new Map<string, number>(),
  _logSubs: new Set<(all: AbilityLogEntry[]) => void>(),
  _logsCutoffMs: 0,
  _logsCutoffSkewMs: 1500,
  _logsStorageKey: PATH_PETS_ABILITY_LOGS,
  _logsSessionStart: Date.now(),

  _extractAbilityValue(abilityId: string, rawData: any): number {
    const num = (value: unknown): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };

    const data = (rawData ?? {}) as Record<string, unknown>;
    const base = (petAbilities as Record<string, any>)[abilityId]?.baseParameters ?? {};

    switch (abilityId as keyof typeof petAbilities) {
      case "CoinFinderI":
      case "CoinFinderII":
      case "CoinFinderIII":
      case "SnowyCoinFinder": {
        const value = data["coinsFound"] ?? data["coins"] ?? 0;
        return num(value);
      }

      case "SellBoostI":
      case "SellBoostII":
      case "SellBoostIII":
      case "SellBoostIV": {
        const value = data["bonusCoins"] ?? data["coinsEarned"] ?? 0;
        return num(value);
      }

      case "ProduceEater":
        return num(data["sellPrice"] ?? 0);

      case "ProduceScaleBoost":
      case "ProduceScaleBoostII":
      case "SnowyCropSizeBoost": {
        const inc =
          data["scaleIncreasePercentage"] ??
          data["cropScaleIncreasePercentage"] ??
          base["scaleIncreasePercentage"] ??
          0;
        return num(inc);
      }

      case "EggGrowthBoost":
      case "EggGrowthBoostII_NEW":
      case "EggGrowthBoostII":
      case "SnowyEggGrowthBoost": {
        const minutes =
          data["eggGrowthTimeReductionMinutes"] ??
          data["minutesReduced"] ??
          data["reductionMinutes"] ??
          base["eggGrowthTimeReductionMinutes"] ??
          0;
        return num(minutes) * 60 * 1000;
      }

      case "PlantGrowthBoost":
      case "PlantGrowthBoostII":
      case "SnowyPlantGrowthBoost": {
        const minutes =
          data["minutesReduced"] ??
          data["reductionMinutes"] ??
          data["plantGrowthReductionMinutes"] ??
          base["plantGrowthReductionMinutes"] ??
          0;
        return num(minutes) * 60 * 1000;
      }

      case "PetXpBoost":
      case "SnowyPetXpBoost":
      case "PetXpBoostII": {
        const xp = data["bonusXp"] ?? base["bonusXp"] ?? 0;
        return num(xp);
      }

      case "PetAgeBoost":
      case "PetAgeBoostII": {
        const xp = data["bonusXp"] ?? base["bonusXp"] ?? 0;
        return num(xp);
      }

      case "PetHatchSizeBoost":
      case "PetHatchSizeBoostII": {
        const strength = data["strengthIncrease"] ?? 0;
        return num(strength);
      }

      case "HungerRestore":
      case "HungerRestoreII":
      case "SnowyHungerRestore": {
        const amount =
          data["hungerRestoreAmount"] ??
          data["hungerRestoredPercentage"] ??
          base["hungerRestorePercentage"] ??
          0;
        return num(amount);
      }

      case "HungerBoost":
      case "HungerBoostII":
      case "SnowyHungerBoost": {
        const pct =
          data["hungerDepletionRateDecreasePercentage"] ??
          base["hungerDepletionRateDecreasePercentage"] ??
          0;
        return num(pct);
      }

      default:
        return 0;
    }
  },

  async startAbilityLogsWatcher(): Promise<() => void> {
    try { await _ensureInventoryWatchersStarted(); } catch {}

    const indexInfosByPetId = (list: any): Record<string, any> => {
      const out: Record<string, any> = {};
      const arr = Array.isArray(list) ? list : [];
      for (const e of arr) {
        const id = String(e?.slot?.id ?? e?.id ?? "");
        if (id) out[id] = e;
      }
      return out;
    };

    const normalizeSlotInfoMap = (src: any): Record<string, any> => {
      if (!src) return {};
      if (Array.isArray(src)) {
        const out: Record<string, any> = {};
        for (const it of src) {
          if (!it || typeof it !== "object") continue;
          const id = String((it as any)?.id ?? (it as any)?.petId ?? (it as any)?.petItemId ?? (it as any)?.itemId ?? (it as any)?.slot?.id ?? "");
          if (!id || out[id]) continue;
          out[id] = {
            ...(it as any),
            lastAbilityTrigger:
              (it as any).lastAbilityTrigger ??
              (it as any).slot?.lastAbilityTrigger ??
              (it as any).data?.lastAbilityTrigger ??
              null,
            position: (it as any).position ?? (it as any).slot?.position ?? null,
          };
        }
        return out;
      }
      if (typeof src === "object") return src as Record<string, any>;
      return {};
    };

    let myInfosMap: Record<string, any> = {};
    try { myInfosMap = indexInfosByPetId(await Atoms.pets.myPetInfos.get()); } catch {}

    let stopInfos: (() => void) | null = null;
    try {
      stopInfos = await Atoms.pets.myPetInfos.onChange((list: any) => {
        try { myInfosMap = indexInfosByPetId(list); } catch {}
      });
    } catch {}

    const extractFlat = (src: any): Record<string, FlatAbilityEntry | null> => {
      const out: Record<string, FlatAbilityEntry | null> = {};
      const obj = normalizeSlotInfoMap(src);
      if (!obj || typeof obj !== "object") return out;

      for (const petId of Object.keys(obj)) {
        const entry = obj[petId] ?? {};
        const evt =
          entry.lastActionEvent ??
          entry.slot?.lastActionEvent ??
          entry.data?.lastActionEvent ??
          entry.lastAbilityTrigger ??
          entry.slot?.lastAbilityTrigger ??
          entry.data?.lastAbilityTrigger ??
          null;
        const lat = evt && (evt.action == null || evt.action === "ability") ? evt : null;

        let rawH =
          entry.hungerPct ??
          entry.hunger_percentage ??
          entry.hunger ??
          entry.slot?.hungerPct ??
          entry.slot?.hunger_percentage ??
          entry.slot?.hunger ??
          entry.stats?.hungerPct ??
          entry.stats?.hunger?.pct ??
          entry.stats?.hunger?.percent ??
          null;

        if (rawH == null) {
          const info = myInfosMap[petId];
          rawH =
            info?.hungerPct ?? info?.hunger_percentage ?? info?.hunger ??
            info?.slot?.hungerPct ?? info?.slot?.hunger ??
            info?.stats?.hungerPct ?? info?.stats?.hunger?.pct ?? info?.stats?.hunger?.percent ?? null;
        }

        let hungerPct: number | null =
          Number.isFinite(Number(rawH)) ? Number(rawH) : null;
        if (hungerPct != null && hungerPct > 0 && hungerPct <= 1) hungerPct *= 100;

        out[petId] = {
          petId,
          abilityId: lat?.abilityId ?? null,
          performedAt: Number.isFinite(lat?.performedAt) ? lat.performedAt : null,
          data: lat?.data ?? null,
          position: entry.position ?? entry.slot?.position ?? entry.data?.position ?? null,
          hungerPct,
        };
      }
      return out;
    };

    try { this._ingestAbilityMap(extractFlat(await Atoms.pets.myPetSlotInfos.get())); } catch {}
    try { this._ingestAbilityMap(extractFlat(await Atoms.pets.myPrimitivePetSlots.get())); } catch {}

    let stopSlots: (() => void) | null = null;
    try {
      const res = await Atoms.pets.myPetSlotInfos.onChange((src) => {
        try { this._ingestAbilityMap(extractFlat(src)); } catch {}
      });
      if (typeof res === "function") stopSlots = res;
    } catch {}
    let stopPrimitives: (() => void) | null = null;
    try {
      stopPrimitives = await Atoms.pets.myPrimitivePetSlots.onChange((src) => {
        try { this._ingestAbilityMap(extractFlat(src)); } catch {}
      });
    } catch {}

    return () => {
      try { stopSlots(); } catch {}
      try { stopPrimitives?.(); } catch {}
      try { stopInfos?.(); } catch {}
    };
  },

  getAbilityLogs(opts?: { abilityIds?: string[]; since?: number; limit?: number }): AbilityLogEntry[] {
    const ids = opts?.abilityIds && opts.abilityIds.length ? new Set(opts.abilityIds) : null;
    const since = Number.isFinite(opts?.since as number) ? (opts!.since as number) : 0;
    const lim = Math.max(0, Math.floor(opts?.limit ?? 0));
    let arr = this._logs.filter(e =>
      (since ? e.performedAt >= since : true) &&
      (ids ? ids.has(e.abilityId) : true)
    );
    arr = arr.sort((a, b) => b.performedAt - a.performedAt);
    return lim ? arr.slice(0, lim) : arr;
  },
  getAbilityLogsSessionStart(): number {
    return this._logsSessionStart;
  },
  onAbilityLogs(cb: (all: AbilityLogEntry[]) => void): () => void {
    this._logSubs.add(cb);
    try { cb(this.getAbilityLogs()); } catch {}
    return () => { this._logSubs.delete(cb); };
  },
  getSeenAbilityIds(): string[] {
    const set = new Set<string>();
    for (const e of this._logs) set.add(e.abilityId);
    return Array.from(set).sort();
  },
  clearAbilityLogs() {
    this._logs.length = 0;
    this._seenPerfByPet.clear();
    this._logsCutoffMs = Date.now();
    this._notifyLogSubs();
    this._persistAbilityLogs();
  },
  _notifyLogSubs() {
    const snap = this.getAbilityLogs();
    this._logSubs.forEach(fn => { try { fn(snap); } catch {} });
  },
  _pushLog(e: AbilityLogEntry) {
    this._logs.push(e);
    if (this._logs.length > this._logsMax) {
      this._logs.splice(0, this._logs.length - this._logsMax);
    }
    this._notifyLogSubs();
    this._persistAbilityLogs();
  },
  _persistAbilityLogs() {
    try {
      const payload = {
        version: 1,
        cutoff: this._logsCutoffMs,
        logs: this._logs.map((entry) => ({
          petId: entry.petId,
          species: entry.species ?? null,
          name: entry.name ?? null,
          mutations: Array.isArray(entry.mutations) ? entry.mutations.slice() : undefined,
          abilityId: entry.abilityId,
          abilityName: entry.abilityName,
          data: entry.data,
          performedAt: entry.performedAt,
          time12: entry.time12,
        })),
      };
      writeAriesPath(PATH_PETS_ABILITY_LOGS, payload);
    } catch {}
  },
  _restoreAbilityLogsFromStorage() {
    try {
      const parsed = readAriesPath<any>(PATH_PETS_ABILITY_LOGS);
      if (!parsed || typeof parsed !== "object") return;
      const logsRaw = Array.isArray((parsed as any).logs) ? (parsed as any).logs : [];
      const restored: AbilityLogEntry[] = [];
      for (const item of logsRaw) {
        if (!item || typeof item !== "object") continue;
        const abilityId = typeof (item as any).abilityId === "string" ? String((item as any).abilityId) : "";
        const performedAt = Number((item as any).performedAt) || 0;
        if (!abilityId || !performedAt) continue;
        const mutsRaw = (item as any).mutations;
        const mutations = Array.isArray(mutsRaw)
          ? mutsRaw.map((m: any) => String(m ?? "").trim()).filter(Boolean)
          : undefined;
        restored.push({
          petId: typeof (item as any).petId === "string" ? String((item as any).petId) : "",
          species: typeof (item as any).species === "string" && (item as any).species ? String((item as any).species) : undefined,
          name: typeof (item as any).name === "string" && (item as any).name ? String((item as any).name) : undefined,
          mutations: mutations && mutations.length ? mutations : undefined,
          abilityId,
          abilityName: typeof (item as any).abilityName === "string" && (item as any).abilityName
            ? String((item as any).abilityName)
            : abilityId,
          data: typeof (item as any).data === "string" ? String((item as any).data) : (item as any).data,
          performedAt,
          time12: typeof (item as any).time12 === "string" && (item as any).time12
            ? String((item as any).time12)
            : new Date(performedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        });
      }

      restored.sort((a, b) => a.performedAt - b.performedAt);
      this._logs = restored.slice(-this._logsMax);
      this._seenPerfByPet.clear();
      for (const entry of this._logs) {
        const prev = this._seenPerfByPet.get(entry.petId) || 0;
        if (entry.performedAt > prev) this._seenPerfByPet.set(entry.petId, entry.performedAt);
      }

      const cutoff = Number((parsed as any).cutoff);
      if (Number.isFinite(cutoff) && cutoff > 0) this._logsCutoffMs = cutoff;
    } catch {}
  },
  _ingestAbilityMap(map: Record<string, FlatAbilityEntry | null | undefined>) {
    if (!map || typeof map !== "object") return;

    const abilityDisplayName = (abilityId: string): string => {
      const def = (petAbilities as Record<string, { name?: string }>)[abilityId];
      return (def?.name && def.name.trim()) || abilityId;
    };
    const fmtTime12 = (ms: number): string =>
      new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const fmtInt = (n: unknown): string =>
      Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString('en-US') : '0';
    const fmtPct0 = (n: unknown): string =>
      `${Number.isFinite(Number(n)) ? Number(n).toFixed(0) : '0'}%`;
    const fmtMin1 = (n: unknown): string =>
      `${Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '0.0'} min`;

    const formatDetails = (abilityId: string, data: any): string | null => {
      const d = (data ?? {}) as Record<string, unknown>;
      const base = (petAbilities as Record<string, any>)[abilityId]?.baseParameters ?? {};
      const label = (value: unknown, fallback: string): string => {
        const s = typeof value === "string" ? value.trim() : "";
        return s || fallback;
      };
      const percentOr = (value: unknown, fallback?: unknown) => (value != null ? value : fallback);
      const cropNameFromGrowSlot = (src: unknown): string | null => {
        if (!src || typeof src !== "object") return null;
        const species = (src as any).species;
        if (typeof species !== "string" || !species.trim()) return null;
        const key = species.trim();
        const variants = [key, key.charAt(0).toUpperCase() + key.slice(1), key.toLowerCase()];
        for (const v of variants) {
          const name = (plantCatalog as any)?.[v]?.crop?.name;
          if (typeof name === "string" && name.trim()) return name;
        }
        return null;
      };

      switch (abilityId as keyof typeof petAbilities) {
        case "CoinFinderI":
        case "CoinFinderII":
        case "CoinFinderIII":
        case "SnowyCoinFinder": {
          const coins = d["coinsFound"] ?? d["coins"] ?? base["baseMaxCoinsFindable"];
          return coins != null ? `+ ${fmtInt(coins)} coins` : "Coins found";
        }

        case "SeedFinderI":
        case "SeedFinderII":
        case "SeedFinderIII":
        case "SeedFinderIV": {
          const seed = label(d["seedName"], "seed");
          return `x1 ${seed}`;
        }

        case "HungerRestore":
        case "HungerRestoreII":
        case "HungerRestoreIII":
        case "SnowyHungerRestore": {
          const whoRaw = d["petName"];
          const who = label(whoRaw === "itself" ? "itself" : whoRaw, "pet");
          const amount = d["hungerRestoreAmount"];
          const pct = percentOr(d["hungerRestoredPercentage"], base["hungerRestorePercentage"]);
          if (amount != null) return `${who}: +${fmtInt(amount)} hunger`;
          return pct != null ? `${who}: ${fmtPct0(pct)}` : `${who}: Hunger restored`;
        }

        case "DoubleHarvest": {
          const crop = label(d["cropName"], "crop");
          return `+1 ${crop}`;
        }
        case "DoubleHatch": {
          const pet = label(d["petName"], "pet");
          return `+1 ${pet}`;
        }

        case "ProduceEater": {
          const name = label(d["cropName"], "crop");
          if (d["sellPrice"] != null) return `Sold ${name}: +${fmtInt(d["sellPrice"])} coins`;
          const pct = base["cropSellPriceIncreasePercentage"];
          return pct != null ? `Eaten: ${name} (+${fmtPct0(pct)} value)` : `Eaten: ${name}`;
        }

        case "ProduceRefund": {
          const n = d["numCropsRefunded"] ?? d["numItemsRefunded"];
          return n != null ? `+ ${fmtInt(n)} crop(s)` : "Crops refunded";
        }

        case "SellBoostI":
        case "SellBoostII":
        case "SellBoostIII":
        case "SellBoostIV": {
          if (d["bonusCoins"] != null) return `Sale bonus: +${fmtInt(d["bonusCoins"])} coins`;
          const pct = base["cropSellPriceIncreasePercentage"];
          return pct != null ? `+ ${fmtPct0(pct)}` : "Sale bonus";
        }

        case "GoldGranter":
        case "RainbowGranter": {
          const cropFromSlot = cropNameFromGrowSlot(d["growSlot"]);
          const cropName = typeof d["cropName"] === "string" && d["cropName"].trim()
            ? d["cropName"].trim()
            : cropFromSlot;
          if (!cropName) return null;
          return cropName;
        }
        case "RainDance": {
          const cropFromSlot = cropNameFromGrowSlot(d["growSlot"]);
          const crop = label(d["cropName"], cropFromSlot ?? "crop");
          const muts = Array.isArray((d as any).mutations)
            ? (d as any).mutations
            : Array.isArray((d as any).growSlot?.mutations)
            ? (d as any).growSlot.mutations
            : [];
          const hasFrozen = muts.some((m: unknown) => typeof m === "string" && m.toLowerCase() === "frozen");
          return hasFrozen ? `${crop}: Chilled + Frozen` : `${crop}: Wet`;
        }
        case "SnowGranter":
        case "FrostGranter":
        case "DawnlitGranter":
        case "AmberlitGranter": {
          const cropFromSlot = cropNameFromGrowSlot(d["growSlot"]);
          const crop = label(d["cropName"], cropFromSlot ?? "crop");
          return `${crop}`;
        }

        case "ProduceScaleBoost":
        case "ProduceScaleBoostII":
        case "ProduceScaleBoostIII":
        case "SnowyCropSizeBoost": {
          const inc =
            d["scaleIncreasePercentage"] ??
            d["cropScaleIncreasePercentage"] ??
            base["scaleIncreasePercentage"];
          return inc != null ? `+ ${fmtPct0(inc)}` : "Crop size boosted";
        }

        case "ProduceMutationBoost":
        case "ProduceMutationBoostII":
        case "ProduceMutationBoostIII":
        case "DawnBoost":
        case "AmberMoonBoost":
        case "SnowyCropMutationBoost":
        case "PetMutationBoost":
        case "PetMutationBoostII":
        case "PetMutationBoostIII": {
          const inc = percentOr(d["mutationChanceIncreasePercentage"], base["mutationChanceIncreasePercentage"]);
          return inc != null ? `+ ${fmtPct0(inc)} mutation chance` : "Mutation chance up";
        }

        case "EggGrowthBoost":
        case "EggGrowthBoostII_NEW":
        case "EggGrowthBoostII":
        case "SnowyEggGrowthBoost": {
          const mins =
            d["minutesReduced"] ??
            d["eggGrowthTimeReductionMinutes"] ??
            base["eggGrowthTimeReductionMinutes"];
          return mins != null ? `- ${fmtMin1(mins)}` : "Egg growth reduced";
        }
        case "PlantGrowthBoost":
        case "PlantGrowthBoostII":
        case "PlantGrowthBoostIII":
        case "DawnPlantGrowthBoost":
        case "AmberPlantGrowthBoost":
        case "SnowyPlantGrowthBoost": {
          const mins = d["minutesReduced"] ?? d["reductionMinutes"] ?? base["plantGrowthReductionMinutes"];
          return mins != null ? `- ${fmtMin1(mins)}` : "Plant growth reduced";
        }

        case "PetXpBoost":
        case "SnowyPetXpBoost":
        case "PetXpBoostII":
        case "PetXpBoostIII": {
          const xp = d["bonusXp"] ?? base["bonusXp"];
          return `+ ${fmtInt(xp)} XP`;
        }
        case "PetAgeBoost":
        case "PetAgeBoostII":
        case "PetAgeBoostIII": {
          const xp = d["bonusXp"] ?? base["bonusXp"];
          const who = label(d["petName"], "pet");
          return `+ ${fmtInt(xp)} XP (${who})`;
        }
        case "PetHatchSizeBoost":
        case "PetHatchSizeBoostII":
        case "PetHatchSizeBoostIII": {
          const who = label(d["petName"], "pet");
          if (d["strengthIncrease"] != null) return `+${fmtInt(d["strengthIncrease"])} strength (${who})`;
          const pct = base["maxStrengthIncreasePercentage"];
          return pct != null ? `+ ${fmtPct0(pct)} (${who})` : `Strength increased (${who})`;
        }

        case "HungerBoost":
        case "HungerBoostII":
        case "HungerBoostIII":
        case "SnowyHungerBoost": {
          const pct = base["hungerDepletionRateDecreasePercentage"];
          return pct != null ? `- ${fmtPct0(pct)} hunger drain` : "Hunger reduced";
        }

        case "PetRefund":
        case "PetRefundII": {
          const egg = (d["eggName"] as string) ?? null;
          return egg ? `x1 ${egg}` : `Pet refunded as egg`;
        }

        case "Copycat":
          return "Copied another ability";

        case "MoonKisser":
          return "Amber mutations empowered";
        case "DawnKisser":
          return "Dawn mutations empowered";

        default: {
          const meta = (petAbilities as Record<string, any>)[abilityId];
          if (d && typeof d === "object" && Object.keys(d).length) return JSON.stringify(d);
          return meta?.description || "—";
        }
      }
    };

    for (const petId of Object.keys(map)) {
      const entry = map[petId];
      if (!entry || typeof entry !== "object") continue;

      const abilityId = (entry as any).abilityId ?? null;
      const performedAtNum = Number((entry as any).performedAt) || 0;
      if (!abilityId || !performedAtNum) continue;

      if (WEATHER_MUTATION_BOOST_IDS.has(String(abilityId))) {
        this._seenPerfByPet.set(petId, performedAtNum);
        continue;
      }

      const prev = this._seenPerfByPet.get(petId) || 0;
      if (performedAtNum <= prev) continue;

      if (this._logsCutoffMs &&
          performedAtNum < (this._logsCutoffMs - this._logsCutoffSkewMs)) {
        this._seenPerfByPet.set(petId, performedAtNum);
        continue;
      }

      // NOTE: Some game versions no longer provide hungerPct in slot infos.
      // We no longer gate logs on hungerPct to avoid dropping valid triggers.

      const pet = _invPetsCache.find(p => String(p.id) === String(petId)) || null;
      const abilityIdStr = String(abilityId);

      const details = formatDetails(abilityIdStr, (entry as any).data);

      // Skip phantom procs (e.g. GoldGranter/RainbowGranter with no resolved crop)
      if (details === null) {
        this._seenPerfByPet.set(petId, performedAtNum);
        continue;
      }

      const logLine: AbilityLogEntry = {
        petId,
        species: pet?.petSpecies || undefined,
        name: pet?.name ?? undefined,
        mutations: Array.isArray(pet?.mutations)
          ? pet.mutations.map(m => String(m ?? "").trim()).filter(Boolean)
          : undefined,
        abilityId: abilityIdStr,
        abilityName: abilityDisplayName(abilityId),
        data: details,
        performedAt: performedAtNum,
        time12: fmtTime12(performedAtNum),
      };

      this._seenPerfByPet.set(petId, performedAtNum);

      try {
        StatsService.incrementAbilityStat(abilityIdStr, "triggers");
        const abilityValue = this._extractAbilityValue(abilityIdStr, (entry as any).data);
        if (abilityValue > 0) {
          StatsService.incrementAbilityStat(abilityIdStr, "totalValue", abilityValue);
        }
      } catch {}

      this._pushLog(logLine);
    }
  },
};

try {
  PetsService._restoreAbilityLogsFromStorage();
} catch {}

// Debug helper: expose for console inspection when needed.
try {
  shareGlobal("QWS_PetsService", PetsService);
  shareGlobal("QWS_Atoms", Atoms);
} catch {}

/* -------------------------- Types for ability logs -------------------------- */
export type AbilityLogEntry = {
  petId: string;
  species?: string;
  name?: string | null;
  mutations?: string[];
  abilityId: string;
  abilityName: string;
  data?: any;
  performedAt: number;
  time12: string;
};

/* ----------------------- Flat map entry from selector ----------------------- */
type FlatAbilityEntry = {
  petId: string;
  abilityId: string | null;
  performedAt: number | null;
  data?: any;
  position?: { x: number; y: number } | null;
  hungerPct?: any;
};

/* --------------------------------- Helpers: free slot finders -------------------------------- */
const _HUTCH_MAX = 25;

async function _findFreeInventoryIndex(): Promise<number | undefined> {
  try {
    const inv = await Atoms.inventory.myInventory.get();
    const items: any[] = Array.isArray(inv?.items) ? inv.items : Array.isArray(inv) ? inv : [];
    for (let i = 0; i < items.length; i++) {
      if (!items[i]) return i;
    }
    return items.length;
  } catch {
    return undefined;
  }
}

async function _findFreeHutchIndex(): Promise<number | undefined> {
  try {
    const hutch = await myPetHutchPetItems.get();
    const items: any[] = Array.isArray(hutch) ? hutch : [];
    const hasStorageIndices = items.some(it => typeof it?.storageIndex === "number");
    if (hasStorageIndices) {
      const used = new Set(items.filter(it => typeof it?.storageIndex === "number").map(it => it.storageIndex as number));
      for (let i = 0; i < _HUTCH_MAX; i++) {
        if (!used.has(i)) return i;
      }
      return _HUTCH_MAX;
    }
    for (let i = 0; i < items.length; i++) {
      if (!items[i]) return i;
    }
    return items.length;
  } catch {
    return undefined;
  }
}

/* --------------------------------- Helpers: active pets -------------------------------- */
async function _getActivePetSlotIds(): Promise<string[]> {
  try {
    // myPrimitivePetSlotsAtom = new atom (game update), items have .id directly
    const primitives = await Atoms.pets.myPrimitivePetSlots.get();
    const primList = Array.isArray(primitives) ? primitives : [];
    const primIds = primList.map((p: any) => String(p?.id || "")).filter((id: string) => !!id).slice(0, 3);
    if (primIds.length) return primIds;

    // Fallback: old myPetInfosAtom format with { slot: { id } } wrapper
    const arr = await PlayerService.getPets();
    const list = Array.isArray(arr) ? arr : [];
    return list
      .map(p => String(p?.slot?.id || ""))
      .filter(id => !!id)
      .slice(0, 3);
  } catch { return []; }
}

async function _waitForHutchState(
  predicate: (ids: Set<string>) => boolean,
  timeoutMs = 4000
): Promise<boolean> {
  const snapshotMatches = async () => {
    try {
      const cur = await myPetHutchPetItems.get();
      const set = new Set<string>(
        (Array.isArray(cur) ? cur : [])
          .map((p: any) => String(p?.id || ""))
          .filter(Boolean),
      );
      return predicate(set);
    } catch { return false; }
  };
  if (await snapshotMatches()) return true;

  return new Promise<boolean>((resolve) => {
    const deadline = Date.now() + timeoutMs;
    let unsub: (() => void) | null = null;
    let pendingUnsub: Promise<(() => void)> | null = null;
    let stopped = false;
    const doUnsub = (fn?: (() => void) | null) => { if (fn) { try { fn(); } catch {} } };
    const stop = (ok: boolean) => {
      if (stopped) return;
      stopped = true;
      if (unsub) { doUnsub(unsub); }
      else if (pendingUnsub) { pendingUnsub.then(fn => doUnsub(fn)).catch(() => {}); }
      resolve(ok);
    };
    const check = async (state?: any) => {
      const set = new Set<string>(
        (Array.isArray(state) ? state : [])
          .map((p: any) => String(p?.id || ""))
          .filter(Boolean),
      );
      if (predicate(set)) { stop(true); }
      else if (Date.now() >= deadline) { stop(false); }
    };
    try {
      const res = myPetHutchPetItems.onChange((state: any) => { void check(state); });
      if (typeof res === "function") { unsub = res; }
      else if (res && typeof (res as any).then === "function") {
        pendingUnsub = res as Promise<() => void>;
        pendingUnsub.then(fn => { unsub = fn; if (stopped) { doUnsub(fn); } }).catch(() => {});
      }
    } catch {
      stop(false);
      return;
    }
    void check();
    setTimeout(() => stop(false), timeoutMs + 50);
  });
}

/* --------------------------------- Team switching --------------------------------- */
type EquipPetOpts = { markTeamId?: string | null; markUsed?: boolean };

async function _equipPetIds(
  targetInvIdsRaw: string[],
  opts?: EquipPetOpts
): Promise<{ swapped: number; placed: number; skipped: number }> {
  const markId = (opts?.markTeamId ?? null) || null;
  const targetInvIds = (Array.isArray(targetInvIdsRaw) ? targetInvIdsRaw : [])
    .map(v => String(v || ""))
    .filter(v => v.length > 0)
    .slice(0, 3);
  const markResolved = markId ?? _teamIdFromSlots(targetInvIds) ?? null;
  const shouldMark = opts?.markUsed !== false && !!markResolved;

  if (!targetInvIds.length) {
    if (shouldMark) markTeamAsUsed(markResolved);
    return { swapped: 0, placed: 0, skipped: 0 };
  }

  const targetSet = new Set<string>(targetInvIds);

  // 1) Snapshot current active pets
  let activeSlots = await _getActivePetSlotIds();

  // 2) Hutch capacity snapshot
  const HUTCH_MAX = 25;
  let hutchCount = (() => { try { return Number(myNumPetHutchItems.get()); } catch { return 0; } })() as any;
  try { hutchCount = Number(await myNumPetHutchItems.get()); } catch { hutchCount = 0; }
  let freeHutch = Math.max(0, HUTCH_MAX - (Number.isFinite(hutchCount) ? (hutchCount as number) : 0));

  // 3) Ensure target pets are in inventory (retrieve from hutch if needed)
  let hutchItemsSet: Set<string> = new Set();
  try {
    const hutchItems = await myPetHutchPetItems.get();
    if (Array.isArray(hutchItems)) {
      hutchItemsSet = new Set(hutchItems.map((it: any) => String(it?.id ?? "")));
    }
  } catch {}

  const missingFromActive = targetInvIds.filter(id => !activeSlots.includes(id));
  const missingFromHutch = missingFromActive.filter(id => hutchItemsSet.has(id));

  // If we must retrieve from Hutch but have no inventory space and no Hutch space to juggle, abort with toast
  if (missingFromHutch.length > 0) {
    let invFull = false;
    try { invFull = !!(await isMyInventoryAtMaxLength.get()); } catch { invFull = false; }
    if (invFull && freeHutch <= 0) {
      try { await toastSimple("Inventory Full", "Cannot equip team: required pets are in the Pet Hutch and your inventory is full."); } catch {}
      if (shouldMark) markTeamAsUsed(markResolved);
      return { swapped: 0, placed: 0, skipped: targetInvIds.length };
    }
  }

  // Iteratively retrieve from Hutch and equip (swap or place) with minimal clicks
  let swapped = 0, placed = 0, skipped = 0;
  for (const invId of targetInvIds) {
    const isAlreadyActive = activeSlots.includes(invId);
    if (isAlreadyActive) { skipped++; continue; }

    const livesInHutch = hutchItemsSet.has(invId);
    if (livesInHutch) {
      // Ensure one free inventory slot
      let invFull = false;
      try { invFull = !!(await isMyInventoryAtMaxLength.get()); } catch { invFull = false; }
      if (invFull) {
        // Try to free by moving a non-target inventory pet into Hutch if space
        if (freeHutch > 0) {
          try {
            const invPets = await PetsService.getInventoryPets();
              const invPet = (Array.isArray(invPets) ? invPets : []).find(p => {
                const id = String(p?.id || "");
                return id && !hutchItemsSet.has(id) && !activeSlots.includes(id) && !targetSet.has(id);
              });
              if (invPet) {
              const hutIdx = await _findFreeHutchIndex();
              await PlayerService.putItemInStorage(invPet.id, "PetHutch", hutIdx);
              freeHutch = Math.max(0, freeHutch - 1);
              void _waitForHutchState(set => set.has(String(invPet.id)), 3000);
              } else {
                // No candidate to free space
                try { await toastSimple("Inventory Full", "Cannot equip team: no free slot to retrieve a pet from the Pet Hutch.", "error"); } catch {}
                if (shouldMark) markTeamAsUsed(markResolved);
                return { swapped, placed, skipped };
              }
            } catch {
              try { await toastSimple("Inventory Full", "Cannot equip team: failed to free up a slot.", "error"); } catch {}
              if (shouldMark) markTeamAsUsed(markResolved);
              return { swapped, placed, skipped };
            }
          } else {
            try { await toastSimple("Inventory Full", "Cannot equip team: required pets are in the Pet Hutch and your inventory is full.", "error"); } catch {}
            if (shouldMark) markTeamAsUsed(markResolved);
            return { swapped, placed, skipped };
          }
        }

      // Retrieve from Hutch (this increases available Hutch space by 1)
      try {
        const invIdx = await _findFreeInventoryIndex();
        await PlayerService.retrieveItemFromStorage(invId, "PetHutch", invIdx);
        hutchItemsSet.delete(invId);
        freeHutch = Math.min(25, freeHutch + 1);
      } catch { continue; }
      void _waitForHutchState(set => !set.has(String(invId)), 3000);
    }

    // Prefer swapping out a non-target active if any, else place
    const offTargetActive = activeSlots.find(id => !targetSet.has(id));
    if (offTargetActive) {
      try {
        await PlayerService.swapPet(offTargetActive, invId);
        swapped++;
        // After swap, offTargetActive becomes inventory item; move it into Hutch if possible to keep flow
        if (freeHutch > 0) {
          try {
            const hutIdx = await _findFreeHutchIndex();
            await PlayerService.putItemInStorage(offTargetActive, "PetHutch", hutIdx);
            freeHutch = Math.max(0, freeHutch - 1);
          } catch {}
          void _waitForHutchState(set => set.has(String(offTargetActive)), 3000);
        }
        // Update active set snapshot
        activeSlots = activeSlots.filter(x => x !== offTargetActive);
        activeSlots.push(invId);
      } catch {
        // fallback to place
        try { await PlayerService.placePet(invId, { x: 0, y: 0 }, "Boardwalk", 64); placed++; activeSlots.push(invId); } catch {}
      }
    } else {
      try { await PlayerService.placePet(invId, { x: 0, y: 0 }, "Boardwalk", 64); placed++; activeSlots.push(invId); } catch {}
    }
  }

  // After equipping targets, if target has fewer pets than current actives,
  // move remaining non-target actives into the Hutch when there is space.
  try {
    // refresh hutch free slots before cleanup
    try { hutchCount = Number(await myNumPetHutchItems.get()); } catch {}
    freeHutch = Math.max(0, HUTCH_MAX - (Number.isFinite(hutchCount) ? (hutchCount as number) : 0));

    const leftovers = activeSlots.filter(id => !targetSet.has(id));
      for (const slotId of leftovers) {
        if (freeHutch <= 0) break;
        try {
          await PlayerService.storePet(slotId);
          const hutIdx = await _findFreeHutchIndex();
          await PlayerService.putItemInStorage(slotId, "PetHutch", hutIdx);
          freeHutch = Math.max(0, freeHutch - 1);
          activeSlots = activeSlots.filter(x => x !== slotId);
          void _waitForHutchState(set => set.has(String(slotId)), 3000);
        } catch {
          // ignore failures; leave as is
        }
      }
  } catch {}

  // Final tidy pass to ensure exact targets are active (handles pets already in inventory)
  const res = await _applyTeam(targetInvIds);
  await new Promise(r => setTimeout(r, 300));
  if (shouldMark) markTeamAsUsed(markResolved);
  return res;
}

async function _applyTeam(targetInvIds: string[]): Promise<{ swapped: number; placed: number; skipped: number }> {
  let activeSlots = await _getActivePetSlotIds();

  const targetSet = new Set(targetInvIds);
  const extras = activeSlots.filter(id => !targetSet.has(id));
  const mustStore = Math.max(0, activeSlots.length - targetInvIds.length);

  if (mustStore > 0) {
    const toStore = extras.slice(0, mustStore);
    for (const itemId of toStore) {
      try {
        await PlayerService.storePet(itemId);
        activeSlots = activeSlots.filter(id => id !== itemId);
      } catch {}
    }
  }

  const alreadyActive = new Set<string>();
  for (const invId of targetInvIds) if (activeSlots.includes(invId)) alreadyActive.add(invId);

  let swapped = 0, placed = 0, skipped = 0;

  if (alreadyActive.size) {
    activeSlots = activeSlots.filter(slotId => !alreadyActive.has(slotId));
    skipped = alreadyActive.size;
  }

  const toDo = targetInvIds.filter(id => !alreadyActive.has(id));

  for (const invId of toDo) {
    const slotId = activeSlots.shift();
    try {
      if (slotId) {
        await PlayerService.swapPet(slotId, invId);
        swapped++;
      } else {
        await PlayerService.placePet(invId, { x: 0, y: 0 }, "Boardwalk", 64);
        placed++;
      }
    } catch {}
  }

  return { swapped, placed, skipped };
}
