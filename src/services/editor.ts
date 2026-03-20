// src/services/editor.ts

// Toggleable overlay + garden clearing by freezing stateAtom (read/write patch) and a left pane for plant/decor selection.



import { Atoms, type GardenState } from "../store/atoms";

import { plantCatalog, decorCatalog, mutationCatalog } from "../data";

import { ensureStore, getAtomByLabel } from "../store/jotai";

import { shareGlobal, pageWindow } from "../utils/page-context";

import { eventMatchesKeybind } from "./keybinds";

import { shouldIgnoreKeydown } from "../utils/keyboard";

import { audioPlayer } from "../core/audioPlayer";

import { readAriesPath, writeAriesPath } from "../utils/localStorage";

import { tos } from "../utils/tileObjectSystemApi";

import { attachSpriteIcon } from "../ui/spriteIconCache";



type Listener = (enabled: boolean) => void;



const ARIES_SAVED_GARDENS_PATH = "editor.savedGardens";

const FIXED_SLOT_START = 1760866288723;

const FIXED_SLOT_END = 1760867858782;



const mutationColorMap: Record<string, string> = {

  Gold:        "rgba(200, 170, 0, 1)",

  Rainbow:     "linear-gradient(135deg, #ff0000, #ff7a00, #ffeb3b, #00c853, #40c4ff, #8e24aa)",

  Wet:         "rgb(30, 140, 230)",

  Chilled:     "rgb(100, 190, 200)",

  Frozen:      "rgb(100, 120, 255)",

  Thunderstruck:"rgb(16, 141, 163)",

  Dawnlit:     "rgba(120, 100, 180, 1)",

  Ambershine:  "rgba(160, 70, 50, 1)",      // <- important : Ambershine, pas Amberlit

  Dawncharged: "rgba(160, 140, 220, 1)",

  Ambercharged:"rgba(240, 110, 80, 1)",



};



function buildSpriteCandidates(rawId?: string | null, label?: string): string[] {

  const set = new Set<string>();

  const add = (value?: string | null) => {

    if (!value) return;

    const trimmed = String(value).trim();

    if (!trimmed) return;

    set.add(trimmed);

    set.add(trimmed.replace(/\s+/g, ""));

    const last = trimmed.split(/[./]/).pop();

    if (last && last !== trimmed) {

      set.add(last);

      set.add(last.replace(/\s+/g, ""));

    }

  };

  add(rawId);

  add(label);

  return Array.from(set).filter(Boolean);

}



let overlayEl: HTMLDivElement | null = null;

let currentEnabled = false;

const listeners = new Set<Listener>();

type SavedGardensListener = () => void;

const savedGardensListeners = new Set<SavedGardensListener>();

let sideOverlayEl: HTMLDivElement | null = null;

let sideListWrap: HTMLDivElement | null = null;

let sideSelect: HTMLSelectElement | null = null;

let sideRightWrap: HTMLDivElement | null = null;

let currentSideMode: "plants" | "decor" = "plants";

let selectedPlantId: string | null = null;

let selectedDecorId: string | null = null;

let currentItemOverlayEl: HTMLDivElement | null = null;

let currentItemUnsub: (() => void) | null = null;

let currentItemApplyAll = false;

const currentItemSlotModes: Record<string, Record<number, SlotScaleMode>> = {};

let editorKeybindsInstalled = false;

let overlaysVisible = true;

const EDITOR_PLACE_REMOVE_FIRST_DELAY_MS = 200;

const EDITOR_PLACE_REMOVE_REPEAT_MS = 100;

let lastEditorPlaceRemoveTs = 0;

let lastEditorPressStartTs = 0;

let lastEditorFirstFired = false;

let lastEditorTileKey: string | null = null;

let lastEditorTileType: string | undefined;

let lastEditorFirstActionTs = 0;

let editorActionHeld = false;



async function triggerEditorAnimation(animation: "dig" | "dropObject"): Promise<void> {

  try {

    const playerId = await getPlayerId();

    if (!playerId) return;

    await Atoms.player.avatarTriggerAnimationAtom.set({ playerId, animation });

    if (animation === "dig") {

      void audioPlayer.playBy("Break_Dirt_01");

    } else if (animation === "dropObject") {

      void (

        audioPlayer.playGroup("plant") ||

        audioPlayer.playGroup("hit_dirt") ||

        audioPlayer.playGroup("hit") ||

        audioPlayer.playBy(/Hit_Dirt/i)

      );

    }

  } catch {

    /* ignore */

  }

}



type StatePatch = {

  atom: any;

  readKey: string;

  origRead: Function;

  writeKey?: string;

  origWrite?: Function;

};



let stateFrozenValue: any = null;

let statePatch: StatePatch | null = null;

let stateOriginalValue: any = null;

let friendGardenPreviewActive = false;

type FriendGardenBackup = { garden: GardenState; userSlotIdx: number };

let friendGardenBackup: FriendGardenBackup | null = null;



function createSelectionIcon(
  kind: "decor" | "plants",
  label: string,
  size = 32,
  rawId?: string | null,
  spriteKey?: string | null,
): HTMLElement {
  const wrap = document.createElement("span");
  Object.assign(wrap.style, {
    width: `${size}px`,
    height: `${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${Math.max(14, size - 10)}px`,
    lineHeight: "1",
  });

  const fallback = label?.trim().charAt(0).toUpperCase() || (kind === "decor" ? "D" : "P");
  wrap.textContent = "";
  wrap.setAttribute("aria-hidden", "true");
  const applyFallback = () => {
    if (!wrap.querySelector("img")) {
      wrap.textContent = fallback;
    }
  };

  // Use the actual sprite atlas key first (e.g. "CloverFourLeaf") to avoid
  // fuzzy-match collisions with the catalog key (e.g. "FourLeafClover").
  const spriteBaseName = spriteKey?.split("/").pop() ?? null;
  const candidates = spriteBaseName
    ? [spriteBaseName, ...buildSpriteCandidates(rawId, label)]
    : buildSpriteCandidates(rawId, label);
  let categories: string[] = kind === "decor" ? ["decor"] : ["plant"];
  if (kind !== "decor" && /bamboo|cactus/i.test(String(rawId ?? label ?? ""))) {
    categories = ["tallplant", "tallPlant", "plant"];
  }
  if (candidates.length) {
    attachSpriteIcon(wrap, categories, candidates, size, "editor", {
      onNoSpriteFound: applyFallback,
    });
  } else {
    applyFallback();
  }

  return wrap;
}


/* -------------------------------------------------------------------------- */

/* Overlay + toggle state                                                     */

/* -------------------------------------------------------------------------- */



function readPersisted(def = false): boolean {

  return def;

}



function persist(enabled: boolean) {

  /* persistence disabled: editor toggle always resets to off */

}



function ensureOverlay(): HTMLDivElement {

  if (overlayEl && document.contains(overlayEl)) return overlayEl;



  const el = document.createElement("div");

  el.id = "qws-editor-overlay";

  el.textContent = "Editor mode";

  Object.assign(el.style, {

    position: "fixed",

    top: "7%",

    left: "50%",

    transform: "translateX(-50%)",

    zIndex: "1000001",

    padding: "8px 12px",

    borderRadius: "999px",

    border: "1px solid #ffffff33",

    background: "linear-gradient(180deg, rgba(17,24,31,0.95), rgba(12,18,26,0.92))",

    color: "#e7eef7",

    font: "600 13px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",

    letterSpacing: "0.3px",

    boxShadow: "0 10px 30px rgba(0,0,0,.35)",

    pointerEvents: "none",

  } as Partial<CSSStyleDeclaration>);



  (document.body || document.documentElement || document)!.appendChild(el);

  overlayEl = el;

  return el;

}



function showOverlay() {

  ensureOverlay();

}



function hideOverlay() {

  if (overlayEl) {

    overlayEl.remove();

    overlayEl = null;

  }

}



function notifySavedGardensChanged(): void {

  if (!savedGardensListeners.size) return;

  for (const listener of savedGardensListeners) {

    try {

      listener();

    } catch (error) {

      console.error("[EditorService] saved gardens listener failed", error);

    }

  }

}



function getSelectedId(): string | null {

  return currentSideMode === "decor" ? selectedDecorId : selectedPlantId;

}



function setSelectedId(next: string | null) {

  if (currentSideMode === "decor") {

    selectedDecorId = next;

  } else {

    selectedPlantId = next;

  }

}



function getSideEntries(): Array<{ id: string; label: string }> {

  if (currentSideMode === "decor") {

    return Object.entries(decorCatalog || {}).map(([decorId, val]) => ({

      id: decorId,

      label: String((val as any)?.name || decorId),

    }));

  }



  return Object.entries(plantCatalog || {}).map(([species, val]) => ({

    id: species,

    label: String((val as any)?.crop?.name || (val as any)?.seed?.name || species),

  }));

}



function getSideEntry(id: string | null): any {

  if (!id) return null;

  return currentSideMode === "decor"

    ? (decorCatalog as Record<string, any>)?.[id]

    : (plantCatalog as Record<string, any>)?.[id];

}



function getSideEntryLabel(id: string, entry: any): string {

  if (currentSideMode === "decor") return entry?.name || id;

  return entry?.crop?.name || entry?.seed?.name || id;

}



function getSideSpriteKind(): "Decor" | "Crop" {

  return currentSideMode === "decor" ? "Decor" : "Crop";

}



function ensureSideOverlay(): HTMLDivElement {

  if (sideOverlayEl && document.contains(sideOverlayEl)) return sideOverlayEl;



  const root = document.createElement("div");

  root.id = "qws-editor-side";

  Object.assign(root.style, {

    position: "fixed",

    top: "12%",

    left: "12px",

    zIndex: "1000001",

    width: "560px",

    minHeight: "420px",

    maxHeight: "86vh",

    height: "min(720px, 86vh)",

    display: "grid",

    gridTemplateRows: "auto 1fr",          // <- header + contenu

    gap: "10px",

    padding: "10px",

    borderRadius: "12px",

    border: "1px solid #ffffff22",

    background: "linear-gradient(180deg, rgba(14,18,25,0.95), rgba(10,14,20,0.92))",

    color: "#e7eef7",

    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",

    pointerEvents: "auto",

  } as Partial<CSSStyleDeclaration>);



  // Header "Item picker"

  const header = document.createElement("div");

  header.textContent = "Item picker";

  header.style.fontWeight = "700";

  header.style.fontSize = "13px";

  header.style.letterSpacing = "0.08em";

  header.style.textTransform = "uppercase";

  header.style.opacity = "0.85";

  header.style.textAlign = "center";



  // Conteneur 2 colonnes (gauche = liste, droite = dÃ©tails)

  const content = document.createElement("div");

  content.style.display = "grid";

  content.style.gridTemplateColumns = "260px 1fr";

  content.style.gap = "10px";

  content.style.minHeight = "0";



  // Left column

  const left = document.createElement("div");

  left.style.display = "grid";

  left.style.gridTemplateRows = "auto 1fr";

  left.style.gap = "8px";

  left.style.minHeight = "0";



  const select = document.createElement("select");

  select.id = "qws-editor-side-select";

  select.style.width = "100%";

  select.style.padding = "8px";

  select.style.borderRadius = "10px";

  select.style.border = "1px solid #33404e";

  select.style.background = "rgba(20,25,33,0.9)";

  select.style.color = "#e7eef7";

  select.style.fontWeight = "600";

  select.style.cursor = "pointer";



  const optPlants = document.createElement("option");

  optPlants.value = "plants";

  optPlants.textContent = "Plants";

  const optDecor = document.createElement("option");

  optDecor.value = "decor";

  optDecor.textContent = "Decor";

  select.append(optPlants, optDecor);

  select.value = currentSideMode;

  select.onchange = () => {

    currentSideMode = select.value === "decor" ? "decor" : "plants";

    renderSideList();

  };

  sideSelect = select;



  const listWrap = document.createElement("div");

  listWrap.id = "qws-editor-side-list";

  Object.assign(listWrap.style, {

    border: "1px solid #2c3643",

    borderRadius: "10px",

    background: "rgba(16,21,28,0.9)",

    overflow: "auto",

    padding: "6px",

    maxHeight: "72vh",

  } as Partial<CSSStyleDeclaration>);

  sideListWrap = listWrap;



  left.append(select, listWrap);



  const right = document.createElement("div");

  right.id = "qws-editor-side-details";

  right.style.display = "grid";

  right.style.gridTemplateRows = "1fr auto"; // contenu scroll / bouton

  right.style.gap = "8px";

  right.style.border = "1px solid #2c3643";

  right.style.borderRadius = "10px";

  right.style.background = "rgba(16,21,28,0.9)";

  right.style.padding = "10px";

  right.style.minHeight = "0";

  right.style.overflow = "hidden";

  sideRightWrap = right;



  content.append(left, right);

  root.append(header, content);



  (document.body || document.documentElement || document)!.appendChild(root);



  sideOverlayEl = root;

  renderSideList();

  renderSideDetails();

  return root;

}





function showSideOverlay() {

  ensureSideOverlay();

}



function hideSideOverlay() {

  if (sideOverlayEl) {

    sideOverlayEl.remove();

    sideOverlayEl = null;

    sideListWrap = null;

    sideSelect = null;

    sideRightWrap = null;

  }

}



function ensureCurrentItemOverlay(): HTMLDivElement {

  if (currentItemOverlayEl && document.contains(currentItemOverlayEl)) return currentItemOverlayEl;



  const root = document.createElement("div");

  root.id = "qws-editor-current-item";

  Object.assign(root.style, {

    position: "fixed",

    top: "12%",

    right: "12px",

    zIndex: "1000001",

    width: "420px",

    minHeight: "200px",

    maxHeight: "86vh",

    display: "grid",

    gridTemplateRows: "auto 1fr",

    gap: "10px",

    padding: "10px",

    borderRadius: "12px",

    border: "1px solid #ffffff22",

    background: "linear-gradient(180deg, rgba(14,18,25,0.95), rgba(10,14,20,0.92))",

    color: "#e7eef7",

    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",

    pointerEvents: "auto",

  } as Partial<CSSStyleDeclaration>);



  const header = document.createElement("div");

  header.textContent = "Current item";

  header.style.fontWeight = "700";

  header.style.fontSize = "13px";

  header.style.letterSpacing = "0.08em";

  header.style.textTransform = "uppercase";

  header.style.opacity = "0.85";

  header.style.textAlign = "center";



  const content = document.createElement("div");

  content.id = "qws-editor-current-item-content";

  content.style.display = "grid";

  content.style.gap = "10px";

  content.style.minHeight = "0";

  content.style.overflow = "auto";



  root.append(header, content);

  (document.body || document.documentElement || document)!.appendChild(root);

  currentItemOverlayEl = root;



  attachCurrentItemListener();

  renderCurrentItemOverlay();



  return root;

}



function showCurrentItemOverlay() {

  ensureCurrentItemOverlay();

}



function hideCurrentItemOverlay() {

  if (currentItemUnsub) {

    try { currentItemUnsub(); } catch {}

    currentItemUnsub = null;

  }

  if (currentItemOverlayEl) {

    currentItemOverlayEl.remove();

    currentItemOverlayEl = null;

  }

}



function attachCurrentItemListener() {

  if (currentItemUnsub) {

    try { currentItemUnsub(); } catch {}

    currentItemUnsub = null;

  }

  void (async () => {

    try {

      const atom = getAtomByLabel("myCurrentGardenObjectAtom");

      const selectedIdxAtom = getAtomByLabel("myValidatedSelectedItemIndexAtom");

      const store = await ensureStore().catch(() => null);

      if (!atom || !store) return;

      const unsubA = store.sub(atom, () => {

        renderCurrentItemOverlay();

      });

      const unsubB = selectedIdxAtom ? store.sub(selectedIdxAtom, () => renderCurrentItemOverlay()) : null;

      currentItemUnsub = () => {

        try { unsubA(); } catch {}

        if (unsubB) { try { unsubB(); } catch {} }

      };

    } catch {

      /* ignore */

    }

  })();

}



async function readCurrentTileContext(): Promise<{

  tileType: string | undefined;

  tileKey: string | null;

  tileObject: any;

}> {

  try {

    const store = await ensureStore().catch(() => null);

    if (!store) return { tileType: undefined, tileKey: null, tileObject: null };

    const tileAtom = getAtomByLabel("myCurrentGardenTileAtom");

    if (!tileAtom) return { tileType: undefined, tileKey: null, tileObject: null };

    const tileVal = store.get(tileAtom) as any;

    if (!tileVal) return { tileType: undefined, tileKey: null, tileObject: null };

    const tileType: string | undefined = tileVal.tileType;

    const localTileIndex: number | undefined = tileVal.localTileIndex;

    const userSlotIdxRaw: unknown = tileVal.userSlotIdx;

    const userSlotIdx =

      typeof userSlotIdxRaw === "number" && Number.isFinite(userSlotIdxRaw)

        ? userSlotIdxRaw

        : 0;

    if (localTileIndex == null || !Number.isFinite(localTileIndex)) {

      return { tileType, tileKey: null, tileObject: null };

    }



    const cur = (stateFrozenValue ?? (await Atoms.root.state.get())) as any;

    const garden =

      Array.isArray(cur?.child?.data?.userSlots)

        ? cur?.child?.data?.userSlots?.[userSlotIdx]?.data?.garden

        : cur?.child?.data?.userSlots?.[String(userSlotIdx)]?.data?.garden;

    const safeGarden: GardenState = garden && typeof garden === "object" ? garden : makeEmptyGarden();

    const key = String(localTileIndex);

    const targetMap =

      tileType === "Dirt" ? safeGarden.tileObjects || {} : safeGarden.boardwalkTileObjects || {};

    return { tileType, tileKey: key, tileObject: targetMap[key] };

  } catch {

    return { tileType: undefined, tileKey: null, tileObject: null };

  }

}



function getGardenObjectLabel(obj: any): string {

  if (!obj || typeof obj !== "object") return "Unknown";

  if (obj.objectType === "plant") {

    const entry = (plantCatalog as any)[obj.species];

    return entry?.crop?.name || entry?.seed?.name || obj.species || "Plant";

  }

  if (obj.objectType === "decor") {

    const entry = (decorCatalog as any)[obj.decorId];

    return entry?.name || obj.decorId || "Decor";

  }

  return String(obj.objectType || "Item");

}



function getInventoryItemLabel(item: any): string {

  if (!item || typeof item !== "object") return "Item";

  if (item.itemType === "Plant") {

    const entry = (plantCatalog as any)[item.species];

    return entry?.crop?.name || entry?.seed?.name || item.species || "Plant";

  }

  if (item.itemType === "Decor") {

    const entry = (decorCatalog as any)[item.decorId];

    return entry?.name || item.decorId || "Decor";

  }

  return String(item.itemType || "Item");

}



function renderCurrentItemOverlay() {

  if (!currentItemOverlayEl) return;

  const content = currentItemOverlayEl.querySelector("#qws-editor-current-item-content") as HTMLDivElement | null;

  if (!content) return;



  void (async () => {

    content.innerHTML = "";



    const { tileType, tileKey, tileObject } = await readCurrentTileContext();

    if (!tileObject) {

      const empty = document.createElement("div");

      empty.textContent = "Look at a plant or decor to edit it.";

      empty.style.opacity = "0.7";

      empty.style.textAlign = "center";

      content.appendChild(empty);



      try {

        const inv = await Atoms.inventory.myInventory.get();

        const idx = await Atoms.inventory.myValidatedSelectedItemIndex.get();

        const items = Array.isArray(inv?.items) ? inv.items : [];

        const selected = typeof idx === "number" ? items[idx] : null;

        if (selected) {

          const infoRow = document.createElement("div");

          infoRow.style.display = "flex";

          infoRow.style.flexDirection = "column";

          infoRow.style.alignItems = "center";

          infoRow.style.gap = "6px";



          const nameEl = document.createElement("div");

          nameEl.textContent = getInventoryItemLabel(selected);

          nameEl.style.fontWeight = "700";

          nameEl.style.fontSize = "14px";

          nameEl.style.overflow = "hidden";

          nameEl.style.textOverflow = "ellipsis";

          nameEl.style.whiteSpace = "nowrap";

          nameEl.style.textAlign = "center";



          const _selSpecies = selected.itemType === "Plant" ? (selected as any)?.species : null;
          const _selCatalogEntry = _selSpecies ? (plantCatalog as any)[_selSpecies] : null;
          const _selSpriteKey = _selCatalogEntry?.crop?.sprite ?? _selCatalogEntry?.plant?.sprite ?? null;
          const icon = createSelectionIcon(
            selected.itemType === "Decor" ? "decor" : "plants",
            getInventoryItemLabel(selected),
            40,
            selected.itemType === "Decor" ? (selected as any)?.decorId : _selSpecies,
            _selSpriteKey,
          );


          infoRow.append(icon, nameEl);

          content.appendChild(infoRow);



          if (selected.itemType === "Plant") {

            const slotsArr = Array.isArray((selected as any).slots) ? (selected as any).slots : [];

            const mutSet = new Set<string>();

            for (const s of slotsArr) {

              const muts = Array.isArray(s?.mutations) ? s.mutations : [];

              muts.forEach((m: string) => mutSet.add(m));

            }

            const mutList = Array.from(mutSet);



            const mutRow = document.createElement("div");

            mutRow.style.display = "flex";

            mutRow.style.flexWrap = "wrap";

            mutRow.style.gap = "6px";

            mutRow.style.justifyContent = "center";



            if (mutList.length) {

              for (const mutId of mutList) {

                const tag = document.createElement("span");

                tag.textContent =

                  (mutationCatalog as any)[mutId]?.name?.charAt(0)?.toUpperCase() ||

                  mutId.charAt(0)?.toUpperCase() ||

                  "?";

                tag.style.fontWeight = "900";

                tag.style.fontSize = "12px";

                tag.style.padding = "4px 8px";

                tag.style.borderRadius = "999px";

                tag.style.border = "1px solid #2c3643";

                tag.style.background = "rgba(10,14,20,0.9)";

                const color = mutationColorMap[mutId];

                if (color) {

                  if (color.startsWith("linear-gradient")) {

                    tag.style.backgroundImage = color;

                    tag.style.backgroundClip = "text";

                    (tag.style as any).webkitBackgroundClip = "text";

                    tag.style.color = "transparent";

                    (tag.style as any).webkitTextFillColor = "transparent";

                  } else {

                    tag.style.color = color;

                  }

                }

                mutRow.appendChild(tag);

              }

            } else {

              const none = document.createElement("div");

              none.textContent = "No mutations";

              none.style.opacity = "0.7";

              none.style.fontSize = "11px";

              mutRow.appendChild(none);

            }



            content.append(mutRow);

          }



          const placeBtn = document.createElement("button");

          placeBtn.type = "button";

          placeBtn.textContent = "Place";

          Object.assign(placeBtn.style, {

            width: "100%",

            padding: "8px 10px",

            borderRadius: "8px",

            border: "1px solid #2b3441",

            background: "linear-gradient(180deg, rgba(42,154,255,0.12), rgba(30,91,181,0.35))",

            color: "#e7eef7",

            fontWeight: "700",

            cursor: "pointer",

          } as Partial<CSSStyleDeclaration>);

          placeBtn.onclick = () => {

            void placeSelectedItemInGardenAtCurrentTile();

          };

          content.appendChild(placeBtn);

        }

      } catch {

        /* ignore */

      }

      return;

    }



    const name = getGardenObjectLabel(tileObject);

    const header = document.createElement("div");

    header.style.display = "flex";

    header.style.flexDirection = "column";

    header.style.alignItems = "center";

    header.style.gap = "6px";



    const nameEl = document.createElement("div");

    nameEl.textContent = name;

    nameEl.style.fontWeight = "700";

    nameEl.style.fontSize = "15px";

    nameEl.style.overflow = "hidden";

    nameEl.style.textOverflow = "ellipsis";

    nameEl.style.whiteSpace = "nowrap";

    nameEl.style.textAlign = "center";



  const _tileSpecies = tileObject.objectType === "plant" ? (tileObject.species || tileKey || name) : null;
  const _tileCatalogEntry = _tileSpecies ? (plantCatalog as any)[_tileSpecies] : null;
  const _tileSpriteKey = _tileCatalogEntry?.crop?.sprite ?? _tileCatalogEntry?.plant?.sprite ?? null;
  const icon = createSelectionIcon(
    tileObject.objectType === "decor" ? "decor" : "plants",
    name,
    48,
    tileObject.objectType === "decor" ? tileObject.decorId || tileKey || name : _tileSpecies,
    _tileSpriteKey,
  );


    header.append(icon, nameEl);

    content.appendChild(header);



    if (tileObject.objectType === "plant") {

      renderCurrentPlantEditor(content, tileObject, tileKey || "");

    }



    const addBtn = document.createElement("button");

    addBtn.type = "button";

    addBtn.textContent = "Copy to inventory";

    Object.assign(addBtn.style, {

      width: "100%",

      padding: "8px 10px",

      borderRadius: "8px",

      border: "1px solid #2b3441",

      background: "linear-gradient(180deg, rgba(42,154,255,0.12), rgba(30,91,181,0.35))",

      color: "#e7eef7",

      fontWeight: "700",

      cursor: "pointer",

    } as Partial<CSSStyleDeclaration>);

    addBtn.onclick = () => {

      void addTileObjectToInventory(tileObject);

    };



    content.appendChild(addBtn);



    const removeBtn = document.createElement("button");

    removeBtn.type = "button";

    removeBtn.textContent = "Remove";

    Object.assign(removeBtn.style, {

      width: "100%",

      padding: "8px 10px",

      borderRadius: "8px",

      border: "1px solid #2b3441",

      background: "linear-gradient(180deg, rgba(220,80,80,0.18), rgba(160,40,40,0.25))",

      color: "#e7eef7",

      fontWeight: "700",

      cursor: "pointer",

    } as Partial<CSSStyleDeclaration>);

    removeBtn.onclick = () => {

      if (tileObject.objectType === "plant") void removeItemFromGardenAtCurrentTile();

      else void removeDecorFromGardenAtCurrentTile();

    };



    content.appendChild(removeBtn);

  })();

}



function renderCurrentPlantEditor(content: HTMLElement, tileObject: any, tileKey: string) {

  const species = tileObject?.species;

  const slots = Array.isArray(tileObject?.slots) ? tileObject.slots : [];



  const modeKey = tileKey || "default";

  const slotModeMap = currentItemSlotModes[modeKey] || {};



  let applyAll = currentItemApplyAll;

  const slotsList = document.createElement("div");

  slotsList.style.display = "grid";

  slotsList.style.gap = "8px";

  const maxSlots = getMaxSlotsForSpecies(species);



  const applyAllRow = document.createElement("label");

  applyAllRow.style.display = "flex";

  applyAllRow.style.alignItems = "center";

  applyAllRow.style.gap = "6px";

  applyAllRow.style.fontSize = "12px";

  applyAllRow.style.opacity = "0.9";



  const applyToggle = document.createElement("input");

  applyToggle.type = "checkbox";

  applyToggle.checked = applyAll;

  applyToggle.onchange = () => {

    applyAll = !!applyToggle.checked;

    currentItemApplyAll = applyAll;

    if (applyAll) syncApplyAllControls();

  };



  const applyLabel = document.createElement("span");

  applyLabel.textContent = "Edit all slots together";



  applyAllRow.append(applyToggle, applyLabel);

    const syncApplyAllControls = () => {

      if (!applyAll) return;

      slotsList.querySelectorAll<HTMLInputElement>('input[data-slot-idx]').forEach((s) => {

        s.value = String((s as any)._currentPct || s.value);

        const mode = (s as any)._currentMode || "percent";

        s.disabled = mode === "custom";

        s.style.opacity = mode === "custom" ? "0.45" : "1";

      });

      slotsList.querySelectorAll<HTMLInputElement>('input[data-scale-input-slot]').forEach((s) => {

        s.value = String((s as any)._currentScale || s.value);

      });

      slotsList.querySelectorAll<HTMLElement>('[data-size-label]').forEach((lab) => {

        const curPct = (lab as any)._currentPct;

        if (curPct != null) lab.textContent = `${curPct}%`;

      });

      slotsList.querySelectorAll<HTMLInputElement>('input[data-scale-mode-slot]').forEach((chk) => {

        const mode = (chk as any)._currentMode || "percent";

        chk.checked = mode === "custom";

      });

      slotsList.querySelectorAll<HTMLElement>('[data-custom-row-slot]').forEach((row) => {

        const mode = (row as any)._currentMode || "percent";

        row.style.display = mode === "custom" ? "flex" : "none";

      });

      slotsList.querySelectorAll<HTMLElement>('[data-slider-row-slot]').forEach((row) => {

        const mode = (row as any)._currentMode || "percent";

        row.style.display = mode === "custom" ? "none" : "";

      });

    };



  slots.forEach((slot: any, idx: number) => {

    const box = document.createElement("div");

    Object.assign(box.style, {

      border: "1px solid #2c3643",

      borderRadius: "8px",

      padding: "8px",

      background: "rgba(10,14,20,0.9)",

      display: "grid",

      gap: "6px",

    } as Partial<CSSStyleDeclaration>);



    const rawScale = Number(slot?.targetScale);

    const fallbackScale = computeTargetScaleFromPercent(species, 100);

    const initialScale = Number.isFinite(rawScale) ? rawScale : fallbackScale;

    const { minScale, maxScale } = getScaleBoundsForSpecies(species);

    const computePercentLoose = (scale: number) => {

      const { minScale, maxScale } = getScaleBoundsForSpecies(species);

      if (!maxScale || maxScale <= minScale) return 100;

      const pct = 50 + ((scale - minScale) / (maxScale - minScale)) * 50;

      return clampSizePercent(pct);

    };

    const pct = computePercentLoose(initialScale);

    let currentPct = pct;

    let currentScale = initialScale;

    const outOfBounds = initialScale < minScale || initialScale > maxScale;

    let currentMode: SlotScaleMode =

      slotModeMap[idx] === "custom" ? "custom" : outOfBounds ? "custom" : "percent";

    if (!slotModeMap[idx] && outOfBounds) {

      currentItemSlotModes[modeKey] = { ...(currentItemSlotModes[modeKey] || {}), [idx]: "custom" };

    }



    const sizeRow = document.createElement("div");

    sizeRow.style.display = "flex";

    sizeRow.style.justifyContent = "space-between";

    sizeRow.style.alignItems = "center";

    sizeRow.style.fontSize = "11px";

    sizeRow.style.opacity = "0.85";



    const sizeName = document.createElement("span");

    sizeName.textContent = "Size";

    const sizeValue = document.createElement("span");

    sizeValue.textContent = `${currentPct}%`;

    sizeValue.dataset.sizeLabel = String(idx);

    (sizeValue as any)._currentPct = currentPct;

    sizeRow.append(sizeName, sizeValue);



    const slider = document.createElement("input");

    slider.type = "range";

    slider.min = "50";

    slider.max = "100";

    slider.step = "1";

    slider.value = String(currentPct);

    slider.dataset.slotIdx = String(idx);

    (slider as any)._currentPct = currentPct;

    (slider as any)._currentMode = currentMode;

    Object.assign(slider.style, { width: "100%", cursor: "pointer" } as Partial<CSSStyleDeclaration>);

    const sliderRow = document.createElement("div");

    sliderRow.dataset.sliderRowSlot = String(idx);

    sliderRow.appendChild(slider);



    const customRow = document.createElement("div");

    customRow.style.display = "flex";

    customRow.style.alignItems = "center";

    customRow.style.gap = "6px";

    customRow.style.fontSize = "11px";

    customRow.style.opacity = "0.9";



    const customLabel = document.createElement("span");

    customLabel.textContent = "Custom scale";

    const customInput = document.createElement("input");

    customInput.type = "text";

    customInput.inputMode = "decimal";

    customInput.autocomplete = "off";

    customInput.value = String(currentScale);

    customInput.dataset.scaleInputSlot = String(idx);

    (customInput as any)._currentScale = currentScale;

    Object.assign(customInput.style, {

      width: "90px",

      padding: "4px 6px",

      borderRadius: "6px",

      border: "1px solid #2c3643",

      background: "rgba(10,14,20,0.9)",

      color: "#e7eef7",

    } as Partial<CSSStyleDeclaration>);



    let pendingPatch: Partial<any> | null = null;

    let debounceTimer: number | null = null;



    const flushPatch = () => {

      if (!pendingPatch) return;

      const patch = pendingPatch;

      pendingPatch = null;

      void updateGardenObjectAtCurrentTile((obj) => {

        if (obj?.objectType !== "plant") return obj;

        const nextSlots = Array.isArray(obj.slots) ? obj.slots.slice() : [];

        if (applyAll) {

          for (let i = 0; i < nextSlots.length; i++) {

            nextSlots[i] = { ...(nextSlots[i] || {}), ...patch };

          }

        } else {

          nextSlots[idx] = { ...(nextSlots[idx] || {}), ...patch };

        }

        return { ...obj, slots: nextSlots };

      });

    };



    const queuePatch = (patch: Partial<any>) => {

      pendingPatch = { ...(pendingPatch || {}), ...patch };

      if (debounceTimer != null) window.clearTimeout(debounceTimer);

      debounceTimer = window.setTimeout(() => {

        flushPatch();

      }, 150);

    };



    const updatePercent = (nextPct: number) => {

      const pctVal = clampSizePercent(nextPct);

      currentPct = pctVal;

      (slider as any)._currentPct = pctVal;

      (sizeValue as any)._currentPct = pctVal;

      sizeValue.textContent = `${pctVal}%`;

      slider.value = String(pctVal);

      currentScale = computeTargetScaleFromPercent(species, pctVal);

      if (currentMode !== "custom") customInput.value = currentScale.toFixed(4);

      (customInput as any)._currentScale = currentScale;

      queuePatch({ targetScale: currentScale });

      if (applyAll) {

        slotsList.querySelectorAll<HTMLInputElement>('input[data-slot-idx]').forEach((s) => {

          if (s === slider) return;

          s.value = String(pctVal);

          (s as any)._currentPct = pctVal;

          (s as any)._currentMode = "percent";

          s.disabled = false;

          s.style.opacity = "1";

        });

        slotsList.querySelectorAll<HTMLInputElement>('input[data-scale-input-slot]').forEach((s) => {

          if (s === customInput) return;

          s.value = currentScale.toFixed(4);

          (s as any)._currentScale = currentScale;

        });

        slotsList.querySelectorAll<HTMLElement>('[data-size-label]').forEach((lab) => {

          lab.textContent = `${pctVal}%`;

          (lab as any)._currentPct = pctVal;

        });

        applyModeToAll("percent", currentScale, currentPct);

      }

    };



    const updateCustomScale = (raw: string) => {

      const normalized = raw.replace(",", ".").replace(/\s+/g, "");

      const n = Number(normalized);

      if (!Number.isFinite(n)) return;

      currentScale = n;

      customInput.value = normalized;

      (customInput as any)._currentScale = n;

      const pctVal = computePercentFromScale(species, n);

      currentPct = pctVal;

      slider.value = String(pctVal);

      sizeValue.textContent = `${pctVal}%`;

      queuePatch({ targetScale: n });

      if (applyAll) {

        slotsList.querySelectorAll<HTMLInputElement>('input[data-slot-idx]').forEach((s) => {

          if (s === slider) return;

          s.value = String(pctVal);

          (s as any)._currentPct = pctVal;

          (s as any)._currentMode = "custom";

          s.disabled = true;

          s.style.opacity = "0.45";

        });

        slotsList.querySelectorAll<HTMLInputElement>('input[data-scale-input-slot]').forEach((s) => {

          if (s === customInput) return;

          s.value = String(n);

          (s as any)._currentScale = n;

        });

        slotsList.querySelectorAll<HTMLElement>('[data-size-label]').forEach((lab) => {

          lab.textContent = `${pctVal}%`;

          (lab as any)._currentPct = pctVal;

        });

        applyModeToAll("custom", n, currentPct);

      }

    };



    slider.oninput = () => updatePercent(Number(slider.value));



    const commitCustomInput = () => updateCustomScale(customInput.value);

    customInput.onblur = commitCustomInput;

    customInput.onkeydown = (ev) => {

      if (ev.key === "Enter") {

        ev.preventDefault();

        commitCustomInput();

      }

    };



    customRow.append(customLabel, customInput);



    const modeRow = document.createElement("label");

    modeRow.style.display = "flex";

    modeRow.style.alignItems = "center";

    modeRow.style.gap = "6px";

    modeRow.style.fontSize = "11px";

    modeRow.style.opacity = "0.9";



    const modeToggle = document.createElement("input");

    modeToggle.type = "checkbox";

    modeToggle.dataset.scaleModeSlot = String(idx);

    (modeToggle as any)._currentMode = currentMode;

    modeToggle.checked = currentMode === "custom";



    const modeText = document.createElement("span");

    modeText.textContent = "Use custom scale";



    const syncValueLabel = () => {

      sizeValue.textContent = currentMode === "custom" ? `${currentScale.toFixed(2)}x` : `${currentPct}%`;

      (sizeValue as any)._currentPct = currentPct;

    };



    const syncControlState = () => {

      const showPercent = currentMode !== "custom";

      (modeToggle as any)._currentMode = currentMode;

      (slider as any)._currentMode = currentMode;

      slider.disabled = !showPercent;

      sliderRow.style.display = showPercent ? "" : "none";

      customRow.style.display = showPercent ? "none" : "flex";

    };



    modeToggle.onchange = () => {

      currentMode = modeToggle.checked ? "custom" : "percent";

      currentItemSlotModes[modeKey] = {

        ...(currentItemSlotModes[modeKey] || {}),

        [idx]: currentMode,

      };

      if (currentMode === "custom") {

        queuePatch({ targetScale: currentScale });

      } else {

        const clamped = clampCustomScale(species, currentScale);

        currentScale = clamped;

        (customInput as any)._currentScale = clamped;

        customInput.value = String(clamped);

        const pctVal = computePercentFromScale(species, clamped);

        currentPct = pctVal;

        (slider as any)._currentPct = pctVal;

        slider.value = String(pctVal);

        queuePatch({ targetScale: clamped });

      }

      syncControlState();

      syncValueLabel();

      if (applyAll) syncApplyAllControls();

      if (applyAll) {

        applyModeToAll(currentMode, currentScale, currentPct);

      }

    };



    const installGameKeyBlocker = (inp: HTMLInputElement) => {

      const stop = (ev: Event) => {

        ev.stopImmediatePropagation?.();

        ev.stopPropagation();

      };

      const attach = () => {

        window.addEventListener("keydown", stop as any, true);

        window.addEventListener("keyup", stop as any, true);

      };

      const detach = () => {

        window.removeEventListener("keydown", stop as any, true);

        window.removeEventListener("keyup", stop as any, true);

      };

      inp.addEventListener("focus", attach);

      inp.addEventListener("blur", detach);

      inp.addEventListener("keydown", stop);

    };



    const installCharGuard = (inp: HTMLInputElement) => {

      const allowed = new Set(["0","1","2","3","4","5","6","7","8","9","-","."]);

      inp.addEventListener("keydown", (ev) => {

        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

        const k = ev.key;

        if (["Backspace","Delete","Tab","Enter","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(k)) {

          return;

        }

        if (k.length === 1 && !allowed.has(k)) {

          ev.preventDefault();

        }

      });

      inp.addEventListener("input", () => {

        const cleaned = inp.value.replace(/[^0-9.-]/g, "");

        if (cleaned !== inp.value) inp.value = cleaned;

      });

    };



    installGameKeyBlocker(customInput);

    installCharGuard(customInput);



    modeRow.append(modeToggle, modeText);



    // initial display state to avoid flicker

    slider.disabled = currentMode === "custom";

    sliderRow.style.display = currentMode === "custom" ? "none" : "";

    customRow.style.display = currentMode === "custom" ? "flex" : "none";



    syncControlState();

    syncValueLabel();



    // Mutations

    const mutWrap = document.createElement("div");

    mutWrap.style.display = "grid";

    mutWrap.style.gap = "6px";



    const mutTitle = document.createElement("div");

    mutTitle.textContent = "Mutations";

    mutTitle.style.fontSize = "11px";

    mutTitle.style.opacity = "0.85";



    const mutRow = document.createElement("div");

    mutRow.style.display = "flex";

    mutRow.style.flexWrap = "wrap";

    mutRow.style.gap = "6px";

    mutRow.style.alignItems = "center";



    const mutations = Array.isArray(slot?.mutations) ? slot.mutations.slice() : [];

    const mutationKeys = Object.keys(mutationCatalog || {});

    const applyMutationsPatch = (nextMutations: string[]) => {

      const copy = nextMutations.slice();

      mutations.length = 0;

      mutations.push(...copy);

      void updateGardenObjectAtCurrentTile((obj) => {

        if (obj?.objectType !== "plant") return obj;

        const nextSlots = Array.isArray(obj.slots) ? obj.slots.slice() : [];

        if (applyAll) {

          for (let i = 0; i < nextSlots.length; i++) {

            nextSlots[i] = { ...(nextSlots[i] || {}), mutations: copy.slice() };

          }

        } else {

          nextSlots[idx] = { ...(nextSlots[idx] || {}), mutations: copy.slice() };

        }

        return { ...obj, slots: nextSlots };

      }).then(() => {

        renderMutations();

      });

    };



    const styleLetter = (target: HTMLElement, mutId: string) => {

      const color = mutationColorMap[mutId];

      if (!color) return;

      if (color.startsWith("linear-gradient")) {

        target.style.backgroundImage = color;

        target.style.backgroundClip = "text";

        (target.style as any).webkitBackgroundClip = "text";

        target.style.color = "transparent";

        (target.style as any).webkitTextFillColor = "transparent";

      } else {

        target.style.color = color;

      }

    };



    const getLetter = (mutId: string) => {

      const def = (mutationCatalog as any)[mutId] || {};

      const src = def.name || mutId || "?";

      return String(src).charAt(0).toUpperCase();

    };



    const renderMutations = () => {

      mutRow.innerHTML = "";

      for (const mutId of mutations) {

        const tag = document.createElement("span");

        Object.assign(tag.style, {

          borderRadius: "999px",

          padding: "3px 8px",

          fontSize: "11px",

          fontWeight: "700",

          border: "1px solid #2c3643",

          background: "rgba(10,14,20,0.9)",

          cursor: "pointer",

        } as Partial<CSSStyleDeclaration>);



        const letterSpan = document.createElement("span");

        letterSpan.textContent = getLetter(mutId);

        letterSpan.style.fontWeight = "900";

        styleLetter(letterSpan, mutId);



      tag.title = "Remove mutation";

      tag.onclick = () => {

        const next = mutations.filter((m: string) => m !== mutId);

        applyMutationsPatch(next);

      };



        tag.appendChild(letterSpan);

        mutRow.appendChild(tag);

      }



      if (mutations.length < mutationKeys.length) {

        const toggleBtn = document.createElement("button");

        toggleBtn.type = "button";

        toggleBtn.textContent = "+";

        Object.assign(toggleBtn.style, {

          width: "28px",

          height: "28px",

          borderRadius: "50%",

          border: "1px solid #2c3643",

          background: "rgba(10,14,20,0.9)",

          color: "#e7eef7",

          fontWeight: "900",

          fontSize: "16px",

          cursor: "pointer",

          display: "inline-flex",

          alignItems: "center",

          justifyContent: "center",

        } as Partial<CSSStyleDeclaration>);



        toggleBtn.onclick = () => {

          const isOpen = dropdown.style.display !== "none";

          dropdown.style.display = isOpen ? "none" : "grid";

          toggleBtn.style.background = isOpen ? "rgba(10,14,20,0.9)" : "rgba(32,42,56,0.8)";

        };



        mutRow.appendChild(toggleBtn);

      }

    };



    const dropdown = document.createElement("div");

    dropdown.style.display = "none";

    dropdown.style.gridTemplateColumns = "repeat(auto-fill, minmax(90px, 1fr))";

    dropdown.style.gap = "6px";

    dropdown.style.padding = "6px";

    dropdown.style.border = "1px solid #2c3643";

    dropdown.style.borderRadius = "8px";

    dropdown.style.background = "rgba(8,12,18,0.9)";



    for (const mutKey of mutationKeys) {

      const def = (mutationCatalog as any)[mutKey] || {};

      const storedId = mutKey === "Amberlit" ? "Ambershine" : mutKey;

      const isActive = Array.isArray(slot.mutations) && slot.mutations.includes(storedId);

      if (isActive) continue;



      const btn = document.createElement("button");

      btn.type = "button";

      btn.textContent = def.name || mutKey || "?";

      Object.assign(btn.style, {

        padding: "6px 8px",

        borderRadius: "8px",

        border: isActive ? "1px solid #55d38a" : "1px solid #2c3643",

        background: isActive ? "rgba(85,211,138,0.22)" : "rgba(10,14,20,0.9)",

        color: "#e7eef7",

        fontSize: "11px",

        fontWeight: "700",

        cursor: "pointer",

        textAlign: "left",

      } as Partial<CSSStyleDeclaration>);



      const color = mutationColorMap[storedId];

      if (color) {

        btn.style.color = color.startsWith("linear-gradient") ? "#e7eef7" : color;

        if (color.startsWith("linear-gradient")) {

          btn.style.backgroundImage = color;

          btn.style.backgroundClip = "text";

          (btn.style as any).webkitBackgroundClip = "text";

          btn.style.color = "transparent";

          (btn.style as any).webkitTextFillColor = "transparent";

        }

      }



      btn.onclick = () => {

        const has = Array.isArray(slot.mutations) && slot.mutations.includes(storedId);

        const next = has

          ? (slot.mutations || []).filter((x: string) => x !== storedId)

          : [...(slot.mutations || []), storedId];

        applyMutationsPatch(next);

      };



      dropdown.appendChild(btn);

    }



    mutWrap.append(mutTitle, mutRow, dropdown);

    renderMutations();



    box.append(sizeRow, modeRow, sliderRow, customRow, mutWrap);

    slotsList.appendChild(box);

  });



  const showSlotControls = maxSlots > 1;

  if (showSlotControls) {

    const slotHeader = document.createElement("div");

    slotHeader.style.display = "flex";

    slotHeader.style.alignItems = "center";

    slotHeader.style.justifyContent = "space-between";

    slotHeader.style.fontSize = "12px";

    slotHeader.style.opacity = "0.9";

    slotHeader.style.gap = "8px";



    const slotCount = document.createElement("span");

    slotCount.textContent = `Slots ${slots.length}/${maxSlots}`;



    const slotBtnWrap = document.createElement("div");

    slotBtnWrap.style.display = "flex";

    slotBtnWrap.style.gap = "6px";

    slotBtnWrap.style.alignItems = "center";



    const makeCircleBtn = (text: string) => {

      const b = document.createElement("button");

      b.type = "button";

      b.textContent = text;

      Object.assign(b.style, {

        width: "28px",

        height: "28px",

        borderRadius: "50%",

        border: "1px solid #2b3441",

        background: "rgba(16,21,28,0.9)",

        color: "#e7eef7",

        cursor: "pointer",

        fontSize: "14px",

        fontWeight: "600",

        display: "inline-flex",

        alignItems: "center",

        justifyContent: "center",

      } as Partial<CSSStyleDeclaration>);

      return b;

    };



    const btnAdd = makeCircleBtn("+");

    const btnRemove = makeCircleBtn("-");



    const updateSlotHeaderState = () => {

      slotCount.textContent = `Slots ${slots.length}/${maxSlots}`;

      btnAdd.disabled = slots.length >= maxSlots;

      btnRemove.disabled = slots.length <= 1;

      btnAdd.style.opacity = btnAdd.disabled ? "0.4" : "1";

      btnRemove.style.opacity = btnRemove.disabled ? "0.4" : "1";

    };

    updateSlotHeaderState();



    const makeDefaultSlot = () => ({

      species,

      startTime: FIXED_SLOT_START,

      endTime: FIXED_SLOT_END,

      targetScale: computeTargetScaleFromPercent(species, 100),

      mutations: [],

    });



    btnAdd.onclick = () => {

      if (slots.length >= maxSlots) return;

      void updateGardenObjectAtCurrentTile((obj) => {

        if (obj?.objectType !== "plant") return obj;

        const nextSlots = Array.isArray(obj.slots) ? obj.slots.slice() : [];

        if (nextSlots.length >= maxSlots) return obj;

        nextSlots.push(makeDefaultSlot());

        return { ...obj, slots: nextSlots };

      }).then((ok) => {

        if (ok) renderCurrentItemOverlay();

      });

    };



    btnRemove.onclick = () => {

      if (slots.length <= 1) return;

      void updateGardenObjectAtCurrentTile((obj) => {

        if (obj?.objectType !== "plant") return obj;

        const nextSlots = Array.isArray(obj.slots) ? obj.slots.slice(0, Math.max(1, obj.slots.length - 1)) : [];

        return { ...obj, slots: nextSlots };

      }).then((ok) => {

        if (ok) renderCurrentItemOverlay();

      });

    };



    slotBtnWrap.append(btnRemove, btnAdd);

    slotHeader.append(slotCount, slotBtnWrap);

    content.appendChild(slotHeader);

    content.appendChild(applyAllRow);

  }

  content.appendChild(slotsList);



  const applyModeToAll = (mode: SlotScaleMode, refScale: number, refPct: number) => {

    slotsList

      .querySelectorAll<HTMLInputElement>('input[data-scale-mode-slot]')

      .forEach((chk) => {

        chk.checked = mode === "custom";

        (chk as any)._currentMode = mode;

      });

    slotsList

      .querySelectorAll<HTMLInputElement>('input[data-slot-idx]')

      .forEach((s) => {

        (s as any)._currentMode = mode;

        s.disabled = mode === "custom";

        s.style.opacity = mode === "custom" ? "0.45" : "1";

        if (mode === "percent") {

          s.value = String((s as any)._currentPct ?? refPct);

        }

      });

    slotsList

      .querySelectorAll<HTMLElement>('[data-slider-row-slot]')

      .forEach((row) => {

        row.style.display = mode === "custom" ? "none" : "";

        (row as any)._currentMode = mode;

      });

    slotsList

      .querySelectorAll<HTMLElement>('[data-custom-row-slot]')

      .forEach((row) => {

        row.style.display = mode === "custom" ? "flex" : "none";

        (row as any)._currentMode = mode;

      });

    slotsList

      .querySelectorAll<HTMLInputElement>('input[data-scale-input-slot]')

      .forEach((inp) => {

        if (mode === "custom") {

          inp.value = String((inp as any)._currentScale ?? refScale);

        }

      });

    slotsList

      .querySelectorAll<HTMLElement>('[data-size-label]')

      .forEach((lab) => {

        const pctVal = (lab as any)._currentPct ?? refPct;

        lab.textContent = mode === "custom" ? `${refScale.toFixed(2)}x` : `${pctVal}%`;

      });

    const map = currentItemSlotModes[modeKey] || {};

    for (let i = 0; i < slots.length; i++) map[i] = mode;

    currentItemSlotModes[modeKey] = map;

  };

}





function renderSideList() {
  if (!sideListWrap) return;
  const applySelectionStyle = (btn: HTMLButtonElement, selected: boolean) => {
    btn.style.border = "1px solid " + (selected ? "#4a6fa5" : "#2b3441");
    btn.style.background = selected ? "rgba(74,111,165,0.18)" : "rgba(24,30,39,0.9)";
    btn.style.fontWeight = selected ? "700" : "600";
  };

  const selectedId = getSelectedId();
  const entries = getSideEntries();
  const sig = `${currentSideMode}:${JSON.stringify(entries)}`;
  const existingList = sideListWrap.querySelector<HTMLDivElement>('[data-editor-side-list="list"]');

  if (existingList && existingList.dataset.sig === sig) {
    // Only update selection styles to avoid rerendering icons (prevents flicker).
    existingList.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach(btn => {
      applySelectionStyle(btn, btn.dataset.id === selectedId);
    });
    return;
  }

  sideListWrap.innerHTML = "";

  const list = document.createElement("div");
  list.dataset.editorSideList = "list";
  list.dataset.sig = sig;
  list.style.display = "grid";
  list.style.gap = "4px";

  const makeItem = (key: string, label: string, selected: boolean) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = key;
    Object.assign(btn.style, {
      width: "100%",
      display: "grid",
      gridTemplateColumns: "auto 1fr",
      alignItems: "center",
      gap: "8px",
      padding: "8px",
      borderRadius: "8px",
      color: "#e7eef7",
      cursor: "pointer",
    } as Partial<CSSStyleDeclaration>);
    applySelectionStyle(btn, selected);
    const _listKind = getSideSpriteKind();
    const _listCatalogEntry = _listKind !== "Decor" ? (plantCatalog as any)[key] : null;
    const _listSpriteKey = _listCatalogEntry?.crop?.sprite ?? _listCatalogEntry?.plant?.sprite ?? null;
    const icon = createSelectionIcon(
      _listKind === "Decor" ? "decor" : "plants",
      label,
      26,
      key,
      _listSpriteKey,
    );

    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    labelEl.style.textAlign = "left";
    labelEl.style.overflow = "hidden";
    labelEl.style.textOverflow = "ellipsis";
    labelEl.style.whiteSpace = "nowrap";

    btn.onclick = () => {
      setSelectedId(key);
      renderSideList();
      renderSideDetails();
    };
    btn.append(icon, labelEl);
    return btn;
  };

  for (const it of entries) {
    const isSelected = selectedId === it.id;
    list.appendChild(makeItem(it.id, it.label, isSelected));
  }

  if (!list.childElementCount) {
    const empty = document.createElement("div");
    empty.style.opacity = "0.7";
    empty.textContent = "No entries.";
    sideListWrap.appendChild(empty);
    return;
  }

  sideListWrap.appendChild(list);
}


function renderSideDetails() {

  if (!sideRightWrap) return;

  sideRightWrap.innerHTML = "";



  // zone centrale scrollable

  const content = document.createElement("div");

  content.style.display = "grid";

  content.style.gap = "10px";

  content.style.minHeight = "0";

  content.style.overflow = "auto";

  content.style.alignContent = "flex-start";

  content.style.justifyItems = "center";



  // barre d'action en bas (bouton fixe)

  const actionBar = document.createElement("div");

  actionBar.style.display = "grid";

  actionBar.style.gap = "6px";

  actionBar.style.justifyItems = "start";

  actionBar.style.marginTop = "4px";



  const selId = getSelectedId();



  if (!selId) {

    const empty = document.createElement("div");

    empty.style.opacity = "0.7";

    empty.style.textAlign = "center";

    empty.textContent = "Select an item on the left.";

    content.appendChild(empty);



    // pas de bouton si rien sÃ©lectionnÃ©

    sideRightWrap.append(content, actionBar);

    return;

  }



  const entry = getSideEntry(selId);

  const label = getSideEntryLabel(selId, entry);



  // bloc ic?ne + nom
  const infoRow = document.createElement("div");
  infoRow.style.display = "grid";
  infoRow.style.gridTemplateColumns = "auto 1fr";
  infoRow.style.alignItems = "center";
  infoRow.style.gap = "10px";
  infoRow.dataset.editorInfoRow = "true";
  infoRow.dataset.selId = selId;

  const existingInfo = sideRightWrap.querySelector<HTMLDivElement>('[data-editor-info-row]');
  const existingIcon = existingInfo?.querySelector<HTMLElement>('[data-editor-info-icon]');
  const existingLabel = existingInfo?.querySelector<HTMLElement>('[data-editor-info-label]');

  const icon =
    existingIcon && existingInfo?.dataset.selId === selId
      ? existingIcon
      : (() => {
          const _infoKind = getSideSpriteKind();
          const _infoCatalogEntry = _infoKind !== "Decor" ? (plantCatalog as any)[selId] : null;
          const _infoSpriteKey = _infoCatalogEntry?.crop?.sprite ?? _infoCatalogEntry?.plant?.sprite ?? null;
          const el = createSelectionIcon(
            _infoKind === "Decor" ? "decor" : "plants",
            label,
            48,
            selId,
            _infoSpriteKey,
          );
          el.dataset.editorInfoIcon = "true";
          return el;
        })();

  const nameEl = existingLabel && existingInfo?.dataset.selId === selId ? existingLabel : (() => {
    const el = document.createElement("div");
    el.dataset.editorInfoLabel = "true";
    el.style.fontWeight = "700";
    el.style.fontSize = "15px";
    el.style.whiteSpace = "nowrap";
    el.style.overflow = "hidden";
    el.style.textOverflow = "ellipsis";
    return el;
  })();
  nameEl.textContent = label;

  infoRow.append(icon, nameEl);
  content.appendChild(infoRow);



  // --- Slots config UI : uniquement pour les plantes ---

  if (currentSideMode === "plants") {

    const maxSlots = getMaxSlotsForSpecies(selId);



    const slotsState = ensureEditorStateForSpecies(selId);

    const slotsConfig = slotsState.slots;

    const applyAll = slotsState.applyAll;



    const slotsPanel = document.createElement("div");

    slotsPanel.style.display = "grid";

    slotsPanel.style.gap = "6px";

    slotsPanel.style.marginTop = "6px";

    slotsPanel.style.width = "100%";



    if (maxSlots > 1) {

      const headerRow = document.createElement("div");

      headerRow.style.display = "flex";

      headerRow.style.justifyContent = "space-between";

      headerRow.style.alignItems = "center";

      headerRow.style.fontSize = "12px";

      headerRow.style.opacity = "0.9";



      const headerLabel = document.createElement("span");

      headerLabel.textContent = "Slots";



      const headerRight = document.createElement("div");

      headerRight.style.display = "flex";

      headerRight.style.gap = "6px";

      headerRight.style.alignItems = "center";



      const countLabel = document.createElement("span");

      countLabel.textContent = `${slotsConfig.length}/${maxSlots}`;



      const btnAdd = document.createElement("button");

      btnAdd.type = "button";

      btnAdd.textContent = "+";

      Object.assign(btnAdd.style, {

        width: "28px",

        height: "28px",

        borderRadius: "50%",

        border: "1px solid #2b3441",

        background: "rgba(16,21,28,0.9)",

        color: "#e7eef7",

        cursor: "pointer",

        fontSize: "14px",

        fontWeight: "600",

      } as Partial<CSSStyleDeclaration>);



      btnAdd.onclick = () => {

        const state = ensureEditorStateForSpecies(selId);

        const current = state.slots;

        if (current.length >= maxSlots) return;

        const defaultScale = computeTargetScaleFromPercent(selId, 100);

        editorPlantSlotsState = {

          ...state,

          species: selId,

          slots: [

            ...current,

            {

              enabled: true,

              sizePercent: 100,

              customScale: defaultScale,

              sizeMode: "percent",

              mutations: [],

            },

          ],

        };



        renderSideDetails();

      };



      const btnRemove = document.createElement("button");

      btnRemove.type = "button";

      btnRemove.textContent = "-";

      Object.assign(btnRemove.style, {

        width: "28px",

        height: "28px",

        borderRadius: "50%",

        border: "1px solid #2b3441",

        background: "rgba(220,80,80,0.18)",

        color: "#e7eef7",

        cursor: "pointer",

        fontSize: "14px",

        fontWeight: "600",

      } as Partial<CSSStyleDeclaration>);



      btnRemove.onclick = () => {

        const state = ensureEditorStateForSpecies(selId);

        const current = state.slots;

        if (current.length <= 1) return;

        editorPlantSlotsState = {

          ...state,

          species: selId,

          slots: current.slice(0, current.length - 1),

        };

        renderSideDetails();

      };



      headerRight.append(countLabel, btnRemove, btnAdd);

      headerRow.append(headerLabel, headerRight);

      slotsPanel.appendChild(headerRow);

    }



    if (maxSlots > 1) {

      const applyAllRow = document.createElement("label");

      applyAllRow.style.display = "flex";

      applyAllRow.style.alignItems = "center";

      applyAllRow.style.gap = "6px";

      applyAllRow.style.fontSize = "12px";

      applyAllRow.style.opacity = "0.9";



      const applyToggle = document.createElement("input");

      applyToggle.type = "checkbox";

      applyToggle.checked = applyAll;

      applyToggle.onchange = () => {

        editorPlantSlotsState.applyAll = applyToggle.checked;

        renderSideDetails();

      };



      const applyLabel = document.createElement("span");

      applyLabel.textContent = "Edit all slots together";



      applyAllRow.append(applyToggle, applyLabel);

      slotsPanel.appendChild(applyAllRow);

    }



    const list = document.createElement("div");

    list.style.display = "grid";

    list.style.gap = "6px";



slotsConfig.forEach((cfg, idx) => {

  const slotBox = document.createElement("div");

  Object.assign(slotBox.style, {

    border: "1px solid #2c3643",

    borderRadius: "8px",

    padding: "8px",

    background: "rgba(10,14,20,0.9)",

    display: "grid",

    gap: "6px",

  } as Partial<CSSStyleDeclaration>);



  const initialPct = clampSizePercent(Number.isFinite(cfg.sizePercent as number) ? cfg.sizePercent : 100);

  const baseScaleFromPct = computeTargetScaleFromPercent(selId, initialPct);

  const initialCustomScale = normalizeCustomScale(

    selId,

    Number.isFinite(cfg.customScale as number) ? (cfg.customScale as number) : baseScaleFromPct

  );



  let currentMode: SlotScaleMode = cfg.sizeMode === "custom" ? "custom" : "percent";

  let currentPct = initialPct;

  let currentScale = currentMode === "custom" ? initialCustomScale : baseScaleFromPct;

  let percentMemory = currentPct; // garde la valeur du slider pour revenir sans Ãªtre Ã©crasÃ© par le custom

  let customText = String(currentScale);



  const sizeRow = document.createElement("div");

  sizeRow.style.display = "flex";

  sizeRow.style.justifyContent = "space-between";

  sizeRow.style.alignItems = "center";

  sizeRow.style.fontSize = "11px";

  sizeRow.style.opacity = "0.85";



  const sizeName = document.createElement("span");

  sizeName.textContent = "Size";



  const sizeValue = document.createElement("span");

  sizeValue.dataset.sizeLabel = String(idx);



  sizeRow.append(sizeName, sizeValue);



  const modeRow = document.createElement("label");

  modeRow.style.display = "flex";

  modeRow.style.alignItems = "center";

  modeRow.style.gap = "6px";

  modeRow.style.fontSize = "11px";

  modeRow.style.opacity = "0.9";



  const modeToggle = document.createElement("input");

  modeToggle.type = "checkbox";

  modeToggle.dataset.scaleMode = String(idx);

  modeToggle.checked = currentMode === "custom";



  const modeText = document.createElement("span");

  modeText.textContent = "Use custom scale";



  modeRow.append(modeToggle, modeText);



  const slider = document.createElement("input");

  slider.type = "range";

  slider.min = "50";

  slider.max = "100";

  slider.step = "1";

  slider.value = String(currentPct);

  slider.dataset.slotIdx = String(idx);

  Object.assign(slider.style, {

    width: "100%",

    cursor: "pointer",

  } as Partial<CSSStyleDeclaration>);



  const customRow = document.createElement("div");

  customRow.style.display = "flex";

  customRow.style.alignItems = "center";

  customRow.style.gap = "6px";

  customRow.style.fontSize = "11px";

  customRow.style.opacity = "0.9";

  customRow.dataset.customRow = String(idx);



  const customLabel = document.createElement("span");

  customLabel.textContent = "Custom scale";



  const customInput = document.createElement("input");

  customInput.type = "text";

  customInput.inputMode = "decimal";

  customInput.autocomplete = "off";

  customInput.value = customText;

  customInput.dataset.scaleInput = String(idx);

  Object.assign(customInput.style, {

    width: "90px",

    padding: "4px 6px",

    borderRadius: "6px",

    border: "1px solid #2c3643",

    background: "rgba(10,14,20,0.9)",

    color: "#e7eef7",

  } as Partial<CSSStyleDeclaration>);



  customRow.append(customLabel, customInput);



  // Bloque les hotkeys du jeu pendant la saisie, en s'alignant sur les inputs du menu.

  const installGameKeyBlocker = (inp: HTMLInputElement) => {

    const stop = (ev: Event) => {

      ev.stopImmediatePropagation?.();

      ev.stopPropagation();

    };

    const attach = () => {

      window.addEventListener("keydown", stop as any, true);

      window.addEventListener("keyup", stop as any, true);

    };

    const detach = () => {

      window.removeEventListener("keydown", stop as any, true);

      window.removeEventListener("keyup", stop as any, true);

    };

    inp.addEventListener("focus", attach);

    inp.addEventListener("blur", detach);

    inp.addEventListener("keydown", stop);

  };



  installGameKeyBlocker(customInput);



  const formatScaleLabel = (val: number) => `${val.toFixed(2)}x`;

  const formatScaleInput = (val: number) => val.toFixed(2);

  const parseInputNumber = (el: HTMLInputElement): number | null => {

    const raw = el.value;

    if (raw === "" || raw == null) return null;

    const normalized = raw.replace(",", ".").replace(/\s+/g, "");

    const n = Number(normalized);

    return Number.isFinite(n) ? n : null;

  };

  const installCharGuard = (inp: HTMLInputElement) => {

    const allowed = new Set(["0","1","2","3","4","5","6","7","8","9","-","."]);

    inp.addEventListener("keydown", (ev) => {

      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

      const k = ev.key;

      if (

        k === "Backspace" ||

        k === "Delete" ||

        k === "Tab" ||

        k === "Enter" ||

        k === "ArrowLeft" ||

        k === "ArrowRight" ||

        k === "ArrowUp" ||

        k === "ArrowDown" ||

        k === "Home" ||

        k === "End"

      ) {

        return;

      }

      if (k.length === 1 && !allowed.has(k)) {

        ev.preventDefault();

      }

    });

    inp.addEventListener("input", () => {

      const cleaned = inp.value.replace(/[^0-9.-]/g, "");

      if (cleaned !== inp.value) {

        inp.value = cleaned;

      }

      customText = inp.value;

    });

  };

  installCharGuard(customInput);



  const syncValueLabel = () => {

    sizeValue.textContent = currentMode === "custom" ? formatScaleLabel(currentScale) : `${currentPct}%`;

  };



  const syncControlState = () => {

    const showPercentMode = currentMode !== "custom";

    slider.disabled = currentMode === "custom";

    slider.style.opacity = currentMode === "custom" ? "0.45" : "1";

    customInput.disabled = currentMode !== "custom";

    customInput.style.opacity = currentMode === "custom" ? "1" : "0.5";

    slider.style.display = showPercentMode ? "" : "none";

    customRow.style.display = showPercentMode ? "none" : "flex";

  };



  const syncApplyAll = () => {

    if (!applyAll || !sideRightWrap) return;

    const showPercentMode = currentMode !== "custom";



    sideRightWrap

      .querySelectorAll<HTMLInputElement>('input[data-slot-idx]')

      .forEach((s) => {

        s.value = String(currentPct);

        s.disabled = currentMode === "custom";

        s.style.opacity = currentMode === "custom" ? "0.45" : "1";

        s.style.display = showPercentMode ? "" : "none";

      });



    sideRightWrap

      .querySelectorAll<HTMLInputElement>('input[data-scale-input]')

      .forEach((inp) => {

        if (currentMode === "custom") {

          inp.value = customText;

        } else {

          inp.value = formatScaleInput(currentScale);

        }

        inp.disabled = currentMode !== "custom";

        inp.style.opacity = currentMode === "custom" ? "1" : "0.5";

      });



    sideRightWrap

      .querySelectorAll<HTMLInputElement>('input[data-scale-mode]')

      .forEach((chk) => {

        chk.checked = currentMode === "custom";

      });



    sideRightWrap

      .querySelectorAll<HTMLElement>('[data-size-label]')

      .forEach((lab) => {

        lab.textContent = currentMode === "custom" ? formatScaleLabel(currentScale) : `${currentPct}%`;

      });



    sideRightWrap

      .querySelectorAll<HTMLElement>('[data-scale-row]')

      .forEach((row) => {

        row.remove();

      });



    sideRightWrap

      .querySelectorAll<HTMLElement>('[data-custom-row]')

      .forEach((row) => {

        row.style.display = showPercentMode ? "none" : "flex";

      });

  };



  const applySlotPatch = (patch: Partial<EditorPlantSlotConfig>) => {

    const base = ensureEditorStateForSpecies(selId).slots;

    editorPlantSlotsState = {

      ...editorPlantSlotsState,

      species: selId,

      slots: base.map((c, i) => {

        if (!applyAll && i !== idx) return c;

        return { ...c, sizeMode: currentMode, ...patch };

      }),

    };

  };



  const updatePercent = (nextPct: number) => {

    const pct = clampSizePercent(nextPct);

    currentPct = pct;

    percentMemory = pct;

    slider.value = String(pct);

    if (currentMode !== "custom") {

      currentScale = computeTargetScaleFromPercent(selId, pct);

    }



    applySlotPatch({

      sizePercent: pct,

      ...(currentMode !== "custom" ? { customScale: currentScale } : {}),

    });



    syncValueLabel();

    syncApplyAll();

  };



  const updateCustomScale = (nextScale: number, rawText?: string) => {

    const normalized = normalizeCustomScale(selId, nextScale);

    currentScale = normalized;

    if (typeof rawText === "string") customText = rawText;

    else customText = customInput.value;



    applySlotPatch({ customScale: normalized });



    syncValueLabel();

    syncApplyAll();

  };



  slider.oninput = () => {

    updatePercent(Number(slider.value));

  };



  customInput.oninput = () => {

    const raw = customInput.value;

    customText = raw;

    const n = parseInputNumber(customInput);

    if (n == null) return;

    updateCustomScale(n, raw);

  };



  modeToggle.onchange = () => {

    currentMode = modeToggle.checked ? "custom" : "percent";



    if (currentMode === "custom") {

      percentMemory = currentPct;

      currentScale = normalizeCustomScale(selId, currentScale || computeTargetScaleFromPercent(selId, currentPct));

      customText = customInput.value || String(currentScale);

      applySlotPatch({ customScale: currentScale });

    } else {

      const restoredPct = clampSizePercent(percentMemory);

      currentPct = restoredPct;

      slider.value = String(restoredPct);

      applySlotPatch({ sizePercent: restoredPct });

    }



    syncControlState();

    syncValueLabel();

    syncApplyAll();

  };



  syncControlState();

  syncValueLabel();



// --- Mutations : bouton + + liste deroulante ---

  const mutWrap = document.createElement("div");

  mutWrap.style.display = "grid";

  mutWrap.style.gap = "6px";



  const mutTitle = document.createElement("div");

  mutTitle.textContent = "Mutations";

  mutTitle.style.fontSize = "11px";

  mutTitle.style.opacity = "0.85";



  const toggleMutBtn = document.createElement("button");

  toggleMutBtn.type = "button";

  toggleMutBtn.textContent = "+";

  Object.assign(toggleMutBtn.style, {

    width: "28px",

    height: "28px",

    borderRadius: "50%",

    border: "1px solid #2c3643",

    background: "rgba(10,14,20,0.9)",

    color: "#e7eef7",

    fontWeight: "900",

    fontSize: "16px",

    cursor: "pointer",

    display: "inline-flex",

    alignItems: "center",

    justifyContent: "center",

  } as Partial<CSSStyleDeclaration>);



  const activeRow = document.createElement("div");

  activeRow.style.display = "flex";

  activeRow.style.flexWrap = "wrap";

  activeRow.style.gap = "6px";

  activeRow.style.alignItems = "center";



  const mutDropdown = document.createElement("div");

  mutDropdown.style.display = "none";

  mutDropdown.style.gridTemplateColumns = "repeat(auto-fill, minmax(90px, 1fr))";

  mutDropdown.style.gap = "6px";

  mutDropdown.style.padding = "6px";

  mutDropdown.style.border = "1px solid #2c3643";

  mutDropdown.style.borderRadius = "8px";

  mutDropdown.style.background = "rgba(8,12,18,0.9)";



  const mutationKeys = Object.keys(mutationCatalog || {});



  const renderActiveTags = () => {

    activeRow.innerHTML = "";

    const active = Array.isArray(cfg.mutations) ? cfg.mutations : [];

    const allKeys = mutationKeys.map((k) => (k === "Amberlit" ? "Ambershine" : k));

    const allSelected = allKeys.every((k) => active.includes(k));

    // tags first, then the + button to keep order like "R +"



    const styleLetter = (target: HTMLElement, mutId: string) => {

      const color = mutationColorMap[mutId];

      if (!color) return;

      if (color.startsWith("linear-gradient")) {

        target.style.backgroundImage = color;

        target.style.backgroundClip = "text";

        (target.style as any).webkitBackgroundClip = "text";

        target.style.color = "transparent";

        (target.style as any).webkitTextFillColor = "transparent";

      } else {

        target.style.color = color;

      }

    };



    const getLetter = (mutId: string) => {

      const def = (mutationCatalog as any)[mutId] || {};

      const src = def.name || mutId || "?";

      return String(src).charAt(0).toUpperCase();

    };



    for (const mutId of active) {

      const tag = document.createElement("span");

      Object.assign(tag.style, {

        borderRadius: "999px",

        padding: "3px 8px",

        fontSize: "11px",

        fontWeight: "700",

        border: "1px solid #2c3643",

        background: "rgba(10,14,20,0.9)",

        cursor: "pointer",

      } as Partial<CSSStyleDeclaration>);



      const letterSpan = document.createElement("span");

      letterSpan.textContent = getLetter(mutId);

      letterSpan.style.fontWeight = "900";

      styleLetter(letterSpan, mutId);



      tag.title = "Remove mutation";

      tag.onclick = () => {

        const base = ensureEditorStateForSpecies(selId).slots;



        editorPlantSlotsState = {

          ...editorPlantSlotsState,

          species: selId,

          slots: applyAll

            ? base.map((c) => {

                const prev = Array.isArray(c.mutations) ? c.mutations : [];

                const next = prev.filter((m) => m !== mutId);

                return { ...c, mutations: next };

              })

            : base.map((c, i) => {

                if (i !== idx) return c;

                const prev = Array.isArray(c.mutations) ? c.mutations : [];

                const next = prev.filter((m) => m !== mutId);

                return { ...c, mutations: next };

              }),

        };



        renderSideDetails();

      };



      tag.appendChild(letterSpan);

      activeRow.appendChild(tag);

    }

    if (!allSelected) {

      activeRow.appendChild(toggleMutBtn);

    }

  };



  const setDropdownOpen = (open: boolean) => {

    mutDropdown.style.display = open ? "grid" : "none";

    toggleMutBtn.style.background = open

      ? "rgba(32,42,56,0.8)"

      : "rgba(10,14,20,0.9)";

  };



  toggleMutBtn.onclick = () => {

    const isOpen = mutDropdown.style.display !== "none";

    setDropdownOpen(!isOpen);

  };



  for (const mutKey of mutationKeys) {

    const def = (mutationCatalog as any)[mutKey] || {};

    const storedId = mutKey === "Amberlit" ? "Ambershine" : mutKey;

    const isActive = Array.isArray(cfg.mutations) && cfg.mutations.includes(storedId);

    if (isActive) continue;



    const btn = document.createElement("button");

    btn.type = "button";

    btn.textContent = def.name || mutKey || "?";

    Object.assign(btn.style, {

      padding: "6px 8px",

      borderRadius: "8px",

      border: isActive ? "1px solid #55d38a" : "1px solid #2c3643",

      background: isActive ? "rgba(85,211,138,0.22)" : "rgba(10,14,20,0.9)",

      color: "#e7eef7",

      fontSize: "11px",

      fontWeight: "700",

      cursor: "pointer",

      textAlign: "left",

    } as Partial<CSSStyleDeclaration>);



    const color = mutationColorMap[storedId];

    if (color) {

      btn.style.color = color.startsWith("linear-gradient") ? "#e7eef7" : color;

      if (color.startsWith("linear-gradient")) {

        btn.style.backgroundImage = color;

        btn.style.backgroundClip = "text";

        (btn.style as any).webkitBackgroundClip = "text";

        btn.style.color = "transparent";

        (btn.style as any).webkitTextFillColor = "transparent";

      }

    }



    btn.onclick = () => {

      const base = ensureEditorStateForSpecies(selId).slots;

      editorPlantSlotsState = {

        ...editorPlantSlotsState,

        species: selId,

        slots: applyAll

          ? base.map((c) => {

              const prev = Array.isArray(c.mutations) ? c.mutations : [];

              const has = prev.includes(storedId);

              const next = has ? prev.filter((x) => x !== storedId) : [...prev, storedId];

              return { ...c, mutations: next };

            })

          : base.map((c, i) => {

              if (i !== idx) return c;

              const prev = Array.isArray(c.mutations) ? c.mutations : [];

              const has = prev.includes(storedId);

              const next = has ? prev.filter((x) => x !== storedId) : [...prev, storedId];

              return { ...c, mutations: next };

            }),

      };

      renderSideDetails();

    };



    mutDropdown.appendChild(btn);

  }



  mutWrap.append(mutTitle, activeRow, mutDropdown);

  renderActiveTags();

  setDropdownOpen(false);



  slotBox.append(sizeRow, modeRow, slider, customRow, mutWrap);

  list.appendChild(slotBox);

});







slotsPanel.appendChild(list);

    content.appendChild(slotsPanel);

  }

  // --- fin slots UI ---



  // bouton Add to inventory (fixÃ© en bas)

  const btn = document.createElement("button");

  btn.type = "button";

  btn.textContent = "Add to inventory";

  Object.assign(btn.style, {

    width: "100%",

    padding: "8px 10px",

    borderRadius: "8px",

    border: "1px solid #2b3441",

    background: "linear-gradient(180deg, rgba(42,154,255,0.12), rgba(30,91,181,0.35))",

    color: "#e7eef7",

    fontWeight: "700",

    cursor: "pointer",

  } as Partial<CSSStyleDeclaration>);

  btn.onclick = () => {

    console.log("[EditorService] addSelectedItemToInventory click", {

      mode: currentSideMode,

      id: selId,

    });

    void addSelectedItemToInventory();

  };

  actionBar.appendChild(btn);



  sideRightWrap.append(content, actionBar);

}





/* -------------------------------------------------------------------------- */

/* Slot helpers                                                               */

/* -------------------------------------------------------------------------- */



type SlotMatch = {

  isArray: boolean;

  matchSlot: any;

  matchIndex: number;

  entries: Array<[string, any]> | null;

  slotsArray: any[] | null;

};



function compareSlotKeys(a: string, b: string): number {

  const ai = Number(a);

  const bi = Number(b);

  if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;

  return a.localeCompare(b);

}



function findPlayerSlot(

  slots: any,

  playerId: string,

  opts: { sortObject?: boolean } = {}

): SlotMatch | null {

  if (!slots || typeof slots !== "object") return null;



  const isMatch = (slot: any) => slot && String(slot.playerId || slot.id || "") === String(playerId);



  if (Array.isArray(slots)) {

    const arr = slots as any[];

    for (let i = 0; i < arr.length; i++) {

      if (isMatch(arr[i])) {

        return { isArray: true, matchSlot: arr[i], matchIndex: i, entries: null, slotsArray: arr };

      }

    }

    return null;

  }



  const entries = Object.entries(slots as Record<string, any>);

  if (opts.sortObject) entries.sort(([a], [b]) => compareSlotKeys(a, b));



  for (let i = 0; i < entries.length; i++) {

    const [, s] = entries[i];

    if (isMatch(s)) {

      return { isArray: false, matchSlot: s, matchIndex: i, entries, slotsArray: null };

    }

  }



  return null;

}



function slotMatchToIndex(meta: SlotMatch): number {

  if (meta.isArray) return meta.matchIndex;

  const entry = meta.entries?.[meta.matchIndex];

  const k = entry ? entry[0] : null;

  const n = Number(k);

  return Number.isFinite(n) ? n : 0;

}



function rebuildUserSlots(meta: SlotMatch, buildSlot: (slot: any) => any): any {

  if (meta.isArray) {

    const nextSlots = (meta.slotsArray || []).slice();

    nextSlots[meta.matchIndex] = buildSlot(meta.matchSlot);

    return nextSlots;

  }



  const nextEntries = (meta.entries || []).map(([k, s], idx) =>

    idx === meta.matchIndex ? [k, buildSlot(s)] : [k, s]

  );

  return Object.fromEntries(nextEntries);

}



function buildStateWithUserSlots(cur: any, userSlots: any) {

  return {

    ...(cur || {}),

    child: {

      ...(cur?.child || {}),

      data: {

        ...(cur?.child?.data || {}),

        userSlots,

      },

    },

  };

}



/* -------------------------------------------------------------------------- */

/* Helpers for writing while atoms are patched                                */

/* -------------------------------------------------------------------------- */



async function withPatchedWrite(patch: StatePatch | null, op: () => Promise<void>) {

  if (!patch) {

    await op();

    return;

  }

  const { atom, readKey, origRead, writeKey, origWrite } = patch;

  const savedRead = (atom as any)[readKey];

  const savedWrite = writeKey ? (atom as any)[writeKey] : undefined;

  try {

    (atom as any)[readKey] = origRead;

    if (writeKey && origWrite) (atom as any)[writeKey] = origWrite;

    await op();

  } finally {

    (atom as any)[readKey] = savedRead;

    if (writeKey) (atom as any)[writeKey] = savedWrite;

  }

}



async function setStateAtom(next: any) {

  console.log("[EditorService] setStateAtom attempt", {

    hasPatch: !!statePatch,

  });

  await withPatchedWrite(statePatch, async () => {

    try {

      await Atoms.root.state.set(next);

      console.log("[EditorService] setStateAtom success");

    } catch (err) {

      console.log("[EditorService] setStateAtom failed", err);

      throw err;

    }

  });

}



async function addSelectedItemToInventory() {

  const selId = getSelectedId();

  if (!selId) return;

  if (currentSideMode === "decor") {

    console.log("[EditorService] addSelectedItemToInventory decor", selId);

    await addDecorToInventory(selId);

  } else {

    console.log("[EditorService] addSelectedItemToInventory plant", selId);

    await addPlantToInventory(selId);

  }

}



async function removeSelectedInventoryItem(): Promise<boolean> {

  try {

    const pid = await getPlayerId();

    if (!pid) return false;



    const selectedIndex = await Atoms.inventory.myValidatedSelectedItemIndex.get();

    const inventoryVal = await Atoms.inventory.myInventory.get();

    const items = Array.isArray(inventoryVal?.items) ? inventoryVal.items.slice() : [];

    if (

      selectedIndex == null ||

      typeof selectedIndex !== "number" ||

      selectedIndex < 0 ||

      selectedIndex >= items.length

    ) {

      return false;

    }



    items.splice(selectedIndex, 1);



    const cur = (stateFrozenValue ?? (await Atoms.root.state.get())) as any;

    const slots = cur?.child?.data?.userSlots;

    const slotMatch = findPlayerSlot(slots, pid);

    if (!slotMatch) return false;



    const slotData = (slotMatch.matchSlot as any)?.data || {};

    const slotInv = slotData.inventory || {};

    const favorited = Array.isArray(slotInv.favoritedItemIds)

      ? slotInv.favoritedItemIds.filter((id: any) => items.some((it: any) => it?.id === id))

      : undefined;



    const nextUserSlots = rebuildUserSlots(slotMatch, (slot) => {

      const data = slot?.data || {};

      return {

        ...(slot || {}),

        data: {

          ...data,

          inventory: {

            ...(slotInv || {}),

            items,

            ...(favorited ? { favoritedItemIds: favorited } : {}),

          },

        },

      };

    });



    const nextState = buildStateWithUserSlots(cur, nextUserSlots);

    stateFrozenValue = nextState;

    stateOriginalValue = nextState;

    await setStateAtom(nextState);



    const newIdx = Math.max(0, Math.min(items.length - 1, selectedIndex));

    try {

      await Atoms.inventory.myValidatedSelectedItemIndex.set(newIdx);

    } catch {

      /* ignore */

    }



    return true;

  } catch (err) {

    console.log("[EditorService] removeSelectedInventoryItem failed", err);

    return false;

  }

}



async function addTileObjectToInventory(tileObject: any): Promise<boolean> {

  try {

    const pid = await getPlayerId();

    if (!pid || !tileObject) return false;



    const cur = (stateFrozenValue ?? (await Atoms.root.state.get())) as any;

    const slots = cur?.child?.data?.userSlots;

    const slotMatch = findPlayerSlot(slots, pid);

    if (!slotMatch) return false;



    const slotData = (slotMatch.matchSlot as any)?.data || {};

    const inv = slotData.inventory;

    const items = Array.isArray(inv?.items) ? inv.items.slice() : [];



    if (tileObject.objectType === "plant") {

      const plantItem = {

        itemType: "Plant",

        species: tileObject.species,

        id: tileObject.id,

        slots: Array.isArray(tileObject.slots) ? JSON.parse(JSON.stringify(tileObject.slots)) : [],

        plantedAt: tileObject.plantedAt,

        maturedAt: tileObject.maturedAt,

      };

      items.push(plantItem);

    } else if (tileObject.objectType === "decor") {

      items.push({

        itemType: "Decor",

        decorId: tileObject.decorId,

        quantity: 1,

        rotation: typeof tileObject.rotation === "number" ? tileObject.rotation : 0,

      });

    } else {

      return false;

    }



    const slotInv = slotData.inventory || {};

    const nextUserSlots = rebuildUserSlots(slotMatch, (slot) => {

      const data = slot?.data || {};

      return {

        ...(slot || {}),

        data: {

          ...data,

          inventory: { ...(slotInv || {}), items },

        },

      };

    });



    const nextState = buildStateWithUserSlots(cur, nextUserSlots);

    stateFrozenValue = nextState;

    stateOriginalValue = nextState;

    await setStateAtom(nextState);



    try {

      await Atoms.inventory.myValidatedSelectedItemIndex.set(items.length - 1);

    } catch {

      /* ignore */

    }



    return true;

  } catch (err) {

    console.log("[EditorService] addTileObjectToInventory failed", err);

    return false;

  }

}



async function addDecorToInventory(decorId: string) {

  try {

    console.log("[EditorService] addDecorToInventory", decorId);



    const pid = await getPlayerId();

    if (!pid) {

      console.log("[EditorService] addDecorToInventory: no playerId");

      return;

    }



    const cur = (stateFrozenValue ?? (await Atoms.root.state.get())) as any;

    const slots = cur?.child?.data?.userSlots;



    if (!slots || typeof slots !== "object") {

      console.log("[EditorService] addDecorToInventory: no userSlots");

      return;

    }



    const slotMatch = findPlayerSlot(slots, pid);

    if (!slotMatch) {

      console.log("[EditorService] addDecorToInventory: player slot not found");

      return;

    }



    const slotData = (slotMatch.matchSlot as any).data || {};

    const inv = slotData.inventory;

    const items = Array.isArray(inv?.items) ? inv.items.slice() : [];



    console.log("[EditorService] decor before add", { itemsLen: items.length });



    items.push({

      itemType: "Decor",

      decorId,

      quantity: 1,

    });



    const nextUserSlots = rebuildUserSlots(slotMatch, (slot) => {

      const slotDataInner = slot?.data || {};

      const slotInv = slotDataInner.inventory;

      return {

        ...(slot || {}),

        data: {

          ...slotDataInner,

          inventory: { ...(slotInv || {}), items },

        },

      };

    });



    const next = buildStateWithUserSlots(cur, nextUserSlots);



    // trÃ¨s important : ce quâon fige et ce quâon restaurera = Ã©tat modifiÃ©

    stateFrozenValue = next;

    stateOriginalValue = next;



    try {

      await setStateAtom(next);

    } catch (err) {

      console.log("[EditorService] stateAtom set failed (decor)", err);

    }



    console.log("[EditorService] decor after add", { itemsLen: items.length });

    console.log("[EditorService] decor added", { decorId });

  } catch (err) {

    console.log("[EditorService] failed to add decor", err);

  }

}





async function addPlantToInventory(species: string) {

  try {

    console.log("[EditorService] addPlantToInventory", species);



    const pid = await getPlayerId();

    if (!pid) {

      console.log("[EditorService] addPlantToInventory: no playerId");

      return;

    }



    const cur = (stateFrozenValue ?? (await Atoms.root.state.get())) as any;

    const slots = cur?.child?.data?.userSlots;



    if (!slots || typeof slots !== "object") {

      console.log("[EditorService] addPlantToInventory: no userSlots");

      return;

    }



    const slotMatch = findPlayerSlot(slots, pid);

    if (!slotMatch) {

      console.log("[EditorService] addPlantToInventory: player slot not found");

      return;

    }



    const slotData = (slotMatch.matchSlot as any).data || {};

    const inv = slotData.inventory;

    const items = Array.isArray(inv?.items) ? inv.items.slice() : [];



    const entry = (plantCatalog as Record<string, any>)?.[species] ?? {};

    const plantDef = entry?.plant ?? {};



    const isMultipleHarvest = plantDef?.harvestType === "Multiple";



    console.log("[EditorService] plant before add", { itemsLen: items.length, isMultipleHarvest });



    // NB: getMaxSlotsForSpecies doit dÃ©jÃ  respecter plantDef.slotOffsets pour les Multiple

    const maxSlots = getMaxSlotsForSpecies(species);



    // on rÃ©cupÃ¨re/configure les slots pour cette espÃ¨ce

    const slotsConfig =

      editorPlantSlotsState.species === species

        ? editorPlantSlotsState.slots.slice(0, maxSlots)

        : ensureEditorSlotsForSpecies(species).slice(0, maxSlots);



    const slotsArr: any[] = [];



    for (const cfg of slotsConfig) {

      if (!cfg.enabled) continue; // tu peux aussi virer cette condition si tout est toujours "enabled"



      const targetScale = resolveSlotTargetScale(species, cfg);



      const mutations = Array.isArray(cfg.mutations) ? cfg.mutations.slice() : [];



      slotsArr.push({

        species,

        startTime: 1760866288723,

        endTime: 1760867858782,

        targetScale,

        mutations,

      });

    }







    // Nombre rÃ©el de slots crÃ©Ã©s (et pas juste le max thÃ©orique)

    const slotCount = slotsArr.length;



    const newItem: any = {

      id:

        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"

          ? crypto.randomUUID()

          : `plant-${Math.random().toString(16).slice(2)}`),

      itemType: "Plant",

      species,

      slots: slotsArr,

      plantedAt: 1760779438723,

      maturedAt: 1760865838723,

    };



    // Pour les plantes *non* multiple-harvest, on garde un name

    if (!isMultipleHarvest) {

      newItem.name = entry?.crop?.name ?? plantDef?.name ?? species;

    }



    items.push(newItem);



    const nextUserSlots = rebuildUserSlots(slotMatch, (slot) => {

      const slotDataInner = slot?.data || {};

      const slotInv = slotDataInner.inventory;

      return {

        ...(slot || {}),

        data: {

          ...slotDataInner,

          inventory: { ...(slotInv || {}), items },

        },

      };

    });



    const next = buildStateWithUserSlots(cur, nextUserSlots);



    stateFrozenValue = next;

    stateOriginalValue = next;



    try {

      await setStateAtom(next);

    } catch (err) {

      console.log("[EditorService] stateAtom set failed (plant)", err);

    }



    console.log("[EditorService] plant after add", { itemsLen: items.length + 1 });

    console.log("[EditorService] plant added", {

      species,

      isMultipleHarvest,

      slotCount,

    });

  } catch (err) {

    console.log("[EditorService] failed to add plant", err);

  }

}









function notify(enabled: boolean) {

  listeners.forEach((cb) => {

    try {

      cb(enabled);

    } catch {

      /* ignore */

    }

  });

}



function applyState(enabled: boolean, opts: { persist?: boolean; emit?: boolean } = {}) {

  const next = !!enabled;

  const changed = next !== currentEnabled;



  if (next && overlaysVisible) showOverlay();

  else hideOverlay();

  if (next && overlaysVisible) showSideOverlay();

  else hideSideOverlay();

  if (next && overlaysVisible) showCurrentItemOverlay();

  else hideCurrentItemOverlay();



  if (next && !currentEnabled) {

    void logGardenTilesForEditor();

    // 1) Snapshot/clear TOS garden so we can edit freely

    void snapshotAndClearGardenForEditor();

    // 2) Freeze jotai state (clears inventory, pets, garden in stateAtom)

    void freezeStateAtom();

  } else if (!next && currentEnabled) {

    // 1) Restore TOS garden snapshot

    void restoreGardenSnapshotForEditor();

    // 2) Unfreeze jotai state to original values

    void unfreezeStateAtom();

  }



  currentEnabled = next;

  if (opts.persist !== false) persist(next);

  if (changed && opts.emit !== false) notify(next);

}



export const EditorService = {

  init() {

    installEditorKeybindsOnce();

    applyState(currentEnabled, { persist: false, emit: false });

  },



  isEnabled(): boolean {

    return currentEnabled;

  },



  setEnabled(enabled: boolean) {

    applyState(enabled, { persist: true, emit: true });

  },



  onChange(listener: Listener): () => void {

    listeners.add(listener);

    return () => listeners.delete(listener);

  },



  onSavedGardensChange(listener: SavedGardensListener): () => void {

    savedGardensListeners.add(listener);

    return () => savedGardensListeners.delete(listener);

  },

};



/* -------------------------------------------------------------------------- */

/* Garden helpers                                                             */

/* -------------------------------------------------------------------------- */



const EMPTY_GARDEN: GardenState = { tileObjects: {}, boardwalkTileObjects: {} };



function isGardenEmpty(val: any): boolean {

  const tiles = val?.tileObjects;

  const boards = val?.boardwalkTileObjects;

  const isEmptyObj = (o: any) => o && typeof o === "object" && Object.keys(o).length === 0;

  return isEmptyObj(tiles) && isEmptyObj(boards);

}



function makeEmptyGarden(): GardenState {

  return { ...EMPTY_GARDEN };

}



type SavedGarden = {

  id: string;

  name: string;

  createdAt: number;

  garden: GardenState;

};



function sanitizeGarden(val: any): GardenState {

  const tileObjects = val && typeof val === "object" && typeof val.tileObjects === "object" ? val.tileObjects : {};

  const boardwalkTileObjects =

    val && typeof val === "object" && typeof val.boardwalkTileObjects === "object"

      ? val.boardwalkTileObjects

      : {};

  return {

    tileObjects: { ...tileObjects },

    boardwalkTileObjects: { ...boardwalkTileObjects },

  };

}



function rewriteGardenSlotTimes(garden: GardenState, startTime: number, endTime: number): GardenState {

  const rewriteSlots = (slots: any) => {

    if (!Array.isArray(slots)) return [];

    return slots.map((s) => ({

      ...(s || {}),

      startTime,

      endTime,

    }));

  };



  const rewriteTileMap = (map: Record<string, any>) => {

    const next: Record<string, any> = {};

    for (const [k, v] of Object.entries(map || {})) {

      if (v && typeof v === "object" && v.objectType === "plant") {

        next[k] = { ...v, slots: rewriteSlots((v as any).slots) };

      } else {

        next[k] = v;

      }

    }

    return next;

  };



  return {

    tileObjects: rewriteTileMap(garden.tileObjects || {}),

    boardwalkTileObjects: rewriteTileMap(garden.boardwalkTileObjects || {}),

  };

}



function readSavedGardens(): SavedGarden[] {

  try {

    const parsed = readAriesPath<unknown>(ARIES_SAVED_GARDENS_PATH);

    const arr = Array.isArray(parsed) ? parsed : [];

    return arr

      .map((g) => ({

        id: String((g as any)?.id || ""),

        name: String((g as any)?.name || "Untitled"),

        createdAt: Number((g as any)?.createdAt) || Date.now(),

        garden: sanitizeGarden((g as any)?.garden || {}),

      }))

      .filter((g) => !!g.id);

  } catch {

    return [];

  }

}



function writeSavedGardens(list: SavedGarden[]) {

  try {

    writeAriesPath(ARIES_SAVED_GARDENS_PATH, list || []);

  } catch {

    /* ignore */

    return;

  }

  notifySavedGardensChanged();

}



async function getCurrentGarden(): Promise<GardenState | null> {

  try {

    const pid = await getPlayerId();

    if (!pid) return null;

    return await getGardenForPlayer(pid);

  } catch {

    return null;

  }

}



async function getGardenForPlayer(playerId: string): Promise<GardenState | null> {

  try {

    if (!playerId) return null;

    const cur = (stateFrozenValue ?? (await Atoms.root.state.get())) as any;

    const slots = cur?.child?.data?.userSlots;

    const slotMatch = findPlayerSlot(slots, playerId, { sortObject: true });

    if (!slotMatch || !slotMatch.matchSlot) return null;

    const g = slotMatch.matchSlot?.data?.garden;

    return sanitizeGarden(g || {});

  } catch {

    return null;

  }

}



async function setCurrentGarden(nextGarden: GardenState): Promise<boolean> {

  try {

    const pid = await getPlayerId();

    if (!pid) return false;

    const cur = (stateFrozenValue ?? (await Atoms.root.state.get())) as any;

    const slots = cur?.child?.data?.userSlots;

    const slotMatch = findPlayerSlot(slots, pid, { sortObject: true });

    if (!slotMatch || !slotMatch.matchSlot) return false;



    const userSlotIdx = slotMatchToIndex(slotMatch);



    const updatedSlot = {

      ...(slotMatch.matchSlot as any),

      data: {

        ...(slotMatch.matchSlot?.data || {}),

        garden: sanitizeGarden(nextGarden),

      },

    };



    const nextUserSlots = rebuildUserSlots(slotMatch, () => updatedSlot);

    const nextState = buildStateWithUserSlots(cur, nextUserSlots);



    stateFrozenValue = nextState;

    stateOriginalValue = nextState;

    await setStateAtom(nextState);



    // Apply to TOS for visual sync

    try {

      await applyGardenToTos(nextGarden, userSlotIdx);

    } catch {

      /* ignore */

    }

    return true;

  } catch (err) {

    console.log("[EditorService] setCurrentGarden failed", err);

    return false;

  }

}



async function applyFriendGardenPreview(garden: GardenState | null): Promise<boolean> {

  if (!garden || typeof garden !== "object") return false;

  try {

    const pid = await getPlayerId();

    if (!pid) return false;

    const cur = await Atoms.root.state.get().catch(() => null) as any;

    if (!cur) return false;

    const slots = cur?.child?.data?.userSlots;

    const slotMatch = findPlayerSlot(slots, pid, { sortObject: true });

    if (!slotMatch || !slotMatch.matchSlot) return false;

    const userSlotIdx = slotMatchToIndex(slotMatch);



    const prevGarden = slotMatch.matchSlot?.data?.garden

      ? sanitizeGarden(slotMatch.matchSlot.data.garden)

      : makeEmptyGarden();

    friendGardenBackup = { garden: prevGarden, userSlotIdx };



    const updatedSlot = {

      ...(slotMatch.matchSlot as any),

      data: {

        ...(slotMatch.matchSlot?.data || {}),

        garden: sanitizeGarden(garden),

      },

    };



    const nextUserSlots = rebuildUserSlots(slotMatch, () => updatedSlot);

    const nextState = buildStateWithUserSlots(cur, nextUserSlots);



    await setStateAtom(nextState);

    try { await applyGardenToTos(garden, userSlotIdx); } catch {}

    friendGardenPreviewActive = true;

    return true;

  } catch (error) {

    console.error("[EditorService] applyFriendGardenPreview failed", error);

    friendGardenPreviewActive = false;

    return false;

  }

}



async function clearFriendGardenPreview(): Promise<boolean> {

  if (!friendGardenPreviewActive) return false;

  friendGardenPreviewActive = false;

  try {

    const backup = friendGardenBackup;

    friendGardenBackup = null;

    if (backup) {

      const pid = await getPlayerId();

      if (pid) {

        const cur = await Atoms.root.state.get().catch(() => null) as any;

        const slots = cur?.child?.data?.userSlots;

        const slotMatch = findPlayerSlot(slots, pid, { sortObject: true });

        if (slotMatch && slotMatch.matchSlot) {

          const updatedSlot = {

            ...(slotMatch.matchSlot as any),

            data: {

              ...(slotMatch.matchSlot?.data || {}),

              garden: sanitizeGarden(backup.garden),

            },

          };

          const nextUserSlots = rebuildUserSlots(slotMatch, () => updatedSlot);

          const nextState = buildStateWithUserSlots(cur, nextUserSlots);

          await setStateAtom(nextState);

          try { await applyGardenToTos(backup.garden, backup.userSlotIdx); } catch {}

        }

      }

    }

    return true;

  } catch (error) {

    console.error("[EditorService] clearFriendGardenPreview failed", error);

    return false;

  }

}



function listSavedGardens(): SavedGarden[] {

  return readSavedGardens();

}



async function saveCurrentGarden(name: string, playerId?: string | null): Promise<SavedGarden | null> {

  const pid = playerId || (await getPlayerId());

  if (!pid) return null;

  const garden = await getGardenForPlayer(pid);

  if (!garden) return null;

  const now = Date.now();

  const all = readSavedGardens();

  const baseName = name?.trim() || "Untitled";



  const makeUniqueName = (base: string, existing: string[]) => {

    let idx = 1;

    let candidate = base;

    const set = new Set(existing);

    while (set.has(candidate)) {

      candidate = `${base} (${idx})`;

      idx += 1;

    }

    return candidate;

  };



  const existingIdx = all.findIndex((g) => g.name === baseName);

  let finalName = baseName;

  let reuseId: string | null = null;



  if (existingIdx >= 0) {

    const canConfirm = typeof window !== "undefined" && typeof window.confirm === "function";

    const overwrite = canConfirm ? window.confirm(`A garden named "${baseName}" already exists. Overwrite it?`) : false;

    if (overwrite) {

      reuseId = all[existingIdx]?.id || null;

    } else {

      finalName = makeUniqueName(baseName, all.map((g) => g.name));

    }

  }



  const saved: SavedGarden = {

    id: reuseId || `${now}-${Math.random().toString(16).slice(2)}`,

    name: finalName,

    createdAt: now,

    garden,

  };



  let updated: SavedGarden[] = [];

  if (reuseId) {

    updated = all.map((g) => (g.id === reuseId ? saved : g));

  } else {

    all.unshift(saved);

    updated = all.slice(0, 50);

  }



  writeSavedGardens(updated);

  return saved;

}



async function loadSavedGarden(id: string): Promise<boolean> {

  if (!id) return false;

  const all = readSavedGardens();

  const found = all.find((g) => g.id === id);

  if (!found) return false;

  return setCurrentGarden(found.garden);

}



function deleteSavedGarden(id: string): boolean {

  if (!id) return false;

  const all = readSavedGardens();

  const next = all.filter((g) => g.id !== id);

  if (next.length === all.length) return false;

  writeSavedGardens(next);

  return true;

}



function exportSavedGarden(id: string): string | null {

  if (!id) return null;

  const all = readSavedGardens();

  const found = all.find((g) => g.id === id);

  if (!found) return null;

  return JSON.stringify(found.garden, null, 2);

}



async function importGarden(name: string, raw: string): Promise<SavedGarden | null> {

  if (!raw) return null;

  try {

    const parsed = JSON.parse(raw);

    const garden = sanitizeGarden(parsed);

    const now = Date.now();

    const saved: SavedGarden = {

      id: `${now}-${Math.random().toString(16).slice(2)}`,

      name: name?.trim() || "Imported garden",

      createdAt: now,

      garden,

    };

    const all = readSavedGardens();

    all.unshift(saved);

    writeSavedGardens(all.slice(0, 50));

    return saved;

  } catch {

    return null;

  }

}



async function getPlayerId(): Promise<string | null> {

  try {

    const id = await Atoms.player.playerId.get();

    return typeof id === "string" && id ? id : null;

  } catch {

    return null;

  }

}



function buildClearedState(state: any, playerId: string): { next: any; changed: boolean } {

  const slots = state?.child?.data?.userSlots;

  const slotMatch = findPlayerSlot(slots, playerId, { sortObject: true });

  if (!slotMatch || !slotMatch.matchSlot || typeof slotMatch.matchSlot !== "object") {

    return { next: state, changed: false };

  }



  const garden = slotMatch.matchSlot?.data?.garden;

  const inventory = slotMatch.matchSlot?.data?.inventory;

  const hasInventory = inventory && typeof inventory === "object";

  const gardenChanged = !isGardenEmpty(garden);

  const invChanged =

    hasInventory &&

    (Array.isArray(inventory.items) ? inventory.items.length > 0 : true ||

      Array.isArray(inventory?.inventory?.items) ? inventory?.inventory?.items?.length > 0 : false);



  if (!gardenChanged && !invChanged) return { next: state, changed: false };



  const updatedSlot = {

    ...(slotMatch.matchSlot as any),

    data: {

      ...(slotMatch.matchSlot?.data || {}),

      garden: makeEmptyGarden(),

      petSlots: buildEmptyPetSlots(slotMatch.matchSlot?.data?.petSlots),

      ...(hasInventory ? { inventory: { ...(inventory || {}), items: [], favoritedItemIds: [] } } : {}),

    },

  };



  const nextUserSlots = rebuildUserSlots(slotMatch, () => updatedSlot);

  const nextState = buildStateWithUserSlots(state, nextUserSlots);



  return { next: nextState, changed: true };

}



async function buildClearedStateSnapshot(playerId: string): Promise<any | null> {

  try {

    const cur = await Atoms.root.state.get();

    const { next } = buildClearedState(cur, playerId);

    return next;

  } catch {

    return null;

  }

}



type GardenTileDebugEntry = {

  type: "dirt" | "boardwalk";

  globalIdx: number;

  localIdx: number;

  x: number;

  y: number;

  obj: any;

};



type GardenTileSnapshot = {

  x: number;

  y: number;

  obj: any;

};



let savedGardenSnapshot: GardenTileSnapshot[] | null = null;



async function readUserSlotIdx(): Promise<number> {

  try {

    const store = await ensureStore().catch(() => null);

    const atom = store ? getAtomByLabel("myUserSlotIdxAtom") : null;

    const raw = atom ? store?.get(atom) : null;

    if (typeof raw === "number" && Number.isFinite(raw)) return raw;

  } catch {

    /* ignore */

  }

  return 0;

}



export async function collectCurrentUserGardenTiles(): Promise<{

  userSlotIdx: number;

  dirt: GardenTileDebugEntry[];

  boardwalk: GardenTileDebugEntry[];

  tiles: GardenTileDebugEntry[];

} | null> {

  const [mapData, userSlotIdx] = await Promise.all([

    Atoms.root.map.get().catch(() => null),

    readUserSlotIdx(),

  ]);



  const cols = Number((mapData as any)?.cols);

  if (!mapData || !Number.isFinite(cols)) return null;



  const clone = (v: any) => {

    try { return JSON.parse(JSON.stringify(v)); } catch { return v; }

  };



  const toPos = (gidx: number) => ({

    x: gidx % cols,

    y: Math.floor(gidx / cols),

  });



  // Enrich with objects from current garden state

  const stateVal = await Atoms.root.state.get().catch(() => null);

  const slots = stateVal?.child?.data?.userSlots;

  const garden =

    Array.isArray(slots) ? slots?.[userSlotIdx]?.data?.garden : slots?.[String(userSlotIdx)]?.data?.garden;

  const dirtObjs = (garden as any)?.tileObjects || {};

  const boardObjs = (garden as any)?.boardwalkTileObjects || {};



  const dirt = Object.entries((mapData as any)?.globalTileIdxToDirtTile || {})

    .filter(([, v]) => v && typeof v === "object" && (v as any).userSlotIdx === userSlotIdx)

    .map(([k, v]) => {

      const gidx = Number(k);

      const pos = toPos(gidx);

      const localIdx = Number((v as any)?.dirtTileIdx ?? -1);

      return {

        type: "dirt" as const,

        globalIdx: gidx,

        localIdx,

        obj: clone(dirtObjs?.[String(localIdx)] ?? null),

        ...pos,

      };

    });



  const boardwalk = Object.entries((mapData as any)?.globalTileIdxToBoardwalk || {})

    .filter(([, v]) => v && typeof v === "object" && (v as any).userSlotIdx === userSlotIdx)

    .map(([k, v]) => {

      const gidx = Number(k);

      const pos = toPos(gidx);

      const localIdx = Number((v as any)?.boardwalkTileIdx ?? -1);

      return {

        type: "boardwalk" as const,

        globalIdx: gidx,

        localIdx,

        obj: clone(boardObjs?.[String(localIdx)] ?? null),

        ...pos,

      };

    });



  const tiles = [...dirt, ...boardwalk].sort((a, b) => a.globalIdx - b.globalIdx);

  return { userSlotIdx, dirt, boardwalk, tiles };

}



async function resolveTileCoords(

  tileType: string | undefined,

  userSlotIdx: number,

  localTileIndex: number

): Promise<{ x: number; y: number } | null> {

  const mapData = await Atoms.root.map.get().catch(() => null);

  const cols = Number((mapData as any)?.cols);

  if (!mapData || !Number.isFinite(cols)) return null;



  const entries = tileType === "Dirt"

    ? Object.entries((mapData as any)?.globalTileIdxToDirtTile || {})

    : Object.entries((mapData as any)?.globalTileIdxToBoardwalk || {});



  for (const [gidxStr, v] of entries) {

    const info = v as any;

    if (!info || typeof info !== "object") continue;

    const slotOk = Number(info.userSlotIdx) === userSlotIdx;

    const localOk =

      tileType === "Dirt"

        ? Number(info.dirtTileIdx) === localTileIndex

        : Number(info.boardwalkTileIdx) === localTileIndex;

    if (slotOk && localOk) {

      const gidx = Number(gidxStr);

      if (!Number.isFinite(gidx)) continue;

      return { x: gidx % cols, y: Math.floor(gidx / cols) };

    }

  }

  return null;

}



function injectTileObjectRaw(tx: number, ty: number, obj: any): boolean {

  try {

    const info = tos.getTileObject(tx, ty, { ensureView: true });

    const tv = (info as any)?.tileView;

    if (!tv || typeof tv.onDataChanged !== "function") return false;

    const cloned = (() => { try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; } })();

    tv.onDataChanged(cloned);



    const status = tos.getStatus();

    const ctx = (status.engine as any)?.reusableContext;

    if (ctx && typeof tv.update === "function") {

      try { tv.update(ctx); } catch {}

    }

    return true;

  } catch {

    return false;

  }

}



async function applyGardenToTos(garden: GardenState, userSlotIdx: number) {

  if (!tos.isReady()) return;

  const mapData = await Atoms.root.map.get().catch(() => null);

  const cols = Number((mapData as any)?.cols);

  if (!mapData || !Number.isFinite(cols)) return;



  const dirtEntries = Object.entries((mapData as any)?.globalTileIdxToDirtTile || {}).filter(

    ([, v]) => (v as any)?.userSlotIdx === userSlotIdx,

  );

  const boardEntries = Object.entries((mapData as any)?.globalTileIdxToBoardwalk || {}).filter(

    ([, v]) => (v as any)?.userSlotIdx === userSlotIdx,

  );



  const applyEntry = (entry: [string, any], type: "Dirt" | "Boardwalk") => {

    const [gidxStr, v] = entry;

    const gidx = Number(gidxStr);

    if (!Number.isFinite(gidx)) return;

    const x = gidx % cols;

    const y = Math.floor(gidx / cols);

    const localIdx =

      type === "Dirt"

        ? Number((v as any)?.dirtTileIdx ?? -1)

        : Number((v as any)?.boardwalkTileIdx ?? -1);

    const obj =

      type === "Dirt"

        ? (garden.tileObjects || {})[String(localIdx)]

        : (garden.boardwalkTileObjects || {})[String(localIdx)];



    if (!obj) {

      tos.setTileEmpty(x, y, { ensureView: true, forceUpdate: true });

      return;

    }



    injectTileObjectRaw(x, y, obj);



    const typ = obj.objectType;

    if (typ === "plant") {

      tos.setTilePlant(x, y, {

        species: obj.species,

        plantedAt: obj.plantedAt,

        maturedAt: obj.maturedAt,

        slots: obj.slots,

      }, { ensureView: true, forceUpdate: true });

    } else if (typ === "decor") {

      tos.setTileDecor(x, y, { rotation: obj.rotation }, { ensureView: true, forceUpdate: true });

    } else if (typ === "egg") {

      tos.setTileEgg(x, y, { plantedAt: obj.plantedAt, maturedAt: obj.maturedAt }, { ensureView: true, forceUpdate: true });

    } else {

      tos.setTileEmpty(x, y, { ensureView: true, forceUpdate: true });

    }

  };



  dirtEntries.forEach((e) => applyEntry(e as any, "Dirt"));

  boardEntries.forEach((e) => applyEntry(e as any, "Boardwalk"));

}



async function snapshotAndClearGardenForEditor() {

  if (!tos.isReady()) {

    console.log("[EditorService] snapshot skipped: tos not ready");

    return;

  }



  const info = await collectCurrentUserGardenTiles();

  if (!info) {

    console.log("[EditorService] snapshot skipped: map/user slot not ready");

    return;

  }



  savedGardenSnapshot = info.tiles.map((t) => ({ x: t.x, y: t.y, obj: t.obj }));



  for (const t of savedGardenSnapshot) {

    try {

      tos.setTileEmpty(t.x, t.y, { ensureView: true, forceUpdate: true });

    } catch (err) {

      console.log("[EditorService] clear tile failed", { x: t.x, y: t.y, err });

    }

  }

}



async function restoreGardenSnapshotForEditor() {

  if (!tos.isReady()) {

    console.log("[EditorService] restore skipped: tos not ready");

    return;

  }

  const snapshot = savedGardenSnapshot;

  if (!snapshot) return;



  for (const t of snapshot) {

    const obj = t.obj;

    try {

      if (!obj) {

        tos.setTileEmpty(t.x, t.y, { ensureView: true, forceUpdate: true });

        continue;

      }



      const typ = obj?.objectType;

      if (typ === "plant") {

        const patch = {

          species: obj.species,

          plantedAt: obj.plantedAt,

          maturedAt: obj.maturedAt,

          slots: obj.slots,

        };

        injectTileObjectRaw(t.x, t.y, obj);

        tos.setTilePlant(t.x, t.y, patch, { ensureView: true, forceUpdate: true });

      } else if (typ === "decor") {

        const patch = { rotation: obj.rotation };

        injectTileObjectRaw(t.x, t.y, obj);

        tos.setTileDecor(t.x, t.y, patch, { ensureView: true, forceUpdate: true });

      } else if (typ === "egg") {

        const patch = { plantedAt: obj.plantedAt, maturedAt: obj.maturedAt };

        injectTileObjectRaw(t.x, t.y, obj);

        tos.setTileEgg(t.x, t.y, patch, { ensureView: true, forceUpdate: true });

      } else {

        tos.setTileEmpty(t.x, t.y, { ensureView: true, forceUpdate: true });

      }

    } catch (err) {

      const ok = obj ? injectTileObjectRaw(t.x, t.y, obj) : false;

      if (!ok) {

        console.log("[EditorService] restore tile failed", { x: t.x, y: t.y, err });

      }

    }

  }



  savedGardenSnapshot = null;

}



async function logGardenTilesForEditor() {

  try {

    const info = await collectCurrentUserGardenTiles();

    if (!info) {

      console.log("[EditorService] garden tiles: map/user slot not ready");

      return;

    }



    console.log("[EditorService] garden tiles (for setTileEmpty)", {

      userSlotIdx: info.userSlotIdx,

      total: info.tiles.length,

      dirtCount: info.dirt.length,

      boardwalkCount: info.boardwalk.length,

      tiles: info.tiles,

    });

  } catch (err) {

    console.log("[EditorService] garden tiles log failed", err);

  }

}





async function logSelectedInventoryItemWithTile() {

  try {

    const store = await ensureStore().catch(() => null);



    let tileType: string | undefined;

    let localTileIndex: number | undefined;



    if (store) {

      const tileAtom = getAtomByLabel("myCurrentGardenTileAtom");

      if (!tileAtom) {

        console.log("[EditorService] logSelectedInventoryItemWithTile: no myCurrentGardenTileAtom");

      } else {

        const tileVal = store.get(tileAtom) as any;

        tileType = tileVal?.tileType;

        localTileIndex = tileVal?.localTileIndex;

      }

    } else {

      console.log("[EditorService] logSelectedInventoryItemWithTile: no jotai store");

    }



    const selectedIndex = await Atoms.inventory.myValidatedSelectedItemIndex.get();

    const inventoryVal = await Atoms.inventory.myInventory.get();

    const rotation = await Atoms.inventory.mySelectedItemRotation.get();



    const items = Array.isArray(inventoryVal?.items) ? inventoryVal.items : [];



    if (

      selectedIndex == null ||

      typeof selectedIndex !== "number" ||

      selectedIndex < 0 ||

      selectedIndex >= items.length

    ) {

      console.log("[EditorService] logSelectedInventoryItemWithTile: invalid selected index", {

        selectedIndex,

        itemsLen: items.length,

      });

      return;

    }



    const selectedItem = items[selectedIndex];



    console.log("[EditorService] selected item placement debug", {

      tileType,

      localTileIndex,

      selectedIndex,

      rotation,

      item: selectedItem,

    });

  } catch (err) {

    console.log("[EditorService] logSelectedInventoryItemWithTile failed", err);

  }

}







async function placeSelectedItemInGardenAtCurrentTile() {

  try {

    const store = await ensureStore().catch(() => null);

    if (!store) {

      console.log("[EditorService] placeSelectedItemInGardenAtCurrentTile: no jotai store");

      return;

    }



    const tileAtom = getAtomByLabel("myCurrentGardenTileAtom");

    if (!tileAtom) {

      console.log("[EditorService] placeSelectedItemInGardenAtCurrentTile: no myCurrentGardenTileAtom");

      return;

    }



    const tileVal = store.get(tileAtom) as any;

    if (!tileVal) {

      console.log("[EditorService] placeSelectedItemInGardenAtCurrentTile: tileVal is null");

      return;

    }



    const tileType: string | undefined = tileVal.tileType;

    const localTileIndex: number | undefined = tileVal.localTileIndex;

    const userSlotIdxRaw: unknown = tileVal.userSlotIdx;



    const userSlotIdx =

      typeof userSlotIdxRaw === "number" && Number.isFinite(userSlotIdxRaw)

        ? userSlotIdxRaw

        : 0;



    if (localTileIndex == null || !Number.isFinite(localTileIndex)) {

      console.log("[EditorService] placeSelectedItemInGardenAtCurrentTile: invalid localTileIndex", {

        localTileIndex,

      });

      return;

    }



    // 1) Item sÃ©lectionnÃ© dans l'inventaire + rotation

    const selectedIndex = await Atoms.inventory.myValidatedSelectedItemIndex.get();

    const inventoryVal = await Atoms.inventory.myInventory.get();

    const rotation = await Atoms.inventory.mySelectedItemRotation.get();



    const items = Array.isArray(inventoryVal?.items) ? inventoryVal.items : [];



    if (

      selectedIndex == null ||

      typeof selectedIndex !== "number" ||

      selectedIndex < 0 ||

      selectedIndex >= items.length

    ) {

      console.log("[EditorService] placeSelectedItemInGardenAtCurrentTile: invalid selected index", {

        selectedIndex,

        itemsLen: items.length,

      });

      return;

    }



    const selectedItem = items[selectedIndex];



    if (selectedItem?.itemType !== "Plant" && selectedItem?.itemType !== "Decor") {

      console.log("[EditorService] placeSelectedItemInGardenAtCurrentTile: unsupported itemType", {

        itemType: selectedItem?.itemType,

      });

      return;

    }



    let tileObject: any;



    if (selectedItem.itemType === "Plant") {

      tileObject = {

        objectType: "plant",

        species: selectedItem.species,

        slots: Array.isArray(selectedItem.slots) ? selectedItem.slots : [],

        plantedAt: selectedItem.plantedAt,

        maturedAt: selectedItem.maturedAt,

      };

    } else if (selectedItem.itemType === "Decor") {

      tileObject = {

        objectType: "decor",

        decorId: selectedItem.decorId,

        // rotation depuis lâatom, fallback sur ce quâaurait dÃ©jÃ  lâitem (au cas oÃ¹)

        rotation:

          typeof rotation === "number"

            ? rotation

            : (selectedItem as any).rotation ?? 0,

      };

    }



    if (!tileObject) {

      console.log("[EditorService] placeSelectedItemInGardenAtCurrentTile: failed to build tileObject");

      return;

    }



    const coords = await resolveTileCoords(tileType, userSlotIdx, localTileIndex);

    if (!coords) {

      console.log("[EditorService] placeSelectedItemInGardenAtCurrentTile: cannot resolve coords", {

        tileType,

        localTileIndex,

        userSlotIdx,

      });

      return;

    }



    if (!tos.isReady()) {

      console.log("[EditorService] placeSelectedItemInGardenAtCurrentTile: tos not ready");

      return;

    }



    injectTileObjectRaw(coords.x, coords.y, tileObject);



    if (tileObject.objectType === "plant") {

      tos.setTilePlant(coords.x, coords.y, {

        species: tileObject.species,

        plantedAt: tileObject.plantedAt,

        maturedAt: tileObject.maturedAt,

        slots: tileObject.slots,

      }, { ensureView: true, forceUpdate: true });

    } else if (tileObject.objectType === "decor") {

      tos.setTileDecor(coords.x, coords.y, { rotation: tileObject.rotation }, { ensureView: true, forceUpdate: true });

    }



    // Also reflect in frozen stateAtom so overlays relying on state stay in sync

    const cur = (stateFrozenValue ?? (await Atoms.root.state.get())) as any;

    const userSlots = cur?.child?.data?.userSlots;

    if (userSlots && typeof userSlots === "object") {

      const isArray = Array.isArray(userSlots);

      const matchSlot = isArray ? (userSlots as any[])[userSlotIdx] : (userSlots as Record<string, any>)[String(userSlotIdx)];

      if (matchSlot) {

        const slotData = matchSlot.data || {};

        const prevGarden = slotData.garden && typeof slotData.garden === "object"

          ? slotData.garden

          : makeEmptyGarden();

        const garden: GardenState = {

          tileObjects: { ...(prevGarden.tileObjects || {}) },

          boardwalkTileObjects: { ...(prevGarden.boardwalkTileObjects || {}) },

        };

        const targetKey = tileType === "Dirt" ? "tileObjects" : "boardwalkTileObjects";

        const tileKey = String(localTileIndex);

        const nextTargetMap = { ...(garden as any)[targetKey], [tileKey]: tileObject };

        const nextGarden: GardenState = {

          tileObjects: targetKey === "tileObjects" ? nextTargetMap : garden.tileObjects,

          boardwalkTileObjects: targetKey === "boardwalkTileObjects" ? nextTargetMap : garden.boardwalkTileObjects,

        };

        const updatedSlot = {

          ...matchSlot,

          data: {

            ...slotData,

            garden: nextGarden,

          },

        };

        const nextUserSlots = isArray

          ? (() => {

              const nextSlots = (userSlots as any[]).slice();

              nextSlots[userSlotIdx] = updatedSlot;

              return nextSlots;

            })()

          : {

              ...(userSlots as Record<string, any>),

              [String(userSlotIdx)]: updatedSlot,

            };

        const nextState = buildStateWithUserSlots(cur, nextUserSlots);

        stateFrozenValue = nextState;

        stateOriginalValue = nextState;

        try { await setStateAtom(nextState); } catch {}

      }

    }



    console.log("[EditorService] placed item in garden (tos)", {

      tileType,

      localTileIndex,

      userSlotIdx,

      selectedIndex,

      itemType: selectedItem.itemType,

      species: selectedItem.species,

      decorId: selectedItem.decorId,

      rotation,

      coords,

    });

  } catch (err) {

    console.log("[EditorService] placeSelectedItemInGardenAtCurrentTile failed", err);

  }

}



async function removeGardenObjectAtCurrentTile(): Promise<boolean> {

  try {

    const store = await ensureStore().catch(() => null);

    if (!store) {

      console.log("[EditorService] removeItemFromGardenAtCurrentTile: no jotai store");

      return false;

    }



    const tileAtom = getAtomByLabel("myCurrentGardenTileAtom");

    if (!tileAtom) {

      console.log("[EditorService] removeItemFromGardenAtCurrentTile: no myCurrentGardenTileAtom");

      return false;

    }



    const tileVal = store.get(tileAtom) as any;

    if (!tileVal) {

      console.log("[EditorService] removeItemFromGardenAtCurrentTile: tileVal is null");

      return false;

    }



    const tileType: string | undefined = tileVal.tileType;

    const localTileIndex: number | undefined = tileVal.localTileIndex;

    const userSlotIdxRaw: unknown = tileVal.userSlotIdx;



    const userSlotIdx =

      typeof userSlotIdxRaw === "number" && Number.isFinite(userSlotIdxRaw)

        ? userSlotIdxRaw

        : 0;



    if (localTileIndex == null || !Number.isFinite(localTileIndex)) {

      console.log("[EditorService] removeItemFromGardenAtCurrentTile: invalid localTileIndex", {

        localTileIndex,

      });

      return false;

    }



    const coords = await resolveTileCoords(tileType, userSlotIdx, localTileIndex);

    if (!coords) {

      console.log("[EditorService] removeItemFromGardenAtCurrentTile: cannot resolve coords", {

        tileType,

        localTileIndex,

        userSlotIdx,

      });

      return false;

    }



    if (!tos.isReady()) {

      console.log("[EditorService] removeItemFromGardenAtCurrentTile: tos not ready");

      return false;

    }



    tos.setTileEmpty(coords.x, coords.y, { ensureView: true, forceUpdate: true });



    // Also reflect in frozen stateAtom for overlay coherence

    const cur = (stateFrozenValue ?? (await Atoms.root.state.get())) as any;

    const userSlots = cur?.child?.data?.userSlots;

    if (userSlots && typeof userSlots === "object") {

      const isArray = Array.isArray(userSlots);

      const matchSlot = isArray ? (userSlots as any[])[userSlotIdx] : (userSlots as Record<string, any>)[String(userSlotIdx)];

      if (matchSlot) {

        const slotData = matchSlot.data || {};

        const prevGarden = slotData.garden && typeof slotData.garden === "object"

          ? slotData.garden

          : makeEmptyGarden();

        const garden: GardenState = {

          tileObjects: { ...(prevGarden.tileObjects || {}) },

          boardwalkTileObjects: { ...(prevGarden.boardwalkTileObjects || {}) },

        };

        const targetKey = tileType === "Dirt" ? "tileObjects" : "boardwalkTileObjects";

        const tileKey = String(localTileIndex);

        const currentTargetMap = (garden as any)[targetKey] || {};

        const nextTargetMap = { ...currentTargetMap };

        delete nextTargetMap[tileKey];

        const nextGarden: GardenState = {

          tileObjects: targetKey === "tileObjects" ? nextTargetMap : garden.tileObjects,

          boardwalkTileObjects: targetKey === "boardwalkTileObjects" ? nextTargetMap : garden.boardwalkTileObjects,

        };

        const updatedSlot = {

          ...matchSlot,

          data: {

            ...slotData,

            garden: nextGarden,

          },

        };

        const nextUserSlots = isArray

          ? (() => {

              const nextSlots = (userSlots as any[]).slice();

              nextSlots[userSlotIdx] = updatedSlot;

              return nextSlots;

            })()

          : {

              ...(userSlots as Record<string, any>),

              [String(userSlotIdx)]: updatedSlot,

            };

        const nextState = buildStateWithUserSlots(cur, nextUserSlots);

        stateFrozenValue = nextState;

        stateOriginalValue = nextState;

        try { await setStateAtom(nextState); } catch {}

      }

    }



    console.log("[EditorService] removed item from garden (tos + state)", {

      tileType,

      localTileIndex,

      userSlotIdx,

      coords,

    });

    return true;

  } catch (err) {

    console.log("[EditorService] removeItemFromGardenAtCurrentTile failed", err);

    return false;

  }

}



async function removeItemFromGardenAtCurrentTile() {

  void removeGardenObjectAtCurrentTile();

}



async function removeDecorFromGardenAtCurrentTile() {

  void removeGardenObjectAtCurrentTile();

}



async function updateGardenObjectAtCurrentTile(

  updater: (tileObject: any) => any

): Promise<boolean> {

  try {

    const store = await ensureStore().catch(() => null);

    if (!store) return false;



    const tileAtom = getAtomByLabel("myCurrentGardenTileAtom");

    if (!tileAtom) return false;



    const tileVal = store.get(tileAtom) as any;

    if (!tileVal) return false;



    const tileType: string | undefined = tileVal.tileType;

    const localTileIndex: number | undefined = tileVal.localTileIndex;

    const userSlotIdxRaw: unknown = tileVal.userSlotIdx;



    const userSlotIdx =

      typeof userSlotIdxRaw === "number" && Number.isFinite(userSlotIdxRaw)

        ? userSlotIdxRaw

        : 0;



    if (localTileIndex == null || !Number.isFinite(localTileIndex)) return false;



    const cur = (stateFrozenValue ?? (await Atoms.root.state.get())) as any;

    const userSlots = cur?.child?.data?.userSlots;

    if (!userSlots || typeof userSlots !== "object") return false;

    const isArray = Array.isArray(userSlots);



    let matchSlot: any;

    if (isArray) {

      matchSlot = (userSlots as any[])[userSlotIdx];

    } else {

      const key = String(userSlotIdx);

      matchSlot = (userSlots as Record<string, any>)[key];

    }

    if (!matchSlot) return false;



    const slotData = matchSlot.data || {};

    const prevGarden = slotData.garden && typeof slotData.garden === "object"

      ? slotData.garden

      : makeEmptyGarden();



    const garden: GardenState = {

      tileObjects: { ...(prevGarden.tileObjects || {}) },

      boardwalkTileObjects: { ...(prevGarden.boardwalkTileObjects || {}) },

    };



    const targetKey =

      tileType === "Dirt"

        ? "tileObjects"

        : "boardwalkTileObjects";

    const tileKey = String(localTileIndex);

    const currentTargetMap = (garden as any)[targetKey] || {};

    const currentObj = currentTargetMap[tileKey];

    if (!currentObj) return false;



    const nextObj = updater(currentObj);

    const nextTargetMap = { ...currentTargetMap, [tileKey]: nextObj };



    const nextGarden: GardenState = {

      tileObjects:

        targetKey === "tileObjects" ? nextTargetMap : garden.tileObjects,

      boardwalkTileObjects:

        targetKey === "boardwalkTileObjects" ? nextTargetMap : garden.boardwalkTileObjects,

    };



    const updatedSlot = {

      ...matchSlot,

      data: {

        ...slotData,

        garden: nextGarden,

      },

    };



    const nextUserSlots = isArray

      ? (() => {

          const nextSlots = (userSlots as any[]).slice();

          nextSlots[userSlotIdx] = updatedSlot;

          return nextSlots;

        })()

      : {

          ...(userSlots as Record<string, any>),

          [String(userSlotIdx)]: updatedSlot,

        };



    const nextState = buildStateWithUserSlots(cur, nextUserSlots);

    stateFrozenValue = nextState;

    stateOriginalValue = nextState;

    await setStateAtom(nextState);



    // Mirror into TOS so the current-item overlay updates the in-game tile

    try {

      const coords = await resolveTileCoords(tileType, userSlotIdx, localTileIndex);

      if (coords && tos.isReady()) {

        injectTileObjectRaw(coords.x, coords.y, nextObj);

        if (nextObj.objectType === "plant") {

          tos.setTilePlant(coords.x, coords.y, {

            species: nextObj.species,

            plantedAt: nextObj.plantedAt,

            maturedAt: nextObj.maturedAt,

            slots: nextObj.slots,

          }, { ensureView: true, forceUpdate: true });

        } else if (nextObj.objectType === "decor") {

          tos.setTileDecor(coords.x, coords.y, { rotation: nextObj.rotation }, { ensureView: true, forceUpdate: true });

        } else if (nextObj.objectType === "egg") {

          tos.setTileEgg(coords.x, coords.y, {

            plantedAt: nextObj.plantedAt,

            maturedAt: nextObj.maturedAt,

          }, { ensureView: true, forceUpdate: true });

        }

      }

    } catch {

      /* ignore TOS sync errors */

    }

    return true;

  } catch {

    return false;

  }

}



type SlotScaleMode = "percent" | "custom";



function clampSizePercent(sizePercent: number): number {

  const pctRaw = Number.isFinite(sizePercent as number) ? (sizePercent as number) : 100;

  return Math.max(50, Math.min(100, Math.round(pctRaw)));

}



function getScaleBoundsForSpecies(

  species: string | null | undefined

): { minScale: number; maxScale: number } {

  if (!species) return { minScale: 1, maxScale: 1 };



  const entry = (plantCatalog as any)[species];

  const maxScaleRaw = Number(entry?.crop?.maxScale);

  const maxScale = Number.isFinite(maxScaleRaw) && maxScaleRaw > 1 ? maxScaleRaw : 1;



  return { minScale: 1, maxScale };

}



function clampCustomScale(species: string, scale: number): number {

  const { minScale, maxScale } = getScaleBoundsForSpecies(species);

  if (!Number.isFinite(scale)) return minScale;

  const upper = Math.max(minScale, maxScale);

  return Math.max(minScale, Math.min(upper, scale));

}



function normalizeCustomScale(species: string, scale: number): number {

  if (!Number.isFinite(scale)) return 1;

  return scale;

}



export function computeTargetScaleFromPercent(

  species: string | null | undefined,

  sizePercent: number

): number {

  const pct = clampSizePercent(sizePercent);

  if (!species) return 1;



  const { minScale, maxScale } = getScaleBoundsForSpecies(species);

  if (!maxScale || maxScale <= minScale) return minScale;



  const t = (pct - 50) / 50;

  return minScale + t * (maxScale - minScale);

}



function computePercentFromScale(species: string, targetScale: number): number {

  const { minScale, maxScale } = getScaleBoundsForSpecies(species);

  if (!maxScale || maxScale <= minScale) return 100;



  const clamped = clampCustomScale(species, targetScale);

  const pct = 50 + ((clamped - minScale) / (maxScale - minScale)) * 50;

  return clampSizePercent(pct);

}



function resolveSlotTargetScale(species: string, cfg: EditorPlantSlotConfig): number {

  if (cfg.sizeMode === "custom") {

    return normalizeCustomScale(species, cfg.customScale);

  }

  return computeTargetScaleFromPercent(species, cfg.sizePercent);

}



type EditorPlantSlotConfig = {

  enabled: boolean;

  sizePercent: number; // 50-100

  customScale: number;

  sizeMode: SlotScaleMode;

  mutations: string[]; // ids du mutationCatalog ("Gold", "Wet", etc.)

};



let editorPlantSlotsState: {

  species: string | null;

  slots: EditorPlantSlotConfig[];

  applyAll: boolean;

} = {

  species: null,

  slots: [],

  applyAll: false,

};



function getMaxSlotsForSpecies(species: string): number {

  const entry = (plantCatalog as any)[species];

  const plantDef = entry?.plant ?? {};

  const isMultipleHarvest = plantDef?.harvestType === "Multiple";

  const slotOffsets = Array.isArray(plantDef.slotOffsets) ? plantDef.slotOffsets : [];



  if (isMultipleHarvest && slotOffsets.length > 0) return slotOffsets.length;

  return 1;

}



function ensureEditorSlotsForSpecies(species: string): EditorPlantSlotConfig[] {

  const maxSlots = getMaxSlotsForSpecies(species);



  // Si changement de species -> reset config

  if (editorPlantSlotsState.species !== species) {

    const defaultScale = computeTargetScaleFromPercent(species, 100);

    editorPlantSlotsState = {

      species,

      slots: Array.from({ length: maxSlots }, () => ({

        enabled: true,

        sizePercent: 100,

        customScale: defaultScale,

        sizeMode: "percent",

        mutations: [],

      })),

      applyAll: false,

    };



    return editorPlantSlotsState.slots;

  }



  // Meme species -> clamp / etend la liste dans les limites

  let slots = editorPlantSlotsState.slots.slice(0, maxSlots);

  if (!slots.length) {

    const defaultScale = computeTargetScaleFromPercent(species, 100);

    slots = [

      {

        enabled: true,

        sizePercent: 100,

        customScale: defaultScale,

        sizeMode: "percent",

        mutations: [],

      },

    ];

  }



  slots = slots.map((slot) => {

    const pct = clampSizePercent((slot as any).sizePercent);

    const mode: SlotScaleMode = (slot as any).sizeMode === "custom" ? "custom" : "percent";

    const fallbackScale = computeTargetScaleFromPercent(species, pct);

    const customScale = normalizeCustomScale(

      species,

      Number.isFinite((slot as any).customScale as number)

        ? ((slot as any).customScale as number)

        : fallbackScale

    );

    const sizePercent = mode === "custom" ? computePercentFromScale(species, customScale) : pct;



    return {

      enabled: (slot as any).enabled !== false,

      sizePercent,

      customScale,

      sizeMode: mode,

      mutations: Array.isArray((slot as any).mutations) ? (slot as any).mutations : [],

    };

  });



  editorPlantSlotsState = { ...editorPlantSlotsState, slots, applyAll: !!editorPlantSlotsState.applyAll };

  return slots;

}



function ensureEditorStateForSpecies(species: string) {

  ensureEditorSlotsForSpecies(species);

  if (editorPlantSlotsState.applyAll == null) {

    editorPlantSlotsState.applyAll = false;

  }

  return editorPlantSlotsState;

}







/* -------------------------------------------------------------------------- */

/* Atom patching                                                              */

/* -------------------------------------------------------------------------- */



function findReadKey(atom: any): string {

  if (atom && typeof atom.read === "function") return "read";

  for (const k of Object.keys(atom || {})) {

    const v = (atom as any)[k];

    if (typeof v === "function" && k !== "write" && k !== "onMount" && k !== "toString") {

      const ar = (v as Function).length;

      if (ar === 1 || ar === 2) return k;

    }

  }

  throw new Error("stateAtom read() not found");

}



function findWriteKey(atom: any): string | null {

  if (atom && typeof atom.write === "function") return "write";

  for (const k of Object.keys(atom || {})) {

    const v = (atom as any)[k];

    if (typeof v === "function" && k !== "read" && k !== "onMount" && k !== "toString") {

      const ar = (v as Function).length;

      if (ar >= 2) return k;

    }

  }

  return null;

}



async function freezeStateAtom() {

  await ensureStore().catch(() => {});

  const pid = await getPlayerId();

  if (!pid) return;



  const atom = getAtomByLabel("stateAtom");

  if (!atom) return;



  try {

    stateOriginalValue = await Atoms.root.state.get();

  } catch {

    stateOriginalValue = null;

  }



  const frozen = await buildClearedStateSnapshot(pid);

  if (!frozen) return;



  try {

    await Atoms.root.state.set(frozen);

  } catch {

    /* ignore */

  }



  stateFrozenValue = frozen;



  // If already patched, just update the frozen value.

  if (statePatch && statePatch.atom === atom) return;



  let readKey: string;

  try {

    readKey = findReadKey(atom);

  } catch {

    return;

  }



  const origRead: Function = (atom as any)[readKey];

  const writeKey = findWriteKey(atom) || undefined;

  const origWrite = writeKey ? (atom as any)[writeKey] : undefined;



  (atom as any)[readKey] = () => stateFrozenValue;

  if (writeKey) {

    (atom as any)[writeKey] = () => stateFrozenValue;

  }



  statePatch = { atom, readKey, origRead, writeKey, origWrite };

}



function unfreezeStateAtom() {

  if (statePatch) {

    try {

      (statePatch.atom as any)[statePatch.readKey] = statePatch.origRead;

      if (statePatch.writeKey && statePatch.origWrite) {

        (statePatch.atom as any)[statePatch.writeKey] = statePatch.origWrite;

      }

    } catch {

      /* ignore */

    }

  }

  statePatch = null;

  stateFrozenValue = null;



  if (stateOriginalValue != null) {

    try {

      void Atoms.root.state.set(stateOriginalValue);

    } catch {}

  }

  stateOriginalValue = null;

}





/* -------------------------------------------------------------------------- */

/* Inventory freeze/restore                                                   */

/* -------------------------------------------------------------------------- */



function buildEmptyInventory(prev: any): any {

  if (Array.isArray(prev)) return [];

  if (prev && typeof prev === "object") {

    const items: any[] = [];

    const hasFavorited = Array.isArray(prev?.favoritedItemIds);

    if (prev.inventory && typeof prev.inventory === "object") {

      return {

        ...prev,

        inventory: { ...(prev.inventory || {}), items },

        ...(hasFavorited ? { favoritedItemIds: [] } : {}),

      };

    }

    return { ...(prev || {}), items, ...(hasFavorited ? { favoritedItemIds: [] } : {}) };

  }

  return [];

}



function buildEmptyPetSlots(prev: any): any {

  if (Array.isArray(prev)) return [];

  if (prev && typeof prev === "object") return {};

  return [];

}



shareGlobal("qwsLogSelectedInventoryItemWithTile", () => {

  void logSelectedInventoryItemWithTile();

});





shareGlobal("qwsPlaceSelectedItemInGardenAtCurrentTile", () => {

  void placeSelectedItemInGardenAtCurrentTile();

});



shareGlobal("qwsRemoveItemFromGardenAtCurrentTile", () => {

  void removeItemFromGardenAtCurrentTile();

});



shareGlobal("qwsRemoveDecorFromGardenAtCurrentTile", () => {

  void removeDecorFromGardenAtCurrentTile();

});



shareGlobal("qwsEditorListSavedGardens", () => {

  return listSavedGardens();

});



shareGlobal("qwsEditorSaveGarden", async (name?: string) => {

  return await saveCurrentGarden(name || "Untitled");

});



shareGlobal("qwsEditorClearGarden", async () => {

  const empty = makeEmptyGarden();

  return await setCurrentGarden(empty);

});



shareGlobal("qwsEditorLoadGarden", async (id: string) => {

  return await loadSavedGarden(id);

});



shareGlobal("qwsEditorSaveGardenForPlayer", async (playerId: string, name?: string) => {

  return await saveCurrentGarden(name || "Untitled", playerId);

});



shareGlobal("qwsEditorDeleteGarden", (id: string) => {

  return deleteSavedGarden(id);

});



shareGlobal("qwsEditorExportGarden", (id: string) => {

  return exportSavedGarden(id);

});



shareGlobal("qwsEditorImportGarden", async (name: string, raw: string) => {

  return await importGarden(name, raw);

});



shareGlobal("qwsEditorPreviewFriendGarden", async (garden: GardenState | null) => {

  return await applyFriendGardenPreview(garden);

});



shareGlobal("qwsEditorClearFriendGardenPreview", async () => {

  return await clearFriendGardenPreview();

});



function installEditorKeybindsOnce() {

  if (editorKeybindsInstalled || typeof window === "undefined") return;

  editorKeybindsInstalled = true;



  window.addEventListener(

    "keydown",

    (ev) => {

      if (shouldIgnoreKeydown(ev)) return;



      if (eventMatchesKeybind("editor.toggle-overlays", ev)) {

        ev.preventDefault();

        ev.stopPropagation();

        if (!currentEnabled) return;

        overlaysVisible = !overlaysVisible;

        if (overlaysVisible) {

          showOverlay();

          showSideOverlay();

          showCurrentItemOverlay();

        } else {

          hideOverlay();

          hideSideOverlay();

          hideCurrentItemOverlay();

        }

        return;

      }



      if (!currentEnabled) return;



      if (eventMatchesKeybind("editor.place-remove", ev)) {

        ev.preventDefault();

        ev.stopPropagation();

        const alreadyHeld = editorActionHeld;

        editorActionHeld = true;

        void handleEditorPlaceRemove(ev, alreadyHeld);

        return;

      }



      if (eventMatchesKeybind("editor.delete-inventory", ev)) {

        ev.preventDefault();

        ev.stopPropagation();

        void removeSelectedInventoryItem();

      }

    },

    true

  );



  window.addEventListener(

    "keyup",

    (ev) => {

      const isSyntheticRF = (ev as any)?.__inGameHotkeysRapidSynthetic__ === true;

      if (isSyntheticRF) return; // ne pas rï¿½ï¿½initialiser pour les keyup du rapid-fire

      if (!currentEnabled) return;

      if (eventMatchesKeybind("editor.place-remove", ev)) {

        editorActionHeld = false;

        lastEditorPressStartTs = 0;

        lastEditorPlaceRemoveTs = 0;

        lastEditorFirstFired = false;

        lastEditorTileKey = null;

        lastEditorTileType = undefined;

        lastEditorFirstActionTs = 0;

      }

    },

    true

  );

}



async function hasSelectedInventoryItem(): Promise<boolean> {

  try {

    const inv = await Atoms.inventory.myInventory.get();

    const idx = await Atoms.inventory.myValidatedSelectedItemIndex.get();

    const items = Array.isArray(inv?.items) ? inv.items : [];

    return typeof idx === "number" && !!items[idx];

  } catch {

    return false;

  }

}



async function handleEditorPlaceRemove(ev?: KeyboardEvent, isHeld = false) {

  const now =

    typeof performance !== "undefined" && typeof performance.now === "function"

      ? performance.now()

      : Date.now();



  if (!isHeld || lastEditorPressStartTs === 0) {

    lastEditorPressStartTs = now;

    lastEditorPlaceRemoveTs = 0;

    lastEditorFirstFired = false;

    lastEditorTileKey = null;

    lastEditorTileType = undefined;

    lastEditorFirstActionTs = 0;

  }



  const { tileObject, tileKey, tileType } = await readCurrentTileContext();



  const hasSelection = await hasSelectedInventoryItem();



  // Determine intended action

  const wantsRemove = !!tileObject;

  const wantsPlace = !tileObject && hasSelection;

  if (!wantsRemove && !wantsPlace) return;



  // Throttle per tile: first trigger is immediate, then wait 150ms before rapid fire at 80ms

  const tileKeyStr = `${tileType ?? "?"}|${tileKey ?? "none"}`;

  const sameTile = tileKeyStr === `${lastEditorTileType ?? "?"}|${lastEditorTileKey ?? "none"}`;

  if (!sameTile) {

    lastEditorTileKey = tileKey ?? null;

    lastEditorTileType = tileType;

    lastEditorFirstFired = false;

    lastEditorPlaceRemoveTs = 0;

    lastEditorPressStartTs = now;

    lastEditorFirstActionTs = 0;

  }



  const elapsedSincePress = now - lastEditorPressStartTs;

  if (!lastEditorFirstFired) {

    lastEditorFirstFired = true;

    lastEditorPlaceRemoveTs = now;

    lastEditorFirstActionTs = now;

  } else {

    const sinceFirstAction = lastEditorFirstActionTs > 0 ? now - lastEditorFirstActionTs : elapsedSincePress;

    const gateMs =

      sinceFirstAction < EDITOR_PLACE_REMOVE_FIRST_DELAY_MS

        ? EDITOR_PLACE_REMOVE_FIRST_DELAY_MS

        : EDITOR_PLACE_REMOVE_REPEAT_MS;

    if (now - lastEditorPlaceRemoveTs < gateMs) {

      return;

    }

    lastEditorPlaceRemoveTs = now;

  }



  // empty tile -> place selected item if any

  if (wantsRemove) {

    if (tileObject?.objectType === "plant") {

      await removeItemFromGardenAtCurrentTile();

      void triggerEditorAnimation("dig");

      return;

    }

    if (tileObject?.objectType === "decor") {

      await removeDecorFromGardenAtCurrentTile();

      void triggerEditorAnimation("dig");

      return;

    }

  }



  if (wantsPlace) {

    await placeSelectedItemInGardenAtCurrentTile();

    void triggerEditorAnimation("dropObject");

  }

}





