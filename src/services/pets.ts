// src/services/pets.ts
import {
  PlayerService,
  type PetInfo,
  type PetState,
  type CropItem,
  type CropInventoryState,
} from "./player";
import { petCatalog, petAbilities, formatAbilityLog, isPetAbilityAction } from "../data";
import { fakeInventoryShow, fakeInventoryDisable, closeInventoryPanel, isInventoryOpen } from "./fakeModal.ts";
import { Atoms, myPetHutchPetItems, myNumPetHutchItems, myPetHutchCapacitySlots, isMyInventoryAtMaxLength, stateUserSlots, playerId, playerDatabaseUserId, myActivityLog } from "../store/atoms";
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
import { sendToGame } from "../core/webSocketBridge";

/* ----------------------------- Types & constants ----------------------------- */

export type PetTeam = {
  id: string;
  name: string;
  slots: (string | null)[];
  /** Server-generated id of the native (in-game) pet team this is linked to, once synced. */
  serverId?: string | null;
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
const PATH_PETS_TEAM_SYNC = "pets.teamSync";
const PATH_PETS_HOTKEYS = "pets.hotkeys";
const PATH_PETS_ABILITY_LOGS = "pets.abilityLogs";

/** Abilities that boost mutation chance based on weather — excluded from the pets logs. */
const WEATHER_MUTATION_BOOST_IDS = new Set([
  "ProduceMutationBoost",
  "ProduceMutationBoostII",
  "ProduceMutationBoostIII",
  "DawnBoost",
  "AmberMoonBoost",
  "ThunderBoost",
  "SnowyCropMutationBoost",
  "PetMutationBoost",
  "PetMutationBoostII",
  "PetMutationBoostIII",
  // Passive chance boost; the game itself never logs it (returns nothing).
  "DawnbinderBoost",
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

// Every known pet ability id, except the weather-driven mutation boosters
// (the game itself never logs those as discrete activity log entries).
const PET_ABILITY_IDS = new Set(Object.keys(_AB).filter(id => !WEATHER_MUTATION_BOOST_IDS.has(id)));

function _abilityLogFallbackText(abilityId: string, params: Record<string, unknown>): string {
  const fmtInt = (n: unknown): string =>
    Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString("en-US") : "0";

  switch (abilityId) {
    case "HungerBoost":
    case "HungerBoostII":
    case "HungerBoostIII":
    case "SnowyHungerBoost": {
      const base = (petAbilities as Record<string, any>)[abilityId]?.baseParameters ?? {};
      const pct = base["hungerDepletionRateDecreasePercentage"];
      return pct != null ? `- ${Number(pct).toFixed(0)}% hunger drain` : "Hunger reduced";
    }
    case "Copycat":
      return "Copied another ability";
    case "DawnCapture": {
      // parameters: { dawnlitRemoved, dawnboundRemoved, capsulesAdded } — the
      // dawnbound count is displayed as Dawncharged by the game.
      const capsules = params["capsulesAdded"];
      const dawnlit = Number(params["dawnlitRemoved"]) || 0;
      const dawncharged = Number(params["dawnboundRemoved"]) || 0;
      const absorbed: string[] = [];
      if (dawnlit > 0) absorbed.push(`${fmtInt(dawnlit)} Dawnlit`);
      if (dawncharged > 0) absorbed.push(`${fmtInt(dawncharged)} Dawncharged`);
      const head = capsules != null
        ? `+ ${fmtInt(capsules)} Dawn Capsule${Number(capsules) === 1 ? "" : "s"}`
        : "Dawn Capsules added";
      return absorbed.length ? `${head} (${absorbed.join(", ")} absorbed)` : head;
    }
    case "Thunderbloom":
      return "Thunder mutations empowered";
    case "Thundercharger": {
      // parameters: { cropsCharged } — converts Thunderstruck crops to Thundercharged.
      const charged = params["cropsCharged"];
      return charged != null
        ? `${fmtInt(charged)} crop${Number(charged) === 1 ? "" : "s"} Thundercharged`
        : "Crops Thundercharged";
    }
    default: {
      const meta = (petAbilities as Record<string, any>)[abilityId];
      return meta?.description || meta?.name || abilityId;
    }
  }
}

/**
 * Builds the display text for one pet-ability activity log entry. Prefers the
 * shared `formatAbilityLog` formatter (kept in sync with the real
 * myActivityLog wire shape); falls back to a local formatter for the handful
 * of abilities it doesn't cover yet.
 */
function _buildAbilityLogText(abilityId: string, params: Record<string, unknown>): string | null {
  // Skip phantom procs (e.g. GoldGranter/RainbowGranter with no resolved crop).
  if (abilityId === "GoldGranter" || abilityId === "RainbowGranter") {
    const growSlot = (params as any)?.growSlot as Record<string, unknown> | undefined;
    const species = typeof growSlot?.species === "string" ? growSlot.species.trim() : "";
    if (!species) return null;
  }

  if (isPetAbilityAction(abilityId)) {
    try {
      const text = formatAbilityLog({ action: abilityId, timestamp: 0, parameters: params });
      if (text) return text;
    } catch {}
  }

  return _abilityLogFallbackText(abilityId, params);
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
      serverId: t?.serverId ? String(t.serverId) : null,
    }))
    .filter(t => t.id);
  const unique = _dedupeTeams(mapped);
  if (unique.length !== mapped.length) {
    try { saveTeams(unique); } catch {}
  }
  for (const t of unique) {
    if (t.serverId) _localTeamIdByServerId.set(t.serverId, t.id);
  }
  return unique;
}
function saveTeams(arr: PetTeam[]) {
  for (const t of Array.isArray(arr) ? arr : []) {
    if (t?.serverId && t?.id) _localTeamIdByServerId.set(String(t.serverId), String(t.id));
  }
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

let _teamSearch: Record<string, string> = _loadTeamSearchMap();

function _teamIdFromSlots(ids: string[]): string | null {
  const wanted = new Set(ids.map(id => String(id || "")).filter(Boolean));
  if (!wanted.size) return null;
  for (const team of PetsService.getTeams()) {
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

/* ------------------------- Native pet-team sync (game <-> mod) ------------------------- */
// The game bundle exposes a built-in pet-team system (SavePetTeam / ApplyPetTeam /
// DeletePetTeam / MovePetTeam / SetPetTeamEmblem, raw Quinoa room actions). We mirror
// it here so the mod's local teams (`PetTeam.id`, used by hotkeys) stay linked to the
// server-generated team (`PetTeam.serverId`) they correspond to, in both directions:
//  - a change made in the mod is pushed to the server via the native commands;
//  - a change made in-game (or by another client) flows back through `stateUserSlots`
//    and is mirrored onto the matching local team.
// On name-collision during first link, the server's members win (see _reconcileTeams).

type ServerPetTeamMember = { petId: string; petSpecies?: string; name?: string | null };
type ServerPetTeam = { id: string; name: string; members: ServerPetTeamMember[]; emblem?: unknown };

function _serverMemberIds(team: ServerPetTeam): string[] {
  return Array.isArray(team?.members)
    ? team.members.map(m => String(m?.petId || "")).filter(Boolean)
    : [];
}

function _sameMemberSet(a: (string | null)[], b: string[]): boolean {
  const aa = a.filter((x): x is string => !!x).slice().sort();
  const bb = b.slice().sort();
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}

// User-facing opt-out (default ON). When off, the mod's teams become purely local:
// nothing is pushed to the native system and nothing is pulled back from it. Existing
// links (`PetTeam.serverId`) are kept frozen, so turning the sync back on resumes where
// it left off — with the server winning on any divergence, as it always does.
let _teamSyncEnabled = readAriesPath<boolean>(PATH_PETS_TEAM_SYNC, true) !== false;

function _sendSavePetTeam(teamId: string | null, name: string, petIds: string[]): void {
  if (!_teamSyncEnabled) return;
  try { sendToGame({ type: "SavePetTeam", teamId, name, petIds }); } catch {}
}
function _sendDeletePetTeam(teamId: string): void {
  if (!_teamSyncEnabled) return;
  try { sendToGame({ type: "DeletePetTeam", teamId }); } catch {}
}
function _sendApplyPetTeam(teamId: string): void {
  if (!_teamSyncEnabled) return;
  try { sendToGame({ type: "ApplyPetTeam", teamId }); } catch {}
}
function _sendMovePetTeam(teamId: string, toIndex: number): void {
  if (!_teamSyncEnabled) return;
  try { sendToGame({ type: "MovePetTeam", movePetTeamId: teamId, toPetTeamIndex: toIndex }); } catch {}
}

// Dernier id local connu pour un serverId donné. Les keybinds des équipes sont
// stockés sous `pets.team.<id local>` : si une équipe disparaît puis revient du
// serveur, elle doit retrouver son id local, sinon le raccourci est perdu.
const _localTeamIdByServerId = new Map<string, string>();

let _serverTeams: ServerPetTeam[] = [];
let _teamSyncStarted = false;
let _lastServerTeamsSig = "";
let _reconcilingTeams = false;
let _reconcileTeamsQueued = false;
const _pendingServerCreates = new Set<string>();
// Safety net for _pendingServerCreates: the native API gives no synchronous ack,
// only an eventual stateUserSlots echo that _reconcileTeams picks up and links
// (which clears the pending flag). If that echo never arrives — command silently
// failed, connection hiccup — don't leave the team stuck forever unable to retry.
const _pendingCreateTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
// The name actually sent in a still-pending create. Reconciliation matches
// local↔server teams by name — if the user renames the team again before
// the server echoes the create back, the local team's *current* name no
// longer matches what the server actually created, so the linking lookup
// also tries this "as sent" name to catch it instead of importing it as an
// orphan duplicate.
const _pendingCreateSentName = new Map<string, string>();
const PENDING_CREATE_TIMEOUT_MS = 8000;

function _clearPendingCreate(localId: string): void {
  _pendingServerCreates.delete(localId);
  _pendingCreateSentName.delete(localId);
  const t = _pendingCreateTimeouts.get(localId);
  if (t) { clearTimeout(t); _pendingCreateTimeouts.delete(localId); }
}

// Per local team id, the (name+members) signature we already asked the server to create.
// The native API gives no synchronous id back, and retrying on every reconcile tick when
// linking hasn't happened yet (e.g. a transient mismatch) would spam duplicate teams
// forever — the doc is explicit that creation must never be auto-retried. We only allow
// firing again if the team's actual content changed since the last attempt.
const _lastCreateAttemptSig = new Map<string, string>();

function _createAttemptSig(local: PetTeam): string {
  const petIds = (local.slots || []).filter((x): x is string => !!x).slice().sort();
  return `${local.name.trim().toLowerCase()}::${petIds.join(",")}`;
}

function _serverTeamsSig(list: ServerPetTeam[]): string {
  try {
    return list
      .map(t => `${t.id}:${t.name}:${_serverMemberIds(t).slice().sort().join(",")}`)
      .sort()
      .join("|");
  } catch { return ""; }
}

/**
 * Creates the native team for a local team that has no server counterpart yet.
 * No-op until it has >=1 pet (native API requires 1-3), and fires at most once per
 * distinct (name, members) combination — see `_lastCreateAttemptSig`.
 */
function _maybeCreateServerTeam(local: PetTeam): void {
  // Bail out before touching `_lastCreateAttemptSig` / `_pendingServerCreates`: with the
  // sync off nothing is ever sent, and recording an attempt here would make the team look
  // "already tried" once the user turns the sync back on.
  if (!_teamSyncEnabled) return;

  // A create for this local team is already in flight — wait for it to link
  // (or time out) rather than firing another one. Without this, editing the
  // team again (add a pet, rename) before the server echoes back a real id
  // used to look like "new content, never attempted" and fire a *second*
  // SavePetTeam(null, ...), which the native API treats as "create another
  // team" rather than "update this one" — that's what produced the orphaned
  // 1-pet/2-pet/3-pet duplicate teams and the same team saved twice under
  // two different names.
  if (_pendingServerCreates.has(local.id)) return;

  const petIds = (local.slots || []).filter((x): x is string => !!x);
  const name = (local.name || "").trim();
  if (!name || !petIds.length) return;

  const sig = _createAttemptSig(local);
  if (_lastCreateAttemptSig.get(local.id) === sig) return;

  _lastCreateAttemptSig.set(local.id, sig);
  _pendingServerCreates.add(local.id);
  _pendingCreateSentName.set(local.id, name);
  try { console.warn(`[Pets] Creating native pet team "${name}" (${petIds.length} pet(s)) — one-shot, will not auto-retry.`); } catch {}
  _sendSavePetTeam(null, name, petIds);

  const timeout = setTimeout(() => _clearPendingCreate(local.id), PENDING_CREATE_TIMEOUT_MS);
  _pendingCreateTimeouts.set(local.id, timeout);
}

function _reconcileTeams(): void {
  if (!_teamSyncEnabled) return;
  if (_reconcilingTeams) { _reconcileTeamsQueued = true; return; }
  _reconcilingTeams = true;
  try {
    const teams = PetsService._teams;
    const serverById = new Map(_serverTeams.map(t => [String(t.id), t]));
    const serverByName = new Map(_serverTeams.map(t => [String(t.name || "").trim().toLowerCase(), t]));
    const linkedServerIds = new Set(teams.map(t => t.serverId).filter((v): v is string => !!v));

    let changed = false;

    for (const local of teams) {
      if (local.serverId) {
        const server = serverById.get(local.serverId);
        if (!server) continue; // deleted in-game: dropped by the removal pass below
        const memberIds = _serverMemberIds(server);
        if (server.name !== local.name || !_sameMemberSet(local.slots, memberIds)) {
          local.name = server.name;
          local.slots = [0, 1, 2].map(i => memberIds[i] ?? null);
          changed = true;
        }
        continue;
      }

      const key = local.name.trim().toLowerCase();
      const sentName = _pendingCreateSentName.get(local.id);
      const sentKey = sentName ? sentName.trim().toLowerCase() : undefined;
      const match =
        (key ? serverByName.get(key) : undefined) ??
        (sentKey ? serverByName.get(sentKey) : undefined);
      if (match && !linkedServerIds.has(String(match.id))) {
        local.serverId = String(match.id);
        linkedServerIds.add(local.serverId);
        _clearPendingCreate(local.id);

        const matchMemberIds = _serverMemberIds(match);
        const divergedWhilePending = match.name !== local.name || !_sameMemberSet(local.slots, matchMemberIds);
        if (divergedWhilePending) {
          // The user kept editing (added another pet, renamed) while this
          // team's first create was still in flight — the server team it
          // just linked to only reflects that earlier snapshot. Push the
          // real current content now that a serverId finally exists, as an
          // update (safe to repeat), instead of silently reverting local
          // state back to the stale snapshot.
          const petIds = local.slots.filter((x): x is string => !!x);
          if (petIds.length) _sendSavePetTeam(local.serverId, local.name.trim() || "Team", petIds);
        } else {
          // First link on a name match: the server's members are the source of truth.
          local.name = match.name;
          local.slots = [0, 1, 2].map(i => matchMemberIds[i] ?? null);
        }
        changed = true;
        continue;
      }

      _maybeCreateServerTeam(local);
    }

    const beforeCount = teams.length;
    const dropped = teams.filter(t => !!t.serverId && !serverById.has(t.serverId));
    for (const t of dropped) _localTeamIdByServerId.set(String(t.serverId), t.id);
    PetsService._teams = teams.filter(t => !t.serverId || serverById.has(t.serverId));
    if (PetsService._teams.length !== beforeCount) changed = true;

    const usedLocalIds = new Set(PetsService._teams.map(t => t.id));
    for (const server of _serverTeams) {
      if (linkedServerIds.has(String(server.id))) continue;
      const memberIds = _serverMemberIds(server);
      // Ce serverId a peut-être déjà eu une équipe locale (drop transitoire) :
      // on réutilise son id pour ne pas casser les keybinds `pets.team.<id>`.
      const knownLocalId = _localTeamIdByServerId.get(String(server.id));
      const importedId = knownLocalId && !usedLocalIds.has(knownLocalId) ? knownLocalId : _uid();
      usedLocalIds.add(importedId);
      const imported: PetTeam = {
        id: importedId,
        name: server.name,
        slots: [0, 1, 2].map(i => memberIds[i] ?? null),
        serverId: String(server.id),
      };
      PetsService._teams.push(imported);
      linkedServerIds.add(String(server.id));
      changed = true;
    }

    if (changed) {
      saveTeams(PetsService._teams);
      PetsService._notifyTeamSubs();
    }
  } finally {
    _reconcilingTeams = false;
    if (_reconcileTeamsQueued) {
      _reconcileTeamsQueued = false;
      _reconcileTeams();
    }
  }
}

/**
 * Server-side teams for my user slot, or `null` when the slot simply can't be read
 * right now (player id not resolved yet, slots not streamed in, reconnect in
 * progress, no `petTeams` field). That distinction matters: `[]` means "the server
 * really has no team" and makes _reconcileTeams drop every linked local team, while
 * `null` means "unknown" and must leave local teams alone. Treating the two as the
 * same is what used to wipe the local teams on a transient payload, re-import them
 * with brand new ids, and silently orphan every `pets.team.<id>` keybind.
 */
async function _extractServerTeamsFromSlots(slots: any): Promise<ServerPetTeam[] | null> {
  try {
    const idx = await _getMyUserSlotIndex();
    if (idx == null) return null;
    const list: any[] = Array.isArray(slots) ? slots : [];
    const mySlot = list[idx];
    if (!mySlot || typeof mySlot !== "object") return null;
    const teams = mySlot?.data?.petTeams;
    return Array.isArray(teams) ? teams : null;
  } catch { return null; }
}

async function _startServerTeamsWatcher(): Promise<void> {
  const applyNext = async (slots: any) => {
    const next = await _extractServerTeamsFromSlots(slots);
    if (next === null) return; // état serveur illisible : on ne touche à rien
    const sig = _serverTeamsSig(next);
    if (sig === _lastServerTeamsSig) return;
    _lastServerTeamsSig = sig;
    _serverTeams = next;
    _reconcileTeams();
  };

  try { await applyNext(await stateUserSlots.get()); } catch {}
  try { await stateUserSlots.onChange((slots: any) => { applyNext(slots); }); } catch {}
}

function _setTeamSyncEnabled(value: boolean): void {
  const next = !!value;
  if (next === _teamSyncEnabled) return;
  _teamSyncEnabled = next;
  writeAriesPath(PATH_PETS_TEAM_SYNC, next);

  if (!next) {
    // Nothing will ever ack these now — drop the timers rather than leave them pending.
    for (const localId of Array.from(_pendingServerCreates)) _clearPendingCreate(localId);
    return;
  }

  // Teams edited while the sync was off never got a create attempt; clear the memo so
  // they aren't mistaken for "already attempted, don't retry".
  _lastCreateAttemptSig.clear();
  _reconcileTeams();
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
    const t: PetTeam = { id: _uid(), name: name?.trim() || `Team ${this._teams.length + 1}`, slots: [null,null,null], serverId: null };
    this._teams.push(t);
    saveTeams(this._teams);
    this._notifyTeamSubs();
    return t;
  },
  deleteTeam(teamId: string): boolean {
    const i = this._teams.findIndex(t => t.id === teamId);
    if (i < 0) return false;
    const [removed] = this._teams.splice(i, 1);
    saveTeams(this._teams);
    this._notifyTeamSubs();
    if (removed.serverId) _sendDeletePetTeam(removed.serverId);
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
      serverId: cur.serverId ?? null,
    };
    this._teams[i] = next;
    saveTeams(this._teams);
    this._notifyTeamSubs();

    const petIds = next.slots.filter((x): x is string => !!x);
    if (next.serverId) {
      if (petIds.length > 0) _sendSavePetTeam(next.serverId, next.name.trim() || "Team", petIds);
    } else {
      _maybeCreateServerTeam(next);
    }
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

    let serverIndex = 0;
    for (const t of next) {
      if (!t.serverId) continue;
      _sendMovePetTeam(t.serverId, serverIndex);
      serverIndex++;
    }
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

    // Si l'user a validé une sélection → on ferme la modal (qu'il a finie d'utiliser).
    // Sinon (timeout ou nav ailleurs) → on désactive juste les fakes sans yank la modal :
    // soit il est encore dedans (il verra ses vraies données), soit il est ailleurs et
    // le guard de closeModal aurait été un no-op de toute façon.
    if (selIndex != null && selIndex >= 0 && selIndex < items.length) {
      await closeInventoryPanel();
    } else {
      await fakeInventoryDisable();
      return null;
    }

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

    if (selIndex != null && selIndex >= 0 && selIndex < items.length) {
      await closeInventoryPanel();
    } else {
      await fakeInventoryDisable();
      return null;
    }

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

    if (_teamSyncEnabled && t.serverId) {
      _sendApplyPetTeam(t.serverId);
      if (opts?.markUsed !== false) markTeamAsUsed(teamId);
      return { swapped: targetInvIds.length, placed: 0, skipped: 0 };
    }

    return _equipPetIds(targetInvIds, { markTeamId: teamId, markUsed: opts?.markUsed });
  },

  /** Whether mod teams mirror the native (in-game) pet teams. Defaults to true. */
  isTeamSyncEnabled(): boolean { return _teamSyncEnabled; },
  /** Turns the native pet-team mirroring on/off. Existing links are kept when turning it off. */
  setTeamSyncEnabled(value: boolean): void { _setTeamSyncEnabled(value); },

  /** Starts the background watcher that keeps local teams linked to their native (in-game) counterpart. Idempotent. */
  async startPetTeamSync(): Promise<void> {
    if (_teamSyncStarted) return;
    _teamSyncStarted = true;
    try { await _startServerTeamsWatcher(); } catch {}
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
  // Identity key (abilityId|petId|performedAt) of every log entry already ingested from
  // myActivityLog, so a reconnect resync of the same historical entries can't double-log them.
  _seenLogKeys: new Set<string>(),
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
      case "SnowyCoinFinder":
      case "DawnCoinFinder":
      case "ThunderCoinFinder": {
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
      case "ProduceScaleBoostIII":
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
      case "SnowyEggGrowthBoost":
      case "ThunderEggGrowthBoost": {
        // myActivityLog reports this in seconds (`secondsReduced`); older
        // minute-based field names are kept as a fallback for safety.
        if (data["secondsReduced"] != null) return num(data["secondsReduced"]) * 1000;
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
      case "PlantGrowthBoostIII":
      case "SnowyPlantGrowthBoost":
      case "DawnPlantGrowthBoost":
      case "AmberPlantGrowthBoost":
      case "ThunderPlantGrowthBoost": {
        if (data["secondsReduced"] != null) return num(data["secondsReduced"]) * 1000;
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
      case "PetXpBoostII":
      case "PetXpBoostIII":
      case "DawnXpBoost":
      case "ThunderXpBoost": {
        const xp = data["bonusXp"] ?? base["bonusXp"] ?? 0;
        return num(xp);
      }

      case "DawnCapture": {
        const value = data["capsulesAdded"] ?? 0;
        return num(value);
      }

      case "PetAgeBoost":
      case "PetAgeBoostII":
      case "PetAgeBoostIII": {
        const xp = data["bonusXp"] ?? base["bonusXp"] ?? 0;
        return num(xp);
      }

      case "PetHatchSizeBoost":
      case "PetHatchSizeBoostII":
      case "PetHatchSizeBoostIII": {
        const strength = data["strengthIncrease"] ?? 0;
        return num(strength);
      }

      case "HungerRestore":
      case "HungerRestoreII":
      case "HungerRestoreIII":
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
      case "HungerBoostIII":
      case "SnowyHungerBoost": {
        const pct =
          data["hungerDepletionRateDecreasePercentage"] ??
          base["hungerDepletionRateDecreasePercentage"] ??
          0;
        return num(pct);
      }

      case "Thundercharger":
        return num(data["cropsCharged"] ?? 0);

      default:
        return 0;
    }
  },

  async startAbilityLogsWatcher(): Promise<() => void> {
    try { await _ensureInventoryWatchersStarted(); } catch {}

    // Source of truth: the game's own activity log (same feed as the in-game
    // Activity Log, capped ~500 entries). Each entry is an immutable historical
    // fact, unlike the old myPetSlotInfos/myPrimitivePetSlots "last known trigger"
    // snapshot — which could get re-delivered with a bumped performedAt after a
    // forced WS reconnect and get mistaken for a brand-new proc (duplicate logs).
    const ingest = (rawLogs: any) => {
      const list: any[] = Array.isArray(rawLogs) ? rawLogs : [];
      for (const raw of list) {
        try { this._ingestActivityLogEntry(raw); } catch {}
      }
    };

    try { ingest(await myActivityLog.get()); } catch {}

    let stop: (() => void) | null = null;
    try {
      const res = await myActivityLog.onChange((next: any) => { try { ingest(next); } catch {} });
      if (typeof res === "function") stop = res;
    } catch {}

    return () => {
      try { stop?.(); } catch {}
    };
  },

  _ingestActivityLogEntry(raw: any) {
    if (!raw || typeof raw !== "object") return;

    const abilityId = typeof raw.action === "string" ? raw.action : "";
    if (!abilityId || !PET_ABILITY_IDS.has(abilityId)) return;

    const performedAtNum = Number(raw.timestamp);
    if (!Number.isFinite(performedAtNum) || performedAtNum <= 0) return;

    const params = (raw.parameters && typeof raw.parameters === "object") ? raw.parameters as Record<string, unknown> : {};
    const petParam = (params as any)?.pet as Record<string, unknown> | undefined;
    const petId = typeof petParam?.id === "string" ? petParam.id : "";
    if (!petId) return;

    const key = `${abilityId}|${petId}|${performedAtNum}`;
    if (this._seenLogKeys.has(key)) return;
    this._seenLogKeys.add(key);

    if (this._logsCutoffMs && performedAtNum < (this._logsCutoffMs - this._logsCutoffSkewMs)) {
      return;
    }

    const details = _buildAbilityLogText(abilityId, params);
    // Skip phantom procs (e.g. GoldGranter/RainbowGranter with no resolved crop)
    if (details === null) return;

    const cachedPet = _invPetsCache.find(p => String(p.id) === petId) || null;
    const species = (typeof petParam?.petSpecies === "string" && petParam.petSpecies) || cachedPet?.petSpecies || undefined;
    const name = (typeof petParam?.name === "string" && petParam.name) || cachedPet?.name || undefined;
    const mutationsRaw = Array.isArray(petParam?.mutations) ? petParam!.mutations : cachedPet?.mutations;
    const mutations = Array.isArray(mutationsRaw)
      ? mutationsRaw.map((m: any) => String(m ?? "").trim()).filter(Boolean)
      : undefined;

    const logLine: AbilityLogEntry = {
      petId,
      species,
      name,
      mutations: mutations && mutations.length ? mutations : undefined,
      abilityId,
      abilityName: _abilityName(abilityId),
      data: details,
      performedAt: performedAtNum,
      time12: new Date(performedAtNum).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
    };

    try {
      StatsService.incrementAbilityStat(abilityId, "triggers");
      const abilityValue = this._extractAbilityValue(abilityId, params);
      if (abilityValue > 0) {
        StatsService.incrementAbilityStat(abilityId, "totalValue", abilityValue);
      }
    } catch {}

    this._pushLog(logLine);
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
    this._seenLogKeys.clear();
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
      this._seenLogKeys.clear();
      for (const entry of this._logs) {
        this._seenLogKeys.add(`${entry.abilityId}|${entry.petId}|${entry.performedAt}`);
      }

      const cutoff = Number((parsed as any).cutoff);
      if (Number.isFinite(cutoff) && cutoff > 0) this._logsCutoffMs = cutoff;
    } catch {}
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

/* --------------------------------- Helpers: free slot finders -------------------------------- */
// The storage entry in myInventoryAtom.storages carries `capacitySlots`
// directly; the game's myPetHutchCapacitySlotsAtom falls back to 10 when
// the field is absent (fresh hutch, no upgrades).
const HUTCH_DEFAULT_CAPACITY = 10;

async function _getHutchInfo(): Promise<{ capacity: number; used: number; free: number }> {
  let capacity = 0;
  let used = 0;
  try {
    const inv = await Atoms.inventory.myInventory.get();
    const storages: any[] = Array.isArray((inv as any)?.storages) ? (inv as any).storages : [];
    const hutch = storages.find((s: any) => s?.id === "PetHutch" || s?.decorId === "PetHutch");
    const slots = Number(hutch?.capacitySlots);
    if (Number.isFinite(slots) && slots > 0) capacity = slots;
    if (Array.isArray(hutch?.items)) used = hutch.items.length;
  } catch {}
  if (!capacity) {
    try {
      const n = Number(await myPetHutchCapacitySlots.get());
      if (Number.isFinite(n) && n > 0) capacity = n;
    } catch {}
  }
  if (!capacity) capacity = HUTCH_DEFAULT_CAPACITY;
  if (!used) {
    try {
      const n = Number(await myNumPetHutchItems.get());
      if (Number.isFinite(n) && n > 0) used = n;
    } catch {}
  }
  return { capacity, used, free: Math.max(0, capacity - used) };
}

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
      const { capacity } = await _getHutchInfo();
      for (let i = 0; i < capacity; i++) {
        if (!used.has(i)) return i;
      }
      return capacity;
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

const MAX_TEAM_SLOTS = 3;

/**
 * Align target pet ids on the current active slots so that pets already
 * active keep their slot. Guarantees a swap never targets a pet that is
 * itself part of the team (which would corrupt the swap sequence).
 */
function _alignTargetsToActiveSlots(targets: string[], activeSlots: string[]): string[] {
  const aligned: string[] = new Array(MAX_TEAM_SLOTS).fill("");
  const remaining: string[] = [];
  for (const id of targets) {
    const idx = activeSlots.indexOf(id);
    if (idx >= 0 && idx < MAX_TEAM_SLOTS && !aligned[idx]) aligned[idx] = id;
    else remaining.push(id);
  }
  for (const id of remaining) {
    const free = aligned.findIndex(v => v === "");
    if (free < 0) break;
    aligned[free] = id;
  }
  return aligned;
}

/** Move one spare (non-target, non-active) inventory pet into the hutch to free an inventory slot. */
async function _moveSparePetToHutch(
  targetSet: Set<string>,
  activeSlots: string[],
  hutchItemsSet: Set<string>,
): Promise<boolean> {
  try {
    const invPets = await PetsService.getInventoryPets();
    const spare = (Array.isArray(invPets) ? invPets : []).find(p => {
      const id = String(p?.id || "");
      return id && !hutchItemsSet.has(id) && !activeSlots.includes(id) && !targetSet.has(id);
    });
    if (!spare) return false;
    const hutIdx = await _findFreeHutchIndex();
    await PlayerService.putItemInStorage(spare.id, "PetHutch", hutIdx);
    void _waitForHutchState(set => set.has(String(spare.id)), 3000);
    return true;
  } catch {
    return false;
  }
}

async function _getMyUserSlotIndex(): Promise<number | null> {
  try {
    const slots = await stateUserSlots.get();
    const list: any[] = Array.isArray(slots) ? slots : [];
    if (!list.length) return null;
    let pid: string | null = null;
    let dbId: string | null = null;
    try { pid = (await playerId.get()) ?? null; } catch {}
    try { dbId = (await playerDatabaseUserId.get()) ?? null; } catch {}
    if (!pid && !dbId) return null;
    for (let i = 0; i < list.length; i++) {
      const slot = list[i];
      if (!slot) continue;
      const slotPid = String(slot?.playerId ?? "");
      const slotDbId = String(slot?.databaseUserId ?? "");
      if ((pid && (slotPid === pid || slotDbId === pid)) ||
          (dbId && (slotPid === dbId || slotDbId === dbId))) {
        return i;
      }
    }
    return null;
  } catch { return null; }
}

/**
 * N-th dirt tile of my garden (position + localTileIndex), mirroring Gemini's
 * getMyGardenDirtTile. Each placed pet must land on a distinct tile: placing
 * several pets on the same tile makes the server ignore all but the first.
 */
async function _getMyDirtTilePlacement(
  tileOffset: number,
): Promise<{ position: { x: number; y: number }; localTileIndex: number } | null> {
  try {
    const map: any = await Atoms.root.map.get();
    const cols = Number(map?.cols);
    const dirtArrays: number[][] = Array.isArray(map?.userSlotIdxAndDirtTileIdxToGlobalTileIdx)
      ? map.userSlotIdxAndDirtTileIdxToGlobalTileIdx
      : [];
    if (!Number.isFinite(cols) || cols <= 0 || !dirtArrays.length) return null;
    const slotIdx = await _getMyUserSlotIndex();
    if (slotIdx == null) return null;
    const dirtGlobals: number[] = Array.isArray(dirtArrays[slotIdx]) ? dirtArrays[slotIdx] : [];
    if (!dirtGlobals.length) return null;
    const localTileIndex = Math.min(Math.max(0, tileOffset), dirtGlobals.length - 1);
    const globalIndex = Number(dirtGlobals[localTileIndex]);
    if (!Number.isFinite(globalIndex)) return null;
    return {
      position: { x: globalIndex % cols, y: Math.floor(globalIndex / cols) },
      localTileIndex,
    };
  } catch { return null; }
}

async function _placePetInMyGarden(petId: string, tileOffset: number): Promise<void> {
  const tile = await _getMyDirtTilePlacement(tileOffset);
  if (tile) {
    await PlayerService.placePet(petId, tile.position, "Dirt", tile.localTileIndex);
    return;
  }
  // Fallback: legacy fixed boardwalk spot when map data is unavailable
  await PlayerService.placePet(petId, { x: 0, y: 0 }, "Boardwalk", 64);
}

async function _equipPetIds(
  targetInvIdsRaw: string[],
  opts?: EquipPetOpts
): Promise<{ swapped: number; placed: number; skipped: number }> {
  const markId = (opts?.markTeamId ?? null) || null;
  const seenIds = new Set<string>();
  const targetInvIds = (Array.isArray(targetInvIdsRaw) ? targetInvIdsRaw : [])
    .map(v => String(v || ""))
    .filter(v => v.length > 0 && !seenIds.has(v) && !!seenIds.add(v))
    .slice(0, MAX_TEAM_SLOTS);
  const markResolved = markId ?? _teamIdFromSlots(targetInvIds) ?? null;
  const shouldMark = opts?.markUsed !== false && !!markResolved;
  const finish = (res: { swapped: number; placed: number; skipped: number }) => {
    if (shouldMark) markTeamAsUsed(markResolved);
    return res;
  };

  if (!targetInvIds.length) return finish({ swapped: 0, placed: 0, skipped: 0 });

  // 1) Snapshot current active pets (slot order)
  const activeSlots = await _getActivePetSlotIds();

  // 2) Team already active (order-independent)? Nothing to do.
  const sameTeam =
    targetInvIds.length === activeSlots.length &&
    [...targetInvIds].sort().join("|") === [...activeSlots].sort().join("|");
  if (sameTeam) return finish({ swapped: 0, placed: 0, skipped: targetInvIds.length });

  // 3) Hutch snapshot — capacity follows the player's hutch upgrade level
  let freeHutch = (await _getHutchInfo()).free;
  let hutchItemsSet = new Set<string>();
  try {
    const hutchItems = await myPetHutchPetItems.get();
    if (Array.isArray(hutchItems)) {
      hutchItemsSet = new Set(
        hutchItems.map((it: any) => String(it?.id ?? "")).filter(Boolean),
      );
    }
  } catch {}

  const targetSet = new Set(targetInvIds);
  const aligned = _alignTargetsToActiveSlots(targetInvIds, activeSlots);

  const notifyInventoryFull = async () => {
    try {
      await toastSimple(
        "Inventory Full",
        "Cannot equip team: required pets are in the Pet Hutch and your inventory is full.",
        "error",
      );
    } catch {}
  };

  let swapped = 0, placed = 0, skipped = 0;
  let placementOffset = 0; // each placed pet gets its own dirt tile

  // 4) Resolve each slot independently (same slot-by-slot logic as the Gemini pet switcher)
  for (let slot = 0; slot < MAX_TEAM_SLOTS; slot++) {
    const targetId = aligned[slot];
    const currentId = String(activeSlots[slot] ?? "");

    // Case 1: slot already holds the right pet
    if (targetId && targetId === currentId) { skipped++; continue; }

    // Case 2: slot must become empty -> store the active pet (hutch if space)
    if (!targetId && currentId) {
      try {
        await PlayerService.storePet(currentId);
        activeSlots[slot] = "";
        if (freeHutch > 0) {
          const hutIdx = await _findFreeHutchIndex();
          await PlayerService.putItemInStorage(currentId, "PetHutch", hutIdx);
          freeHutch--;
          void _waitForHutchState(set => set.has(currentId), 3000);
        }
      } catch {}
      continue;
    }
    if (!targetId) continue;

    // Fast path: target sits in the hutch and there's an active pet to swap it
    // with -> one atomic SwapPetFromStorage call instead of retrieve+swap+store.
    // Capacity-neutral (the displaced pet takes the exact hutch slot the target
    // vacated), so no freeHutch/index bookkeeping is needed here.
    if (currentId && hutchItemsSet.has(targetId)) {
      try {
        await PlayerService.swapPetFromStorage(currentId, targetId, "PetHutch");
        swapped++;
        activeSlots[slot] = targetId;
        hutchItemsSet.delete(targetId);
        hutchItemsSet.add(currentId);
      } catch {
        try {
          await _placePetInMyGarden(targetId, placementOffset++);
          placed++;
        } catch {}
      }
      continue;
    }

    // The target must be in inventory before swapping/placing: retrieve from hutch
    if (hutchItemsSet.has(targetId)) {
      let invFull = false;
      try { invFull = !!(await isMyInventoryAtMaxLength.get()); } catch {}
      if (invFull) {
        const freed = freeHutch > 0 && (await _moveSparePetToHutch(targetSet, activeSlots, hutchItemsSet));
        if (freed) {
          freeHutch--;
        } else {
          await notifyInventoryFull();
          return finish({ swapped, placed, skipped });
        }
      }
      try {
        const invIdx = await _findFreeInventoryIndex();
        await PlayerService.retrieveItemFromStorage(targetId, "PetHutch", invIdx);
        hutchItemsSet.delete(targetId);
        freeHutch++; // retrieving frees one hutch space
        void _waitForHutchState(set => !set.has(targetId), 3000);
      } catch { continue; }
    }

    // Case 3: empty active slot -> place the pet on its own dirt tile
    if (!currentId) {
      try {
        await _placePetInMyGarden(targetId, placementOffset++);
        placed++;
        activeSlots[slot] = targetId;
      } catch {}
      continue;
    }

    // Case 4: swap the active pet out for a target already in inventory (store it in hutch if space)
    try {
      await PlayerService.swapPet(currentId, targetId);
      swapped++;
      activeSlots[slot] = targetId;
      if (freeHutch > 0) {
        try {
          const hutIdx = await _findFreeHutchIndex();
          await PlayerService.putItemInStorage(currentId, "PetHutch", hutIdx);
          freeHutch--;
          void _waitForHutchState(set => set.has(currentId), 3000);
        } catch {}
      }
    } catch {
      // Swap failed: fall back to a direct placement of the target pet
      try {
        await _placePetInMyGarden(targetId, placementOffset++);
        placed++;
      } catch {}
    }
  }

  return finish({ swapped, placed, skipped });
}
