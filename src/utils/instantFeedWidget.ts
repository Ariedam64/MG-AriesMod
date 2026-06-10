// Floating, draggable widget hosting the Instant Feed buttons.
// Replaces the old in-game DOM injection (instantFeedButton.ts), which was
// disabled at the request of the game developers. The widget lives in its own
// overlay element and never touches the game's UI tree.

import { PetsService } from "../services/pets";
import { PlayerService, type PetInfo } from "../services/player";
import { Store } from "../store/api";
import { Atoms } from "../store/atoms";
import {
  attachSpriteIcon,
  getSpriteWarmupState,
  onSpriteWarmupProgress,
} from "../ui/spriteIconCache";
import { readAriesPath, writeAriesPath } from "./localStorage";
import { getPetStrength, getPetMaxStrength } from "./petCalcul";

const DEFAULT_LABEL = "Instant Feed";
const MAX_BUTTONS = 3;
const ICON_SIZE = 18;
const WIDGET_Z_INDEX = 1_999_900; // above game UI, below HUD windows (2_000_000+)
const SCREEN_MARGIN = 8;
const DEFAULT_TOP = 64;
const GLOBAL_START_FLAG = "__qws_instant_feed_widget_started";
const INVENTORY_CARD_ATOM = "inventoryCardIsOpenAtom";
const ENABLED_PATH = "pets.instantFeedWidget.enabled";
const POS_PATH = "pets.instantFeedWidget.pos";

type ActivePetSlot = {
  id: string;
  name?: string | null;
  petSpecies?: string | null;
  mutations?: string[];
  xp?: number;
  targetScale?: number;
};

type WidgetPosition = { left: number; top: number };

let started = false;
let enabled = true;
let modalOpen = false;
let inventoryCardOpen = false;
let activePets: ActivePetSlot[] = [];
let activePetsSig = "";
let widget: HTMLDivElement | null = null;
let widgetButtons: HTMLButtonElement[] = [];
let savedPos: WidgetPosition | null = null;
let positioned = false;

export function isInstantFeedWidgetEnabled(): boolean {
  return readAriesPath<boolean>(ENABLED_PATH, true) !== false;
}

export function setInstantFeedWidgetEnabled(value: boolean): void {
  enabled = value;
  writeAriesPath(ENABLED_PATH, value);
  syncVisibility();
}

export function startInstantFeedWidget(): void {
  if (typeof document === "undefined") return;
  const win = globalThis as Record<string, unknown>;
  if (win[GLOBAL_START_FLAG]) return;
  win[GLOBAL_START_FLAG] = true;
  if (started) return;
  started = true;

  enabled = isInstantFeedWidgetEnabled();
  savedPos = readSavedPosition();

  const mount = () => {
    ensureWidget();
    syncVisibility();
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });

  window.addEventListener("resize", () => {
    if (widget && isWidgetVisible() && positioned) clampIntoViewport();
  });

  void (async () => {
    try {
      const warmup = getSpriteWarmupState();
      if (!warmup?.completed) {
        const unsub = onSpriteWarmupProgress((state) => {
          if (state.completed) {
            try { unsub(); } catch {}
            updateButtons();
          }
        });
      }
    } catch {}

    try {
      modalOpen = (await Atoms.ui.activeModal.get()) != null;
      syncVisibility();
    } catch {}
    try {
      await Atoms.ui.activeModal.onChange((next) => {
        modalOpen = next != null;
        syncVisibility();
      });
    } catch {}

    try {
      await Store.subscribeImmediate<boolean>(INVENTORY_CARD_ATOM, (next) => {
        inventoryCardOpen = next === true;
        syncVisibility();
      });
    } catch {}

    try {
      updateActivePets(await Atoms.pets.myPrimitivePetSlots.get());
    } catch {}
    try {
      await Atoms.pets.myPrimitivePetSlots.onChange((next) => updateActivePets(next));
    } catch {}
  })();
}

/* ------------------------------ Visibility ------------------------------ */

function isWidgetVisible(): boolean {
  return enabled && !modalOpen && !inventoryCardOpen;
}

function syncVisibility(): void {
  if (!widget) return;
  const visible = isWidgetVisible();
  widget.style.display = visible ? "flex" : "none";
  if (!visible) return;
  if (!positioned) applyInitialPosition();
  else clampIntoViewport();
}

/* ------------------------------ Positioning ----------------------------- */

function readSavedPosition(): WidgetPosition | null {
  const raw = readAriesPath<unknown>(POS_PATH);
  if (!raw || typeof raw !== "object") return null;
  const left = Number((raw as Record<string, unknown>).left);
  const top = Number((raw as Record<string, unknown>).top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left, top };
}

function persistPosition(pos: WidgetPosition): void {
  savedPos = pos;
  writeAriesPath(POS_PATH, { left: Math.round(pos.left), top: Math.round(pos.top) });
}

function clampCoord(value: number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function applyPosition(left: number, top: number): WidgetPosition {
  if (!widget) return { left, top };
  const width = widget.offsetWidth;
  const height = widget.offsetHeight;
  const boundedLeft = clampCoord(left, SCREEN_MARGIN, window.innerWidth - width - SCREEN_MARGIN);
  const boundedTop = clampCoord(top, SCREEN_MARGIN, window.innerHeight - height - SCREEN_MARGIN);
  widget.style.left = `${Math.round(boundedLeft)}px`;
  widget.style.top = `${Math.round(boundedTop)}px`;
  return { left: boundedLeft, top: boundedTop };
}

function applyInitialPosition(): void {
  if (!widget) return;
  positioned = true;
  if (savedPos) {
    applyPosition(savedPos.left, savedPos.top);
    return;
  }
  const centeredLeft = (window.innerWidth - widget.offsetWidth) / 2;
  applyPosition(centeredLeft, DEFAULT_TOP);
}

function clampIntoViewport(): void {
  if (!widget) return;
  const rect = widget.getBoundingClientRect();
  applyPosition(rect.left, rect.top);
}

/* -------------------------------- Widget -------------------------------- */

function ensureWidget(): HTMLDivElement {
  if (widget && widget.isConnected) return widget;

  const el = document.createElement("div");
  el.setAttribute("data-instant-feed-widget", "1");
  Object.assign(el.style, {
    position: "fixed",
    left: "-9999px",
    top: "-9999px",
    zIndex: String(WIDGET_Z_INDEX),
    display: "none",
    flexDirection: "column",
    gap: "6px",
    padding: "6px 8px",
    borderRadius: "12px",
    border: "1px solid #32404e",
    background: "linear-gradient(180deg, #111923, #0b131c)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
    cursor: "grab",
    userSelect: "none",
    touchAction: "none",
  } as CSSStyleDeclaration);

  el.appendChild(createHeader());

  const buttonsRow = document.createElement("div");
  Object.assign(buttonsRow.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  } as CSSStyleDeclaration);
  el.appendChild(buttonsRow);

  widgetButtons = [];
  for (let i = 0; i < MAX_BUTTONS; i++) {
    const btn = createButton();
    buttonsRow.appendChild(btn);
    widgetButtons.push(btn);
  }

  installDragHandlers(el);
  document.body.appendChild(el);
  widget = el;
  positioned = false;
  updateButtons();
  return el;
}

function installDragHandlers(el: HTMLDivElement): void {
  let dragState: {
    pointerId: number;
    startX: number;
    startY: number;
    baseLeft: number;
    baseTop: number;
    lastPos: WidgetPosition;
  } | null = null;

  const onDragMove = (ev: PointerEvent) => {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    const dx = ev.clientX - dragState.startX;
    const dy = ev.clientY - dragState.startY;
    dragState.lastPos = applyPosition(dragState.baseLeft + dx, dragState.baseTop + dy);
  };

  const stopDrag = (ev?: PointerEvent) => {
    if (!dragState) return;
    if (ev && ev.pointerId !== dragState.pointerId) return;
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", stopDrag);
    document.removeEventListener("pointercancel", stopDrag);
    try { el.releasePointerCapture(dragState.pointerId); } catch {}
    persistPosition(dragState.lastPos);
    dragState = null;
    el.style.cursor = "grab";
  };

  el.addEventListener("pointerdown", (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement | null;
    if (target && target.closest("button")) return;
    if (dragState) stopDrag();
    const rect = el.getBoundingClientRect();
    dragState = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      baseLeft: rect.left,
      baseTop: rect.top,
      lastPos: { left: rect.left, top: rect.top },
    };
    try { el.setPointerCapture(ev.pointerId); } catch {}
    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", stopDrag);
    document.addEventListener("pointercancel", stopDrag);
    el.style.cursor = "grabbing";
    ev.preventDefault();
  });
}

function createHeader(): HTMLDivElement {
  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  } as CSSStyleDeclaration);

  const grip = document.createElement("span");
  grip.textContent = "⠿";
  Object.assign(grip.style, {
    color: "#c8d7e8",
    opacity: "0.65",
    fontSize: "13px",
    lineHeight: "1",
    pointerEvents: "none",
  } as CSSStyleDeclaration);

  const title = document.createElement("span");
  title.textContent = DEFAULT_LABEL;
  Object.assign(title.style, {
    color: "#c8d7e8",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "1",
    flex: "1 1 auto",
    pointerEvents: "none",
  } as CSSStyleDeclaration);

  const gear = document.createElement("button");
  gear.type = "button";
  gear.textContent = "⚙";
  gear.title = "Open instant feed settings (Pets > Feeding)";
  gear.setAttribute("aria-label", gear.title);
  Object.assign(gear.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    padding: "0",
    border: "none",
    borderRadius: "6px",
    background: "transparent",
    color: "#c8d7e8",
    fontSize: "13px",
    lineHeight: "1",
    cursor: "pointer",
  } as CSSStyleDeclaration);
  gear.addEventListener("mouseenter", () => {
    gear.style.background = "rgba(200, 215, 232, 0.15)";
  });
  gear.addEventListener("mouseleave", () => {
    gear.style.background = "transparent";
  });
  gear.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    window.dispatchEvent(new CustomEvent("qws:open-panel", { detail: { id: "pets" } }));
    window.dispatchEvent(new CustomEvent("qws:pets-open-tab", { detail: { tab: "feeding" } }));
  });

  header.append(grip, title, gear);
  return header;
}

/* ------------------------------- Buttons -------------------------------- */

function createButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("data-instant-feed-btn", "1");
  Object.assign(btn.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    flex: "0 0 auto",
    whiteSpace: "nowrap",
    padding: "6px 10px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#6D3A88",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    pointerEvents: "auto",
  } as CSSStyleDeclaration);

  const icon = document.createElement("span");
  icon.setAttribute("data-instant-feed-icon", "1");
  Object.assign(icon.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: `${ICON_SIZE}px`,
    height: `${ICON_SIZE}px`,
    flex: "0 0 auto",
    pointerEvents: "none",
  } as CSSStyleDeclaration);

  const textWrap = document.createElement("span");
  Object.assign(textWrap.style, {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "flex-start",
    lineHeight: "1.15",
    pointerEvents: "none",
  } as CSSStyleDeclaration);

  const name = document.createElement("span");
  name.setAttribute("data-instant-feed-name", "1");
  name.style.fontSize = "12px";
  name.style.fontWeight = "600";
  name.textContent = DEFAULT_LABEL;

  const strength = document.createElement("span");
  strength.setAttribute("data-instant-feed-str", "1");
  strength.style.fontSize = "10px";
  strength.style.opacity = "0.85";
  strength.style.display = "none";

  textWrap.append(name, strength);
  btn.append(icon, textWrap);

  btn.addEventListener("click", (ev) => {
    const petId = btn.dataset.petId || "";
    if (!petId) return;
    ev.preventDefault();
    ev.stopPropagation();
    void handleInstantFeedForPet(petId, btn);
  });

  return btn;
}

function updateButtons(): void {
  for (let i = 0; i < widgetButtons.length; i++) {
    const btn = widgetButtons[i];
    const icon = btn.querySelector<HTMLSpanElement>('[data-instant-feed-icon="1"]');
    const nameEl = btn.querySelector<HTMLSpanElement>('[data-instant-feed-name="1"]');
    const strEl = btn.querySelector<HTMLSpanElement>('[data-instant-feed-str="1"]');
    const pet = activePets[i] ?? null;
    const title = pet ? buildButtonTitle(pet) : DEFAULT_LABEL;
    btn.setAttribute("aria-label", title);
    btn.title = title;
    btn.dataset.petId = pet?.id ?? "";
    btn.disabled = !pet;
    btn.style.opacity = pet ? "" : "0.6";
    btn.style.cursor = pet ? "pointer" : "default";

    if (nameEl) nameEl.textContent = pet ? buildPetDisplayName(pet) : DEFAULT_LABEL;
    if (strEl) {
      const strength = pet ? buildStrengthLabel(pet) : null;
      strEl.textContent = strength?.text ?? "";
      strEl.style.color = strength?.maxed ? "#facc15" : "";
      strEl.style.display = strength ? "" : "none";
    }

    if (!icon) continue;
    if (pet) {
      const mutations =
        Array.isArray(pet.mutations) && pet.mutations.length ? pet.mutations : undefined;
      const iconKey = `${pet.petSpecies ?? ""}|${pet.name ?? ""}|${mutations?.join(",") ?? ""}`;
      if (btn.dataset.iconKey === iconKey) continue;
      btn.dataset.iconKey = iconKey;
      icon.textContent = "";
      const candidates = [pet.petSpecies ?? "", pet.name ?? ""].filter(Boolean);
      attachSpriteIcon(icon, ["pet"], candidates, ICON_SIZE, "instant-feed-widget", {
        mutations,
        onNoSpriteFound: () => {
          icon.textContent = (pet.name || pet.petSpecies || "?").charAt(0).toUpperCase();
        },
      });
    } else {
      btn.dataset.iconKey = "";
      icon.replaceChildren();
    }
  }
  // Labels change the widget width; keep it inside the viewport.
  if (widget && positioned && isWidgetVisible()) clampIntoViewport();
}

function buildPetDisplayName(pet: ActivePetSlot): string {
  const name = String(pet.name ?? "").trim();
  if (name) return name;
  const species = String(pet.petSpecies ?? "").trim();
  if (species) return species.charAt(0).toUpperCase() + species.slice(1);
  return "Pet";
}

function buildStrengthLabel(pet: ActivePetSlot): { text: string; maxed: boolean } | null {
  const petLike = {
    petSpecies: String(pet.petSpecies ?? ""),
    xp: pet.xp,
    targetScale: pet.targetScale,
    mutations: pet.mutations,
  };
  const maxStr = getPetMaxStrength(petLike);
  if (maxStr <= 0) return null;
  const str = getPetStrength(petLike);
  const maxed = str >= maxStr;
  return { text: maxed ? `STR ${maxStr}` : `STR ${str}/${maxStr}`, maxed };
}

function buildButtonTitle(pet: ActivePetSlot): string {
  const name = buildPetDisplayName(pet);
  const strength = buildStrengthLabel(pet);
  return strength ? `${DEFAULT_LABEL}: ${name} (${strength.text})` : `${DEFAULT_LABEL}: ${name}`;
}

/* ------------------------------ Active pets ------------------------------ */

function updateActivePets(next: unknown): void {
  const normalized = normalizeActivePets(next);
  const sig = buildActivePetsSignature(normalized);
  if (sig === activePetsSig) return;
  activePetsSig = sig;
  activePets = normalized;
  updateButtons();
}

function normalizeActivePets(value: unknown): ActivePetSlot[] {
  const list = Array.isArray(value) ? value : [];
  const out: ActivePetSlot[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as any;
    // Prefer slot.* when a slot wrapper exists (matches _activeSlotToPet in pets.ts)
    const slot = raw?.slot && typeof raw.slot === "object" ? raw.slot : raw;
    const id = String(slot?.id ?? "").trim();
    if (!id) continue;
    const name = (slot?.name ?? raw?.name ?? raw?.petName ?? null) as string | null;
    const petSpecies = (slot?.petSpecies ?? raw?.petSpecies ?? raw?.species ?? null) as
      | string
      | null;
    const mutationsRaw =
      slot?.mutations ??
      raw?.mutations ??
      raw?.data?.mutations ??
      raw?.slot?.data?.mutations ??
      raw?.pet?.mutations ??
      null;
    const mutations = Array.isArray(mutationsRaw)
      ? mutationsRaw.map((m: unknown) => String(m ?? "").trim()).filter(Boolean)
      : undefined;
    const xpRaw = Number(slot?.xp ?? raw?.xp);
    const xp = Number.isFinite(xpRaw) ? xpRaw : undefined;
    const targetScaleRaw = Number(slot?.targetScale ?? raw?.targetScale);
    const targetScale = Number.isFinite(targetScaleRaw) ? targetScaleRaw : undefined;
    out.push({ id, name, petSpecies, mutations, xp, targetScale });
    if (out.length >= MAX_BUTTONS) break;
  }
  return out;
}

function buildActivePetsSignature(list: ActivePetSlot[]): string {
  if (!list.length) return "";
  return list
    .map((pet) => {
      const id = String(pet.id ?? "");
      const species = String(pet.petSpecies ?? "");
      const name = String(pet.name ?? "");
      const muts = Array.isArray(pet.mutations)
        ? pet.mutations.map((m) => String(m ?? "").trim()).filter(Boolean).sort().join(",")
        : "";
      // Use the displayed strength (not raw xp) so xp ticks that don't change
      // the visible value never trigger a re-render.
      const strength = buildStrengthLabel(pet)?.text ?? "";
      return `${id}|${species}|${name}|${muts}|${strength}`;
    })
    .join(";");
}

/* ------------------------------ Feed action ------------------------------ */

async function findPetById(petId: string): Promise<PetInfo | null> {
  try {
    const list = await PetsService.getPets();
    const arr = Array.isArray(list) ? list : [];
    return arr.find((p) => String(p?.slot?.id || "") === petId) ?? null;
  } catch (err) {
    console.warn("[InstantFeed] Failed to fetch pets", err);
    return null;
  }
}

async function handleInstantFeedForPet(petId: string, btn: HTMLButtonElement): Promise<void> {
  if (!petId) return;
  const prevDisabled = btn.disabled;
  const expectedPetId = petId;
  btn.disabled = true;
  try {
    const pet = await findPetById(petId);
    if (!pet) return;

    const species = String(pet?.slot?.petSpecies || "");
    const compatible = PetsService.getInstantFeedAllowedCrops(species);
    if (!compatible.size) return;

    const inventory = await PlayerService.getCropInventoryState();
    const items = Array.isArray(inventory) ? inventory : [];
    const favoriteSet = await PlayerService.getFavoriteIdSet().catch(() => new Set<string>());

    const chosen = items.find((item) => {
      const speciesId = String((item as any)?.species || "");
      if (!speciesId || !compatible.has(speciesId)) return false;
      const id = String((item as any)?.id || "");
      return id && !favoriteSet.has(id);
    }) as any;

    const chosenId = String(chosen?.id || "");
    if (!chosenId) return;

    await PlayerService.feedPet(petId, chosenId);
  } catch (err) {
    console.error("[InstantFeed] Failed to feed pet", err);
  } finally {
    if (btn.dataset.petId === expectedPetId) {
      btn.disabled = prevDisabled;
    }
  }
}
