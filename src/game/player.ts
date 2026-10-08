import { sendToGame } from "./ws/send";
import { randomClientId } from "./ws/commands";
import { Atoms, type GardenState, type XY } from "./store/atoms";
import { buildMoveItemCommand, INVENTORY as INVENTORY_PLACE, type MoveItemParams } from "./ws/moveItemMessage";

/* ================================== Pets ================================== */

type PetSlot = {
  id: string;
  petSpecies: string;
  name?: string | null;
  xp?: number;
  hunger?: number;
  mutations?: string[];
  targetScale?: number;
  abilities?: string[];
};

export type PetInfo = {
  slot: PetSlot;
  position?: XY | null;
};

export type PetState = PetInfo[] | null;

/** One pet as a compact string, so a list of pets can be compared in one go. */
function petSig(p: PetInfo): string {
  const s = p?.slot ?? ({} as PetSlot);
  const muts = Array.isArray(s.mutations) ? s.mutations.slice().sort().join(",") : "";
  const ab = Array.isArray(s.abilities) ? s.abilities.slice().sort().join(",") : "";
  const name = s.name ?? "";
  const species = s.petSpecies ?? "";
  const xp = Number.isFinite(s.xp as number) ? Math.round(s.xp as number) : 0;
  const hunger = Number.isFinite(s.hunger as number) ? Math.round((s.hunger as number) * 1000) : 0;
  const scale = Number.isFinite(s.targetScale as number) ? Math.round((s.targetScale as number) * 1000) : 0;
  const x = Number.isFinite(p?.position?.x as number) ? Math.round(p!.position!.x as number) : 0;
  const y = Number.isFinite(p?.position?.y as number) ? Math.round(p!.position!.y as number) : 0;
  return `${species}|${name}|xp:${xp}|hg:${hunger}|sc:${scale}|m:${muts}|a:${ab}|pos:${x},${y}`;
}

/** An entry of the game's flat pet slot list, under any of the names its fields have had. */
type PrimitivePetSlot = {
  id?: string;
  petId?: string;
  petItemId?: string;
  itemId?: string;
  petSpecies?: string;
  species?: string;
  name?: string | null;
  petName?: string | null;
  xp?: number;
  hunger?: number;
  mutations?: string[];
  targetScale?: number;
  abilities?: string[];
  position?: XY | null;
  slot?: Partial<PetSlot> | null;
};

function toPetInfoFromPrimitive(entry: PrimitivePetSlot | null | undefined): PetInfo | null {
  if (!entry || typeof entry !== "object") return null;
  if (entry.slot && typeof entry.slot === "object" && entry.slot.id) {
    return entry as unknown as PetInfo;
  }

  const id = String(entry.id ?? entry.petId ?? entry.petItemId ?? entry.itemId ?? entry.slot?.id ?? "").trim();
  if (!id) return null;

  const slot: PetSlot = {
    id,
    petSpecies: String(entry.petSpecies ?? entry.species ?? entry.slot?.petSpecies ?? "").trim(),
    name: entry.name ?? entry.petName ?? entry.slot?.name ?? null,
    xp: Number.isFinite(entry.xp as number) ? Number(entry.xp) : undefined,
    hunger: Number.isFinite(entry.hunger as number) ? Number(entry.hunger) : undefined,
    mutations: Array.isArray(entry.mutations) ? entry.mutations.slice() : undefined,
    targetScale: Number.isFinite(entry.targetScale as number) ? Number(entry.targetScale) : undefined,
    abilities: Array.isArray(entry.abilities) ? entry.abilities.slice() : undefined,
  };

  const info: PetInfo = { slot };
  const pos = entry.position;
  if (pos && Number.isFinite(pos.x as number) && Number.isFinite(pos.y as number)) {
    info.position = { x: Number(pos.x), y: Number(pos.y) };
  }
  return info;
}

/**
 * The active pets. `myPetInfosAtom` is gone from the game (v1029), so the pet
 * slots are what normally answers; the old atom still wins if it ever comes back.
 */
function normalizePetsState(petInfosRaw: unknown, primitiveRaw: unknown): PetState {
  const infos = Array.isArray(petInfosRaw) ? (petInfosRaw as PetInfo[]) : null;
  if (infos && infos.length) return infos;

  const prim = Array.isArray(primitiveRaw) ? (primitiveRaw as PrimitivePetSlot[]) : null;
  if (prim && prim.length) {
    const mapped = prim.map(toPetInfoFromPrimitive).filter(Boolean) as PetInfo[];
    if (mapped.length) return mapped;
  }
  return infos;
}

function petsStateSig(state: PetState): string {
  if (!Array.isArray(state)) return "null";
  if (!state.length) return "empty";
  return state.map((p) => `${String(p?.slot?.id ?? "")}:${petSig(p)}`).join("|");
}

/**
 * Calls `cb` whenever the active pets change, from either source. With `seed`
 * (the current values of both sources) it also emits once before listening.
 */
function watchPets(cb: (pets: PetState) => void, seed?: { infos: unknown; primitives: unknown }): () => void {
  let lastInfos: unknown = seed?.infos ?? null;
  let lastPrimitives: unknown = seed?.primitives ?? null;
  let prevSig: string | null = null;

  const emit = () => {
    const next = normalizePetsState(lastInfos, lastPrimitives);
    const sig = petsStateSig(next);
    if (sig === prevSig) return;
    prevSig = sig;
    cb(next);
  };
  if (seed) emit();

  const subs = [
    Atoms.pets.myPetInfos.onChange((next) => {
      lastInfos = next;
      emit();
    }),
    Atoms.pets.myPrimitivePetSlots.onChange((next) => {
      lastPrimitives = next;
      emit();
    }),
  ];
  // onChange resolves to the unsubscriber, so it has to be awaited first.
  return () => {
    for (const sub of subs) Promise.resolve(sub).then((off) => off?.()).catch(() => {});
  };
}

/* ============================= Crop inventory ============================= */

export type CropItem = {
  id: string;
  species?: string;
  itemType?: string;
  /** Whole-number Crop Size in [50, 100]. */
  size?: number;
  /** Pre-rework fractional scale, still read when `size` is absent. */
  scale?: number;
  mutations?: string[];
};

export type CropInventoryState = CropItem[] | null;

/* ================================ Player API =============================== */

/**
 * The local player: commands sent to the server in their name, and what the
 * game knows about them (position, pets, garden, favourites). A send that fails
 * is dropped quietly, as the game itself would when offline.
 */
export const PlayerService = {
  /* -------------------------------- Position -------------------------------- */

  getPosition(): Promise<XY | undefined> {
    return Atoms.player.position.get();
  },

  async setPosition(x: number, y: number) {
    await Atoms.player.position.set({ x, y });
  },

  async teleport(x: number, y: number) {
    try { await this.setPosition(x, y); } catch {}
    try { sendToGame({ type: "Teleport", position: { x, y } }); } catch {}
  },

  async move(x: number, y: number) {
    try { await this.setPosition(x, y); } catch {}
    try { sendToGame({ type: "PlayerPosition", position: { x, y } }); } catch {}
  },

  // Anti-AFK keepalive: resends the current position to the server without
  // touching the local position atom. Writing a fresh {x,y} object there
  // (even with unchanged coordinates) makes the game close any open
  // storage-building modal (pet hutch/decor shed/seed silo/feeding trough),
  // so the no-op ping must go over the wire only.
  async pingPosition(x: number, y: number) {
    try { sendToGame({ type: "PlayerPosition", position: { x, y } }); } catch {}
  },

  /* ------------------------------ Game actions ------------------------------ */

  async plantSeed(slot: number, species: string) {
    try { sendToGame({ type: "PlantSeed", slot, species }); } catch {}
  },

  async logItems() {
    try { sendToGame({ type: "LogItems" }); } catch {}
  },

  async sellAllCrops() {
    try { sendToGame({ type: "SellAllCrops" }); } catch {}
  },

  async sellPet(itemId: string) {
    try { sendToGame({ type: "SellPet", itemId }); } catch {}
  },

  async removeGardenObject(slot: number, slotType: string) {
    try { sendToGame({ type: "RemoveGardenObject", slot, slotType }); } catch {}
  },

  async setSelectedItem(itemIndex: any) {
    try { sendToGame({ type: "SetSelectedItem", itemIndex }); } catch {}
  },

  async dropObject() {
    try { sendToGame({ type: "DropObject" }); } catch {}
  },

  // `cropItemId` is the id of the produce about to exist, which the client
  // makes up itself (bundle 1125: `cropItemId: crypto.randomUUID()`). It feeds
  // the game's local prediction; without it the server ignores the harvest.
  async harvestCrop(slot: number, slotsIndex: number = 0, cropItemId: string = randomClientId()) {
    try { sendToGame({ scopePath: ["Room", "Quinoa"], type: "HarvestCrop", slot, slotsIndex, cropItemId }); } catch {}
  },

  async feedPet(petItemId: string, cropItemId: string) {
    try { sendToGame({ type: "FeedPet", petItemId, cropItemId }); } catch {}
  },

  async hatchEgg(slot: number) {
    try { sendToGame({ type: "HatchEgg", slot }); } catch {}
  },

  // The message is named `GrowEgg` on the wire: `PlantEgg` no longer exists
  // anywhere in the client, so it could only ever have been rejected.
  async plantEgg(slot: number, eggId: string) {
    try { sendToGame({ type: "GrowEgg", slot, eggId }); } catch {}
  },

  async placeDecor(tileType: "Dirt" | "Boardwalk", localTileIndex: number, decorId: string, rotation: 0) {
    try { sendToGame({ type: "PlaceDecor", tileType, localTileIndex, decorId, rotation }); } catch {}
  },

  async swapPet(petSlotId: string, petInventoryId: string) {
    try { sendToGame({ type: "SwapPet", petSlotId, petInventoryId }); } catch {}
  },

  async swapPetFromStorage(petSlotId: string, storagePetId: string, storageId: string) {
    try { sendToGame({ type: "SwapPetFromStorage", petSlotId, storagePetId, storageId }); } catch {}
  },

  async placePet(itemId: string, position: { x: number; y: number }, tileType: "Dirt" | "Boardwalk", localTileIndex: number) {
    try { sendToGame({ type: "PlacePet", itemId, position, tileType, localTileIndex }); } catch {}
  },

  async storePet(petId: string) {
    try { sendToGame({ type: "PickupPet", petId }); } catch {}
  },

  async wish(itemId: string) {
    try { sendToGame({ type: "Wish", itemId }); } catch {}
  },

  async petPositions(petPositions: Record<string, XY | null | undefined>) {
    const sanitized: Record<string, { x: number; y: number }> = {};
    for (const [id, pos] of Object.entries(petPositions ?? {})) {
      const x = Number(pos?.x);
      const y = Number(pos?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) sanitized[String(id)] = { x, y };
    }
    if (!Object.keys(sanitized).length) return;

    // `PetPositions` exists nowhere in the current client, so the server has
    // no handler for it: this send is a no-op and pet-follow only moves pets
    // client-side. Kept flat (never wrapped in a command envelope, which would
    // be rejected as malformed) until the feature is reworked.
    try { sendToGame({ type: "PetPositions", petPositions: sanitized }); } catch {}
  },

  /* --------------------------------- Storage -------------------------------- */

  /** Every item move goes through here: see `ws/moveItemMessage.ts`. */
  async moveItem(params: MoveItemParams) {
    const command = buildMoveItemCommand(params);
    if (!command) return;
    try { sendToGame(command); } catch {}
  },

  /**
   * `quantity` pulls back part of a stack; omitting it takes the whole entry
   * (the game's own drag-and-drop leaves it out for unique items).
   */
  async retrieveItemFromStorage(itemId: string, storageId: string, quantity?: number) {
    await this.moveItem({ from: storageId, to: INVENTORY_PLACE, itemId, quantity });
  },

  async putItemInStorage(itemId: string, storageId: string) {
    await this.moveItem({ from: INVENTORY_PLACE, to: storageId, itemId });
  },

  /* -------------------------------- Favorites ------------------------------- */

  // The game renamed the action to `ToggleLockItem` (the padlock in the
  // inventory); the state field it toggles is still `favoritedItemIds`, which
  // is what `Atoms.inventory.favoriteIds` reads.
  async toggleFavoriteItem(itemId: string) {
    try { sendToGame({ type: "ToggleLockItem", itemId }); } catch {}
  },

  async getFavoriteIds(): Promise<string[]> {
    const ids = await Atoms.inventory.favoriteIds.get();
    return Array.isArray(ids) ? ids.slice() : [];
  },

  async getFavoriteIdSet(): Promise<Set<string>> {
    return new Set(await this.getFavoriteIds());
  },

  /** Locks or unlocks an item to match `shouldBeFavorite`, and returns the state it ends in. */
  async ensureFavoriteItem(itemId: string, shouldBeFavorite: boolean): Promise<boolean> {
    const current = (await this.getFavoriteIdSet()).has(itemId);
    if (current === shouldBeFavorite) return current;
    await this.toggleFavoriteItem(itemId);
    return shouldBeFavorite;
  },

  /* ------------------------------ Garden, pets ------------------------------ */

  async getGardenState(): Promise<GardenState | null> {
    return (await Atoms.data.garden.get()) ?? null;
  },

  async getPets(): Promise<PetState> {
    const infos = await Atoms.pets.myPetInfos.get();
    const primitives = await Atoms.pets.myPrimitivePetSlots.get();
    return normalizePetsState(infos, primitives);
  },

  onPetsChange(cb: (pets: PetState) => void): () => void {
    return watchPets(cb);
  },

  async onPetsChangeNow(cb: (pets: PetState) => void): Promise<() => void> {
    const infos = await Atoms.pets.myPetInfos.get();
    const primitives = await Atoms.pets.myPrimitivePetSlots.get();
    return watchPets(cb, { infos, primitives });
  },

  async getCropInventoryState(): Promise<CropInventoryState> {
    return Atoms.inventory.myCropInventory.get();
  },
};
