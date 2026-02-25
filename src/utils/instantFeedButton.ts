import { onAdded } from "../core/dom";
import { PetsService } from "../services/pets";
import { PlayerService, type PetInfo } from "../services/player";
import { Atoms } from "../store/atoms";
import { toastSimple } from "../ui/toast";

const INSTANT_FEED_ATTR = "data-instant-feed";
const INSTANT_FEED_BOUND_ATTR = "data-instant-feed-bound";
const INSTANT_FEED_LABEL = "Instant Feed";
const FEED_BTN_BASE_CLASS = "chakra-button";
const FEED_BTN_CLASS_A = "css-1sqevwu";
const FEED_BTN_CLASS_B = "css-18p13xh";

let started = false;

export function startInstantFeedButton(): void {
  if (started) return;
  started = true;

  if (typeof document === "undefined") return;

  onAdded(
    (el) => isPetPanelFeedButton(el),
    (el) => {
      if (!(el instanceof HTMLButtonElement)) return;
      replaceFeedButton(el);
    },
  );
}

function isPetPanelFeedButton(el: Element): el is HTMLButtonElement {
  if (!(el instanceof HTMLButtonElement)) return false;
  if (el.getAttribute(INSTANT_FEED_BOUND_ATTR) === "1") return false;
  if (
    !el.classList.contains(FEED_BTN_BASE_CLASS) ||
    (!el.classList.contains(FEED_BTN_CLASS_A) && !el.classList.contains(FEED_BTN_CLASS_B))
  ) {
    return false;
  }

  const grid = el.closest(".McGrid");
  if (!grid) return false;

  const columns = Array.from(grid.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  if (columns.length < 2) return false;
  if (!columns[0].classList.contains("McFlex")) return false;
  if (!columns[1].classList.contains("McFlex")) return false;

  const leftButtons = Array.from(columns[0].querySelectorAll("button")).filter(
    (btn): btn is HTMLButtonElement => btn instanceof HTMLButtonElement,
  );
  const rightButtons = Array.from(columns[1].querySelectorAll("button")).filter(
    (btn): btn is HTMLButtonElement => btn instanceof HTMLButtonElement,
  );
  if (!leftButtons.length || !rightButtons.length) return false;

  const candidate =
    leftButtons.find((btn) => btn.querySelector("div[style*='scaleX']")) ??
    leftButtons[0] ??
    null;

  return candidate === el;
}

function replaceFeedButton(original: HTMLButtonElement): void {
  const alreadyInstant = original.getAttribute(INSTANT_FEED_ATTR) === "1";
  const target = alreadyInstant ? original : (original.cloneNode(true) as HTMLButtonElement);

  // Remove stray pet name/label injected inside the button (ex: "Mata")
  const nameBlock = target.querySelector(".McFlex.css-1rdk3wo");
  if (nameBlock) nameBlock.remove();

  target.setAttribute(INSTANT_FEED_ATTR, "1");
  target.setAttribute(INSTANT_FEED_BOUND_ATTR, "1");
  setButtonLabel(target, INSTANT_FEED_LABEL);

  target.addEventListener(
    "click",
    (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      (ev as any).stopImmediatePropagation?.();
      void handleInstantFeed(target);
    },
    true,
  );

  if (!alreadyInstant) {
    original.replaceWith(target);
  }
}

function setButtonLabel(btn: HTMLButtonElement, label: string): void {
  let textNode: Text | null = null;
  for (const node of Array.from(btn.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      textNode = node as Text;
      break;
    }
  }
  if (textNode) {
    textNode.textContent = label;
    return;
  }
  btn.appendChild(document.createTextNode(label));
}

async function getPetIdOnSameTile(): Promise<string | null> {
  try {
    const raw = await Atoms.pets.myPetIdOnSameTile.get();
    const id = String(raw || "").trim();
    return id ? id : null;
  } catch {
    return null;
  }
}

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

async function handleInstantFeed(btn: HTMLButtonElement): Promise<void> {
  const prevDisabled = btn.disabled;
  btn.disabled = true;
  try {
    const petId = await getPetIdOnSameTile();
    if (!petId) {
      await toastSimple("Instant feed", "No pet detected on the same tile.", "error");
      return;
    }

    const pet = await findPetById(petId);
    if (!pet) {
      await toastSimple("Instant feed", "Unable to resolve expanded pet.", "error");
      return;
    }

    const species = String(pet?.slot?.petSpecies || "");
    const compatibleList = PetsService.getCompatibleCropsForSpecies(species) ?? [];
    const compatible = new Set(compatibleList.map((item) => String(item || "")));

    if (!compatible.size) {
      await toastSimple("Instant feed", "No compatible crops for this pet.", "info");
      return;
    }

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
    if (!chosenId) {
      await toastSimple(
        "Instant feed",
        "No compatible crops in inventory (excluding favorites).",
        "info",
      );
      return;
    }

    const previousHungerPct = getHungerPctForPet(pet);

    await PlayerService.feedPet(petId, chosenId);

    const hungerPct = await waitForHungerIncrease(petId, previousHungerPct, {
      initialDelay: 150,
    });
    const hungerSuffix =
      hungerPct != null ? ` Hunger: ${formatHungerPct(hungerPct)}%.` : "";

    const cropName = String(chosen?.species || "crop");
    const petLabel = pet?.slot?.name || species || petId;
    await toastSimple(
      "Instant feed",
      `Fed ${petLabel} with ${cropName}.${hungerSuffix}`,
      "success",
    );
  } catch (err) {
    console.error("[InstantFeed] Failed to feed pet", err);
    await toastSimple(
      "Instant feed",
      err instanceof Error ? err.message : "Failed to feed pet.",
      "error",
    );
  } finally {
    btn.disabled = prevDisabled;
  }
}

function formatHungerPct(pct: number): string {
  if (!Number.isFinite(pct)) return "";
  const clamped = Math.max(0, Math.min(100, pct));
  const rounded = Math.round(clamped * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const HUNGER_EPSILON = 0.05;
const HUNGER_TIMEOUT_MS = 4000;
const HUNGER_POLL_INTERVAL_MS = 120;

function isPetInfo(value: unknown): value is PetInfo {
  if (!value || typeof value !== "object") return false;
  const slot = (value as { slot?: unknown }).slot;
  return !!slot && typeof slot === "object";
}

function getHungerPctForPet(pet: unknown): number | null {
  if (!isPetInfo(pet)) return null;
  try {
    const hungerPct = PetsService.getHungerPctFor(pet);
    return typeof hungerPct === "number" && Number.isFinite(hungerPct)
      ? hungerPct
      : null;
  } catch {
    return null;
  }
}

async function getPetHungerPct(petId: string): Promise<number | null> {
  try {
    const updatedPet = await findPetById(petId);
    return getHungerPctForPet(updatedPet);
  } catch {
    return null;
  }
}

async function waitForHungerIncrease(
  petId: string,
  previousPct: number | null,
  options: { initialDelay?: number; timeout?: number; interval?: number } = {},
): Promise<number | null> {
  const { initialDelay = 0, timeout = HUNGER_TIMEOUT_MS, interval = HUNGER_POLL_INTERVAL_MS } =
    options;

  if (initialDelay > 0) {
    await delay(initialDelay);
  }

  const start =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  let lastResult: number | null = null;

  while (true) {
    const pct = await getPetHungerPct(petId);
    if (pct != null) {
      lastResult = pct;
      if (
        previousPct == null ||
        pct >= Math.min(100, previousPct + HUNGER_EPSILON) ||
        pct >= 99.9
      ) {
        return pct;
      }
    }

    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    if (now - start >= timeout) {
      return lastResult;
    }

    if (interval > 0) {
      await delay(interval);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
