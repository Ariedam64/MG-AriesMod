// Floating, draggable widget hosting the Instant Feed buttons.
// Replaces the old in-game DOM injection, which was
// disabled at the request of the game developers. The widget lives in its own
// overlay element and never touches the game's UI tree.

import { Store } from "../../game/store/api";
import { Atoms } from "../../game/store/atoms";
import {
  attachSpriteIcon,
  getSpriteWarmupState,
  onSpriteWarmupProgress,
} from "../../ui/kit/sprites/iconCache";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { makeDraggable, placeInViewport, readStoredPosition, storePosition, type ScreenPosition } from "../../ui/kit/floating";
import { color } from "../../ui/kit/theme";
import {
  DEFAULT_LABEL,
  MAX_BUTTONS,
  activePetsSignature,
  buttonTitle,
  normalizeActivePets,
  petDisplayName,
  strengthLabel,
  type ActivePetSlot,
} from "./activePetSlots";
import { instantFeedPet } from "./instantFeed";

const ICON_SIZE = 18;
const WIDGET_Z_INDEX = 1_999_900; // above game UI, below HUD windows (2_000_000+)
const SCREEN_MARGIN = 8;
const DEFAULT_TOP = 64;
const GLOBAL_START_FLAG = "__qws_instant_feed_widget_started";
const INVENTORY_CARD_ATOM = "inventoryCardIsOpenAtom";
const ENABLED_PATH = "pets.instantFeedWidget.enabled";
const POS_PATH = "pets.instantFeedWidget.pos";

let started = false;
let enabled = true;
let modalOpen = false;
let inventoryCardOpen = false;
let activePets: ActivePetSlot[] = [];
let activePetsSig = "";
let widget: HTMLDivElement | null = null;
let widgetButtons: HTMLButtonElement[] = [];
let savedPos: ScreenPosition | null = null;
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
  savedPos = readStoredPosition(POS_PATH);

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

function applyPosition(left: number, top: number): ScreenPosition {
  if (!widget) return { left, top };
  const size = { width: widget.offsetWidth, height: widget.offsetHeight };
  return placeInViewport(widget, { left, top }, size, SCREEN_MARGIN);
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
    borderRadius: "16px",
    border: `3px solid ${color.sandEdge}`,
    background: color.paper,
    boxShadow: `0 4px 0 ${color.sandShade}`,
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

  makeDraggable(el, {
    ignore: (target) => !!target.closest("button"),
    moveTo: (pos) => applyPosition(pos.left, pos.top),
    onDrop: (pos) => {
      savedPos = pos;
      storePosition(POS_PATH, pos);
    },
  });
  document.body.appendChild(el);
  widget = el;
  positioned = false;
  updateButtons();
  return el;
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
    color: color.textDim,
    fontSize: "13px",
    lineHeight: "1",
    pointerEvents: "none",
  } as CSSStyleDeclaration);

  const title = document.createElement("span");
  title.textContent = DEFAULT_LABEL;
  Object.assign(title.style, {
    color: color.text,
    fontSize: "12px",
    fontWeight: "800",
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
    color: color.textSoft,
    fontSize: "13px",
    lineHeight: "1",
    cursor: "pointer",
  } as CSSStyleDeclaration);
  gear.addEventListener("mouseenter", () => {
    gear.style.background = color.sand;
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
    backgroundColor: color.sepiaStrong,
    boxShadow: `0 3px 0 ${color.sepiaShade}`,
    color: color.onSepia,
    fontSize: "13px",
    fontWeight: "800",
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
    const title = pet ? buttonTitle(pet) : DEFAULT_LABEL;
    btn.setAttribute("aria-label", title);
    btn.title = title;
    btn.dataset.petId = pet?.id ?? "";
    btn.disabled = !pet;
    btn.style.opacity = pet ? "" : "0.6";
    btn.style.cursor = pet ? "pointer" : "default";

    if (nameEl) nameEl.textContent = pet ? petDisplayName(pet) : DEFAULT_LABEL;
    if (strEl) {
      const strength = pet ? strengthLabel(pet) : null;
      strEl.textContent = strength?.text ?? "";
      strEl.style.color = strength?.maxed ? color.gold : "";
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

/* ------------------------------ Active pets ------------------------------ */

function updateActivePets(next: unknown): void {
  const normalized = normalizeActivePets(next);
  const sig = activePetsSignature(normalized);
  if (sig === activePetsSig) return;
  activePetsSig = sig;
  activePets = normalized;
  updateButtons();
}

/* ------------------------------ Feed action ------------------------------ */

async function handleInstantFeedForPet(petId: string, btn: HTMLButtonElement): Promise<void> {
  if (!petId) return;
  const prevDisabled = btn.disabled;
  btn.disabled = true;
  try {
    await instantFeedPet(petId);
  } catch (err) {
    console.error("[InstantFeed] Failed to feed pet", err);
  } finally {
    if (btn.dataset.petId === petId) {
      btn.disabled = prevDisabled;
    }
  }
}
