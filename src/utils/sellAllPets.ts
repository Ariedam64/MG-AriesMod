import { Atoms } from "../store/atoms";
import { ensureStore } from "../store/jotai";
import { PlayerService } from "../services/player";
import { toastSimple } from "../ui/toast";
import { audioPlayer } from "../core/audioPlayer";
import { StatsService } from "../services/stats";
import { computeInventoryItemValue } from "./inventoryValue";
import { getPetInfo } from "./petCalcul";
import { attachSpriteIcon } from "../ui/spriteIconCache";
import { lockerRestrictionsService } from "../services/lockerRestrictions";
import { petCatalog } from "../data";

/* =============================================================================
 * Inject a styled "Sell all Pets" button next to a detected "Sell X" button
 * Detection rule (NEW):
 *   - Button label (textContent or aria-label) must be EXACTLY 2 words
 *   - First word must be "Sell" (case-insensitive)
 *     e.g. "Sell Chicken", "Sell Cat" → OK
 *     e.g. "Sell all Pets" (3 mots) → IGNORÉ
 *     e.g. "Sell Golden Chicken" (3 mots) → IGNORÉ
 *
 * - SPA-friendly (MutationObserver + optional history hooks)
 * - Idempotent: 1 injected button per root (repositioned if DOM changes)
 * - Back-compat: keep options signatures, but targetText no longer used for detection
 * ==========================================================================='*/

export type InventoryPetItem = {
  id: string;
  itemType: "Pet";
  petSpecies?: string;
  name?: string | null;
  xp?: number;
  hunger?: number;
  mutations?: string[];
  targetScale?: number;
  abilities?: string[];
  inventoryIndex?: number;
  [key: string]: unknown;
};

export type SellAllPetsEventDetail = {
  pets: InventoryPetItem[];
  count: number;
};

export const SELL_ALL_PETS_EVENT = "sell-all-pets:list" as const;

const SELL_ALL_PETS_DRY_RUN = false;
const SELL_ALL_PETS_CONFIRM_MODAL_ID = "tm-sellallpets-confirm";

export interface ThemeColors {
  text: string;
  bg: string;
  border: string;
  hoverBg: string;
  hoverBorder: string;
  activeBg: string;
  ring: string;
}

export interface InjectOptions {
  /** Root container selector */
  rootSelector?: string;            // default: '.McFlex.css-1wu1jyg'
  /** Presence gate: must exist inside root */
  checkSelector?: string;           // default: '.McFlex.css-bvyqr8'
  /** Wide selector to find candidate buttons */
  buttonSelectorWide?: string;      // default includes 'button.chakra-button.css-1rizn4y'
  /** Strict selector (classes exactes) as fallback */
  buttonSelectorStrict?: string;    // default: 'button.chakra-button.css-1rizn4y'
  /** Target text (kept for back-compat, NOT used for detection anymore) */
  targetText?: string;              // default: 'Sell Pet'
  /** Label of injected button */
  injectText?: string;              // default: 'Sell all Pets'
  /** ClassName of injected button (used for idempotence) */
  injectedClass?: string;           // default: 'tm-injected-sell-all'
  /** CSS theme for injected button */
  theme?: ThemeColors;
  /** Attach history hooks (pushState/replaceState/popstate) */
  observeHistory?: boolean;         // default: true
  /** Callback for injected button click */
  onClick?: (ev: MouseEvent, ctx: { host: Element | null; targetBtn: HTMLButtonElement; injectedBtn: HTMLButtonElement; }) => void | Promise<void>;
  /** Light logger */
  log?: boolean | ((...args: unknown[]) => void);
}

export interface InjectController {
  stop(): void;
  runOnce(): void;
  isRunning(): boolean;
}

const DEFAULT_THEME: ThemeColors = {
  text:        'var(--chakra-colors-Neutral-TrueWhite, #FFFFFF)',
  bg:          'var(--chakra-colors-Blue-Magic, #0067B4)',
  border:      'var(--chakra-colors-Blue-Light, #48ADF4)',
  hoverBg:     'var(--chakra-colors-Blue-Light, #48ADF4)',
  hoverBorder: 'var(--chakra-colors-Blue-Baby, #25AAE2)',
  activeBg:    'var(--chakra-colors-Blue-Dark, #264093)',
  ring:        'var(--chakra-ring-color, rgba(66,153,225,0.6))',
};

export const DEFAULTS = {
  // conteneur principal du panel modal pet sell
  rootSelector: '.McFlex.css-1svwxx0',
  // gate : bloc qui contient le bouton (hash de classe instable côté Chakra)
  checkSelector: '.McGrid',
  // nouveau bouton "Sell Pet"
  buttonSelectorWide: 'button.chakra-button.css-1glc7hj, button.chakra-button, button.css-1glc7hj',
  buttonSelectorStrict: 'button.chakra-button.css-1glc7hj',
  targetText: 'Sell Pet', // Back-compat only
  injectText: 'Sell all Pets',
  injectedClass: 'tm-injected-sell-all',
  styleId: 'tm-injected-sell-all-style',
} as const;

/** Start the observer */
export function startInjectSellAllPets(options: InjectOptions = {}): InjectController {
  if (!isBrowser()) return noSSRController();

  const ROOT_SEL   = options.rootSelector      ?? DEFAULTS.rootSelector;
  const CHECK_SEL  = options.checkSelector     ?? DEFAULTS.checkSelector;
  const BTN_WIDE   = options.buttonSelectorWide  ?? DEFAULTS.buttonSelectorWide;
  const BTN_STRICT = options.buttonSelectorStrict ?? DEFAULTS.buttonSelectorStrict;
  const BTN_TEXT   = options.targetText        ?? DEFAULTS.targetText;     // kept for signature
  const INJ_TEXT   = options.injectText        ?? DEFAULTS.injectText;
  const INJ_CLASS  = options.injectedClass     ?? DEFAULTS.injectedClass;
  const THEME      = options.theme             ?? DEFAULT_THEME;
  const OBS_HIST   = options.observeHistory ?? true;

  const logger: (...args: unknown[]) => void =
    typeof options.log === 'function'
      ? options.log
      : options.log
      ? (...a: unknown[]) => console.debug('[injectSellAllPets]', ...a)
      : () => {};

  const HANDLE     = options.onClick ?? createDefaultClickHandler(logger);

  ensureStyle(INJ_CLASS, THEME);

  let running = true;
  let pending = false;

  const processAll = () => {
    if (!running || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      try {
        document.querySelectorAll(ROOT_SEL).forEach(root => processRoot(root as HTMLElement));
      } finally {
        pending = false;
      }
    });
  };

  function processRoot(root: HTMLElement) {
    const gate = root.querySelector(CHECK_SEL);
    if (!gate) { cleanup(root, INJ_CLASS); return; }

    const target = findTargetButton(root, BTN_WIDE, BTN_STRICT, BTN_TEXT);
    if (!target) { cleanup(root, INJ_CLASS); return; }

    ensureInjectedNextTo(target, INJ_CLASS, INJ_TEXT, (ev, ctx) => {
      safeInvokeClick(HANDLE, ev, ctx, logger);
    });
  }

  // Mutation observer
  const mo = new MutationObserver(processAll);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Initial pass
  processAll();

  // History hooks (optional)
  let unhookHistory: (() => void) | null = null;
  if (OBS_HIST) {
    unhookHistory = hookHistory(processAll);
  }

  return {
    stop() {
      if (!running) return;
      running = false;
      mo.disconnect();
      unhookHistory?.();
      logger('stopped');
    },
    runOnce() { processAll(); },
    isRunning() { return running; },
  };
}

/** One-shot pass without installing observers */
export function injectSellAllPetsOnce(options: Omit<InjectOptions, 'observeHistory' | 'log'> = {}): void {
  if (!isBrowser()) return;

  const ROOT_SEL   = options.rootSelector      ?? DEFAULTS.rootSelector;
  const CHECK_SEL  = options.checkSelector     ?? DEFAULTS.checkSelector;
  const BTN_WIDE   = options.buttonSelectorWide  ?? DEFAULTS.buttonSelectorWide;
  const BTN_STRICT = options.buttonSelectorStrict ?? DEFAULTS.buttonSelectorStrict;
  const BTN_TEXT   = options.targetText        ?? DEFAULTS.targetText;     // kept for signature
  const INJ_TEXT   = options.injectText        ?? DEFAULTS.injectText;
  const INJ_CLASS  = options.injectedClass     ?? DEFAULTS.injectedClass;
  const THEME      = options.theme             ?? DEFAULT_THEME;
  const logger: (...args: unknown[]) => void = () => {};
  const HANDLE     = options.onClick ?? createDefaultClickHandler(logger);

  ensureStyle(INJ_CLASS, THEME);

  document.querySelectorAll(ROOT_SEL).forEach(root => {
    const gate = (root as Element).querySelector(CHECK_SEL);
    if (!gate) { cleanup(root as Element, INJ_CLASS); return; }
    const target = findTargetButton(root as Element, BTN_WIDE, BTN_STRICT, BTN_TEXT);
    if (!target) { cleanup(root as Element, INJ_CLASS); return; }
    ensureInjectedNextTo(target, INJ_CLASS, INJ_TEXT, (ev, ctx) => { safeInvokeClick(HANDLE, ev, ctx, logger); });
  });
}

export async function runSellAllPetsFlow(
  logger: (...args: unknown[]) => void = () => {}
): Promise<void> {
  try {
    logger('sell-all-pets:log-items');
  } catch {}
  await PlayerService.logItems();
  const pets = await runDefaultSellAllPetsAction(logger);
  if (pets.length === 0) return;
  await sellPetsFromInventory(pets, logger);
}

/* ======================== inventory extraction logic ======================== */

export async function getUnfavoritedInventoryPets(): Promise<InventoryPetItem[]> {
  try { await ensureStore(); } catch {}

  const [inventory, favoriteIds] = await Promise.all([
    Atoms.inventory.myInventory.get().catch(() => null),
    Atoms.inventory.favoriteIds.get().catch(() => [] as string[]),
  ]);

  const favSet = new Set(
    Array.isArray(favoriteIds)
      ? favoriteIds.filter((id): id is string => typeof id === 'string')
      : []
  );

  const items = Array.isArray((inventory as any)?.items)
    ? (inventory as any).items as any[]
    : [];

  const availablePets: InventoryPetItem[] = [];

  items.forEach((item, index) => {
    if (!isInventoryPetItem(item)) return;
    if (favSet.has(item.id)) return;

    console.log("[sellAllPets] inventory index", index, item);
    availablePets.push({ ...item, inventoryIndex: index });
  });

  return availablePets;
}

function createDefaultClickHandler(logger: (...args: unknown[]) => void) {
  return async () => {
    try { logger('sell-all-pets:click'); } catch {}
    await runSellAllPetsFlow(logger);
  };
}

async function runDefaultSellAllPetsAction(
  logger: (...args: unknown[]) => void
): Promise<InventoryPetItem[]> {
  const pets = await getUnfavoritedInventoryPets();
  const detail: SellAllPetsEventDetail = { pets, count: pets.length };

  (globalThis as any).__sellAllPetsCandidates = pets;

  try { logger('collected-non-favorite-pets', detail); } catch {}

  try {
    (globalThis as any).dispatchEvent?.(
      new CustomEvent<SellAllPetsEventDetail>(SELL_ALL_PETS_EVENT, { detail })
    );
  } catch {}

  return pets;
}

async function sellPetsFromInventory(
  pets: InventoryPetItem[],
  logger: (...args: unknown[]) => void
): Promise<void> {
  const toSell = pets.filter((pet) => typeof pet?.id === 'string' && pet.id.trim().length > 0);


  if (toSell.length === 0) {
    try { logger('no-sellable-pets', { requested: pets.length }); } catch {}
    try { (globalThis as any).__sellAllPetsResult = { attempted: 0, sold: 0, failures: [] }; } catch {}
    return;
  }

  if (!(await confirmHighValuePetSale(toSell, logger))) {
    try { logger('sell-pets:cancelled'); } catch {}
    try { toastSimple("Sell all Pets", "Sale cancelled.", "info"); } catch {}
    return;
  }

  const failures: { pet: InventoryPetItem; error: unknown }[] = [];
  let sold = 0;

  const totalValue = computeTotalPetSellValueFromInventory(toSell);
  try { logger('sell-pets:total-value', { attempted: toSell.length, totalValue }); } catch {}

  if (SELL_ALL_PETS_DRY_RUN) {
    try { logger('sell-pets:dry-run', { attempted: toSell.length, totalValue }); } catch {}
    try { toastSimple("Sell all Pets", `Dry run: ${toSell.length} pets detected (no sale).`, "info"); } catch {}
    try { (globalThis as any).__sellAllPetsResult = { attempted: toSell.length, sold: 0, failures: [] }; } catch {}
    return;
  }

  for (const pet of toSell) {
    try { logger('sell-pet:start', { id: pet.id, pet }); } catch {}
    try {
      await PlayerService.sellPet(pet.id);
      sold += 1;
      StatsService.incrementShopStat("petsSoldCount");
      
      void (async () => {
        try {
          const total = await Atoms.pets.totalPetSellPrice.get();
          const value = Number(total);
          if (Number.isFinite(value) && value > 0) {
            StatsService.incrementShopStat("petsSoldValue", value);
          }
        } catch (error) {
          console.error("[SellPet] Unable to read pet sell price", error);
        }
      })();
      try { logger('sell-pet:success', { id: pet.id, pet }); } catch {}
    } catch (error) {
      failures.push({ pet, error });
      try { logger('sell-pet:error', { id: pet.id, error, pet }); } catch {}
    }
  }

  if (failures.length === 0) {
    toastSimple("Sell all Pets", `${sold} pets have been sold for ${totalValue} coins!`, "success");
  }

  try {
    (globalThis as any).__sellAllPetsResult = { attempted: toSell.length, sold, failures };
  } catch {}

  audioPlayer.playSellNotification()
  try { logger('sell-pets:complete', { attempted: toSell.length, sold, failures }); } catch {}
}

function computeTotalPetSellValueFromInventory(pets: InventoryPetItem[]): string {
  if (!pets.length) return "";
  let total = 0;
  for (const pet of pets) {
    const value = computeInventoryItemValue(pet);
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
    }
  }
  return total.toLocaleString("en-US");
}

type FlaggedPet = {
  pet: InventoryPetItem;
  reasons: string[];
  maxStrength: number | null;
  mutations: string[];
};

async function confirmHighValuePetSale(
  pets: InventoryPetItem[],
  logger: (...args: unknown[]) => void
): Promise<boolean> {
  const rules = lockerRestrictionsService.getSellAllPetsRules();
  if (!rules?.enabled) return true;

  const mutationProtect = new Set<string>();
  if (rules.protectGold) mutationProtect.add("gold");
  if (rules.protectRainbow) mutationProtect.add("rainbow");

  const maxStrThreshold = Number.isFinite(rules.maxStrThreshold)
    ? Math.max(0, Math.min(100, Math.round(rules.maxStrThreshold)))
    : 0;
  const checkMaxStr = !!rules.protectMaxStr;

  const protectedRarities = new Set<string>(
    Array.isArray(rules.protectedRarities) ? rules.protectedRarities : [],
  );

  if (mutationProtect.size === 0 && !checkMaxStr && protectedRarities.size === 0) return true;

  const flagged: FlaggedPet[] = [];
  for (const pet of pets) {
    const rawMutations = Array.isArray(pet?.mutations) ? pet.mutations : [];
    const mutations = rawMutations.filter((m): m is string => typeof m === "string");
    const foundMutations = mutationProtect.size
      ? mutations
        .map((m) => m.toLowerCase())
        .filter((m) => mutationProtect.has(m))
        .map((m) => (m === "gold" ? "Gold" : "Rainbow"))
      : [];
    const hasMutation = foundMutations.length > 0;
    const maxStrength = getPetInfo(pet as any)?.maxStrength;
    const strongEnough = checkMaxStr && typeof maxStrength === "number" && Number.isFinite(maxStrength)
      ? maxStrength >= maxStrThreshold
      : false;

    const petSpecies = String(pet.petSpecies || "").trim();
    const petEntry = petSpecies
      ? (petCatalog as Record<string, { rarity?: string } | undefined>)[petSpecies]
      : null;
    const petRarity = petEntry?.rarity ?? "";
    const hasProtectedRarity = protectedRarities.size > 0 && petRarity !== "" && protectedRarities.has(petRarity);

    if (!hasMutation && !strongEnough && !hasProtectedRarity) continue;

    const reasons: string[] = [];
    if (hasMutation) {
      for (const mut of Array.from(new Set(foundMutations))) {
        reasons.push(`Mutation: ${mut}`);
      }
    }
    if (strongEnough) {
      reasons.push(`Max STR: ${Math.floor(maxStrength ?? 0)}`);
    }
    if (hasProtectedRarity) {
      reasons.push(`Rarity: ${petRarity}`);
    }

    flagged.push({
      pet,
      reasons,
      maxStrength: typeof maxStrength === "number" && Number.isFinite(maxStrength) ? maxStrength : null,
      mutations,
    });
  }

  if (flagged.length === 0) return true;

  if (!isBrowser()) {
    try { logger('sell-pets:confirm-unavailable', { flagged: flagged.length }); } catch {}
    return false;
  }

  const confirmed = await showSellAllPetsConfirmModal(flagged);
  if (!confirmed) {
    try { logger('sell-pets:confirm-cancelled', { flagged: flagged.length }); } catch {}
  }
  return confirmed;
}

function showSellAllPetsConfirmModal(flagged: FlaggedPet[]): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isBrowser()) {
      resolve(false);
      return;
    }

    const existing = document.getElementById(SELL_ALL_PETS_CONFIRM_MODAL_ID);
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = SELL_ALL_PETS_CONFIRM_MODAL_ID;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483647";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(0,0,0,0.6)";

    const box = document.createElement("div");
    box.style.minWidth = "320px";
    box.style.maxWidth = "520px";
    box.style.background = "#0f1318";
    box.style.color = "#ffffff";
    box.style.border = "1px solid rgba(255,255,255,0.15)";
    box.style.borderRadius = "14px";
    box.style.boxShadow = "0 12px 40px rgba(0,0,0,0.45)";
    box.style.padding = "18px 20px";
    box.style.display = "grid";
    box.style.gap = "12px";
    box.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

    const title = document.createElement("div");
    title.textContent = "Confirm sell all pets";
    title.style.fontSize = "18px";
    title.style.fontWeight = "800";

    const body = document.createElement("div");
    body.textContent = "The following pets match protected rules:";
    body.style.opacity = "0.9";
    body.style.fontSize = "13px";
    body.style.lineHeight = "1.4";

    const list = document.createElement("div");
    list.style.display = "grid";
    list.style.gap = "8px";
    list.style.maxHeight = "260px";
    list.style.overflow = "auto";
    list.style.paddingRight = "4px";

    const buildPetRow = (entry: FlaggedPet) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "48px 1fr";
      row.style.gap = "10px";
      row.style.alignItems = "center";
      row.style.padding = "6px 8px";
      row.style.border = "1px solid rgba(255,255,255,0.08)";
      row.style.borderRadius = "10px";
      row.style.background = "rgba(255,255,255,0.03)";

      const imgWrap = document.createElement("div");
      imgWrap.style.width = "48px";
      imgWrap.style.height = "48px";
      imgWrap.style.borderRadius = "10px";
      imgWrap.style.background = "rgba(255,255,255,0.08)";
      imgWrap.style.display = "flex";
      imgWrap.style.alignItems = "center";
      imgWrap.style.justifyContent = "center";
      imgWrap.style.overflow = "hidden";

      const label = entry.pet.petSpecies || entry.pet.name || "Pet";
      const fallback = document.createElement("div");
      fallback.textContent = String(label).slice(0, 2).toUpperCase();
      fallback.style.fontSize = "12px";
      fallback.style.fontWeight = "700";
      imgWrap.appendChild(fallback);

      const species = String(entry.pet.petSpecies || "").trim();
      const mutations = Array.isArray(entry.mutations)
        ? entry.mutations.map((m) => String(m ?? "").trim()).filter(Boolean)
        : [];

      if (species) {
        attachSpriteIcon(
          imgWrap,
          ["pet"],
          [species, entry.pet.name || ""],
          48,
          "sell-all-pets-confirm",
          {
            mutations,
          },
        );
      }

      const info = document.createElement("div");
      info.style.display = "grid";
      info.style.gap = "4px";

      const name = document.createElement("div");
      name.textContent = entry.pet.name ? `${entry.pet.name} (${entry.pet.petSpecies ?? "Pet"})` : (entry.pet.petSpecies ?? "Pet");
      name.style.fontWeight = "700";
      name.style.fontSize = "13px";

      const reasons = document.createElement("div");
      reasons.style.display = "flex";
      reasons.style.flexWrap = "wrap";
      reasons.style.gap = "6px";

      for (const reason of entry.reasons) {
        const chip = document.createElement("div");
        chip.textContent = reason;
        chip.style.fontSize = "11px";
        chip.style.padding = "2px 6px";
        chip.style.borderRadius = "999px";
        chip.style.background = "rgba(122,162,255,0.2)";
        chip.style.border = "1px solid rgba(122,162,255,0.4)";
        chip.style.color = "#dbe7ff";
        reasons.appendChild(chip);
      }

      info.append(name, reasons);
      row.append(imgWrap, info);
      return row;
    };

    for (const entry of flagged) {
      list.appendChild(buildPetRow(entry));
    }

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "8px";

    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.textContent = "Cancel";
    btnCancel.style.padding = "8px 12px";
    btnCancel.style.borderRadius = "10px";
    btnCancel.style.border = "1px solid rgba(255,255,255,0.2)";
    btnCancel.style.background = "transparent";
    btnCancel.style.color = "#ffffff";
    btnCancel.style.cursor = "pointer";

    const btnConfirm = document.createElement("button");
    btnConfirm.type = "button";
    btnConfirm.textContent = "Sell";
    btnConfirm.style.padding = "8px 14px";
    btnConfirm.style.borderRadius = "10px";
    btnConfirm.style.border = "1px solid rgba(122,162,255,0.7)";
    btnConfirm.style.background = "#1a2644";
    btnConfirm.style.color = "#ffffff";
    btnConfirm.style.cursor = "pointer";
    btnConfirm.style.fontWeight = "700";

    let settled = false;
    const close = (value: boolean) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown, true);
      resolve(value);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close(false);
      }
    };

    btnCancel.addEventListener("click", () => close(false));
    btnConfirm.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) close(false);
    });

    actions.append(btnCancel, btnConfirm);
    box.append(title, body, list, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeyDown, true);
    btnConfirm.focus();
  });
}

function safeInvokeClick(
  handler: NonNullable<InjectOptions['onClick']>,
  ev: MouseEvent,
  ctx: { host: Element | null; targetBtn: HTMLButtonElement; injectedBtn: HTMLButtonElement; },
  logger: (...args: unknown[]) => void,
): void {
  try {
    const result = handler(ev, ctx);
    if (isPromiseLike(result)) {
      result.catch((err) => logClickError(err, logger));
    }
  } catch (err) {
    logClickError(err, logger);
  }
}

function logClickError(error: unknown, logger: (...args: unknown[]) => void) {
  try { logger('sell-all-click-error', error); } catch {}
}

function isPromiseLike<T = unknown>(value: any): value is PromiseLike<T> {
  return !!value && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function';
}

function isInventoryPetItem(item: any): item is InventoryPetItem {
  return !!item && item.itemType === 'Pet' && typeof item.id === 'string';
}

/* =============================== helpers =============================== */

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function noSSRController(): InjectController {
  return { stop() {}, runOnce() {}, isRunning: () => false };
}

function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Get a meaningful label from the button (prefers textContent, falls back to aria-label). */
function getLabel(el: Element): string {
  const t = norm(el.textContent);
  if (t) return t;
  const a = norm(el.getAttribute('aria-label'));
  return a;
}

/** Split into words via spaces (robust to nested spans/icons). */
function getWords(label: string): string[] {
  return label.trim().split(/\s+/).filter(Boolean);
}

/** True if label is exactly 2 words and starts with "Sell" (case-insensitive). */
function isSellTwoWordLabel(label: string): boolean {
  const words = getWords(label);
  return words.length === 2 && /^sell$/i.test(words[0]);
}

/** NEW detection: pick any button whose label/aria-label is exactly two words, starting with "Sell". */
function findTargetButton(
  scope: Element,
  btnWide: string,
  btnStrict: string,
  _btnText: string // kept for signature/back-compat, not used
): HTMLButtonElement | null {
  const all = Array.from(new Set([
    ...Array.from(scope.querySelectorAll(btnWide)),
    ...Array.from(scope.querySelectorAll(btnStrict)),
  ]))
    .filter((b): b is HTMLButtonElement => b instanceof HTMLButtonElement)
    .filter((b) => !b.classList.contains(DEFAULTS.injectedClass)); // ignore our injected button

  const target = all.find((b) => {
    const label = getLabel(b);
    if (/crops/i.test(label)) return false; // do not inject next to "Sell Crops"
    // Cas A (legacy) : bouton "Sell <petName>" du panel modal pet sell (2 mots)
    if (isSellTwoWordLabel(label)) return true;
    // Cas B (nouveau format) : bouton "Sell" + <canvas> (icône du pet) dans le modal
    if (/^sell$/i.test(label.trim()) && b.querySelector("canvas")) return true;
    return false;
  });
  return target ?? null;
}

function ensureInjectedNextTo(
  targetBtn: HTMLButtonElement,
  injectedClass: string,
  injectedText: string,
  onClick: (ev: MouseEvent, ctx: { host: Element | null; targetBtn: HTMLButtonElement; injectedBtn: HTMLButtonElement; }) => void
): void {
  const parent = (targetBtn.parentElement || targetBtn.closest('.McFlex, .css-0') || targetBtn.parentNode) as HTMLElement | null;
  if (!parent) return;

  // Idempotence: reuse if exists
  let injected = parent.querySelector(`.${injectedClass}`) as HTMLButtonElement | null;
  if (injected) {
    if (targetBtn.nextElementSibling !== injected) {
      parent.insertBefore(injected, targetBtn.nextSibling);
    }
    if (injected.textContent !== injectedText) injected.textContent = injectedText;
    return;
  }

  injected = document.createElement('button');
  injected.type = 'button';
  injected.className = `${injectedClass} chakra-button`;
  injected.textContent = injectedText;
  injected.setAttribute('aria-label', injectedText);
  injected.title = injectedText;

  // spacing next to source button
  injected.style.marginLeft = '8px';

  // Align nicely when parent is not flex
  const cs = getComputedStyle(parent);
  if (cs.display !== 'flex') {
    injected.style.display = 'inline-flex';
    injected.style.alignItems = 'center';
  }

  injected.addEventListener('click', (ev) => onClick(ev, {
    host: targetBtn.closest(DEFAULTS.rootSelector),
    targetBtn,
    injectedBtn: injected!,
  }));

  parent.insertBefore(injected, targetBtn.nextSibling);
}

function cleanup(root: Element, injectedClass: string): void {
  root.querySelectorAll(`.${injectedClass}`).forEach((n) => n.remove());
}

function ensureStyle(injectedClass: string, theme: ThemeColors) {
  const STYLE_ID = `${injectedClass}-style`;
  if (document.getElementById(STYLE_ID)) return;

  const css = `
.${injectedClass}{
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
  -webkit-text-size-adjust: 100%;
  cursor: pointer;
  display: inline-flex;
  appearance: none;
  align-items: center;
  justify-content: center;
  user-select: none;
  white-space: nowrap;
  vertical-align: middle;

  outline: transparent solid 2px;
  outline-offset: 2px;
  line-height: 1.2;

  border-radius: 15px;                        /* aligns with provided design */
  font-weight: 700;
  height: auto;
  min-width: var(--chakra-sizes-10, 2.5rem);
  box-shadow: rgba(0, 0, 0, 0.3) 0px 4px 12px;
  transform: translateY(0px);
  transition: 0.2s;

  border: 2px solid ${theme.border};
  color: ${theme.text};
  background: ${theme.bg};

  text-transform: none;
  overflow: hidden;
  font-size: 20px;
  padding-inline-start: var(--chakra-space-4, 1rem);
  padding-inline-end: var(--chakra-space-4, 1rem);
  padding-top: var(--chakra-space-3, 0.75rem);
  padding-bottom: var(--chakra-space-3, 0.75rem);

  -webkit-tap-highlight-color: transparent;
}
.${injectedClass}:hover{
  transform: translateY(-1px);
  background: ${theme.hoverBg};
  border-color: ${theme.hoverBorder};
}
.${injectedClass}:active{
  transform: translateY(1px);
  background: ${theme.activeBg};
}
.${injectedClass}:focus-visible{
  box-shadow: 0 0 0 3px ${theme.ring};
}
`.trim();

  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
}

function hookHistory(onNavigate: () => void): () => void {
  const p = history.pushState?.bind(history);
  const r = history.replaceState?.bind(history);
  const wrap = <T extends (...a: any[]) => any>(fn?: T): T | undefined =>
    fn ? (function (this: unknown, ...args: Parameters<T>) {
      const ret = fn.apply(this, args as any);
      onNavigate();
      return ret;
    } as T) : fn;

  if (p) history.pushState = wrap(p)!;
  if (r) history.replaceState = wrap(r)!;
  const onPop = () => onNavigate();
  window.addEventListener('popstate', onPop);

  return () => {
    if (p) history.pushState = p;
    if (r) history.replaceState = r;
    window.removeEventListener('popstate', onPop);
  };
}
