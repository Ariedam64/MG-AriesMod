// src/services/players.ts
// Service central des actions liées aux joueurs (liste, positions, téléport, follow + journal)

import { toastSimple } from "../ui/toast";
import {
  fakeActivityLogShow,
  fakeInventoryShow,
  fakeJournalShow,
  fakeStatsShow,
} from "./fakeModal";
import { skipNextActivityLogHistoryReopen } from "./activityLogHistory";
import { PlayerService } from "./player";
import { Atoms } from "../store/atoms";
import type { XY, GardenState  } from "../store/atoms";
import { sumGardenValue, sumInventoryValue, type PricingOptions } from "../utils/calculators";

/* ============================== Types ============================== */

export type Inventory = { items: any[]; favoritedItemIds?: string[] };

export type Garden = GardenState

export type Player = {
  id: string;
  name: string;
  isConnected?: boolean;
  discordAvatarUrl?: string;
  x?: number; y?: number;
  inventory?: Inventory | null;
  gardenPosition?: number | null;
};

// Journal types
export type ProduceVariantLog = { variant: string; createdAt?: number };
export type PetVariantLog    = { variant: string; createdAt?: number };
export type PetAbilityLog    = { ability: string; createdAt?: number };

export type GardenData = {
  tileObjects: Record<string, any>;
  boardwalkTileObjects?: Record<string, any>;
} | null;

export type SpeciesProduceLog = { variantsLogged?: ProduceVariantLog[] };
export type SpeciesPetLog = {
  variantsLogged?: PetVariantLog[];
  abilitiesLogged?: PetAbilityLog[];
};

export type Journal = {
  produce?: Record<string, SpeciesProduceLog>;
  pets?: Record<string, SpeciesPetLog>;
};

/* ---------------- Helpers de parsing ---------------- */
function findPlayersDeep(state: any): Player[] {
  if (!state || typeof state !== "object") return [];
  const out: Player[] = []; const seen = new Set<any>(); const stack = [state];
  while (stack.length) {
    const cur = stack.pop(); if (!cur || typeof cur !== "object" || seen.has(cur)) continue; seen.add(cur);
    for (const k of Object.keys(cur)) {
      const v = (cur as any)[k];
      if (Array.isArray(v) && v.length && v.every(x => x && typeof x === "object")) {
        const looks = v.some(p => "id" in p && "name" in p);
        if (looks && /player/i.test(k)) out.push(...(v as Player[]));
      }
      if (v && typeof v === "object") stack.push(v);
    }
  }
  const byId = new Map<string, Player>(); for (const p of out) if (p?.id) byId.set(String(p.id), p);
  return [...byId.values()];
}

function getPlayersArray(st: any): Player[] {
  const direct = st?.fullState?.data?.players ?? st?.data?.players ?? st?.players;
  return Array.isArray(direct) ? direct : findPlayersDeep(st);
}

function getSlotsArray(st: any): any[] {
  const raw = st?.child?.data?.userSlots
    ?? st?.fullState?.child?.data?.userSlots
    ?? st?.data?.userSlots;
  if (Array.isArray(raw)) return raw; // déjà ordonné par index
  if (raw && typeof raw === "object") {
    const entries = Object.entries(raw as Record<string, any>);
    entries.sort((a, b) => {
      const ai = Number(a[0]); const bi = Number(b[0]);
      if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
      return a[0].localeCompare(b[0]);
    });
    return entries.map(([, v]) => v);
  }
  return [];
}

function extractPosFromSlot(slot: any): { x: number; y: number } | null {
  const pos = slot?.data?.position
    ?? slot?.position
    ?? slot?.data?.coords
    ?? slot?.coords;
  const x = Number(pos?.x); const y = Number(pos?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function extractInventoryFromSlot(slot: any): Inventory | null {
  const inv = slot?.data?.inventory;
  if (!inv || typeof inv !== "object") return null;
  const items = Array.isArray(inv.items) ? inv.items : [];
  const favoritedItemIds = Array.isArray(inv.favoritedItemIds) ? inv.favoritedItemIds : [];
  return { items, favoritedItemIds };
}

function extractJournalFromSlot(slot: any): Journal | null {
  const j = slot?.data?.journal ?? slot?.journal;
  if (!j || typeof j !== "object") return null;

  const produce = j.produce && typeof j.produce === "object" ? j.produce as Record<string, any> : undefined;
  const pets = j.pets && typeof j.pets === "object" ? j.pets as Record<string, any> : undefined;

  const normProduce: Record<string, SpeciesProduceLog> | undefined = produce
    ? Object.fromEntries(Object.entries(produce).map(([k, v]) => [
        String(k),
        { variantsLogged: Array.isArray((v as any)?.variantsLogged) ? (v as any).variantsLogged : [] }
      ]))
    : undefined;

  const normPets: Record<string, SpeciesPetLog> | undefined = pets
    ? Object.fromEntries(Object.entries(pets).map(([k, v]) => [
        String(k),
        {
          variantsLogged: Array.isArray((v as any)?.variantsLogged) ? (v as any).variantsLogged : [],
          abilitiesLogged: Array.isArray((v as any)?.abilitiesLogged) ? (v as any).abilitiesLogged : [],
        }
      ]))
    : undefined;

  return { produce: normProduce, pets: normPets };
}

function extractStatsFromSlot(slot: any): Record<string, any> | null {
  const stats = slot?.data?.stats ?? slot?.stats;
  if (!stats || typeof stats !== "object") return null;
  return stats as Record<string, any>;
}

function extractActivityLogsFromSlot(slot: any): any[] | null {
  const logs = slot?.data?.activityLogs ?? slot?.activityLogs;
  if (!Array.isArray(logs)) return null;
  return logs;
}

function extractGardenFromSlot(slot: any): Garden | null {
  const g = slot?.data?.garden ?? slot?.garden;
  if (!g || typeof g !== "object") return null;

  const to  = (g as any).tileObjects;
  const bto = (g as any).boardwalkTileObjects;

  const tileObjects: Record<string, any> =
    to && typeof to === "object" ? (to as Record<string, any>) : {};

  const boardwalkTileObjects: Record<string, any> =
    bto && typeof bto === "object" ? (bto as Record<string, any>) : {};

  return { tileObjects, boardwalkTileObjects };
}

/**
 * Identifiant du propriétaire d'un `userSlot`.
 * Le jeu a renommé `playerId` en `userId` : lire les deux, sinon la jointure
 * joueur↔slot casse (inventaire/jardin/journal/stats vides pour tout le monde).
 */
function getSlotOwnerId(slot: any): string {
  const raw = slot?.userId ?? slot?.playerId ?? slot?.id;
  return raw != null ? String(raw) : "";
}

function getSlotByPlayerId(st: any, playerId: string) {
  for (const s of getSlotsArray(st)) if (getSlotOwnerId(s) === String(playerId)) return s;
  return null;
}

function enrichPlayersWithSlots(players: Player[], st: any): Player[] {
  const byPid = new Map<string, { x?: number; y?: number; inventory?: Inventory | null }>();
  for (const slot of getSlotsArray(st)) {
    if (!slot || typeof slot !== "object") continue;
    const pid = getSlotOwnerId(slot);
    if (!pid) continue;
    const pos = extractPosFromSlot(slot);
    const inv = extractInventoryFromSlot(slot);
    byPid.set(pid, { x: pos?.x, y: pos?.y, inventory: inv ?? null });
  }
  return players.map(p => {
    const extra = byPid.get(String(p.id));
    return extra ? { ...p, ...extra } : { ...p, inventory: null };
  });
}

/** Ordonne la liste des joueurs selon l'ordre de `userSlots` */
function orderPlayersBySlots(players: Player[], st: any): Player[] {
  const slots = getSlotsArray(st);
  const mapById = new Map<string, Player>();
  for (const p of players) mapById.set(String(p.id), p);

  const out: Player[] = [];
  const seen = new Set<string>();
  for (const s of slots) {
    const pid = getSlotOwnerId(s);
    if (!pid || seen.has(pid)) continue;
    const p = mapById.get(pid);
    if (p) { out.push(p); seen.add(pid); }
  }
  for (const p of players) {
    const pid = String(p.id);
    if (!seen.has(pid)) { out.push(p); seen.add(pid); }
  }
  return out;
}

/* ---------------- Helper Atoms -------------------*/

function clampPlayers(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.min(6, v));
}

// Récupération ponctuelle
export async function getPlayersInRoom(): Promise<number> {
  try {
    const raw = await Atoms.server.numPlayers.get(); // <- lit l’atom
    return clampPlayers(raw);
  } catch {
    return 1;
  }
}

// Abonnement aux changements
export function onPlayersInRoomChange(cb: (n: number) => void) {
  return Atoms.server.numPlayers.onChange((raw: unknown) => {
    cb(clampPlayers(raw));
  });
}

/* ---------------- Spawn tiles (garden positions) ---------------- */

let __cachedSpawnTiles: number[] | null = null;
let __spawnLoadPromise: Promise<number[]> | null = null;

export function invalidateSpawnTilesCache() {
  __cachedSpawnTiles = null;
  __spawnLoadPromise = null;
}

export async function getSpawnTilesSorted(): Promise<number[]> {
  if (Array.isArray(__cachedSpawnTiles)) return __cachedSpawnTiles;
  if (__spawnLoadPromise) return __spawnLoadPromise;

  __spawnLoadPromise = (async () => {
    try {
      const map = await Atoms.root.map.get();
      const arr = map?.spawnTiles;
      if (Array.isArray(arr) && arr.every((n: any) => Number.isFinite(n))) {
        __cachedSpawnTiles = [...arr].sort((a: number, b: number) => a - b);
        return __cachedSpawnTiles;
      }
    } catch {}

    try {
      const st = await Atoms.root.state.get();
      const seen = new Set<any>(); const stack = [st];
      while (stack.length) {
        const cur = stack.pop();
        if (!cur || typeof cur !== "object" || seen.has(cur)) continue; seen.add(cur);
        const arr = (cur as any)?.spawnTiles;
        if (Array.isArray(arr) && arr.every((n: any) => Number.isFinite(n))) {
          __cachedSpawnTiles = [...arr].sort((a: number, b: number) => a - b);
          return __cachedSpawnTiles;
        }
        for (const k of Object.keys(cur)) {
          const v = (cur as any)[k];
          if (v && typeof v === "object") stack.push(v);
        }
      }
    } catch {}

    __cachedSpawnTiles = [];
    return __cachedSpawnTiles;
  })();

  const res = await __spawnLoadPromise;
  __spawnLoadPromise = null;
  return res;
}

async function getMapCols(): Promise<number> {
  try {
    const map = await Atoms.root.map.get();
    const cols = Number(map?.cols);
    if (Number.isFinite(cols) && cols > 0) return cols;
  } catch {}
  try {
    const st = await Atoms.root.state.get();
    const maybeCols = Number(
      st?.map?.cols ??
      st?.child?.data?.map?.cols ??
      st?.fullState?.map?.cols
    );
    if (Number.isFinite(maybeCols) && maybeCols > 0) return maybeCols;
  } catch {}
  return 81;
}

function assignGardenPositions(players: Player[], spawnTilesSorted: number[]): Player[] {
  if (!players.length || !spawnTilesSorted.length) {
    return players.map(p => ({ ...p, gardenPosition: null }));
  }
  const out: Player[] = [];
  for (let i = 0; i < players.length; i++) {
    out.push({ ...players[i], gardenPosition: spawnTilesSorted[i] ?? null });
  }
  return out;
}

/* ---------------- Journal helpers (normalize + guards) -------------- */

function nowTs() { return Date.now(); }

function normJournal(j: any): Journal {
  if (!j || typeof j !== "object") return {};
  const out: Journal = {};
  if (j.produce && typeof j.produce === "object") out.produce = j.produce;
  if (j.pets && typeof j.pets === "object") out.pets = j.pets;
  return out;
}

function hasJournalData(j: Journal | null | undefined): boolean {
  if (!j) return false;
  const hasProduce = !!j.produce && Object.values(j.produce).some(s => (s.variantsLogged?.length ?? 0) > 0);
  const hasPets =
    !!j.pets &&
    Object.values(j.pets).some(s => (s.variantsLogged?.length ?? 0) > 0 || (s.abilitiesLogged?.length ?? 0) > 0);
  return hasProduce || hasPets;
}

/* ---------------- Follow Manager ---------------- */

const followingState = {
  currentTargetId: null as string | null,
  unsub: null as null | (() => void | Promise<void>),
  lastPos: null as XY | null,
  prevPos: null as XY | null,
  steps: 0,
};

const PET_FOLLOW_INTERVAL_MS = 20;
const PET_HISTORY_FACTOR = 3;
const PET_SPACING_STEPS = 1;

const petFollowState = {
  targetId: null as string | null,
  unsub: null as null | (() => void | Promise<void>),
  timer: null as null | ReturnType<typeof setInterval>,
  pets: [] as string[],
  history: [] as XY[],
  historyCap: 0,
};

function clearPetFollowTimer() {
  if (petFollowState.timer) {
    clearInterval(petFollowState.timer);
    petFollowState.timer = null;
  }
}

async function resetPetFollowState() {
  if (petFollowState.unsub) {
    const fn = petFollowState.unsub;
    petFollowState.unsub = null;
    try { await fn(); } catch {}
  } else {
    petFollowState.unsub = null;
  }
  clearPetFollowTimer();
  petFollowState.targetId = null;
  petFollowState.pets = [];
  petFollowState.history = [];
  petFollowState.historyCap = 0;
}

function recordPetHistory(pos: XY, force = false) {
  const top = petFollowState.history[0];
  if (!force && top && top.x === pos.x && top.y === pos.y) return;
  petFollowState.history.unshift({ x: pos.x, y: pos.y });
  const cap = petFollowState.historyCap || petFollowState.history.length;
  if (petFollowState.history.length > cap) {
    petFollowState.history.length = cap;
  }
}

/* ---------------- API ---------------- */
export const PlayersService = {
  async list(): Promise<Player[]> {
    const st = await Atoms.root.state.get();
    if (!st) return [];
    const base = enrichPlayersWithSlots(getPlayersArray(st), st);
    const ordered = orderPlayersBySlots(base, st);
    const spawns = await getSpawnTilesSorted();
    const players = assignGardenPositions(ordered, spawns);
    return players;
  },

  async onChange(cb: (players: Player[]) => void) {
    return Atoms.root.state.onChange(async () => {
      try { cb(await this.list()); } catch {}
    });
  },

  async getPosition(playerId: string): Promise<{ x: number; y: number } | null> {
    const st = await Atoms.root.state.get();
    if (!st) return null;
    const slot = getSlotByPlayerId(st, playerId);
    const pos = extractPosFromSlot(slot);
    return pos;
  },

  async getInventory(playerId: string): Promise<Inventory | null> {
    const st = await Atoms.root.state.get();
    if (!st) return null;
    const slot = getSlotByPlayerId(st, playerId);
    const inv = extractInventoryFromSlot(slot);
    return inv;
  },

  async getJournal(playerId: string): Promise<Journal | null> {
    const st = await Atoms.root.state.get();
    if (!st) return null;
    const slot = getSlotByPlayerId(st, playerId);
    const j = extractJournalFromSlot(slot);
    const journal = j ? normJournal(j) : null;
    return journal;
  },

  async getGarden(playerId: string): Promise<Garden | null> {
    const st = await Atoms.root.state.get();
    if (!st) return null;
    const slot = getSlotByPlayerId(st, playerId);
    return extractGardenFromSlot(slot);
  },

  async getGardenPosition(playerId: string): Promise<number | null> {
    const list = await this.list();
    const p = list.find(x => String(x.id) === String(playerId));
    return p?.gardenPosition ?? null;
  },

  async getPlayerNameById(playerId: string): Promise<string | null> {
    try {
      const st = await Atoms.root.state.get();
      if (st) {
        const arr = getPlayersArray(st);
        const p = arr.find(x => String(x?.id) === String(playerId));
        if (p && typeof p.name === "string" && p.name) return p.name;
      }
    } catch {}
    try {
      const list = await this.list();
      const p = list.find(x => String(x.id) === String(playerId));
      return p?.name ?? null;
    } catch { return null; }
  },

  async teleportToPlayer(playerId: string) {
    const pos = await this.getPosition(playerId);
    if (!pos) throw new Error("Unknown position for this player");
    PlayerService.teleport(pos.x, pos.y);
    toastSimple("Teleport", `Teleported to ${await this.getPlayerNameById(playerId)}`, "success");
  },

  async teleportToGarden(playerId: string) {
    const tileId = await this.getGardenPosition(playerId);
    if (tileId == null) { await toastSimple("Teleport", "No garden position for this player.", "error"); return; }
    const cols = await getMapCols();
    const x = tileId % cols, y = Math.floor(tileId / cols);
    await PlayerService.teleport(x, y);
    await toastSimple("Teleport", `Teleported to ${await this.getPlayerNameById(playerId)}'s garden`, "success");
  },

  async getInventoryValue(playerId: string,  opts?: PricingOptions): Promise<number> {
    try {
      const playersInRoom = await getPlayersInRoom();
      const inv = await this.getInventory(playerId);
      const items = Array.isArray(inv?.items) ? inv!.items : [];
      if (!items.length) return 0;
      const value = sumInventoryValue(items, opts, playersInRoom );
      return value;
    } catch {
      return 0;
    }
  },

 async getGardenValue(playerId: string,  opts?: PricingOptions): Promise<number> {
    try {
      const playersInRoom = await getPlayersInRoom();
      const garden = await this.getGarden(playerId);
      if (!garden) return 0;
      const value = sumGardenValue(garden.tileObjects ?? {}, opts, playersInRoom );
      return value;
    } catch {
      return 0;
    }
  },

  /** Ouvre l’aperçu d’inventaire (fake modal) avec garde + toasts. */
  async openInventoryPreview(playerId: string, playerName?: string) {
    try {
      const inv = await this.getInventory(playerId);
      if (!inv) {
        await toastSimple("Inventory", "No inventory object found for this player.", "error");
        return;
      }
      const items = Array.isArray(inv.items) ? inv.items : [];
      if (items.length === 0) {
        await toastSimple("Inventory", "Inventory is empty for this player.", "info");
        return;
      }
      try {
        await fakeInventoryShow({ ...inv, items }, { open: true });
      } catch (err: any) {
        await toastSimple("Inventory", err?.message || "Failed to open inventory", "error");
        return;
      }
      if (playerName) await toastSimple("Inventory", `${playerName}'s inventory displayed.`, "info");
    } catch (e: any) {
      await toastSimple("Inventory", e?.message || "Failed to open inventory.", "error");
    }
  },

  /** Ouvre le Journal (produce + pets) avec garde + toasts. */
  async openJournalLog(playerId: string, playerName?: string) {
    try {
      const journal = await this.getJournal(playerId);
      if (!hasJournalData(journal)) {
        await toastSimple("Journal", "No journal data for this player.", "error");
        return;
      }
      const safe = journal ?? {};
      try {
        await fakeJournalShow(safe, { open: true });
      } catch (err: any) {
        await toastSimple("Journal", err?.message || "Failed to open journal.", "error");
        return;
      }
      if (playerName) await toastSimple("Journal", `${playerName}'s journal displayed.`, "info");
    } catch (e: any) {
      await toastSimple("Journal", e?.message || "Failed to open journal.", "error");
    }
  },

  async getStats(playerId: string): Promise<Record<string, any> | null> {
    const st = await Atoms.root.state.get();
    if (!st) return null;
    const slot = getSlotByPlayerId(st, playerId);
    return extractStatsFromSlot(slot);
  },

  async getActivityLogs(playerId: string): Promise<any[] | null> {
    const st = await Atoms.root.state.get();
    if (!st) return null;
    const slot = getSlotByPlayerId(st, playerId);
    return extractActivityLogsFromSlot(slot);
  },

  async openStatsModal(playerId: string, playerName?: string) {
    try {
      const stats = await this.getStats(playerId);
      if (!stats) {
        await toastSimple("Stats", "No stats found for this player.", "error");
        return;
      }
      await fakeStatsShow(stats, { open: true });
      if (playerName) await toastSimple("Stats", `${playerName}'s stats displayed.`, "info");
    } catch (e: any) {
      await toastSimple("Stats", e?.message || "Failed to open stats modal.", "error");
    }
  },

  async openActivityLogModal(playerId: string, playerName?: string) {
    try {
      const logs = await this.getActivityLogs(playerId);
      if (!logs || logs.length === 0) {
        await toastSimple("Activity log", "No activity logs for this player.", "info");
        return;
      }
      skipNextActivityLogHistoryReopen();
      await fakeActivityLogShow(logs, { open: true });
      if (playerName) await toastSimple("Activity log", `${playerName}'s activity log displayed.`, "info");
    } catch (e: any) {
      await toastSimple("Activity log", e?.message || "Failed to open activity log.", "error");
    }
  },

  /* ---------------- Ajouts "fake" au journal (UI only, avec gardes) ---------------- */

  async addProduceVariant(playerId: string, species: string, variant: string, createdAt = nowTs()) {
    if (!species || !variant) {
      await toastSimple("Journal", "Missing species or variant.", "error");
      return;
    }
    try {
      await fakeJournalShow({
        produce: {
          [String(species)]: {
            variantsLogged: [{ variant: String(variant), createdAt }]
          }
        }
      }, { open: true });
      const name = await this.getPlayerNameById(playerId);
      await toastSimple("Journal", `Added produce variant "${variant}" for ${name ?? playerId}.`, "success");
    } catch (e: any) {
      await toastSimple("Journal", e?.message || "Failed to add produce variant.", "error");
    }
  },

  async addPetVariant(playerId: string, petSpecies: string, variant: string, createdAt = nowTs()) {
    if (!petSpecies || !variant) {
      await toastSimple("Journal", "Missing pet species or variant.", "error");
      return;
    }
    try {
      await fakeJournalShow({
        pets: {
          [String(petSpecies)]: {
            variantsLogged: [{ variant: String(variant), createdAt }]
          }
        }
      }, { open: true });
      const name = await this.getPlayerNameById(playerId);
      await toastSimple("Journal", `Added pet variant "${variant}" for ${name ?? playerId}.`, "success");
    } catch (e: any) {
      await toastSimple("Journal", e?.message || "Failed to add pet variant.", "error");
    }
  },

  async addPetAbility(playerId: string, petSpecies: string, ability: string, createdAt = nowTs()) {
    if (!petSpecies || !ability) {
      await toastSimple("Journal", "Missing pet species or ability.", "error");
      return;
    }
    try {
      await fakeJournalShow({
        pets: {
          [String(petSpecies)]: {
            abilitiesLogged: [{ ability: String(ability), createdAt }]
          }
        }
      }, { open: true });
      const name = await this.getPlayerNameById(playerId);
      await toastSimple("Journal", `Added pet ability "${ability}" for ${name ?? playerId}.`, "success");
    } catch (e: any) {
      await toastSimple("Journal", e?.message || "Failed to add pet ability.", "error");
    }
  },

  /* ---------------- Follow ---------------- */

  async stopFollowing() {
    if (followingState.unsub) {
      try { await followingState.unsub(); } catch {}
    }
    followingState.unsub = null;
    followingState.currentTargetId = null;
    followingState.lastPos = null;
    followingState.prevPos = null;
    followingState.steps = 0;
  },

  isFollowing(playerId: string) {
    return followingState.currentTargetId === playerId;
  },

  async startFollowing(playerId: string) {
    if (followingState.unsub) {
      try { await followingState.unsub(); } catch {}
      followingState.unsub = null;
    }
    followingState.currentTargetId = playerId;
    followingState.lastPos = null;
    followingState.prevPos = null;
    followingState.steps = 0;

    const pos = await this.getPosition(playerId);
    if (!pos) {
      await toastSimple("Follow", "Unable to retrieve player position.", "error");
      followingState.currentTargetId = null;
      return;
    }
    await PlayerService.teleport(pos.x, pos.y);

    followingState.lastPos = { x: pos.x, y: pos.y };
    followingState.prevPos = null;
    followingState.steps = 0;

    followingState.unsub = await this.onChange(async (players) => {
      if (followingState.currentTargetId !== playerId) return;

      const target = players.find(p => p.id === playerId);
      if (!target || typeof target.x !== "number" || typeof target.y !== "number") {
        await this.stopFollowing();
        await toastSimple("Follow", "The target is no longer trackable (disconnected?).", "error");
        return;
      }

      const cur: XY = { x: target.x, y: target.y };
      const last = followingState.lastPos;
      if (!last) {
        followingState.lastPos = cur;
        return;
      }

      if (cur.x !== last.x || cur.y !== last.y) {
        followingState.steps += 1;
        if (followingState.steps >= 2) {
          if (last) {
            PlayerService.move(last.x, last.y);
          }
        }
        followingState.prevPos = followingState.lastPos;
        followingState.lastPos = cur;
      }
    });

    await toastSimple("Follow", "Follow enabled", "success");
  },

  /* ---------------- Pet Follow ---------------- */

  async stopPetFollowing(opts?: { silent?: boolean; message?: string; tone?: "success" | "info" | "error" }) {
    await resetPetFollowState();
    if (!opts?.silent) {
      await toastSimple("Pet follow", opts?.message ?? "Disabled.", opts?.tone ?? "info");
    }
  },

  isPetFollowing(playerId: string) {
    return petFollowState.targetId === playerId;
  },

  async startPetFollowing(playerId: string) {
    await this.stopPetFollowing({ silent: true });

    const petsRaw = await Atoms.pets.myPetInfos.get();
    const petIds = Array.isArray(petsRaw)
      ? petsRaw
        .map((entry: any) => entry?.slot?.id)
        .filter((id: unknown): id is string => typeof id === "string" && !!id)
      : [];

    if (!petIds.length) {
      await toastSimple("Pet follow", "You don't have any active pets.", "error");
      return;
    }

    const pos = await this.getPosition(playerId);
    if (!pos) {
      await toastSimple("Pet follow", "Unable to retrieve player position.", "error");
      return;
    }

    petFollowState.targetId = playerId;
    petFollowState.pets = petIds;
    petFollowState.historyCap = Math.max(petIds.length * PET_HISTORY_FACTOR, petIds.length + PET_SPACING_STEPS + 1);
    petFollowState.history = [];

    for (let i = 0; i < petFollowState.historyCap; i += 1) {
      recordPetHistory(pos, true);
    }

    const sendPositions = async () => {
      if (petFollowState.targetId !== playerId) return;
      if (!petFollowState.pets.length || !petFollowState.history.length) return;

      const payload: Record<string, XY> = {};
      for (let i = 0; i < petFollowState.pets.length; i += 1) {
        const petId = petFollowState.pets[i];
        const historyIndex = Math.min(
          petFollowState.history.length - 1,
          (i + 1) * PET_SPACING_STEPS
        );
        const targetPos = petFollowState.history[historyIndex] ?? petFollowState.history[petFollowState.history.length - 1];
        if (targetPos) {
          payload[petId] = { x: targetPos.x, y: targetPos.y };
        }
      }

      if (Object.keys(payload).length === 0) return;

      try {
        await PlayerService.petPositions(payload);
      } catch (err) {
      }
    };

    petFollowState.timer = setInterval(() => { sendPositions().catch(() => {}); }, PET_FOLLOW_INTERVAL_MS);

    const initialSend = sendPositions();

    petFollowState.unsub = await this.onChange(async (players) => {
      if (petFollowState.targetId !== playerId) return;

      const target = players.find(p => p.id === playerId);
      if (!target || typeof target.x !== "number" || typeof target.y !== "number") {
        await this.stopPetFollowing({ silent: false, message: "Target is no longer trackable.", tone: "error" });
        return;
      }

      recordPetHistory({ x: target.x, y: target.y });
    });

    await initialSend;
    await toastSimple("Pet follow", "Pets are now following the target.", "success");
  }
};
