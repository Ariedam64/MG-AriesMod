// src/ui/menus/petsTeamBuilder.ts
// "Team Builder" tab of the Pets menu: scans owned pets and proposes
// ready-to-save teams per goal category (Active + AFK variants). UI only —
// all scoring logic lives in services/petTeamBuilder.ts.

import { Menu } from "../menu";
import { PetsService, type InventoryPet } from "../../services/pets";
import { buildSuggestedTeams, type SuggestedTeam, type UnusedPetInfo } from "../../services/petTeamBuilder";
import { getAbilityChipColors } from "./pets";
import { attachSpriteIcon } from "../spriteIconCache";
import { toastSimple } from "../toast";
import { getPetStrength, getPetMaxStrength } from "../../utils/petCalcul";

const miniSpriteCache = new Map<string, string>();

function mkMiniIcon(pet: InventoryPet | null, size = 24): HTMLElement {
  const holder = document.createElement("div");
  Object.assign(holder.style, {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "9px",
    background: "linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01) 60%), #161b22",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    boxShadow: "0 1px 0 #000 inset, 0 1px 2px rgba(0,0,0,0.3)",
    fontSize: "11px",
    color: "#e2e8f0",
    flex: "0 0 auto",
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
    holder.replaceChildren(img);
  };

  const cached = miniSpriteCache.get(cacheKey);
  if (cached) {
    applyImg(cached);
    return holder;
  }

  attachSpriteIcon(holder, ["pet"], species, size, "pet-teambuilder-mini", {
    mutations: pet.mutations,
    onSpriteApplied: (img) => { miniSpriteCache.set(cacheKey, img.src); },
    onNoSpriteFound: () => {
      holder.textContent = (species || pet.name || "pet").charAt(0).toUpperCase();
    },
  });
  return holder;
}

function abilityChipsFor(pet: InventoryPet): HTMLElement {
  const wrap = document.createElement("span");
  wrap.style.display = "inline-flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "4px";

  const ids = Array.isArray(pet.abilities) ? pet.abilities.filter(Boolean) : [];
  for (const id of ids) {
    const chip = document.createElement("span");
    const { bg, hover } = getAbilityChipColors(id);
    chip.title = PetsService.getAbilityName(id) || id;
    Object.assign(chip.style, {
      display: "inline-block",
      width: "9px",
      height: "9px",
      borderRadius: "3px",
      background: bg,
      boxShadow: "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff1a",
      cursor: "default",
    } as CSSStyleDeclaration);
    chip.onmouseenter = () => { chip.style.background = hover; };
    chip.onmouseleave = () => { chip.style.background = bg; };
    wrap.appendChild(chip);
  }
  return wrap;
}

// Single line per pet: icon, name (truncates), STR, ability dots — no
// wrapped second line, that's what made cards tall before.
function renderPetChip(pet: InventoryPet | undefined): HTMLElement {
  const chip = document.createElement("div");
  Object.assign(chip.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    minWidth: "0",
    padding: "3px 4px",
    borderRadius: "6px",
    transition: "background 100ms ease",
  } as CSSStyleDeclaration);
  chip.onmouseenter = () => { chip.style.background = "rgba(255,255,255,0.04)"; };
  chip.onmouseleave = () => { chip.style.background = "transparent"; };

  chip.appendChild(mkMiniIcon(pet ?? null));

  const nameSpan = document.createElement("span");
  nameSpan.style.fontSize = "11px";
  nameSpan.style.fontWeight = "600";
  nameSpan.style.overflow = "hidden";
  nameSpan.style.textOverflow = "ellipsis";
  nameSpan.style.whiteSpace = "nowrap";
  nameSpan.style.flex = "1 1 auto";
  nameSpan.style.minWidth = "0";
  nameSpan.textContent = pet ? (pet.name || pet.petSpecies || "?") : "—";
  chip.appendChild(nameSpan);

  if (pet) {
    const strBadge = document.createElement("span");
    strBadge.textContent = `${getPetStrength(pet)}/${getPetMaxStrength(pet)}`;
    strBadge.title = "Strength (current/max) — teams rank by max strength";
    Object.assign(strBadge.style, {
      fontSize: "10px",
      fontVariantNumeric: "tabular-nums",
      color: "#94a3b8",
      background: "rgba(255,255,255,0.05)",
      padding: "1px 6px",
      borderRadius: "999px",
      flex: "0 0 auto",
    } as CSSStyleDeclaration);
    chip.appendChild(strBadge);
    chip.appendChild(abilityChipsFor(pet));
  }

  return chip;
}

// The native pet-team name field caps at 16 characters — most category
// labels alone already exceed that, so the *saved* name is a compact,
// truncated version, separate from the full label shown in the card header.
const TEAM_NAME_MAX_LENGTH = 16;

// Count by Unicode code point, not UTF-16 code unit, so a single emoji isn't
// counted as 2 characters and truncation never splits a surrogate pair.
function charLength(text: string): number {
  return Array.from(text).length;
}

function truncateChars(text: string, maxLength: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  if (maxLength <= 1) return chars.slice(0, Math.max(0, maxLength)).join("");
  return `${chars.slice(0, maxLength - 1).join("")}…`;
}

// Weather-exclusive categories carry the weather name as a "(...)" suffix
// on their label (e.g. "Mutation: Ambershine (Amber Moon)") — reuse that
// instead of re-deriving it, so a weather-required team's title still
// calls out which weather it needs, just attached to the shorter ability
// name instead of the full category label.
function weatherSuffix(label: string): string {
  return label.match(/\([^)]+\)$/)?.[0] ?? "";
}

// The real ability name (e.g. "Amberlit Granter") reads shorter and more
// direct than the goal-category label ("Mutation: Ambershine") — dedupe in
// case a merge ever lands on the same ability twice.
function abilityLabel(team: SuggestedTeam): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const c of team.categories) {
    if (seen.has(c.abilityId)) continue;
    seen.add(c.abilityId);
    const name = PetsService.getAbilityName(c.abilityId) || c.label;
    const weather = weatherSuffix(c.label);
    names.push(weather ? `${name} ${weather}` : name);
  }
  return names.join(" + ");
}

function buildSaveName(team: SuggestedTeam, isAfk: boolean): string {
  const suffix = isAfk ? " AFK" : "";
  const budget = Math.max(1, TEAM_NAME_MAX_LENGTH - charLength(suffix));

  const fullLabel = abilityLabel(team);
  if (charLength(fullLabel) <= budget) return `${fullLabel}${suffix}`;

  // Full text doesn't fit — a truncated half-word ("Plant Growth S…") isn't
  // any more readable than the icons, so skip straight to icons-only.
  const icons = team.categories.map((c) => c.icon).join("");
  return `${truncateChars(icons, budget)}${suffix}`;
}

function renderTeamCard(
  team: SuggestedTeam,
  petsById: Map<string, InventoryPet>,
  ui: Menu,
): HTMLElement {
  const isAfk = team.mode === "afk";
  const glow = isAfk ? "#38bdf8" : "#34d399";
  const title = isAfk ? `${abilityLabel(team)} (AFK)` : abilityLabel(team);
  const card = ui.card(title, {
    tone: isAfk ? "accent" : "default",
    compactHeader: true,
    gap: 6,
  });
  Object.assign(card.root.style, {
    padding: "8px 10px 10px",
    position: "relative",
    overflow: "hidden",
    transition: "transform 140ms ease, box-shadow 140ms ease",
  } as CSSStyleDeclaration);
  card.root.onmouseenter = () => {
    card.root.style.transform = "translateY(-2px)";
    card.root.style.boxShadow = `0 10px 24px rgba(0,0,0,0.35), 0 0 0 1px ${glow}33`;
  };
  card.root.onmouseleave = () => {
    card.root.style.transform = "none";
    card.root.style.boxShadow = "";
  };

  // Left strip = the ability color(s) this team is built around (same
  // palette as the ability dots), not just a generic Active/AFK accent —
  // blended top-to-bottom when the team merges more than one category.
  const stripColors = team.categories.map((c) => getAbilityChipColors(c.abilityId).bg);
  const strip = document.createElement("div");
  Object.assign(strip.style, {
    position: "absolute",
    left: "0",
    top: "0",
    bottom: "0",
    width: "4px",
    background: stripColors.length > 1 ? `linear-gradient(180deg, ${stripColors.join(", ")})` : stripColors[0],
  } as CSSStyleDeclaration);
  card.root.appendChild(strip);

  const petsCol = document.createElement("div");
  petsCol.style.display = "grid";
  petsCol.style.gap = "1px";
  for (const id of team.petIds) {
    petsCol.appendChild(renderPetChip(petsById.get(id)));
  }
  card.body.appendChild(petsCol);

  const saveBtn = ui.btn("💾 Save", {
    variant: "primary",
    size: "sm",
    onClick: () => {
      const name = buildSaveName(team, isAfk);
      const created = PetsService.createTeam(name);
      PetsService.saveTeam({ id: created.id, slots: [...team.petIds, null, null].slice(0, 3) });
      void toastSimple("Team saved", name, "success");
    },
  });
  Object.assign(saveBtn.style, {
    marginTop: "2px",
    width: "84px",
    height: "24px",
    minHeight: "24px",
    maxHeight: "24px",
    boxSizing: "border-box",
    padding: "0",
    fontSize: "11px",
    lineHeight: "1",
    justifySelf: "center",
    alignSelf: "center",
    flexShrink: "0",
  } as CSSStyleDeclaration);
  card.body.appendChild(saveBtn);

  return card.root;
}

function unusedReasonText(info: UnusedPetInfo): string {
  if (info.untracked) return "no tracked ability";
  const parts = info.outrankedIn.slice();
  if (info.outrankedAsSustain) parts.push("Sustain");
  return `outranked in: ${parts.join(", ")}`;
}

function renderUnusedRow(info: UnusedPetInfo): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.padding = "3px 0";
  row.style.opacity = "0.75";

  row.appendChild(renderPetChip(info.pet));

  const reason = document.createElement("span");
  reason.textContent = unusedReasonText(info);
  reason.style.fontSize = "10px";
  reason.style.opacity = "0.7";
  reason.style.flex = "0 0 auto";
  reason.style.whiteSpace = "nowrap";
  reason.style.overflow = "hidden";
  reason.style.textOverflow = "ellipsis";
  reason.style.maxWidth = "45%";
  row.appendChild(reason);

  return row;
}

// Collapsed by default — this list can get long, and it's secondary info
// compared to the suggested teams above.
function renderUnusedSection(unusedPets: UnusedPetInfo[], ui: Menu): HTMLElement {
  const card = ui.card(`🗑️ Not used in any team (${unusedPets.length})`, { tone: "muted", compactHeader: true, gap: 4 });
  card.root.style.gridColumn = "1 / -1";
  card.root.style.padding = "8px 10px";

  const chevron = document.createElement("span");
  chevron.textContent = "▸";
  chevron.style.display = "inline-block";
  chevron.style.marginLeft = "8px";
  chevron.style.opacity = "0.6";
  chevron.style.transition = "transform 120ms ease";
  card.header.appendChild(chevron);
  card.header.style.cursor = "pointer";
  card.header.style.userSelect = "none";

  const list = document.createElement("div");
  list.style.display = "none";
  list.style.gap = "1px";
  for (const info of unusedPets) {
    list.appendChild(renderUnusedRow(info));
  }
  card.body.appendChild(list);

  let expanded = false;
  card.header.addEventListener("click", () => {
    expanded = !expanded;
    list.style.display = expanded ? "grid" : "none";
    chevron.style.transform = expanded ? "rotate(90deg)" : "none";
  });

  return card.root;
}

async function loadTeams(): Promise<{ teams: SuggestedTeam[]; sustainPet: InventoryPet | null; unusedPets: UnusedPetInfo[]; petsById: Map<string, InventoryPet> }> {
  const pets = await PetsService.getInventoryPets();
  const petsById = new Map(pets.map((p) => [p.id, p] as const));
  const { teams, sustainPet, unusedPets } = buildSuggestedTeams(pets);
  return { teams, sustainPet, unusedPets, petsById };
}

export function renderTeamBuilderTab(view: HTMLElement, ui: Menu): void {
  const prevCleanup = (view as any).__cleanup__;
  if (typeof prevCleanup === "function") {
    try { prevCleanup(); } catch {}
    (view as any).__cleanup__ = undefined;
  }

  view.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "10px";
  wrap.style.alignContent = "start";
  wrap.style.minHeight = "0";
  wrap.style.maxHeight = "54vh";
  wrap.style.overflow = "auto";
  view.appendChild(wrap);

  const header = ui.flexRow({ justify: "end", fullWidth: true });
  header.style.paddingBottom = "8px";
  header.style.borderBottom = "1px solid rgba(255,255,255,0.06)";

  const refreshBtn = ui.btn("🔄 Refresh", { size: "sm" });
  header.appendChild(refreshBtn);
  wrap.appendChild(header);

  const content = document.createElement("div");
  content.style.display = "grid";
  content.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
  content.style.gap = "8px";
  wrap.appendChild(content);

  let destroyed = false;
  (view as any).__cleanup__ = () => { destroyed = true; };

  async function repaint() {
    content.innerHTML = "";
    const loading = document.createElement("div");
    loading.textContent = "Loading…";
    loading.style.opacity = "0.6";
    content.appendChild(loading);

    const { teams, unusedPets, petsById } = await loadTeams();
    if (destroyed || !view.isConnected) return;

    content.innerHTML = "";

    if (!teams.length) {
      const empty = document.createElement("div");
      empty.textContent = "No useful team found — hatch pets with offensive abilities.";
      empty.style.opacity = "0.7";
      content.appendChild(empty);
      return;
    }

    for (const team of teams) {
      content.appendChild(renderTeamCard(team, petsById, ui));
    }

    if (unusedPets.length) {
      content.appendChild(renderUnusedSection(unusedPets, ui));
    }
  }

  refreshBtn.addEventListener("click", () => { void repaint(); });

  void repaint();
}
