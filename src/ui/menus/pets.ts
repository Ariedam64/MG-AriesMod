// src/ui/menus/pets.ts
// UI UNIQUEMENT (aucune logique). Aligné sur le style/layout de garden.ts.

import { Menu} from "../menu";
import { PetsService,
  InventoryPet,
  installPetTeamHotkeysOnce,
  setTeamsForHotkeys } from "../../services/pets";
import type { PetInfo } from "../../services/player";
import type { PetTeam } from "../../services/pets";
import { onActivePetsStructuralChangeNow } from "../../store/atoms";
import { attachSpriteIcon } from "../spriteIconCache";
import { rarityBadge } from "./notifier";
import { petCatalog, plantCatalog, petAbilities } from "../../data";
import { getPetStrength, getPetMaxStrength } from "../../utils/petCalcul";
import {
  isInstantFeedWidgetEnabled,
  setInstantFeedWidgetEnabled,
} from "../../utils/instantFeedWidget";
import { renderHatchTab } from "./petsHatch";

/* ================== petits helpers UI (mêmes vibes que garden) ================== */


  // Ability → { bg, hover } — couleurs servies par l'API en priorité
export function getAbilityChipColors(id: string): { bg: string; hover: string } {
  const key = String(id || "");

  // The abilities catalog is enriched at runtime with the exact chip colors
  // parsed from the game bundle (data/dynamic/logic/abilityColors.ts). The
  // hardcoded mapping below is only a fallback until enrichment completes.
  const apiColor = (petAbilities as Record<string, any>)?.[key]?.color;
  if (apiColor && typeof apiColor.bg === "string" && apiColor.bg) {
    const hover = typeof apiColor.hover === "string" && apiColor.hover ? apiColor.hover : apiColor.bg;
    return { bg: apiColor.bg, hover };
  }

  const base = (PetsService.getAbilityNameWithoutLevel?.(key) || "")
    .replace(/[\s\-_]+/g, "")
    .toLowerCase();

  const is = (prefix: string) =>
    key.startsWith(prefix) || base === prefix.toLowerCase();

  // Celestials / événements spéciauxa
  if (is("MoonKisser")) {
    return {
      bg: "rgba(250,166,35,0.9)",
      hover: "rgba(250,166,35,1)",
    };
  }

  if (is("DawnKisser")) {
    return {
      bg: "rgba(162,92,242,0.9)",
      hover: "rgba(162,92,242,1)",
    };
  }

  // Boosts de production / croissance / œufs / âge / taille / XP
  if (is("ProduceScaleBoost") || is("SnowyCropSizeBoost")) {
    // I & II (+ Snowy)
    return { bg: "rgba(34,139,34,0.9)", hover: "rgba(34,139,34,1)" };
  }

  if (is("PlantGrowthBoost") || is("SnowyPlantGrowthBoost") || is("DawnPlantGrowthBoost") || is("AmberPlantGrowthBoost") || is("ThunderPlantGrowthBoost")) {
    return { bg: "rgba(0,128,128,0.9)", hover: "rgba(0,128,128,1)" };
  }

  if (is("EggGrowthBoost") || is("SnowyEggGrowthBoost") || is("ThunderEggGrowthBoost")) {
    // I, II_NEW, II (III en jeu) + Snowy
    return { bg: "rgba(180,90,240,0.9)", hover: "rgba(180,90,240,1)" };
  }

  if (is("PetAgeBoost")) {
    // I & II
    return { bg: "rgba(147,112,219,0.9)", hover: "rgba(147,112,219,1)" };
  }

  if (is("PetHatchSizeBoost")) {
    // I & II
    return { bg: "rgba(128,0,128,0.9)", hover: "rgba(128,0,128,1)" };
  }

  if (is("PetXpBoost") || is("SnowyPetXpBoost") || is("DawnXpBoost") || is("ThunderXpBoost")) {
    // I & II (+ Snowy / Dawn / Thunder)
    return { bg: "rgba(30,144,255,0.9)", hover: "rgba(30,144,255,1)" };
  }

  // Faim / regen faim
  if (is("HungerBoost") || is("SnowyHungerBoost")) {
    // I & II (+ Snowy)
    return { bg: "rgba(255,20,147,0.9)", hover: "rgba(255,20,147,1)" };
  }

  if (is("HungerRestore") || is("SnowyHungerRestore")) {
    // I & II (+ Snowy)
    return { bg: "rgba(255,105,180,0.9)", hover: "rgba(255,105,180,1)" };
  }

  // Sell Boost (toutes les versions)
  if (is("SellBoost")) {
    // I, II, III, IV
    return { bg: "rgba(220,20,60,0.9)", hover: "rgba(220,20,60,1)" };
  }

  // Coin Finder (I, II, III + Snowy / Dawn / Thunder)
  if (is("CoinFinder") || is("SnowyCoinFinder") || is("DawnCoinFinder") || is("ThunderCoinFinder")) {
    return { bg: "rgba(180,150,0,0.9)", hover: "rgba(180,150,0,1)" };
  }

  // Seed Finder (I à IV) → même couleur pour toutes les versions
  if (is("SeedFinder")) {
    return {
      bg: "rgba(168,102,38,0.9)",
      hover: "rgba(168,102,38,1)",
    };
  }

  // Mutation / mutation pets
  if (is("ProduceMutationBoost") || is("SnowyCropMutationBoost") || is("DawnBoost") || is("AmberMoonBoost") || is("ThunderBoost")) {
    return { bg: "rgba(140,15,70,0.9)", hover: "rgba(140,15,70,1)" };
  }

  if (is("PetMutationBoost")) {
    // I & II
    return { bg: "rgba(160,50,100,0.9)", hover: "rgba(160,50,100,1)" };
  }

  // Double récolte / double hatch
  if (is("DoubleHarvest")) {
    return { bg: "rgba(0,120,180,0.9)", hover: "rgba(0,120,180,1)" };
  }

  if (is("DoubleHatch")) {
    return { bg: "rgba(60,90,180,0.9)", hover: "rgba(60,90,180,1)" };
  }

  // Abilities liées aux crops / ventes / refund
  if (is("ProduceEater")) {
    return { bg: "rgba(255,69,0,0.9)", hover: "rgba(255,69,0,1)" };
  }

  if (is("ProduceRefund")) {
    return { bg: "rgba(255,99,71,0.9)", hover: "rgba(255,99,71,1)" };
  }

  // Pet refund
  if (is("PetRefund")) {
    // I & II
    return { bg: "rgba(0,80,120,0.9)", hover: "rgba(0,80,120,1)" };
  }

  // Copycat
  if (is("Copycat")) {
    return { bg: "rgba(255,140,0,0.9)", hover: "rgba(255,140,0,1)" };
  }

  // Gold granter (gradient)
  if (is("GoldGranter")) {
    return {
      bg: "linear-gradient(135deg, rgba(225,200,55,0.9) 0%, rgba(225,180,10,0.9) 40%, rgba(215,185,45,0.9) 70%, rgba(210,185,45,0.9) 100%)",
      hover:
        "linear-gradient(135deg, rgba(220,200,70,1) 0%, rgba(210,175,5,1) 40%, rgba(210,185,55,1) 70%, rgba(200,175,30,1) 100%)",
    };
  }

  // Rainbow granter (gradient)
  if (is("RainbowGranter")) {
    return {
      bg: "linear-gradient(45deg, rgba(200,0,0,0.9), rgba(200,120,0,0.9), rgba(160,170,30,0.9), rgba(60,170,60,0.9), rgba(50,170,170,0.9), rgba(40,150,180,0.9), rgba(20,90,180,0.9), rgba(70,30,150,0.9))",
      hover:
        "linear-gradient(45deg, rgba(200,0,0,1), rgba(200,120,0,1), rgba(160,170,30,1), rgba(60,170,60,1), rgba(50,170,170,1), rgba(40,150,180,1), rgba(20,90,180,1), rgba(70,30,150,1))",
    };
  }

  // Rain Dance
  if (is("RainDance")) {
    return { bg: "rgba(76,204,204,0.9)", hover: "rgba(76,204,204,1)" };
  }

  // Cold mutations granters
  if (is("SnowGranter")) {
    return { bg: "rgba(144,184,204,0.9)", hover: "rgba(144,184,204,1)" };
  }

  if (is("FrostGranter")) {
    return { bg: "rgba(148,160,204,0.9)", hover: "rgba(148,160,204,1)" };
  }

  if (is("DawnlitGranter")) {
    return { bg: "rgba(196,124,180,0.9)", hover: "rgba(196,124,180,1)" };
  }

  if (is("AmberlitGranter")) {
    return { bg: "rgba(204,144,96,0.9)", hover: "rgba(204,144,96,1)" };
  }

  if (is("ThunderstruckGranter")) {
    return { bg: "rgba(194,184,60,0.9)", hover: "rgba(194,184,60,1)" };
  }

  if (is("Thundercharger")) {
    return { bg: "rgba(31,163,130,0.9)", hover: "rgba(31,163,130,1)" };
  }

  if (is("Thunderbloom")) {
    return { bg: "rgba(112,246,203,0.9)", hover: "rgba(112,246,203,1)" };
  }

  // Couleur neutre par défaut (même que le jeu)
  return {
    bg: "rgba(100,100,100,0.9)",
    hover: "rgba(150,150,150,1)",
  };
}

/* ================== Onglet: Manager ================== */
function renderManagerTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";

  // --- state
  let teams: PetTeam[] = [];
  let selectedId: string | null = null;
  let activeTeamId: string | null = null;
  let activePetIdSet = new Set<string>();

  // gel visuel pendant application d’une team
  let isApplyingTeam = false;

  // DnD anim state
  let draggingIdx: number | null = null;
  let overInsertIdx: number | null = null;
  let draggingHeight = 0;

  let invCacheMap: Map<string, InventoryPet> | null = null;
  const lastRenderedSlotIds: (string | null)[] = [null, null, null];

  const miniSpriteCache = new Map<string, string>();

  async function buildPetRenderMap(): Promise<Map<string, InventoryPet>> {
    let inv = await PetsService.getInventoryPets().catch(() => null) as InventoryPet[] | null;
    if (!inv || inv.length === 0) {
      // keep previous cache (if any)
    } else {
      invCacheMap = new Map<string, InventoryPet>();
      for (const p of inv) {
        const id = p?.id != null ? String(p.id) : "";
        if (id) invCacheMap.set(id, p);
      }
    }

    const map = new Map<string, InventoryPet>(invCacheMap ?? new Map());
    try {
      const pets = await PetsService.getPets();
      const list = Array.isArray(pets) ? pets : [];
      for (const p of list) {
        const slot = (p as any)?.slot ?? null;
        const id = String(slot?.id || "");
        if (!id || map.has(id)) continue;
        map.set(id, {
          id,
          itemType: "Pet",
          petSpecies: String(slot?.petSpecies || "").trim(),
          name: slot?.name ?? null,
          xp: Number.isFinite(slot?.xp as number) ? Number(slot.xp) : 0,
          hunger: Number.isFinite(slot?.hunger as number) ? Number(slot.hunger) : 0,
          mutations: Array.isArray(slot?.mutations) ? slot.mutations.slice() : [],
          targetScale: Number.isFinite(slot?.targetScale as number) ? Number(slot.targetScale) : undefined,
          abilities: Array.isArray(slot?.abilities) ? slot.abilities.slice() : [],
        });
      }
    } catch {}

    return map;
  }

  const mkMiniIcon = (pet: InventoryPet | null): HTMLElement => {
    const size = 18;
    const holder = document.createElement("div");
    Object.assign(holder.style, {
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "6px",
      background: "#161b22",
      border: "1px solid #ffffff10",
      display: "grid",
      placeItems: "center",
      overflow: "hidden",
      boxShadow: "0 1px 0 #000 inset",
      fontSize: "10px",
      color: "#e2e8f0",
    } as CSSStyleDeclaration);

    if (!pet) {
      holder.style.opacity = "0.35";
      holder.textContent = "·";
      return holder;
    }

    const species = pet.petSpecies || "";
    const mutKey = Array.isArray(pet.mutations) ? pet.mutations.join(",") : "";
    const cacheKey = `${species}|${mutKey}`;

    const applyImg = (dataUrl: string) => {
      const img = document.createElement("img");
      img.src = dataUrl;
      img.width = size;
      img.height = size;
      img.alt = "";
      img.draggable = false;
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      img.style.objectFit = "contain";
      img.style.imageRendering = "auto";
      holder.replaceChildren(img);
    };

    const cached = miniSpriteCache.get(cacheKey);
    if (cached) {
      applyImg(cached);
      return holder;
    }

    attachSpriteIcon(holder, ["pet"], species, size, "pet-team-mini", {
      mutations: pet.mutations,
      onSpriteApplied: (img) => {
        miniSpriteCache.set(cacheKey, img.src);
      },
      onNoSpriteFound: () => {
        holder.textContent = (species || pet.name || "pet").charAt(0).toUpperCase();
      },
    });
    return holder;
  };

  function applySubtleBorder(btn: HTMLButtonElement, hex: string, alpha = 0.22) {
    const toRgba = (h: string, a: number) => {
      const m = h.replace("#", "");
      const r = parseInt(m.length === 3 ? m[0] + m[0] : m.slice(0, 2), 16);
      const g = parseInt(m.length === 3 ? m[1] + m[1] : m.slice(2, 4), 16);
      const b = parseInt(m.length === 3 ? m[2] + m[2] : m.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    };

    const border = toRgba(hex, alpha);
    btn.style.border = `1px solid ${border}`;
    btn.style.background = "#1f2328";
    btn.style.boxShadow = "none";
    btn.style.transition = "none";
  }

  const framed = (title: string, content: HTMLElement) => {
    const cardSection = ui.card(title, { tone: "muted", align: "center" });
    cardSection.body.append(content);
    cardSection.root.style.maxWidth = "720px";
    return cardSection.root;
  };
  const row = (opts?: { justify?: "start" | "center" }) => ui.flexRow({ justify: opts?.justify ?? "center" });

  // layout global
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "minmax(220px, 280px) minmax(0, 1fr)";
  wrap.style.gap = "10px";
  wrap.style.alignItems = "stretch";
  wrap.style.height = "54vh";
  wrap.style.overflow = "hidden";
  view.appendChild(wrap);

  /* ================= LEFT: liste des teams ================= */
  const left = document.createElement("div");
  left.style.display = "grid";
  left.style.gridTemplateRows = "1fr auto";
  left.style.gap = "8px";
  left.style.minHeight = "0";
  wrap.appendChild(left);

  const teamList = document.createElement("div");
  teamList.style.display = "flex";
  teamList.style.flexDirection = "column";
  teamList.style.gap = "6px";
  teamList.style.overflow = "auto";
  teamList.style.padding = "6px";
  teamList.style.border = "1px solid #4445";
  teamList.style.borderRadius = "10px";
  teamList.style.scrollBehavior = "smooth";
  teamList.style.minHeight = "0";
  left.appendChild(teamList);

  const footer = document.createElement("div");
  footer.style.display = "flex";
  footer.style.gap = "6px";
  left.appendChild(footer);

  const btnNew = ui.btn("➕ New", { variant: "primary", size: "sm" }); btnNew.id = "pets.teams.new";
  btnNew.style.flex = "1 1 0";
  const btnDel = ui.btn("🗑️ Delete", { variant: "danger", size: "sm" }); btnDel.id = "pets.teams.delete";
  btnDel.style.flex = "1 1 0";
  applySubtleBorder(btnNew, "#22c55e", 0.22);
  applySubtleBorder(btnDel, "#ef4444", 0.22);
  footer.append(btnNew, btnDel);

  // helpers
  function getSelectedTeam(): PetTeam | null {
    return teams.find(t => t.id === selectedId) || null;
  }

  // calcule l’index d’insertion en se basant sur la position Y dans la liste
  function computeInsertIndex(clientY: number): number {
    const children = Array.from(teamList.children) as HTMLElement[];
    if (!children.length) return 0;
    const first = children[0].getBoundingClientRect();
    if (clientY < first.top + first.height / 2) return 0;
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) return i;
    }
    return children.length;
  }

  function abilitiesBadge(abilities: string[]): HTMLElement {
    const wrap = document.createElement("span");
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.lineHeight = "1";

    const SPACING_PX = 8;
    const SIZE_PX = 12;
    const RADIUS_PX = 3;

    const ids = Array.isArray(abilities) ? abilities.filter(Boolean) : [];
    if (!ids.length) {
      const empty = document.createElement("span");
      empty.textContent = "No ability";
      empty.style.opacity = "0.75";
      empty.style.fontSize = "12px";
      wrap.appendChild(empty);
      return wrap;
    }

    ids.forEach((id, i) => {
      const chip = document.createElement("span");
      const { bg, hover } = getAbilityChipColors(id);
      chip.title = PetsService.getAbilityName(id) || id;
      chip.setAttribute("aria-label", chip.title);

      Object.assign(chip.style, {
        display: "inline-block",
        width: `${SIZE_PX}px`,
        height: `${SIZE_PX}px`,
        borderRadius: `${RADIUS_PX}px`,
        marginRight: i === ids.length - 1 ? "0" : `${SPACING_PX}px`,
        background: bg,
        transition: "transform 80ms ease, box-shadow 120ms ease, background 120ms ease",
        cursor: "default",
        boxShadow: "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff1a",
      } as CSSStyleDeclaration);

      chip.onmouseenter = () => {
        chip.style.background = hover;
        chip.style.transform = "scale(1.08)";
        chip.style.boxShadow = "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff33";
      };
      chip.onmouseleave = () => {
        chip.style.background = bg;
        chip.style.transform = "none";
        chip.style.boxShadow = "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff1a";
      };

      wrap.appendChild(chip);
    });

    return wrap;
  }

  // petit util pour animer le déplacement “live” (sans rerender)
  function applyLiveTransforms() {
    const children = Array.from(teamList.children) as HTMLElement[];
    children.forEach((el) => (el.style.transform = ""));
    if (draggingIdx === null || overInsertIdx === null) return;
    const from = draggingIdx;
    const to = overInsertIdx;
    children.forEach((el, idx) => {
      el.style.transition = "transform 120ms ease";
      if (idx === from) return;
      if (to > from && idx > from && idx < to) {
        el.style.transform = `translateY(${-draggingHeight}px)`;
      }
      if (to < from && idx >= to && idx < from) {
        el.style.transform = `translateY(${draggingHeight}px)`;
      }
    });
  }
  function clearLiveTransforms() {
    Array.from(teamList.children).forEach((el) => {
      (el as HTMLElement).style.transform = "";
      (el as HTMLElement).style.transition = "";
    });
  }

  async function refreshActiveIds() {
    activeTeamId = null;
    activePetIdSet = new Set();
    try {
      const pets = await PetsService.getPets();
      const equipIds = Array.isArray(pets)
        ? pets.map(p => String(p?.slot?.id || "")).filter(Boolean)
        : [];
      activePetIdSet = new Set(equipIds);
      for (const t of teams) {
        const tIds = (t.slots || []).filter(Boolean) as string[];
        if (tIds.length !== equipIds.length) continue;
        let same = true;
        for (const id of tIds) { if (!activePetIdSet.has(id)) { same = false; break; } }
        if (same) { activeTeamId = t.id; break; }
      }
    } catch {}
  }

  // re-render list items
  function updateSelectedVisuals() {
    const children = Array.from(teamList.children) as HTMLElement[];
    children.forEach((el) => {
      const id = el.dataset.teamId || "";
      el.style.background = id === selectedId ? "#2a313a" : "#1f2328";
    });

    updateSelectedVisuals();
  }

  async function refreshTeamList(skipDetectActive = false) {
    if (!skipDetectActive) {
      await refreshActiveIds();
    }
    const renderMap = await buildPetRenderMap();
    clearLiveTransforms();
    draggingIdx = null;
    overInsertIdx = null;
    draggingHeight = 0;

    teamList.innerHTML = "";

    if (!teams.length) {
      const empty = document.createElement("div");
      empty.textContent = "No teams yet. Create one!";
      empty.style.opacity = "0.75";
      empty.style.textAlign = "center";
      empty.style.padding = "8px";
      teamList.appendChild(empty);
      hydrateEditor(null);
      return;
    }

    teams.forEach((t, idx) => {
      const item = document.createElement("div");
      const isActive = t.id === activeTeamId;
      item.dataset.index = String(idx);
      item.dataset.teamId = t.id;
      item.textContent = "";
      item.style.height = "36px";
      item.style.lineHeight = "36px";
      item.style.padding = "0 10px";
      item.style.border = "1px solid #ffffff15";
      item.style.borderRadius = "6px";
      item.style.cursor = "pointer";
      item.style.fontSize = "13px";
      item.style.overflow = "hidden";
      item.style.whiteSpace = "nowrap";
      item.style.textOverflow = "ellipsis";
      item.style.display = "flex";
      item.style.flex = "0 0 auto";
      item.style.gap = "8px";
      item.style.alignItems = "center";
      item.style.background = t.id === selectedId ? "#2a313a" : "#1f2328";

      const dot = document.createElement("span");
      dot.style.width = "10px";
      dot.style.height = "10px";
      dot.style.borderRadius = "50%";
      dot.style.boxShadow = "0 0 0 1px #0006 inset";
      dot.style.background = isActive ? "#48d170" : "#64748b";
      dot.title = isActive ? "This team is currently active" : "Inactive team";

      const label = document.createElement("span");
      label.textContent = t.name || "(unnamed)";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.style.whiteSpace = "nowrap";
      label.style.flex = "1 1 0";
      const minis = document.createElement("div");
      minis.style.display = "flex";
      minis.style.gap = "4px";
      minis.style.alignItems = "center";
      minis.style.marginLeft = "auto";
      const slots = Array.isArray(t.slots) ? t.slots.slice(0, 3) : [];
      slots.forEach((id) => {
        const pet = id != null ? renderMap.get(String(id)) ?? null : null;
        minis.appendChild(mkMiniIcon(pet));
      });
      if (slots.length < 3) {
        for (let i = slots.length; i < 3; i += 1) minis.appendChild(mkMiniIcon(null));
      }

      item.append(dot, label, minis);

      const grab = document.createElement("span");
      grab.className = "qmm-grab";
      grab.title = "Drag to reorder";
      grab.setAttribute("aria-label", "Drag to reorder");
      grab.innerHTML = "";
      for (let i = 0; i < 6; i += 1) {
        const dot = document.createElement("span");
        dot.className = "qmm-grab-dot";
        grab.appendChild(dot);
      }
      grab.draggable = true;

      item.onmouseenter = () => (item.style.borderColor = "#6aa1");
      item.onmouseleave = () => (item.style.borderColor = "#ffffff15");

      item.onclick = (ev) => {
        if ((ev as any).__byDrag) return;
        const changed = selectedId !== t.id;
        if (changed) {
          selectedId = t.id;
          refreshTeamList(true);
        }
        void hydrateEditor(getSelectedTeam());
      };

      grab.addEventListener("dragstart", (ev) => {
        draggingIdx = idx;
        draggingHeight = item.getBoundingClientRect().height;
        item.classList.add("qmm-dragging");
        ev.dataTransfer?.setData("text/plain", String(idx));
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
        try {
          const ghost = item.cloneNode(true) as HTMLElement;
          ghost.style.width = `${item.getBoundingClientRect().width}px`;
          ghost.style.position = "absolute";
          ghost.style.top = "-9999px";
          document.body.appendChild(ghost);
          ev.dataTransfer!.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
          setTimeout(() => document.body.removeChild(ghost), 0);
        } catch {}
      });

      grab.addEventListener("dragend", () => {
        item.classList.remove("qmm-dragging");
        clearLiveTransforms();
        draggingIdx = null;
        overInsertIdx = null;
      });

      item.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        if (draggingIdx === null) return;

        const idxOver = Number((ev.currentTarget as HTMLElement).dataset.index || -1);
        if (idxOver < 0) return;
        const rect = item.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const insertIdx = (ev.clientY < mid) ? idxOver : idxOver + 1;

        const clamped = Math.max(0, Math.min(teams.length, insertIdx));
        if (overInsertIdx !== clamped) {
          overInsertIdx = clamped;
          applyLiveTransforms();
        }

        const edge = 28;
        const listRect = teamList.getBoundingClientRect();
        if (ev.clientY < listRect.top + edge) teamList.scrollTop -= 18;
        else if (ev.clientY > listRect.bottom - edge) teamList.scrollTop += 18;
      });

      item.addEventListener("drop", (ev) => {
        ev.preventDefault();
        (ev as any).__byDrag = true;
        if (draggingIdx === null) return;

        let target = overInsertIdx ?? computeInsertIndex(ev.clientY);
        if (target > draggingIdx) target -= 1;

        target = Math.max(0, Math.min(teams.length - 1, target));
        if (target !== draggingIdx) {
          const a = teams.slice();
          const [it] = a.splice(draggingIdx, 1);
          a.splice(target, 0, it);
          teams = a;
          try { PetsService.setTeamsOrder(teams.map(x => x.id)); } catch {}
        }

        clearLiveTransforms();
        draggingIdx = null;
        overInsertIdx = null;
        draggingHeight = 0;

        refreshTeamList();
      });

      item.appendChild(grab);
      teamList.appendChild(item);
    });
  }

  // autorise le drop "dans les trous"
  teamList.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (draggingIdx === null) return;

    const idx = computeInsertIndex(e.clientY);
    if (overInsertIdx !== idx) {
      overInsertIdx = idx;
      applyLiveTransforms();
    }

    const edge = 28;
    const listRect = teamList.getBoundingClientRect();
    if (e.clientY < listRect.top + edge) teamList.scrollTop -= 18;
    else if (e.clientY > listRect.bottom - edge) teamList.scrollTop += 18;
  });

  teamList.addEventListener("drop", (e) => {
    e.preventDefault();
    if (draggingIdx === null) return;
    let target = overInsertIdx ?? computeInsertIndex(e.clientY);
    if (target > draggingIdx) target -= 1;

    target = Math.max(0, Math.min(teams.length - 1, target));
    if (target !== draggingIdx) {
      const a = teams.slice();
      const [it] = a.splice(draggingIdx, 1);
      a.splice(target, 0, it);
      teams = a;
      try { PetsService.setTeamsOrder(teams.map(x => x.id)); } catch {}
    }

    clearLiveTransforms();
    draggingIdx = null;
    overInsertIdx = null;
    draggingHeight = 0;

    refreshTeamList();
  });

  // logique boutons
  btnNew.onclick = () => {
    const created = PetsService.createTeam("New Team");
    selectedId = created.id;
    refreshTeamList();
    hydrateEditor(getSelectedTeam());
  };
  btnDel.onclick = () => {
    if (!selectedId) return;
    const ok = PetsService.deleteTeam(selectedId);
    if (!ok) return;
  };

  // ----- subscribe to service (keeps UI in sync & persisted) -----
  let unsubTeams: (() => void) | null = null;
  (async () => {
    try {
      unsubTeams = await PetsService.onTeamsChangeNow(async (all) => {
        teams = Array.isArray(all) ? all.slice() : [];
        if (selectedId && !teams.some(t => t.id === selectedId)) {
          selectedId = teams[0]?.id ?? null;
        }
        if (!selectedId && teams.length) selectedId = teams[0].id;

        refreshTeamList();
        setTeamsForHotkeys(teams);

        // prime cache inventaire (sécurisé par le mute côté service)
        await PetsService.getInventoryPets().catch(() => []);
        await hydrateEditor(getSelectedTeam());
      });
    } catch {}
  })();

  /* ================= RIGHT: éditeur de team ================= */
  const right = document.createElement("div");
  right.style.display = "grid";
  right.style.gridTemplateRows = "auto 1fr";
  right.style.gap = "10px";
  right.style.minHeight = "0";
  wrap.appendChild(right);

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "8px";

  const headerTitle = document.createElement("div");
  headerTitle.textContent = "Team editor — ";
  headerTitle.style.fontWeight = "700";
  headerTitle.style.fontSize = "14px";

  const btnUseTeam = document.createElement("button");
  btnUseTeam.id = "pets.teams.useThisTeam";
  btnUseTeam.textContent = "Use this team";
  btnUseTeam.style.padding = "6px 10px";
  btnUseTeam.style.borderRadius = "8px";
  btnUseTeam.style.border = "1px solid #4445";
  btnUseTeam.style.background = "#1f2328";
  btnUseTeam.style.color = "#e7eef7";
  btnUseTeam.style.cursor = "pointer";
  btnUseTeam.onmouseenter = () => (btnUseTeam.style.borderColor = "#6aa1");
  btnUseTeam.onmouseleave = () => (btnUseTeam.style.borderColor = "#4445");
  btnUseTeam.disabled = true;

  header.append(headerTitle, btnUseTeam);
  right.appendChild(header);

  const card = document.createElement("div");
  card.style.border = "1px solid #4445";
  card.style.borderRadius = "10px";
  card.style.padding = "10px";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.gap = "12px";
  card.style.overflow = "auto";
  card.style.minHeight = "0";
  card.style.background = "#0f1318";
  right.appendChild(card);

  // ---- Team name ----
  const secName = (() => {
    const r = row();
    r.style.width = "100%";
    const nameInput = ui.inputText("Team name", "");
    (nameInput as any).id = "pets.teams.editor.name";
    (nameInput as HTMLInputElement).style.flex = "1";
    (nameInput as HTMLInputElement).style.minWidth = "0";
    r.append(nameInput);
    card.appendChild(framed("🏷️ Team name", r));
    return { nameInput: nameInput as HTMLInputElement };
  })();

  // ---- Search bar ----
  const secSearch = (() => {
    const wrapOuter = document.createElement("div");
    wrapOuter.style.display = "flex";
    wrapOuter.style.flexDirection = "column";
    wrapOuter.style.gap = "10px";
    wrapOuter.style.alignItems = "center";

    let isProgrammaticModeSet = false;
    let currentMode: "ability" | "species" = "ability";

    const seg = ui.segmented<"ability" | "species">(
      [
        { value: "ability", label: "✨ Ability" },
        { value: "species", label: "🧬 Species" },
      ],
      "ability",
      async (val) => {
        if (isProgrammaticModeSet) return;
        currentMode = val;
        await rebuildOptionsFromInventory();
        select.value = "";
        applyFilterToTeam();
      },
      { ariaLabel: "Search mode" }
    );

    const select = document.createElement("select");
    select.className = "qmm-input";
    select.id = "pets.teams.filter.select";
    select.style.minWidth = "260px";

    const getMode = (): "ability" | "species" => currentMode;
    const setMode = (m: "ability" | "species") => {
      currentMode = m;
      isProgrammaticModeSet = true;
      (seg as any).set(m);
      isProgrammaticModeSet = false;
    };

    const rebuildOptionsFromInventory = async () => {
      const prev = select.value;
      const inv = await PetsService.getInventoryPets().catch(() => []) as any[];

      select.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "— No filter —";
      select.appendChild(opt0);

      if (getMode() === "ability") {
        const nameSet = new Set<string>();
        for (const p of inv) {
          const abs: string[] = Array.isArray(p?.abilities) ? p.abilities.filter(Boolean) : [];
          for (const id of abs) {
            const base = PetsService.getAbilityNameWithoutLevel?.(id) || "";
            if (base) nameSet.add(base);
          }
        }
        for (const name of Array.from(nameSet).sort((a, b) => a.localeCompare(b))) {
          const o = document.createElement("option"); o.value = name; o.textContent = name; select.appendChild(o);
        }
      } else {
        const set = new Set<string>();
        for (const p of inv) {
          const sp = String(p?.petSpecies || "").trim();
          if (sp) set.add(sp);
        }
        for (const v of Array.from(set).sort((a, b) => a.localeCompare(b))) {
          const o = document.createElement("option"); o.value = v; o.textContent = v.charAt(0).toUpperCase() + v.slice(1); select.appendChild(o);
        }
      }

      if (Array.from(select.options).some(o => o.value === prev)) select.value = prev;
    };

    const applyFilterToTeam = () => {
      const t = getSelectedTeam();
      if (!t) return;
      const val = (select.value || "").trim();
      const raw = getMode() === "ability" ? (val ? `ab:${val}` : "") : (val ? `sp:${val}` : "");
      PetsService.setTeamSearch(t.id, raw);
    };

    select.addEventListener("change", applyFilterToTeam);

    wrapOuter.append(seg, select);
    card.appendChild(framed("🔍 Search", wrapOuter));

    const ensureOptionExists = (val: string, pretty?: string) => {
      const v = (val || "").trim();
      if (!v) return;
      const has = Array.from(select.options).some(o => o.value === v);
      if (!has) {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = pretty ?? v;
        select.appendChild(o);
      }
    };

    return {
      getMode,
      setMode,
      select,
      rebuild: rebuildOptionsFromInventory,
      apply: applyFilterToTeam,
      setFromSearchString(s: string) {
        const m = (s || "").match(/^(ab|sp):\s*(.*)$/i);
        if (!m) { setMode("ability"); select.value = ""; return; }
        const mode = m[1].toLowerCase() === "ab" ? "ability" : "species";
        const val = (m[2] || "").trim();

        setMode(mode);
        ensureOptionExists(val, mode === "species" ? val.charAt(0).toUpperCase() + val.slice(1) : val);
        select.value = val;
      }
    };
  })();

  // ---- Active pets (3 slots) ----
  const secSlots = (() => {
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr";
    grid.style.rowGap = "10px";
    grid.style.justifyItems = "center";

    type SlotRow = {
      root: HTMLDivElement;
      nameEl: HTMLDivElement;
      abilitiesEl: HTMLSpanElement;
      btnChoose: HTMLButtonElement;
      btnClear: HTMLButtonElement;
      update(pet: InventoryPet | null): void;
    };

    const mkRow = (idx: 0 | 1 | 2): SlotRow => {
      const root = document.createElement("div");
      const BTN = 28;
      const ICON = 40;

      root.style.display = "grid";
      root.style.gridTemplateColumns = `${ICON}px minmax(0,1fr) ${BTN}px ${BTN}px`;
      root.style.alignItems = "center";
      root.style.gap = "8px";
      root.style.width = "min(560px, 100%)";
      root.style.border = "1px solid #4445";
      root.style.borderRadius = "10px";
      root.style.padding = "8px 10px";
      root.style.background = "#0f1318";

      // icon container — flex colonne : sprite au-dessus, badge en dessous
      const iconContainer = document.createElement("div");
      Object.assign(iconContainer.style, {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2px",
        flexShrink: "0",
      });

      const iconWrap = document.createElement("div");
      Object.assign(iconWrap.style, {
        width: `${ICON}px`,
        height: `${ICON}px`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      });

      // STR badge — en dessous du sprite, hors du iconWrap
      const strBadge = document.createElement("div");
      Object.assign(strBadge.style, {
        fontSize: "9px",
        fontWeight: "700",
        lineHeight: "1",
        padding: "1px 4px",
        borderRadius: "4px",
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        whiteSpace: "nowrap",
        display: "none",
        pointerEvents: "none",
      });
      iconContainer.append(iconWrap, strBadge);

      const useEmojiFallback = () => {
        iconWrap.replaceChildren();
        const span = document.createElement("span");
        span.textContent = "🐾";
        span.style.fontSize = `${Math.max(ICON - 6, 12)}px`;
        span.setAttribute("aria-hidden", "true");
        iconWrap.appendChild(span);
      };

      const setIcon = (species?: string, mutations?: string[]) => {
        const speciesLabel = String(species ?? "").trim();
        if (!speciesLabel) {
          iconWrap.replaceChildren();
          iconWrap.dataset.iconKey = "";
          useEmojiFallback();
          return;
        }

        const mutKey = Array.isArray(mutations) ? mutations.join(",") : "";
        const key = `${speciesLabel}|${mutKey}`;
        if (iconWrap.dataset.iconKey === key && iconWrap.querySelector("img")) {
          return;
        }
        iconWrap.dataset.iconKey = key;

        attachSpriteIcon(iconWrap, ["pet"], speciesLabel, ICON, "pet-slot", {
          mutations,
          onNoSpriteFound: () => {
            iconWrap.replaceChildren();
            useEmojiFallback();
          },
        });
      };

      // text column
      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      left.style.gap = "6px";
      left.style.minWidth = "0";

      const nameEl = document.createElement("div");
      nameEl.style.fontWeight = "700";
      nameEl.textContent = "None";
      nameEl.style.overflow = "hidden";
      nameEl.style.textOverflow = "ellipsis";
      nameEl.style.whiteSpace = "nowrap";

      let abilitiesEl = abilitiesBadge([]);
      abilitiesEl.style.display = "inline-block";
      left.append(nameEl, abilitiesEl);

      // buttons
      const btnChoose = document.createElement("button");
      btnChoose.textContent = "+";
      Object.assign(btnChoose.style, {
        width: `${BTN}px`,
        minWidth: `${BTN}px`,
        height: `${BTN}px`,
        padding: "0",
        fontSize: "16px",
        lineHeight: "1",
        borderRadius: "10px",
        boxShadow: "none",
        display: "grid",
        placeItems: "center",
      });
      btnChoose.title = "Choose a pet";
      btnChoose.setAttribute("aria-label", "Choose a pet");

      const btnClear = document.createElement("button");
      btnClear.textContent = "−";
      Object.assign(btnClear.style, {
        width: `${BTN}px`,
        minWidth: `${BTN}px`,
        height: `${BTN}px`,
        padding: "0",
        fontSize: "16px",
        lineHeight: "1",
        borderRadius: "10px",
        boxShadow: "none",
        display: "grid",
        placeItems: "center",
      });
      btnClear.title = "Remove this pet";
      btnClear.setAttribute("aria-label", "Remove this pet");

      root.append(iconContainer, left, btnChoose, btnClear);

      function update(p: InventoryPet | null) {
        if (!p) {
          nameEl.textContent = "None";
          setIcon(undefined);
          strBadge.style.display = "none";
          const fresh = abilitiesBadge([]);
          (fresh as any).style.display = "inline-block";
          left.replaceChild(fresh, left.children[1]);
          (abilitiesEl as any) = fresh;
          return;
        }
        const species = String(p.petSpecies || "").trim();
        const muts = Array.isArray(p.mutations) ? p.mutations : [];

        setIcon(species, muts);

        const str = getPetStrength(p);
        const maxStr = getPetMaxStrength(p);
        if (maxStr > 0) {
          strBadge.textContent = str >= maxStr ? `${maxStr}` : `${str}/${maxStr}`;
          strBadge.style.color = str >= maxStr ? "#facc15" : "#fff";
          strBadge.style.display = "block";
        } else {
          strBadge.style.display = "none";
        }

        const speciesLabel = species ? species.charAt(0).toUpperCase() + species.slice(1) : "";
        nameEl.textContent = (p.name?.trim() || speciesLabel || "Pet");

        const abs: string[] = Array.isArray(p.abilities) ? p.abilities.filter(Boolean) : [];
        const fresh = abilitiesBadge(abs);
        (fresh as any).style.display = "inline-block";
        left.replaceChild(fresh, left.children[1]);
        (abilitiesEl as any) = fresh;
      }

      // handlers (UI → Service)
      btnChoose.onclick = async () => {
        const t = getSelectedTeam();
        if (!t) return;
        btnChoose.disabled = true; btnClear.disabled = true;
        ui.setWindowVisible(false);
        try {
          await PetsService.chooseSlotPet(t.id, idx);
          await repaintSlots(getSelectedTeam());
        } finally {
          ui.setWindowVisible(true);
          btnChoose.disabled = false; btnClear.disabled = false;
        }
      };

      btnClear.onclick = async () => {
        const t = getSelectedTeam();
        if (!t) return;
        const next = t.slots.slice(0, 3);
        next[idx] = null;
        const saved = PetsService.saveTeam({ id: t.id, slots: next });
        await repaintSlots(saved ?? getSelectedTeam());
      };

      return { root, nameEl, abilitiesEl: abilitiesEl as HTMLSpanElement, btnChoose, btnClear, update };
    };

    const r0 = mkRow(0);
    const r1 = mkRow(1);
    const r2 = mkRow(2);

    grid.append(r0.root, r1.root, r2.root);

    const extra = document.createElement("div");
    extra.style.display = "flex";
    extra.style.gap = "6px";
    extra.style.justifyContent = "center";
    const btnUseCurrent = ui.btn("Current active", { variant: "primary" });
    btnUseCurrent.id = "pets.teams.useCurrent";
    btnUseCurrent.style.minWidth = "140px";
    const btnClear = ui.btn("Clear slots", { variant: "secondary" });
    btnClear.id = "pets.teams.clearSlots";
    btnClear.style.minWidth = "140px";
    const DARK_BG = "#0f1318";
    extra.append(btnUseCurrent, btnClear);

    Object.assign(btnUseCurrent.style, {
      width: "auto",
      fontSize: "16px",
      borderRadius: "10px",
      background: DARK_BG,
      boxShadow: "none",
    });
    Object.assign(btnClear.style, {
      width: "auto",
      fontSize: "16px",
      borderRadius: "10px",
      background: DARK_BG,
      boxShadow: "none",
    });

    const wrapSlots = document.createElement("div");
    wrapSlots.style.display = "flex";
    wrapSlots.style.flexDirection = "column";
    wrapSlots.style.gap = "8px";
    wrapSlots.append(grid, extra);

    card.appendChild(framed("⚡ Active pets (3 slots)", wrapSlots));

    return {
      rows: [r0, r1, r2],
      btnUseCurrent,
      btnClear,
    };
  })();

  // ===================== Wiring RIGHT side =====================
  async function repaintSlots(sourceTeam?: PetTeam | null) {
    const t = sourceTeam ?? getSelectedTeam();
    if (!t) return;
    const map = await buildPetRenderMap();
    [0, 1, 2].forEach((i) => {
      const id = (t.slots[i] || null) as string | null;
      if (!id) {
        if (lastRenderedSlotIds[i] !== null) {
          secSlots.rows[i].update(null);
          lastRenderedSlotIds[i] = null;
        }
        return;
      }
      const pet = map.get(id);
      if (!pet) {
        if (lastRenderedSlotIds[i] !== id) {
          secSlots.rows[i].update({
            id,
            itemType: "Pet",
            petSpecies: "",
            name: null,
            xp: 0,
            hunger: 0,
            mutations: [],
            abilities: [],
          });
          lastRenderedSlotIds[i] = id;
        }
        return;
      }
      if (lastRenderedSlotIds[i] !== id) {
        secSlots.rows[i].update(pet);
        lastRenderedSlotIds[i] = id;
      }
    });
  }

  async function hydrateEditor(team: PetTeam | null) {
    const has = !!team;
    secName.nameInput.disabled = !has;
    secSlots.btnClear.disabled = !has;
    secSlots.btnUseCurrent.disabled = !has;
    btnUseTeam.disabled = !has;


    if (has) {
      const saved = PetsService.getTeamSearch(team!.id) || "";
      const m = saved.match(/^(ab|sp):\s*(.*)$/i);
      const mode: "ability" | "species" = m
        ? (m[1].toLowerCase() === "ab" ? "ability" : "species")
        : "ability";
      secSearch.setMode(mode);
      await secSearch.rebuild();
      if (m) secSearch.setFromSearchString(saved);
    } else {
      await secSearch.rebuild();
    }

    if (!has) {
      secSlots.rows.forEach(r => r.update(null));
      secName.nameInput.value = "";
      return;
    }

    secName.nameInput.value = String(team!.name || "");
    await repaintSlots(team!);
  }

  // events: name change (auto-save)
  const saveNameNow = () => {
    const t = getSelectedTeam();
    if (!t) return;
    const nextName = secName.nameInput.value.trim();
    if (nextName === t.name) return;
    t.name = nextName;
    PetsService.saveTeam({ id: t.id, name: nextName });
    refreshTeamList(true);
  };

  secName.nameInput.addEventListener("input", () => saveNameNow());
  secName.nameInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      (ev.currentTarget as HTMLInputElement).blur();
      saveNameNow();
    }
  });
  secName.nameInput.addEventListener("blur", () => saveNameNow());

  // Use current active
  secSlots.btnUseCurrent.onclick = async () => {
    const t = getSelectedTeam();
    if (!t) return;
    try {
      const ids = await PetsService.getActivePetIds();
      const nextSlots: (string | null)[] = [ids[0] || null, ids[1] || null, ids[2] || null];
      const saved = PetsService.saveTeam({ id: t.id, slots: nextSlots });
      await repaintSlots(saved ?? getSelectedTeam());
    } catch {}
  };

  // Clear slots
  secSlots.btnClear.onclick = async () => {
    const t = getSelectedTeam();
    if (!t) return;
    const saved = PetsService.saveTeam({ id: t.id, slots: [null, null, null] });
    await repaintSlots(saved ?? getSelectedTeam());
  };

  function sameSet(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    for (const x of b) if (!s.has(x)) return false;
    return true;
  }

  async function waitForActiveTeam(team: PetTeam, timeoutMs = 2000) {
    const target = (team.slots || []).filter(Boolean) as string[];
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      const pets = await PetsService.getPets().catch(() => null);
      const equip = Array.isArray(pets)
        ? pets.map(p => String(p?.slot?.id || "")).filter(Boolean)
        : [];
      if (sameSet(equip, target)) return true;
      await new Promise(r => setTimeout(r, 80));
    }
    return false;
  }

  btnUseTeam.onclick = async () => {
    const t = getSelectedTeam();
    if (!t) return;

    try {
      isApplyingTeam = true;
      activeTeamId = t.id;
      await refreshTeamList(true);

      await PetsService.useTeam(t.id);
      await waitForActiveTeam(t);
      await hydrateEditor(getSelectedTeam());
      await refreshTeamList();
    } catch (e) {
      console.warn("[Pets] Use this team failed:", e);
      await refreshTeamList();
    } finally {
      isApplyingTeam = false;
    }
  };

  // ----- écoute inventaire unifié (le service gère mute/debounce) -----
  let unsubPets: (() => void) | null = null;
  (async () => {
    try {
      unsubPets = await onActivePetsStructuralChangeNow(async () => {
        if (isApplyingTeam) return;
        await repaintSlots(getSelectedTeam());
        await refreshTeamList();
      });
    } catch {}
  })();

  // ----- hotkeys après init du state -----
  installPetTeamHotkeysOnce(async (teamId) => {
    const t = teams.find(tt => tt.id === teamId) || null;
    try {
      isApplyingTeam = true;
      if (t) {
        activeTeamId = t.id;
        await refreshTeamList(true);
      }
      await PetsService.useTeam(teamId);
      if (t) await waitForActiveTeam(t);
      await hydrateEditor(getSelectedTeam());
      await refreshTeamList();
    } catch (e) {
      console.warn("[Pets] hotkey useTeam failed:", e);
      await refreshTeamList();
    } finally {
      isApplyingTeam = false;
    }
  });

  // cleanup on tab unmount
  (view as any).__cleanup__ = (() => {
    const prev = (view as any).__cleanup__;
    return () => {
      try { unsubTeams?.(); } catch {}
      try { unsubPets?.(); } catch {}
      try { prev?.(); } catch {}
    };
  })();
}


/* ================== Onglet: Feeding ================== */

function renderFeedingTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "minmax(220px, 280px) minmax(0, 1fr)";
  wrap.style.gap = "10px";
  wrap.style.alignItems = "stretch";
  wrap.style.height = "54vh";
  wrap.style.minHeight = "0";
  view.appendChild(wrap);

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.flexDirection = "column";
    left.style.height = "100%";
    left.style.minHeight = "0";
    wrap.appendChild(left);

  const vtabs = ui.vtabs({
    emptyText: "No pets found.",
    fillAvailableHeight: true,
    renderItem: (item, btn) => {
      btn.innerHTML = "";
        btn.style.gridTemplateColumns = "24px 1fr auto";
      btn.style.gap = "10px";

      const size = 22;
      const iconWrap = document.createElement("div");
      Object.assign(iconWrap.style, {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "6px",
        background: "#161b22",
        border: "1px solid #ffffff10",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        boxShadow: "0 1px 0 #000 inset",
        fontSize: "11px",
        color: "#e2e8f0",
      } as CSSStyleDeclaration);

      const label = String(item.title || "Pet");
      iconWrap.textContent = label.charAt(0).toUpperCase();
      attachSpriteIcon(iconWrap, ["pet"], item.id, size, "pet-feeding-list", {
        onNoSpriteFound: () => {
          iconWrap.textContent = label.charAt(0).toUpperCase();
        },
      });

      const textWrap = document.createElement("div");
      textWrap.style.display = "flex";
      textWrap.style.flexDirection = "column";
      textWrap.style.gap = "2px";
      textWrap.style.minWidth = "0";

      const titleEl = document.createElement("div");
      titleEl.textContent = label;
      titleEl.style.whiteSpace = "nowrap";
      titleEl.style.overflow = "hidden";
      titleEl.style.textOverflow = "ellipsis";
      textWrap.appendChild(titleEl);

        const rarity = String((item as PetItem).rarity || "").trim();
        const badge = rarity ? rarityBadge(rarity) : null;
        if (badge) {
          badge.style.margin = "0";
          badge.style.alignSelf = "center";
        }

        btn.append(iconWrap, textWrap);
        if (badge) btn.appendChild(badge);
      },
    });
    vtabs.root.style.flex = "1 1 auto";
    vtabs.root.style.minHeight = "0";
    left.appendChild(vtabs.root);

  const right = document.createElement("div");
  right.style.display = "flex";
  right.style.flexDirection = "column";
  right.style.gap = "10px";
  right.style.minHeight = "0";
  wrap.appendChild(right);

  const card = document.createElement("div");
  card.style.border = "1px solid #4445";
  card.style.borderRadius = "10px";
  card.style.padding = "10px";
  card.style.background = "#0f1318";
  card.style.display = "grid";
  card.style.gridTemplateRows = "auto 1fr";
  card.style.minHeight = "0";
  right.appendChild(card);

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.flexDirection = "column";
  header.style.gap = "4px";
  header.style.marginBottom = "8px";
  card.appendChild(header);

  const title = document.createElement("div");
  title.textContent = "Instant feed options";
  title.style.fontWeight = "600";
  header.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.textContent = "Allow or block crops for the Instant Feed button.";
  subtitle.style.opacity = "0.7";
  subtitle.style.fontSize = "12px";
  header.appendChild(subtitle);

  const widgetRow = document.createElement("label");
  widgetRow.style.display = "flex";
  widgetRow.style.alignItems = "center";
  widgetRow.style.gap = "8px";
  widgetRow.style.marginTop = "6px";
  widgetRow.style.cursor = "pointer";

  const widgetSwitch = ui.switch(isInstantFeedWidgetEnabled()) as HTMLInputElement;
  widgetSwitch.addEventListener("change", () => {
    setInstantFeedWidgetEnabled(widgetSwitch.checked);
  });

  const widgetLabel = document.createElement("span");
  widgetLabel.textContent = "Show floating Instant Feed widget";
  widgetLabel.style.fontSize = "13px";

  widgetRow.append(widgetSwitch, widgetLabel);
  header.appendChild(widgetRow);

  const body = document.createElement("div");
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.gap = "6px";
  body.style.overflow = "auto";
  body.style.minHeight = "0";
  card.appendChild(body);

    type PetItem = { id: string; title: string; rarity?: string };
    const petItems: PetItem[] = Object.keys(petCatalog as Record<string, any>)
      .map((species) => {
        const entry = (petCatalog as Record<string, any>)[species];
        const name = String(entry?.name || species);
        return {
          id: species,
          title: name,
          rarity: entry?.rarity,
        };
      });

  vtabs.setItems(petItems);
  if (petItems.length) vtabs.select(petItems[0].id);

  const renderCrops = (species: string | null) => {
    body.innerHTML = "";
    if (!species) {
      const empty = document.createElement("div");
      empty.textContent = "Select a pet to configure instant feed crops.";
      empty.style.opacity = "0.75";
      body.appendChild(empty);
      return;
    }

    const compatibles = PetsService.getCompatibleCropsForSpecies(species) ?? [];
    const seen = new Set<string>();
    const list = compatibles
      .map((c) => String(c || ""))
      .filter((c) => c && !seen.has(c) && seen.add(c));

    if (!list.length) {
      const empty = document.createElement("div");
      empty.textContent = "No compatible crops for this pet.";
      empty.style.opacity = "0.75";
      body.appendChild(empty);
      return;
    }

    const cropEntries = list
      .map((crop) => {
        const entry = (plantCatalog as Record<string, any>)[crop];
        const name = String(entry?.name || crop);
        return { crop, name };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    cropEntries.forEach(({ crop, name }) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "6px 4px";
      row.style.borderBottom = "1px solid #ffffff12";

      const labelWrap = document.createElement("div");
      labelWrap.style.display = "flex";
      labelWrap.style.flexDirection = "column";
      labelWrap.style.gap = "2px";

      const nameEl = document.createElement("div");
      nameEl.textContent = name;
      nameEl.style.fontSize = "13px";
      labelWrap.appendChild(nameEl);

      if (name !== crop) {
        const idEl = document.createElement("div");
        idEl.textContent = crop;
        idEl.style.fontSize = "11px";
        idEl.style.opacity = "0.6";
        labelWrap.appendChild(idEl);
      }

      const sw = ui.switch(PetsService.isInstantFeedCropAllowed(species, crop)) as HTMLInputElement;
      sw.addEventListener("change", () => {
        PetsService.setInstantFeedCropAllowed(species, crop, sw.checked);
      });

      row.append(labelWrap, sw);
      body.appendChild(row);
    });
  };

  vtabs.onSelect((id) => {
    renderCrops(id);
  });

  renderCrops(petItems[0]?.id ?? null);
}


/* ================== Onglet: Logs (nouveau) ================== */

function renderLogsTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";

  // ===== Layout
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateRows = "auto 1fr";
  wrap.style.gap = "10px";
  wrap.style.height = "54vh";
  view.appendChild(wrap);

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.flexWrap = "wrap";
  header.style.alignItems = "center";
  header.style.gap = "8px";
  header.style.border = "1px solid #4445";
  header.style.borderRadius = "10px";
  header.style.padding = "8px 10px";
  header.style.background = "#0f1318";
  wrap.appendChild(header);

  const selAbility = ui.select({ id: "pets.logs.filter.ability", width: "200px" });

  const selSort = ui.select({ id: "pets.logs.sort", width: "140px" });
  [["desc","Newest first"],["asc","Oldest first"]].forEach(([v,t])=>{
    const o = document.createElement("option"); o.value = v; o.textContent = t; selSort.appendChild(o);
  });
  selSort.value = "desc";

  const inputSearch = ui.inputText("search (pet / ability / details)", "");
  (inputSearch as any).id = "pets.logs.search";
  (inputSearch as HTMLInputElement).style.minWidth = "220px";

  const btnClear = ui.btn("🧹 Clear", { size: "sm" });
  btnClear.id = "pets.logs.clear";
  btnClear.style.flex = "0 0 auto";

  header.append(
    ui.label("Ability"), selAbility,
    ui.label("Sort"), selSort,
    inputSearch,
    btnClear
  );

  // ===== Card + header
  const card = document.createElement("div");
  card.style.border = "1px solid #4445";
  card.style.borderRadius = "10px";
  card.style.padding = "10px";
  card.style.background = "#0f1318";
  card.style.overflow = "hidden";
  card.style.display = "grid";
  card.style.gridTemplateRows = "auto 1fr";
  card.style.minHeight = "0";
  wrap.appendChild(card);

  const headerGrid = document.createElement("div");
  headerGrid.style.display = "grid";
  headerGrid.style.gridTemplateColumns = "140px 220px 200px minmax(0,1fr)";
  headerGrid.style.columnGap = "0";
  headerGrid.style.borderBottom = "1px solid #ffffff1a";
  headerGrid.style.padding = "0 0 6px 0";

  function mkHeadCell(txt: string, align: "center"|"left" = "center") {
    const el = document.createElement("div");
    el.textContent = txt;
    el.style.fontWeight = "600";
    el.style.opacity = "0.9";
    el.style.padding = "6px 8px";
    el.style.textAlign = align;
    return el;
  }
  headerGrid.append(
    mkHeadCell("Date & Time"),
    mkHeadCell("Pet"),
    mkHeadCell("Ability"),
    mkHeadCell("Details","left")
  );
  card.appendChild(headerGrid);

  // ===== Body scroller (grid)
  const bodyGrid = document.createElement("div");
  bodyGrid.style.display = "grid";
  bodyGrid.style.gridTemplateColumns = "140px 220px 200px minmax(0,1fr)";
  bodyGrid.style.gridAutoRows = "auto";
  bodyGrid.style.alignContent = "start";
  bodyGrid.style.overflow = "auto";
  bodyGrid.style.width = "100%";
  bodyGrid.style.minHeight = "0";
  card.appendChild(bodyGrid);

  // ===== State
  const sessionStart = PetsService.getAbilityLogsSessionStart?.() ?? 0;

  type UILog = {
    petId: string;
    petName: string | null | undefined;
    species: string | null | undefined;
    mutations?: string[];
    abilityId: string;
    abilityName: string;
    data: any;                 // déjà formatté string par le service
    performedAt: number;
    date: string;
    time12: string;
    isActiveSession: boolean;
  };

  let logs: UILog[] = [];
  let abilityFilter = "";
  let sortDir: "asc" | "desc" = "desc";
  let q = "";
  const petSpriteCache = new Map<string, string>();

  const mkPetIcon = (log: UILog) => {
    const size = 22;
    const holder = document.createElement("div");
    Object.assign(holder.style, {
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "8px",
      background: "#161b22",
      border: "1px solid #ffffff10",
      display: "grid",
      placeItems: "center",
      overflow: "hidden",
      boxShadow: "0 1px 0 #000 inset",
      fontSize: "11px",
      color: "#e2e8f0",
      flex: "0 0 auto",
    } as CSSStyleDeclaration);

    const species = String(log.species || "").trim();
    const mutations = Array.isArray(log.mutations)
      ? log.mutations.map((m) => String(m ?? "").trim()).filter(Boolean)
      : [];
    const mutKey = mutations.length ? mutations.map(m => m.toLowerCase()).sort().join(",") : "";
    const cacheKey = mutKey ? `${species}|${mutKey}` : species;

    const applyImg = (src: string) => {
      const img = document.createElement("img");
      img.src = src;
      img.width = size;
      img.height = size;
      img.alt = "";
      img.draggable = false;
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      img.style.objectFit = "contain";
      img.style.imageRendering = "auto";
      holder.replaceChildren(img);
    };

    const cached = cacheKey ? petSpriteCache.get(cacheKey) : undefined;
    if (cached) {
      applyImg(cached);
      return holder;
    }

    const letter = (log.petName || species || "pet").charAt(0).toUpperCase();
    holder.textContent = letter || "🐾";

    if (species) {
      attachSpriteIcon(holder, ["pet"], species, size, "pet-log", {
        mutations,
        onSpriteApplied: (img) => {
          petSpriteCache.set(cacheKey, img.src);
        },
      });
    }

    return holder;
  };

  // helpers simples
  function rebuildAbilityOptions() {
    const current = selAbility.value;
    selAbility.innerHTML = "";
    const opts = [["", "All abilities"], ...PetsService.getSeenAbilityIds().map(a => [a, a] as [string,string])];
    for (const [v,t] of opts) {
      const o = document.createElement("option");
      o.value = v; o.textContent = t;
      selAbility.appendChild(o);
    }
    selAbility.value = (opts.some(([v]) => v === current) ? current : "");
  }

  function formatDateMMDDYY(timestamp: number): string {
    const value = Number(timestamp);
    if (!Number.isFinite(value)) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yy = String(date.getFullYear() % 100).padStart(2, "0");
    return `${mm}/${dd}/${yy}`;
  }

  function cell(txt: string, align: "center"|"left" = "center") {
    const el = document.createElement("div");
    el.textContent = txt;
    el.style.padding = "6px 8px";
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.justifyContent = "center";
    el.style.alignItems = align === "left" ? "flex-start" : "center";
    el.style.textAlign = align;
    el.style.whiteSpace = align === "left" ? "pre-wrap" : "normal";
    el.style.wordBreak = align === "left" ? "break-word" : "normal";
    el.style.borderBottom = "1px solid #ffffff12";
    return el;
  }

  function row(log: UILog) {
    const time = cell("", "center");
    time.style.gap = "2px";
    const dateLine = document.createElement("div");
    const timeLine = document.createElement("div");
    const hasDate = typeof log.date === "string" && log.date.trim().length > 0;
    if (hasDate) dateLine.textContent = log.date ?? "";
    timeLine.textContent = log.time12;
    if (hasDate) time.appendChild(dateLine);
    time.appendChild(timeLine);
    const petLabel = (log.petName || log.species || "Pet");
    const pet  = cell("", "center");
    pet.style.flexDirection = "row";
    pet.style.alignItems = "center";
    pet.style.gap = "8px";
    const petIcon = mkPetIcon(log);
    const petText = document.createElement("span");
    petText.textContent = petLabel;
    petText.style.whiteSpace = "nowrap";
    petText.style.overflow = "hidden";
    petText.style.textOverflow = "ellipsis";
    pet.append(petIcon, petText);
    const abName = cell(log.abilityName || log.abilityId, "center");
    const detText = typeof log.data === "string" ? log.data : (() => { try { return JSON.stringify(log.data); } catch { return ""; } })();
    const det  = cell(detText, "left");
    if (log.isActiveSession) {
      [time, pet, abName, det].forEach((el) => {
        el.style.background = "rgba(89, 162, 255, 0.14)";
      });
    }
    bodyGrid.append(time, pet, abName, det);
  }

  // normalise pour filtre "ability X / X II"
  const normAbilityKey = (s?: string | null) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/([ivx]+)$/i, ""); // vire suffixe romain

  function applyFilters(): UILog[] {
    let arr = logs.slice();

    if (abilityFilter && abilityFilter.trim()) {
      const f = normAbilityKey(abilityFilter);
      arr = arr.filter(l => {
        const idKey   = normAbilityKey(l.abilityId);
        const nameKey = normAbilityKey(PetsService.getAbilityNameWithoutLevel(l.abilityId));
        return idKey === f || nameKey === f;
      });
    }

    if (q && q.trim()) {
      const qq = q.toLowerCase();
      arr = arr.filter(l => {
        const pet    = (l.petName || l.species || "").toLowerCase();
        const abName = (l.abilityName || "").toLowerCase();
        const abId   = (l.abilityId || "").toLowerCase();
        const det    = (typeof l.data === "string" ? l.data : (() => { try { return JSON.stringify(l.data); } catch { return ""; } })()).toLowerCase();
        return (
          pet.includes(qq) ||
          abName.includes(qq) || abId.includes(qq) ||
          det.includes(qq) ||
          (l.petId || "").toLowerCase().includes(qq)
        );
      });
    }

    arr.sort((a, b) =>
      sortDir === "asc" ? (a.performedAt - b.performedAt) : (b.performedAt - a.performedAt)
    );
    return arr;
  }

  function repaint() {
    bodyGrid.innerHTML = "";
    const arr = applyFilters();
    if (!arr.length) {
      const empty = document.createElement("div");
      empty.textContent = "No logs yet.";
      empty.style.opacity = "0.75";
      empty.style.gridColumn = "1 / -1";
      empty.style.padding = "8px";
      bodyGrid.appendChild(empty);
      return;
    }
    arr.forEach(row);

    // autoscroll côté "fin" de liste (utile si tri asc)
    if (sortDir === "asc") bodyGrid.scrollTop = bodyGrid.scrollHeight + 32;
    else bodyGrid.scrollTop = 0;
  }

  // ===== handlers UI
  selAbility.onchange = () => { abilityFilter = selAbility.value; repaint(); };
  selSort.onchange = () => { sortDir = (selSort.value as "asc" | "desc") || "desc"; repaint(); };
  (inputSearch as HTMLInputElement).addEventListener("input", () => { q = (inputSearch as HTMLInputElement).value.trim(); repaint(); });
  btnClear.onclick = () => { try { PetsService.clearAbilityLogs(); } catch {} };

  // ===== subscriptions
  let stopWatcher: (() => void) | null = null;
  let unsubLogs: (() => void) | null = null;

  (async () => {
    try {
      // démarre le watcher (ingestion côté service)
      stopWatcher = await PetsService.startAbilityLogsWatcher();

      // seed + options
      rebuildAbilityOptions();

      // écoute du flux normalisé côté service
      unsubLogs = PetsService.onAbilityLogs((all) => {
        // mappe en shape UI (juste pour renommer "name" → "petName")
        logs = all.map(e => ({
          petId: e.petId,
          petName: e.name ?? null,
          species: e.species ?? null,
          mutations: Array.isArray(e.mutations) ? e.mutations.slice() : undefined,
          abilityId: e.abilityId,
          abilityName: e.abilityName,
          data: e.data,
          performedAt: e.performedAt,
          date: formatDateMMDDYY(e.performedAt),
          time12: e.time12,
          isActiveSession: sessionStart > 0 && e.performedAt >= sessionStart,
        }));
        rebuildAbilityOptions();
        repaint();
      });
    } catch {}
  })();

  // cleanup
  (view as any).__cleanup__ = (() => {
    const prev = (view as any).__cleanup__;
    return () => {
      try { unsubLogs?.(); } catch {}
      try { stopWatcher?.(); } catch {}
      try { prev?.(); } catch {}
    };
  })();

  repaint();
}

/* ================== Entrée ================== */
let detachPetsOpenTabListener: (() => void) | null = null;

export function renderPetsMenu(root: HTMLElement) {
  const ui = new Menu({ id: "pets", compact: true, windowSelector: ".qws-win" });
  ui.mount(root);

  ui.addTab("manager", "🧰 Manager", (view) => renderManagerTab(view, ui));
  ui.addTab("feeding", "🍖 Feeding", (view) => renderFeedingTab(view, ui));
  ui.addTab("hatch", "🥚 Hatch", (view) => renderHatchTab(view, ui));
  ui.addTab("logs", "📝 Logs", (view) => renderLogsTab(view, ui));

  const knownTabs = new Set(["manager", "feeding", "hatch", "logs"]);
  const onOpenTab = (ev: Event) => {
    const tab = String((ev as CustomEvent).detail?.tab || "");
    if (knownTabs.has(tab)) ui.switchTo(tab);
  };
  detachPetsOpenTabListener?.();
  window.addEventListener("qws:pets-open-tab", onOpenTab);
  detachPetsOpenTabListener = () => window.removeEventListener("qws:pets-open-tab", onOpenTab);
}
