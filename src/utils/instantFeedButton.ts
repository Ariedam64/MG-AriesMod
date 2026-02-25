import { onAdded } from "../core/dom";
import { PetsService } from "../services/pets";
import { PlayerService, type PetInfo } from "../services/player";
import { Atoms } from "../store/atoms";
import { toastSimple } from "../ui/toast";
import { attachSpriteIcon } from "../ui/spriteIconCache";

const ROOT_CLASS = "css-pb842o";
const BAR_ATTR = "data-instant-feed-bar";
const BTN_ATTR = "data-instant-feed-btn";
const BTN_INDEX_ATTR = "data-instant-feed-idx";
const DEFAULT_LABEL = "Instant Feed";
const MAX_BUTTONS = 3;
const ICON_SIZE = 18;
const GLOBAL_START_FLAG = "__qws_instant_feed_btn_started";

type ActivePetSlot = {
  id: string;
  name?: string | null;
  petSpecies?: string | null;
  mutations?: string[];
};

let started = false;
let activePets: ActivePetSlot[] = [];
const roots = new Set<HTMLElement>();

export function startInstantFeedButton(): void {
  if (typeof document === "undefined") return;
  const win = globalThis as any;
  if (win[GLOBAL_START_FLAG]) return;
  win[GLOBAL_START_FLAG] = true;
  if (started) return;
  started = true;

  const syncRoots = () => {
    for (const root of Array.from(roots)) {
      if (!root.isConnected) continue;
      renderBar(root);
    }
  };

  const updateActivePets = (next: unknown) => {
    activePets = normalizeActivePets(next);
    syncRoots();
  };

  void (async () => {
    try {
      updateActivePets(await Atoms.pets.myPrimitivePetSlots.get());
    } catch {}

    try {
      await Atoms.pets.myPrimitivePetSlots.onChange((next) => {
        updateActivePets(next);
      });
    } catch {}
  })();

  onAdded(
    (el) => isInstantFeedRoot(el),
    (el) => {
      if (!(el instanceof HTMLElement)) return;
      roots.add(el);
      renderBar(el);
    },
  );
}

function isInstantFeedRoot(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (!el.classList.contains("McFlex")) return false;

  if (el.classList.contains(ROOT_CLASS)) return true;

  const hasTopNav = !!el.querySelector(".McGrid.css-8i2u7l");
  const hasPetActions = !!el.querySelector(".McGrid.css-1n1dtdw");
  return hasTopNav && hasPetActions;
}

function renderBar(root: HTMLElement): void {
  if (!root.isConnected) return;
  const bar = ensureBar(root);
  const buttons = ensureButtons(root, bar);
  updateButtons(buttons);
}

function ensureBar(root: HTMLElement): HTMLDivElement {
  const { host, anchor, stackWithNav } = findBarHost(root);
  if (stackWithNav) {
    host.style.display = "flex";
    host.style.flexDirection = "column";
    host.style.alignItems = "center";
    host.style.gap = "6px";
    host.style.width = "100%";
  }
  let bar = root.querySelector<HTMLDivElement>(`[${BAR_ATTR}="1"]`);
  if (!bar) {
    bar = document.createElement("div");
    bar.setAttribute(BAR_ATTR, "1");
    bar.style.display = "grid";
    bar.style.gridTemplateColumns = `repeat(${MAX_BUTTONS}, max-content)`;
    bar.style.justifyContent = "center";
    bar.style.alignItems = "center";
    bar.style.gap = "6px";
    bar.style.marginTop = stackWithNav ? "0" : "6px";
    bar.style.width = "100%";
    if (anchor && anchor.parentElement === host) {
      anchor.insertAdjacentElement("afterend", bar);
    } else {
      host.appendChild(bar);
    }
  } else if (bar.parentElement !== host) {
    if (anchor && anchor.parentElement === host) {
      anchor.insertAdjacentElement("afterend", bar);
    } else {
      host.appendChild(bar);
    }
  } else if (anchor && bar.previousElementSibling !== anchor) {
    anchor.insertAdjacentElement("afterend", bar);
  } else if (!anchor && host.lastChild !== bar) {
    host.appendChild(bar);
  }
  return bar;
}

function findBarHost(root: HTMLElement): {
  host: HTMLElement;
  anchor: HTMLElement | null;
  stackWithNav: boolean;
} {
  const navContainer = root.querySelector<HTMLElement>(".McFlex.css-1vtdcnr");
  if (navContainer) {
    const navGrid = navContainer.querySelector<HTMLElement>(".McGrid.css-8i2u7l");
    return { host: navContainer, anchor: navGrid, stackWithNav: true };
  }

  const host = root;
  const navGrid = root.querySelector<HTMLElement>(".McGrid.css-8i2u7l");
  const gridAnchor = navGrid ? findDirectChild(host, navGrid) : null;
  return { host, anchor: gridAnchor, stackWithNav: false };
}

function findDirectChild(root: HTMLElement, node: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = node;
  while (current && current.parentElement && current.parentElement !== root) {
    current = current.parentElement;
  }
  if (current && current.parentElement === root) return current;
  return null;
}

function ensureButtons(root: HTMLElement, bar: HTMLElement): HTMLButtonElement[] {
  const existing = Array.from(
    bar.querySelectorAll<HTMLButtonElement>(`button[${BTN_ATTR}="1"]`),
  );

  for (let i = existing.length; i < MAX_BUTTONS; i++) {
    const btn = createButton(root, i);
    bar.appendChild(btn);
    existing.push(btn);
  }

  while (existing.length > MAX_BUTTONS) {
    const btn = existing.pop();
    if (btn) btn.remove();
  }

  return existing;
}

function createButton(root: HTMLElement, index: number): HTMLButtonElement {
  const ref = findReferenceButton(root);
  const btn = ref ? (ref.cloneNode(false) as HTMLButtonElement) : document.createElement("button");

  if (!btn.classList.contains("chakra-button")) {
    btn.classList.add("chakra-button");
  }

  btn.type = "button";
  btn.removeAttribute("id");
  btn.setAttribute(BTN_ATTR, "1");
  btn.setAttribute(BTN_INDEX_ATTR, String(index));
  btn.style.display = "inline-flex";
  btn.style.alignItems = "center";
  btn.style.justifyContent = "center";
  btn.style.gap = "6px";
  btn.style.width = "auto";
  btn.style.flex = "0 0 auto";
  btn.style.whiteSpace = "nowrap";
  btn.style.backgroundColor = "#6D3A88";
  btn.style.color = "#ffffff";
  btn.style.pointerEvents = "auto";
  btn.setAttribute("aria-label", DEFAULT_LABEL);
  btn.title = DEFAULT_LABEL;
  ensureButtonContent(btn).label.textContent = DEFAULT_LABEL;

  btn.addEventListener("click", (ev) => {
    const target = ev.currentTarget as HTMLButtonElement | null;
    if (!target) return;
    const petId = target.dataset.petId || "";
    if (!petId) return;
    ev.preventDefault();
    ev.stopPropagation();
    (ev as any).stopImmediatePropagation?.();
    void handleInstantFeedForPet(petId, target);
  });

  return btn;
}

function findReferenceButton(root: HTMLElement): HTMLButtonElement | null {
  const btn = root.querySelector<HTMLButtonElement>("button.chakra-button");
  return btn ?? null;
}

function updateButtons(buttons: HTMLButtonElement[]): void {
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const pet = activePets[i] ?? null;
    const label = DEFAULT_LABEL;
    const title = pet ? buildButtonTitle(pet) : DEFAULT_LABEL;
    const parts = ensureButtonContent(btn);
    parts.label.textContent = label;
    btn.setAttribute("aria-label", title);
    btn.title = title;
    btn.dataset.petId = pet?.id ?? "";
    btn.disabled = !pet;
    btn.style.opacity = pet ? "" : "0.6";

    if (pet) {
      parts.icon.textContent = "";
      const candidates = [pet.petSpecies ?? "", pet.name ?? ""].filter(Boolean);
      const mutations = Array.isArray(pet.mutations) && pet.mutations.length ? pet.mutations : undefined;
      attachSpriteIcon(parts.icon, ["pet"], candidates, ICON_SIZE, "instant-feed-btn", {
        mutations,
        onNoSpriteFound: () => {
          parts.icon.textContent = (pet.name || pet.petSpecies || "?").charAt(0).toUpperCase();
        },
      });
    } else {
      parts.icon.replaceChildren();
    }
  }
}

function buildButtonTitle(pet: ActivePetSlot): string {
  const name = String(pet.name ?? pet.petSpecies ?? "").trim();
  return name ? `${DEFAULT_LABEL}: ${name}` : DEFAULT_LABEL;
}

function ensureButtonContent(btn: HTMLButtonElement): {
  icon: HTMLSpanElement;
  label: HTMLSpanElement;
} {
  let content = btn.querySelector<HTMLSpanElement>('[data-instant-feed-content="1"]');
  let icon = btn.querySelector<HTMLSpanElement>('[data-instant-feed-icon="1"]');
  let label = btn.querySelector<HTMLSpanElement>('[data-instant-feed-label="1"]');

  if (!content || !icon || !label) {
    content = document.createElement("span");
    content.dataset.instantFeedContent = "1";
    content.style.display = "inline-flex";
    content.style.alignItems = "center";
    content.style.justifyContent = "center";
    content.style.gap = "6px";
    content.style.pointerEvents = "none";

    icon = document.createElement("span");
    icon.dataset.instantFeedIcon = "1";
    icon.style.display = "inline-flex";
    icon.style.alignItems = "center";
    icon.style.justifyContent = "center";
    icon.style.width = `${ICON_SIZE}px`;
    icon.style.height = `${ICON_SIZE}px`;
    icon.style.flex = "0 0 auto";
    icon.style.pointerEvents = "none";
    icon.textContent = "";

    label = document.createElement("span");
    label.dataset.instantFeedLabel = "1";
    label.style.pointerEvents = "none";
    label.textContent = DEFAULT_LABEL;

    content.append(icon, label);
    btn.replaceChildren(content);
  }

  return { icon, label };
}

function normalizeActivePets(value: unknown): ActivePetSlot[] {
  const list = Array.isArray(value) ? value : [];
  const out: ActivePetSlot[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as any;
    const id = String(raw?.id ?? raw?.slot?.id ?? "").trim();
    if (!id) continue;
    const name = (raw?.name ?? raw?.petName ?? raw?.slot?.name ?? null) as string | null;
    const petSpecies = (raw?.petSpecies ?? raw?.species ?? raw?.slot?.petSpecies ?? null) as
      | string
      | null;
    const mutationsRaw =
      raw?.mutations ??
      raw?.slot?.mutations ??
      raw?.data?.mutations ??
      raw?.slot?.data?.mutations ??
      raw?.pet?.mutations ??
      null;
    const mutations = Array.isArray(mutationsRaw)
      ? mutationsRaw.map((m: unknown) => String(m ?? "").trim()).filter(Boolean)
      : undefined;
    out.push({ id, name, petSpecies, mutations });
    if (out.length >= MAX_BUTTONS) break;
  }
  return out;
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

async function handleInstantFeedForPet(petId: string, btn: HTMLButtonElement): Promise<void> {
  if (!petId) return;
  const prevDisabled = btn.disabled;
  const expectedPetId = petId;
  btn.disabled = true;
  try {
    const pet = await findPetById(petId);
    if (!pet) {
      await toastSimple("Instant feed", "Unable to resolve selected pet.", "error");
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
    if (btn.dataset.petId === expectedPetId) {
      btn.disabled = prevDisabled;
    }
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
