// src/ui/menus/communityHub/tabs/chatImporter.ts
import { style, CH_EVENTS } from "../shared";
import { detectEnvironment } from "../../../../utils/api";
import { Atoms, myPetHutchPetItems } from "../../../../store/atoms";
import {
  fakeInventoryShow,
  fakeInventoryHide,
  isInventoryOpen,
} from "../../../../services/fakeModal";
import { attachSpriteIcon } from "../../../spriteIconCache";
import { ShopsService } from "../../../../services/shops";
import { formatPrice } from "../../../../utils/format";
import { plantCatalog, petCatalog } from "../../../../data";
import { PetsService } from "../../../../services/pets";
import { readAriesPath } from "../../../../utils/localStorage";
import type { PetTeam } from "../../../../services/pets";
import { getAbilityChipColors } from "../../pets";

// ─────────────────────────────────────────────────────────────────────────────
// Token format: {{gem:type|id|label|meta}}
// Example:      {{gem:room|ABC123}}
// ─────────────────────────────────────────────────────────────────────────────

const GEM_TOKEN_REGEX = /\{\{gem:([^|]+)\|([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?\}\}/g;


/** Get the current room ID from the game state (works on all surfaces). */
async function getCurrentRoomId(): Promise<string | null> {
  try {
    const state = await Atoms.root.state.get();
    if (!state || typeof state !== "object") return null;
    const s = state as Record<string, unknown>;
    const roomId =
      ((s.data as Record<string, unknown>)?.roomId as string) ??
      ((s.fullState as Record<string, unknown>)?.data as Record<string, unknown>)?.roomId as string ??
      (s.roomId as string) ??
      null;
    return roomId || null;
  } catch {
    return null;
  }
}

export interface GemToken {
  type: string;
  id: string;
  label?: string;
  meta?: string;
  raw: string;
}

// ── Token helpers ────────────────────────────────────────────────────────────

/** Build a token string for embedding in message text. */
export function buildGemToken(type: string, id: string, label?: string, meta?: string): string {
  let token = `{{gem:${type}|${id}`;
  if (label) token += `|${label}`;
  if (meta) token += `|${meta}`;
  token += "}}";
  return token;
}

/** Parse all gem tokens from a message body. Returns clean text + token list. */
export function parseGemTokens(body: string): { text: string; tokens: GemToken[] } {
  const tokens: GemToken[] = [];
  let match: RegExpExecArray | null;

  GEM_TOKEN_REGEX.lastIndex = 0;
  while ((match = GEM_TOKEN_REGEX.exec(body)) !== null) {
    tokens.push({
      type: match[1],
      id: match[2],
      label: match[3] || undefined,
      meta: match[4] || undefined,
      raw: match[0],
    });
  }

  const text = body.replace(GEM_TOKEN_REGEX, "").trim();
  return { text, tokens };
}

// ── Card rendering (for received messages in bubbles) ────────────────────────

// ── Item type helpers ─────────────────────────────────────────────────────────

/** Simple item types that have an identifier + quantity. */
const SIMPLE_ITEM_TYPES = new Set(["seed", "tool", "egg", "decor"]);

/** Map item token type → ShopsService kind. */
const TOKEN_TO_SHOP_KIND: Record<string, string> = {
  seed: "seeds",
  tool: "tools",
  egg: "eggs",
  decor: "decor",
};

/** Map item token type → sprite categories for attachSpriteIcon. */
const TOKEN_TO_SPRITE_CATS: Record<string, string[]> = {
  seed: ["seed"],
  tool: ["item"],
  egg: ["pet"],
  decor: ["decor"],
};

/** Get display name for a simple item token using ShopsService. */
function getItemDisplayName(tokenType: string, itemId: string): string {
  const kind = TOKEN_TO_SHOP_KIND[tokenType];
  if (!kind) return itemId;

  // Build a minimal item object that ShopsService.identityFor can use
  const itemObj: Record<string, string> = {};
  if (tokenType === "seed") itemObj.species = itemId;
  else if (tokenType === "tool") itemObj.toolId = itemId;
  else if (tokenType === "egg") itemObj.eggId = itemId;
  else if (tokenType === "decor") itemObj.decorId = itemId;

  try {
    return ShopsService.identityFor(kind as "seeds" | "tools" | "eggs" | "decor", itemObj as never);
  } catch {
    return itemId;
  }
}

/** Get display name for a produce species from plantCatalog. */
function getProduceDisplayName(species: string): string {
  const entry = (plantCatalog as unknown as Record<string, Record<string, Record<string, unknown>>>)[species];
  return (entry?.crop?.name as string) ?? species;
}

/** Calculate produce size from species and targetScale (50-100 range). */
function getProduceSize(species: string, targetScale: number): { size: number; maxSize: number } | null {
  const catalog = plantCatalog as Record<string, Record<string, Record<string, unknown>>>;
  const entry = catalog[species];
  if (!entry?.crop) return null;

  const maxScale = Number(entry.crop.maxScale);
  if (!Number.isFinite(maxScale) || maxScale <= 1) return null;

  const SIZE_MIN = 50;
  const SIZE_MAX = 100;
  const SCALE_MIN = 1;

  // Clamp targetScale to valid range [1, maxScale]
  const clampedScale = Math.max(SCALE_MIN, Math.min(targetScale, maxScale));

  // Convert scale to size percent using calculator formula (inverse of sizePercentToScale)
  // Formula: normalized = (scale - SCALE_MIN) / (maxScale - SCALE_MIN)
  //          percent = SIZE_MIN + normalized * (SIZE_MAX - SIZE_MIN)
  const normalized = (clampedScale - SCALE_MIN) / (maxScale - SCALE_MIN);
  const size = Math.round(SIZE_MIN + normalized * (SIZE_MAX - SIZE_MIN));

  const maxSize = 100;
  return { size: Math.max(SIZE_MIN, Math.min(size, maxSize)), maxSize };
}

/**
 * Build a GemToken for a pet team.
 * Format: {{gem:team|teamId|teamName|base64_team_data}}
 */
export function buildTeamToken(team: PetTeam, pets: Record<string, unknown>[]): GemToken | null {
  if (!team.id || !team.name) return null;

  // Get pet data for each slot
  const teamPets: Array<{
    species: string;
    name: string;
    mutations: string[];
    abilities: string[];
    xp: number;
    targetScale: number;
  } | null> = [];

  for (const slotPetId of team.slots) {
    if (!slotPetId) {
      teamPets.push(null);
      continue;
    }

    // Find the pet in the pets array
    const pet = pets.find((p) => String(p.id) === String(slotPetId)) as Record<string, unknown> | undefined;
    if (!pet) {
      teamPets.push(null);
      continue;
    }

    teamPets.push({
      species: String(pet.petSpecies ?? ""),
      name: String(pet.name ?? ""),
      mutations: Array.isArray(pet.mutations) ? pet.mutations : [],
      abilities: Array.isArray(pet.abilities) ? pet.abilities : [],
      xp: typeof pet.xp === "number" ? pet.xp : 0,
      targetScale: typeof pet.targetScale === "number" ? pet.targetScale : 1,
    });
  }

  // Base64-encode team data to avoid } breaking the token regex
  const metaB64 = btoa(JSON.stringify({ pets: teamPets }));
  const raw = buildGemToken("team", team.id, team.name, metaB64);
  return { type: "team", id: team.id, label: team.name, meta: metaB64, raw };
}

/**
 * Build a GemToken from a selected inventory item.
 * Simple items: {{gem:seed|species|quantity}}
 * Produce:      {{gem:produce|species|value|mutations_json}}
 */
function buildItemToken(item: Record<string, unknown>): GemToken | null {
  const itemType = String(item.itemType ?? "");
  const qty = typeof item.quantity === "number" ? String(item.quantity) : "1";

  switch (itemType) {
    case "Seed": {
      const id = String(item.species ?? "");
      if (!id) return null;
      const raw = buildGemToken("seed", id, qty);
      return { type: "seed", id, label: qty, raw };
    }
    case "Tool": {
      const id = String(item.toolId ?? "");
      if (!id) return null;
      const raw = buildGemToken("tool", id, qty);
      return { type: "tool", id, label: qty, raw };
    }
    case "Egg": {
      const id = String(item.eggId ?? "");
      if (!id) return null;
      const raw = buildGemToken("egg", id, qty);
      return { type: "egg", id, label: qty, raw };
    }
    case "Decor": {
      const id = String(item.decorId ?? "");
      if (!id) return null;
      const raw = buildGemToken("decor", id, qty);
      return { type: "decor", id, label: qty, raw };
    }
    case "Produce": {
      const id = String(item.species ?? "");
      if (!id) return null;
      const value = typeof item.value === "number" ? String(item.value) : "0";
      const mutations = Array.isArray(item.mutations) ? item.mutations : [];
      const targetScale = typeof item.scale === "number" ? item.scale : 1;
      // Base64-encode meta to avoid } breaking the token regex
      const metaB64 = btoa(JSON.stringify({
        mutations: mutations.length > 0 ? mutations : undefined,
        targetScale,
      }));
      const raw = buildGemToken("produce", id, value, metaB64);
      return { type: "produce", id, label: value, meta: metaB64, raw };
    }
    case "Pet": {
      const species = String(item.petSpecies ?? "");
      if (!species) return null;
      const name = String(item.name ?? species);
      const mutations = Array.isArray(item.mutations) ? item.mutations : [];
      const abilities = Array.isArray(item.abilities) ? item.abilities : [];
      const xp = typeof item.xp === "number" ? item.xp : 0;
      const targetScale = typeof item.targetScale === "number" ? item.targetScale : 1;
      // Base64-encode meta to avoid } breaking the token regex
      const metaB64 = btoa(JSON.stringify({ mutations, abilities, xp, targetScale }));
      const raw = buildGemToken("pet", species, name, metaB64);
      return { type: "pet", id: species, label: name, meta: metaB64, raw };
    }
    default:
      return null;
  }
}

/** Create a card element for a single gem token. */
export function createTokenCard(token: GemToken, isOutgoing: boolean): HTMLElement {
  if (SIMPLE_ITEM_TYPES.has(token.type)) {
    return createItemCard(token, isOutgoing);
  }
  switch (token.type) {
    case "room":
      return createRoomCard(token, isOutgoing);
    case "produce":
      return createProduceCard(token, isOutgoing);
    case "pet":
      return createPetCard(token, isOutgoing);
    case "team":
      return createTeamCard(token, isOutgoing);
    default:
      return createGenericCard(token, isOutgoing);
  }
}

function createRoomCard(token: GemToken, isOutgoing: boolean): HTMLElement {
  const env = detectEnvironment();
  const isDiscord = env.surface === "discord";

  const card = document.createElement("div");
  style(card, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: isOutgoing ? "rgba(94,234,212,0.08)" : "rgba(255,255,255,0.04)",
    border: isOutgoing
      ? "1px solid rgba(94,234,212,0.18)"
      : "1px solid rgba(255,255,255,0.08)",
    cursor: isDiscord ? "default" : "pointer",
    transition: "background 120ms ease, border-color 120ms ease",
    maxWidth: "100%",
  });

  if (!isDiscord) {
    card.onmouseenter = () =>
      style(card, {
        background: isOutgoing ? "rgba(94,234,212,0.14)" : "rgba(255,255,255,0.08)",
        borderColor: isOutgoing ? "rgba(94,234,212,0.3)" : "rgba(255,255,255,0.14)",
      });
    card.onmouseleave = () =>
      style(card, {
        background: isOutgoing ? "rgba(94,234,212,0.08)" : "rgba(255,255,255,0.04)",
        borderColor: isOutgoing ? "rgba(94,234,212,0.18)" : "rgba(255,255,255,0.08)",
      });
  }

  // Icon
  const icon = document.createElement("div");
  style(icon, {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    background: "linear-gradient(135deg, rgba(94,234,212,0.2), rgba(59,130,246,0.2))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
  });
  icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${isOutgoing ? "#5eead4" : "#94a3b8"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;

  // Info
  const info = document.createElement("div");
  style(info, {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: "0",
    flex: "1",
  });

  const labelEl = document.createElement("div");
  style(labelEl, {
    fontSize: "11px",
    fontWeight: "600",
    color: isOutgoing ? "rgba(94,234,212,0.7)" : "rgba(226,232,240,0.5)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  });
  labelEl.textContent = "Room";

  const roomIdEl = document.createElement("div");
  style(roomIdEl, {
    fontSize: "13px",
    fontWeight: "500",
    color: isOutgoing ? "#d1fae5" : "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  roomIdEl.textContent = token.id;

  info.append(labelEl, roomIdEl);

  if (isDiscord) {
    // Discord: show disabled message below the card content
    const disabledMsg = document.createElement("div");
    style(disabledMsg, {
      fontSize: "10px",
      color: "rgba(226,232,240,0.35)",
      fontStyle: "italic",
      lineHeight: "1.3",
    });
    disabledMsg.textContent = "Unavailable on Discord";
    info.appendChild(disabledMsg);
    card.append(icon, info);
  } else {
    // Arrow icon for clickable join
    const arrow = document.createElement("div");
    style(arrow, {
      flexShrink: "0",
      color: isOutgoing ? "rgba(94,234,212,0.4)" : "rgba(226,232,240,0.3)",
    });
    arrow.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
    card.append(icon, info, arrow);

    // Click: navigate to room (use receiver's own origin)
    card.onclick = () => {
      const roomUrl = `${env.origin}/r/${token.id}`;
      window.open(roomUrl, "_blank");
    };
  }

  return card;
}

function createGenericCard(token: GemToken, isOutgoing: boolean): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    borderRadius: "8px",
    background: isOutgoing ? "rgba(94,234,212,0.06)" : "rgba(255,255,255,0.03)",
    border: isOutgoing
      ? "1px solid rgba(94,234,212,0.15)"
      : "1px solid rgba(255,255,255,0.06)",
    fontSize: "12px",
    color: isOutgoing ? "#d1fae5" : "#e7eef7",
  });
  card.textContent = `${token.type}: ${token.id}`;
  return card;
}

/** Card for simple item tokens (seed, tool, egg, decor) with sprite + name + qty. */
function createItemCard(token: GemToken, isOutgoing: boolean): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    borderRadius: "10px",
    background: isOutgoing ? "rgba(94,234,212,0.08)" : "rgba(255,255,255,0.04)",
    border: isOutgoing
      ? "1px solid rgba(94,234,212,0.18)"
      : "1px solid rgba(255,255,255,0.08)",
    maxWidth: "100%",
  });

  // Sprite icon
  const spriteWrap = document.createElement("div");
  style(spriteWrap, {
    width: "32px",
    height: "32px",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.05)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    overflow: "hidden",
  });
  const cats = TOKEN_TO_SPRITE_CATS[token.type] ?? [];
  if (cats.length) {
    attachSpriteIcon(spriteWrap, cats, [token.id], 32, "chat-item");
  }

  // Info column
  const info = document.createElement("div");
  style(info, {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: "0",
    flex: "1",
  });

  // Type label
  const typeLabel = document.createElement("div");
  style(typeLabel, {
    fontSize: "10px",
    fontWeight: "600",
    color: isOutgoing ? "rgba(94,234,212,0.6)" : "rgba(226,232,240,0.4)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  });
  typeLabel.textContent = token.type.charAt(0).toUpperCase() + token.type.slice(1);

  // Item name
  const nameEl = document.createElement("div");
  style(nameEl, {
    fontSize: "13px",
    fontWeight: "500",
    color: isOutgoing ? "#d1fae5" : "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  nameEl.textContent = getItemDisplayName(token.type, token.id);

  info.append(typeLabel, nameEl);

  // Quantity badge
  const qty = parseInt(token.label ?? "1", 10);
  if (qty > 1) {
    const qtyBadge = document.createElement("div");
    style(qtyBadge, {
      padding: "2px 8px",
      borderRadius: "6px",
      fontSize: "11px",
      fontWeight: "600",
      background: isOutgoing ? "rgba(94,234,212,0.15)" : "rgba(255,255,255,0.08)",
      color: isOutgoing ? "#5eead4" : "rgba(226,232,240,0.6)",
      flexShrink: "0",
    });
    qtyBadge.textContent = `x${qty}`;
    card.append(spriteWrap, info, qtyBadge);
  } else {
    card.append(spriteWrap, info);
  }

  return card;
}

/** Sprite categories for produce/crops (same order as calculator). */
const PRODUCE_SPRITE_CATS = ["crop", "plant", "tallplant"];

/** Card for produce tokens with sprite (mutations applied) + name + value. */
function createProduceCard(token: GemToken, isOutgoing: boolean): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    borderRadius: "10px",
    background: isOutgoing ? "rgba(94,234,212,0.08)" : "rgba(255,255,255,0.04)",
    border: isOutgoing
      ? "1px solid rgba(94,234,212,0.18)"
      : "1px solid rgba(255,255,255,0.08)",
    maxWidth: "100%",
  });

  // Parse mutations AND targetScale from meta field
  let mutations: string[] | undefined;
  let targetScale = 1;
  if (token.meta) {
    try {
      // Try base64 decode first (new format), fallback to direct JSON parse (old formats)
      let parsed: unknown;
      try {
        parsed = JSON.parse(atob(token.meta));
      } catch {
        parsed = JSON.parse(token.meta);
      }

      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        // New format: { mutations?, targetScale }
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.mutations)) mutations = obj.mutations;
        if (typeof obj.targetScale === "number") targetScale = obj.targetScale;
      } else if (Array.isArray(parsed) && parsed.length > 0) {
        // Old format compatibility: just mutations array
        mutations = parsed;
      }
    } catch {}
  }

  // Sprite icon with mutations applied
  const spriteWrap = document.createElement("div");
  style(spriteWrap, {
    width: "32px",
    height: "32px",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.05)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    overflow: "hidden",
  });
  attachSpriteIcon(spriteWrap, PRODUCE_SPRITE_CATS, [token.id], 32, "chat-produce", {
    mutations,
  });

  // Info column
  const info = document.createElement("div");
  style(info, {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: "0",
    flex: "1",
  });

  // Type label row (Produce + SIZE badge)
  const typeLabelRow = document.createElement("div");
  style(typeLabelRow, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  });

  const typeLabel = document.createElement("div");
  style(typeLabel, {
    fontSize: "10px",
    fontWeight: "600",
    color: isOutgoing ? "rgba(94,234,212,0.6)" : "rgba(226,232,240,0.4)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  });
  typeLabel.textContent = "Produce";
  typeLabelRow.appendChild(typeLabel);

  // SIZE badge
  const sizeInfo = getProduceSize(token.id, targetScale);
  if (sizeInfo) {
    const { size } = sizeInfo;

    const sizeBadge = document.createElement("span");
    style(sizeBadge, {
      display: "inline-flex",
      alignItems: "center",
      gap: "2px",
      padding: "1px 4px",
      borderRadius: "3px",
      fontSize: "9px",
      fontWeight: "700",
      lineHeight: "1",
      color: isOutgoing ? "rgba(94,234,212,0.7)" : "rgba(226,232,240,0.5)",
      backgroundColor: isOutgoing ? "rgba(94,234,212,0.12)" : "rgba(255,255,255,0.08)",
    });
    sizeBadge.textContent = `SIZE ${size}`;

    typeLabelRow.appendChild(sizeBadge);
  }

  // Item name
  const nameEl = document.createElement("div");
  style(nameEl, {
    fontSize: "13px",
    fontWeight: "500",
    color: isOutgoing ? "#d1fae5" : "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  nameEl.textContent = getProduceDisplayName(token.id);

  // Value (price) below name
  const valueEl = document.createElement("div");
  style(valueEl, {
    fontSize: "11px",
    color: isOutgoing ? "rgba(94,234,212,0.65)" : "rgba(226,232,240,0.5)",
  });
  const coinVal = parseInt(token.label ?? "0", 10);
  const formatted = formatPrice(coinVal) ?? String(coinVal);
  valueEl.textContent = `${formatted} coins`;

  info.append(typeLabelRow, nameEl, valueEl);
  card.append(spriteWrap, info);

  return card;
}

/** Create ability squares badge (12px colored chips with tooltip). */
function createAbilityBadge(abilities: string[]): HTMLElement {
  const wrap = document.createElement("span");
  style(wrap, { display: "inline-flex", alignItems: "center", lineHeight: "1" });

  const ids = Array.isArray(abilities) ? abilities.filter(Boolean) : [];
  if (!ids.length) return wrap;

  for (let i = 0; i < ids.length; i++) {
    const chip = document.createElement("span");
    const { bg, hover } = getAbilityChipColors(ids[i]);
    chip.title = PetsService.getAbilityName(ids[i]) || ids[i];
    style(chip, {
      display: "inline-block",
      width: "12px",
      height: "12px",
      borderRadius: "3px",
      marginRight: i === ids.length - 1 ? "0" : "8px",
      background: bg,
      transition: "transform 80ms ease, box-shadow 120ms ease, background 120ms ease",
      cursor: "default",
      boxShadow: "0 0 0 1px #0006 inset, 0 0 0 1px #ffffff1a",
    });
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
  }
  return wrap;
}

/** Decode base64-encoded pet meta into mutations, abilities, xp, targetScale. */
function decodePetMeta(meta: string | undefined): {
  mutations: string[] | undefined;
  abilities: string[];
  xp: number;
  targetScale: number;
} {
  if (!meta) return { mutations: undefined, abilities: [], xp: 0, targetScale: 1 };
  try {
    const parsed = JSON.parse(atob(meta));
    if (parsed && typeof parsed === "object") {
      const mutations = Array.isArray(parsed.mutations) && parsed.mutations.length > 0 ? parsed.mutations : undefined;
      const abilities = Array.isArray(parsed.abilities) ? parsed.abilities : [];
      const xp = typeof parsed.xp === "number" ? parsed.xp : 0;
      const targetScale = typeof parsed.targetScale === "number" ? parsed.targetScale : 1;
      return { mutations, abilities, xp, targetScale };
    }
  } catch {}
  return { mutations: undefined, abilities: [], xp: 0, targetScale: 1 };
}

/** Calculate pet strength from species, xp, and targetScale (same formula as inventorySorting). */
function getPetStrength(species: string, xp: number, targetScale: number): { strength: number; maxStrength: number } | null {
  const catalog = petCatalog as Record<string, Record<string, unknown>>;
  const entry = catalog[species];
  if (!entry) return null;

  const maxScale = Number(entry.maxScale);
  const hoursToMature = Number(entry.hoursToMature);
  if (!Number.isFinite(maxScale) || maxScale <= 1) return null;
  if (!Number.isFinite(hoursToMature) || hoursToMature <= 0) return null;

  const safeXp = Math.max(0, xp);
  const xpDenominator = hoursToMature * 3600;
  const xpComponent = xpDenominator > 0 ? Math.min(Math.floor((safeXp / xpDenominator) * 30), 30) : 0;

  const minScale = 1;
  const clampedScale = Math.max(minScale, Math.min(targetScale, maxScale));
  const scaleDenominator = maxScale - minScale;
  const scaleComponent = scaleDenominator > 0
    ? Math.floor(((clampedScale - minScale) / scaleDenominator) * 20 + 80)
    : 80;

  const maxStrength = Math.max(0, Math.min(scaleComponent, 100));
  const combined = xpComponent + maxStrength - 30;
  const strength = Math.max(0, Math.min(combined, maxStrength));
  return { strength, maxStrength };
}

/** Card for pet tokens with sprite (mutations applied) + name + ability squares. */
function createPetCard(token: GemToken, isOutgoing: boolean): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    borderRadius: "10px",
    background: isOutgoing ? "rgba(94,234,212,0.08)" : "rgba(255,255,255,0.04)",
    border: isOutgoing
      ? "1px solid rgba(94,234,212,0.18)"
      : "1px solid rgba(255,255,255,0.08)",
    maxWidth: "100%",
  });

  const { mutations, abilities, xp, targetScale } = decodePetMeta(token.meta);

  // Sprite icon with mutations applied
  const spriteWrap = document.createElement("div");
  style(spriteWrap, {
    width: "32px",
    height: "32px",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.05)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    overflow: "hidden",
  });
  attachSpriteIcon(spriteWrap, ["pet"], [token.id], 32, "chat-pet", { mutations });

  // Info column
  const info = document.createElement("div");
  style(info, {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: "0",
    flex: "1",
  });

  // Type label row (Pet + STR badge)
  const typeLabelRow = document.createElement("div");
  style(typeLabelRow, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  });

  const typeLabel = document.createElement("div");
  style(typeLabel, {
    fontSize: "10px",
    fontWeight: "600",
    color: isOutgoing ? "rgba(94,234,212,0.6)" : "rgba(226,232,240,0.4)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  });
  typeLabel.textContent = "Pet";
  typeLabelRow.appendChild(typeLabel);

  // STR badge
  const strInfo = getPetStrength(token.id, xp, targetScale);
  if (strInfo) {
    const { strength, maxStrength } = strInfo;
    const isMax = strength >= maxStrength;

    const strBadge = document.createElement("span");
    style(strBadge, {
      display: "inline-flex",
      alignItems: "center",
      gap: "2px",
      padding: "1px 4px",
      borderRadius: "3px",
      fontSize: "9px",
      fontWeight: "700",
      lineHeight: "1",
      color: isOutgoing ? "rgba(94,234,212,0.7)" : "rgba(226,232,240,0.5)",
      backgroundColor: isOutgoing ? "rgba(94,234,212,0.12)" : "rgba(255,255,255,0.08)",
    });
    strBadge.textContent = isMax ? `STR ${maxStrength} MAX` : `STR ${strength}/${maxStrength}`;

    typeLabelRow.appendChild(strBadge);
  }

  // Pet name
  const nameEl = document.createElement("div");
  style(nameEl, {
    fontSize: "13px",
    fontWeight: "500",
    color: isOutgoing ? "#d1fae5" : "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  nameEl.textContent = token.label || token.id;

  info.append(typeLabelRow, nameEl);

  // Ability squares below name
  if (abilities.length > 0) {
    info.appendChild(createAbilityBadge(abilities));
  }

  card.append(spriteWrap, info);
  return card;
}

/** Card for team tokens with 3 pet sprites + abilities. */
function createTeamCard(token: GemToken, isOutgoing: boolean): HTMLElement {
  const card = document.createElement("div");
  style(card, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: isOutgoing ? "rgba(94,234,212,0.08)" : "rgba(255,255,255,0.04)",
    border: isOutgoing
      ? "1px solid rgba(94,234,212,0.18)"
      : "1px solid rgba(255,255,255,0.08)",
    maxWidth: "100%",
  });

  // Decode team data
  let teamPets: Array<{
    species: string;
    name: string;
    mutations: string[];
    abilities: string[];
    xp: number;
    targetScale: number;
  } | null> = [];

  if (token.meta) {
    try {
      const decoded = JSON.parse(atob(token.meta));
      if (decoded && Array.isArray(decoded.pets)) {
        teamPets = decoded.pets;
      }
    } catch {}
  }

  // Header row: Team label + name
  const headerRow = document.createElement("div");
  style(headerRow, {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  });

  const typeLabel = document.createElement("div");
  style(typeLabel, {
    fontSize: "10px",
    fontWeight: "600",
    color: isOutgoing ? "rgba(94,234,212,0.6)" : "rgba(226,232,240,0.4)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  });
  typeLabel.textContent = "Team";

  const teamName = document.createElement("div");
  style(teamName, {
    fontSize: "13px",
    fontWeight: "500",
    color: isOutgoing ? "#d1fae5" : "#e7eef7",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  teamName.textContent = token.label || token.id;

  headerRow.append(typeLabel, teamName);
  card.appendChild(headerRow);

  // Pets row: 3 pet slots
  const petsRow = document.createElement("div");
  style(petsRow, {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  });

  for (const pet of teamPets) {
    if (!pet) continue;

    const petSlot = document.createElement("div");
    style(petSlot, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
      flex: "1",
      minWidth: "80px",
    });

    // Pet name
    const petNameEl = document.createElement("div");
    style(petNameEl, {
      fontSize: "11px",
      fontWeight: "500",
      color: isOutgoing ? "#d1fae5" : "#e7eef7",
      textAlign: "center",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      maxWidth: "100%",
    });
    petNameEl.textContent = pet.name || pet.species;
    petSlot.appendChild(petNameEl);

    // STR badge
    const strInfo = getPetStrength(pet.species, pet.xp, pet.targetScale);
    if (strInfo) {
      const { strength, maxStrength } = strInfo;
      const isMax = strength >= maxStrength;

      const strBadge = document.createElement("span");
      style(strBadge, {
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        padding: "1px 4px",
        borderRadius: "3px",
        fontSize: "8px",
        fontWeight: "700",
        lineHeight: "1",
        color: isOutgoing ? "rgba(94,234,212,0.7)" : "rgba(226,232,240,0.5)",
        backgroundColor: isOutgoing ? "rgba(94,234,212,0.12)" : "rgba(255,255,255,0.08)",
      });
      strBadge.textContent = isMax ? `STR ${maxStrength} MAX` : `STR ${strength}/${maxStrength}`;
      petSlot.appendChild(strBadge);
    }

    // Pet sprite
    const spriteWrap = document.createElement("div");
    style(spriteWrap, {
      width: "40px",
      height: "40px",
      borderRadius: "8px",
      background: "rgba(255,255,255,0.05)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    });
    const muts = pet.mutations.length > 0 ? pet.mutations : undefined;
    attachSpriteIcon(spriteWrap, ["pet"], [pet.species], 40, "chat-team-pet", { mutations: muts });
    petSlot.appendChild(spriteWrap);

    // Ability badges
    if (pet.abilities.length > 0) {
      const abilityWrap = document.createElement("div");
      style(abilityWrap, {
        display: "flex",
        justifyContent: "center",
      });
      abilityWrap.appendChild(createAbilityBadge(pet.abilities));
      petSlot.appendChild(abilityWrap);
    }

    petsRow.appendChild(petSlot);
  }

  card.appendChild(petsRow);
  return card;
}

// ── Token cards container (rendered below a bubble) ──────────────────────────

/** Create a container with all token cards for a message. */
export function createTokenCardsContainer(tokens: GemToken[], isOutgoing: boolean): HTMLElement {
  const container = document.createElement("div");
  style(container, {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginTop: "4px",
  });

  for (const token of tokens) {
    container.appendChild(createTokenCard(token, isOutgoing));
  }

  return container;
}

// ── Attachment system (preview above input before sending) ───────────────────

export interface AttachmentState {
  /** The attachment bar element to insert into the DOM. */
  barElement: HTMLElement;
  /** Current list of pending attachments (tokens). */
  getTokens: () => GemToken[];
  /** Add an attachment. */
  add: (token: GemToken) => void;
  /** Clear all attachments. */
  clear: () => void;
  /** Build the token strings to append to the message body on send. */
  buildTokensString: () => string;
}

/** Create the attachment state + preview bar. */
export function createAttachmentState(): AttachmentState {
  const pending: GemToken[] = [];

  // Container that sits above the input bar
  const bar = document.createElement("div");
  style(bar, {
    display: "none",
    flexDirection: "row",
    gap: "6px",
    padding: "6px 12px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    flexShrink: "0",
    overflowX: "auto",
    overflowY: "hidden",
  });

  function render(): void {
    bar.innerHTML = "";
    if (pending.length === 0) {
      style(bar, { display: "none" });
      return;
    }
    style(bar, { display: "flex" });

    for (let i = 0; i < pending.length; i++) {
      bar.appendChild(createAttachmentChip(pending[i], i));
    }
  }

  function createAttachmentChip(token: GemToken, index: number): HTMLElement {
    const chip = document.createElement("div");
    style(chip, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 10px",
      borderRadius: "8px",
      background: "rgba(94,234,212,0.08)",
      border: "1px solid rgba(94,234,212,0.18)",
      flexShrink: "0",
      whiteSpace: "nowrap",
    });

    // Type icon (sprite for items, SVG for room)
    const typeIcon = document.createElement("div");
    style(typeIcon, {
      width: "22px",
      height: "22px",
      borderRadius: "6px",
      background: "rgba(94,234,212,0.15)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      color: "#5eead4",
      overflow: "hidden",
    });
    if (SIMPLE_ITEM_TYPES.has(token.type)) {
      const spriteCats = TOKEN_TO_SPRITE_CATS[token.type] ?? [];
      if (spriteCats.length) {
        attachSpriteIcon(typeIcon, spriteCats, [token.id], 22, "chip-icon");
      }
    } else if (token.type === "produce") {
      let muts: string[] | undefined;
      if (token.meta) {
        try {
          // Try base64 decode first (new format), fallback to direct JSON parse (old formats)
          let p: unknown;
          try {
            p = JSON.parse(atob(token.meta));
          } catch {
            p = JSON.parse(token.meta);
          }

          if (typeof p === "object" && p !== null && Array.isArray(p.mutations)) {
            muts = p.mutations;
          } else if (Array.isArray(p) && p.length) {
            muts = p;
          }
        } catch {}
      }
      attachSpriteIcon(typeIcon, PRODUCE_SPRITE_CATS, [token.id], 22, "chip-produce", {
        mutations: muts,
      });
    } else if (token.type === "pet") {
      const { mutations: petMuts } = decodePetMeta(token.meta);
      attachSpriteIcon(typeIcon, ["pet"], [token.id], 22, "chip-pet", { mutations: petMuts });
    } else if (token.type === "team") {
      typeIcon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.0803 15.7203C18.4903 12.1903 15.1003 9.32031 11.5203 9.32031C7.63028 9.32031 4.21028 12.4703 3.88028 16.3503C3.75028 17.8503 4.23028 19.2703 5.22028 20.3403C6.20028 21.4103 7.58028 22.0003 9.08028 22.0003H13.7603C15.4503 22.0003 16.9303 21.3403 17.9403 20.1503C18.9503 18.9603 19.3503 17.3803 19.0803 15.7203Z" fill="currentColor"/><path d="M10.2796 7.86C11.8978 7.86 13.2096 6.54819 13.2096 4.93C13.2096 3.31181 11.8978 2 10.2796 2C8.66141 2 7.34961 3.31181 7.34961 4.93C7.34961 6.54819 8.66141 7.86 10.2796 7.86Z" fill="currentColor"/><path d="M16.94 9.02844C18.2876 9.02844 19.38 7.93601 19.38 6.58844C19.38 5.24086 18.2876 4.14844 16.94 4.14844C15.5924 4.14844 14.5 5.24086 14.5 6.58844C14.5 7.93601 15.5924 9.02844 16.94 9.02844Z" fill="currentColor"/><path d="M20.5496 12.9313C21.6266 12.9313 22.4996 12.0582 22.4996 10.9812C22.4996 9.90429 21.6266 9.03125 20.5496 9.03125C19.4727 9.03125 18.5996 9.90429 18.5996 10.9812C18.5996 12.0582 19.4727 12.9313 20.5496 12.9313Z" fill="currentColor"/><path d="M3.94 10.9816C5.28757 10.9816 6.38 9.88914 6.38 8.54156C6.38 7.19399 5.28757 6.10156 3.94 6.10156C2.59243 6.10156 1.5 7.19399 1.5 8.54156C1.5 9.88914 2.59243 10.9816 3.94 10.9816Z" fill="currentColor"/></svg>`;
    } else if (token.type === "room") {
      typeIcon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
    }

    // Label
    const labelEl = document.createElement("div");
    style(labelEl, {
      fontSize: "12px",
      color: "#d1fae5",
      flex: "1",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    // For items, show display name + quantity; for others, show type: id
    let chipLabel: string;
    if (SIMPLE_ITEM_TYPES.has(token.type)) {
      const displayName = getItemDisplayName(token.type, token.id);
      const qty = parseInt(token.label ?? "1", 10);
      chipLabel = qty > 1 ? `${displayName} x${qty}` : displayName;
    } else if (token.type === "produce") {
      const displayName = getProduceDisplayName(token.id);
      const coinVal = parseInt(token.label ?? "0", 10);
      const valStr = formatPrice(coinVal) ?? String(coinVal);
      chipLabel = `${displayName} (${valStr})`;
    } else if (token.type === "pet") {
      chipLabel = token.label || token.id;
    } else if (token.type === "team") {
      chipLabel = token.label || token.id;
    } else {
      const typeName = token.type.charAt(0).toUpperCase() + token.type.slice(1);
      chipLabel = `${typeName}: ${token.id}`;
    }
    labelEl.textContent = chipLabel;

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    style(removeBtn, {
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      border: "none",
      background: "rgba(255,255,255,0.08)",
      color: "rgba(226,232,240,0.5)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "12px",
      padding: "0",
      lineHeight: "1",
      flexShrink: "0",
      transition: "all 100ms ease",
    });
    removeBtn.textContent = "\u00d7";
    removeBtn.onmouseenter = () => style(removeBtn, { background: "rgba(239,68,68,0.3)", color: "#fca5a5" });
    removeBtn.onmouseleave = () => style(removeBtn, { background: "rgba(255,255,255,0.08)", color: "rgba(226,232,240,0.5)" });
    removeBtn.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      pending.splice(index, 1);
      render();
    };

    chip.append(typeIcon, labelEl, removeBtn);
    return chip;
  }

  return {
    barElement: bar,
    getTokens: () => [...pending],
    add: (token: GemToken) => {
      pending.push(token);
      render();
    },
    clear: () => {
      pending.length = 0;
      render();
    },
    buildTokensString: () => {
      if (pending.length === 0) return "";
      return pending.map((t) => t.raw).join(" ");
    },
  };
}

// ── Consolidated inventory builder ───────────────────────────────────────────

interface ConsolidatedInventory {
  items: unknown[];
  storages: never[];
  favoritedItemIds: string[];
}

/**
 * Build a flat inventory merging main items, storage items, and active pets.
 * Returns `{ items: [...all], storages: [], favoritedItemIds: [...unchanged] }`.
 */
export async function buildConsolidatedInventory(): Promise<ConsolidatedInventory> {
  const [rawInv, rawPets] = await Promise.all([
    Atoms.inventory.myInventory.get(),
    Atoms.pets.myPetInfos.get(),
  ]);

  const inv = (rawInv && typeof rawInv === "object" ? rawInv : {}) as Record<string, unknown>;
  const mainItems = Array.isArray(inv.items) ? [...inv.items] : [];
  const storages = Array.isArray(inv.storages) ? (inv.storages as Record<string, unknown>[]) : [];
  const favoritedItemIds = Array.isArray(inv.favoritedItemIds) ? (inv.favoritedItemIds as string[]) : [];

  // Flatten storage items into main list
  for (const storage of storages) {
    const storageItems = Array.isArray(storage.items) ? storage.items : [];
    mainItems.push(...storageItems);
  }

  // Transform active pets into item format
  const pets = Array.isArray(rawPets) ? rawPets : [];
  for (const pet of pets) {
    if (!pet || typeof pet !== "object") continue;
    const slot = (pet as Record<string, unknown>).slot as Record<string, unknown> | undefined;
    if (!slot) continue;

    mainItems.push({
      id: slot.id,
      itemType: "Pet",
      petSpecies: slot.petSpecies,
      name: slot.name,
      xp: slot.xp,
      hunger: slot.hunger,
      mutations: slot.mutations,
      targetScale: slot.targetScale,
      abilities: slot.abilities,
    });
  }

  return { items: mainItems, storages: [] as never[], favoritedItemIds };
}

// ── Item import modal flow ───────────────────────────────────────────────────

/**
 * Poll for the user selecting an item inside the fake inventory modal.
 * Returns the selected index, or null if the modal was closed without selection.
 */
async function waitForItemSelection(timeoutMs = 120_000): Promise<number | null> {
  const start = performance.now();
  // Clear any stale selection first
  try { await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null); } catch {}
  try { await Atoms.inventory.myValidatedSelectedItemIndex.set(null); } catch {}
  try { await Atoms.inventory.mySelectedItemName.set(null); } catch {}
  try { await Atoms.inventory.mySelectedItemId.set(null); } catch {}

  while (performance.now() - start < timeoutMs) {
    // If the modal was closed, bail out
    try {
      const modalVal = await Atoms.ui.activeModal.get();
      if (!isInventoryOpen(modalVal)) return null;
    } catch { return null; }

    // Check if an item was selected
    try {
      const idx = await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.get();
      if (typeof idx === "number" && Number.isInteger(idx) && idx >= 0) {
        return idx;
      }
    } catch {}

    await new Promise((r) => setTimeout(r, 80));
  }
  return null;
}

/**
 * Create a team selection view (displayed inside the hub).
 * Shows a list of teams with name + 3 pet sprites.
 */
export async function createTeamSelectionView(options: {
  onTeamSelected: (team: PetTeam, pets: Record<string, unknown>[]) => void;
  onBack: () => void;
}): Promise<HTMLElement> {
  const { onTeamSelected, onBack } = options;

  const teams = readAriesPath<PetTeam[]>("pets.teams") ?? [];

  // Initialize sprite service to ensure pet sprites are available
  try {
    const win = (window as any).unsafeWindow || window;
    const service = win?.__MG_SPRITE_SERVICE__;
    if (service?.list) {
      // Call list to initialize pet sprites in the service
      service.list("pet");
    }
    if (service?.ready && typeof service.ready.then === "function") {
      await service.ready;
    }
  } catch (err) {
    console.warn("[ChatImporter] Failed to initialize sprite service:", err);
  }

  // Get pet data from all 3 sources
  const petItems: Record<string, unknown>[] = [];

  // 1. Pets placed on terrain (myPetInfos)
  const rawPlacedPets = await Atoms.pets.myPetInfos.get();
  const placedPets = Array.isArray(rawPlacedPets) ? rawPlacedPets : [];
  console.log("[Team Selector] Placed pets from myPetInfos:", placedPets.length);

  for (const pet of placedPets) {
    if (!pet || typeof pet !== "object") continue;
    const slot = (pet as Record<string, unknown>).slot as Record<string, unknown> | undefined;
    if (!slot || !slot.id) continue;

    petItems.push({
      id: slot.id,
      petSpecies: slot.petSpecies,
      name: slot.name,
      xp: slot.xp,
      mutations: slot.mutations,
      targetScale: slot.targetScale,
      abilities: slot.abilities,
    });
  }

  // 2. Pets in inventory (from myInventory, filter itemType === "Pet")
  const rawInventory = await Atoms.inventory.myInventory.get();
  if (rawInventory && typeof rawInventory === "object") {
    const inv = rawInventory as Record<string, unknown>;
    const items = inv.items;
    if (Array.isArray(items)) {
      const inventoryPets = items.filter((item: any) => item?.itemType === "Pet");
      console.log("[Team Selector] Inventory pets from myInventory:", inventoryPets.length);

      for (const pet of inventoryPets) {
        if (!pet || typeof pet !== "object") continue;
        const p = pet as Record<string, unknown>;
        if (!p.id) continue;

        petItems.push({
          id: p.id,
          petSpecies: p.petSpecies,
          name: p.name,
          xp: p.xp,
          mutations: p.mutations,
          targetScale: p.targetScale,
          abilities: p.abilities,
        });
      }
    }
  }

  // 3. Pets in hutch (myPetHutchPetItems)
  const rawHutchPets = await myPetHutchPetItems.get();
  const hutchPets = Array.isArray(rawHutchPets) ? rawHutchPets : [];
  console.log("[Team Selector] Hutch pets from myPetHutchPetItems:", hutchPets.length);

  for (const pet of hutchPets) {
    if (!pet || typeof pet !== "object") continue;
    const p = pet as Record<string, unknown>;
    if (!p.id || p.itemType !== "Pet") continue;

    petItems.push({
      id: p.id,
      petSpecies: p.petSpecies,
      name: p.name,
      xp: p.xp,
      mutations: p.mutations,
      targetScale: p.targetScale,
      abilities: p.abilities,
    });
  }

  console.log("[Team Selector] Total pets collected:", petItems.length);
  console.log("[Team Selector] Pet IDs:", petItems.map(p => p.id));

  // Container
  const container = document.createElement("div");
  style(container, {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  });

  // Header with back button
  const header = document.createElement("div");
  style(header, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    paddingBottom: "12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: "0",
  });

  const backButton = document.createElement("button");
  backButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="display:block;"><path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  backButton.type = "button";
  style(backButton, {
    padding: "8px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.03)",
    color: "#e7eef7",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 120ms ease",
  });
  backButton.onclick = onBack;

  const title = document.createElement("div");
  style(title, {
    fontSize: "16px",
    fontWeight: "700",
    color: "#e7eef7",
  });
  title.textContent = "Select a Team";

  header.append(backButton, title);

  // Team list
  const list = document.createElement("div");
  style(list, {
    flex: "1",
    overflowY: "auto",
    padding: "12px 0",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });

  if (teams.length === 0) {
    const emptyMsg = document.createElement("div");
    style(emptyMsg, {
      padding: "32px",
      textAlign: "center",
      color: "rgba(226,232,240,0.5)",
      fontSize: "14px",
    });
    emptyMsg.textContent = "No teams found";
    list.appendChild(emptyMsg);
  }

  console.log("[Team Selector] Teams:", teams);

  for (const team of teams) {
    console.log("[Team Selector] Processing team:", team.name, "slots:", team.slots);

    const teamItem = document.createElement("div");
    style(teamItem, {
      padding: "12px",
      borderRadius: "10px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      cursor: "pointer",
      transition: "all 120ms ease",
      display: "flex",
      alignItems: "center",
      gap: "12px",
    });
    teamItem.onmouseenter = () => style(teamItem, {
      background: "rgba(94,234,212,0.08)",
      borderColor: "rgba(94,234,212,0.2)",
    });
    teamItem.onmouseleave = () => style(teamItem, {
      background: "rgba(255,255,255,0.02)",
      borderColor: "rgba(255,255,255,0.06)",
    });
    teamItem.onclick = () => onTeamSelected(team, petItems);

    // Team name on the left
    const teamNameEl = document.createElement("div");
    style(teamNameEl, {
      fontSize: "14px",
      fontWeight: "500",
      color: "#e7eef7",
      flex: "1",
      minWidth: "0",
    });
    teamNameEl.textContent = team.name || team.id;

    // Pets row on the right (3 sprites)
    const petsRow = document.createElement("div");
    style(petsRow, {
      display: "flex",
      gap: "6px",
      flexShrink: "0",
    });

    for (const slotPetId of team.slots) {
      if (!slotPetId) {
        console.log("[Team Selector] Empty slot in team", team.name);
        // Empty slot placeholder
        const emptySlot = document.createElement("div");
        style(emptySlot, {
          width: "32px",
          height: "32px",
          borderRadius: "6px",
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed rgba(255,255,255,0.1)",
        });
        petsRow.appendChild(emptySlot);
        continue;
      }

      const pet = petItems.find((p) => String(p.id) === String(slotPetId)) as Record<string, unknown> | undefined;
      if (!pet) {
        console.log("[Team Selector] Pet not found for slot ID:", slotPetId);
        const emptySlot = document.createElement("div");
        style(emptySlot, {
          width: "32px",
          height: "32px",
          borderRadius: "6px",
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed rgba(255,255,255,0.1)",
        });
        petsRow.appendChild(emptySlot);
        continue;
      }

      const species = String(pet.petSpecies ?? "");
      const mutations = Array.isArray(pet.mutations) && pet.mutations.length > 0 ? pet.mutations : undefined;

      console.log("[Team Selector] Rendering sprite for:", species, "mutations:", mutations, "pet:", pet);

      const spriteWrap = document.createElement("div");
      style(spriteWrap, {
        width: "32px",
        height: "32px",
        borderRadius: "6px",
        background: "rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      });
      attachSpriteIcon(spriteWrap, ["pet"], [species], 32, "team-select-pet", { mutations });
      petsRow.appendChild(spriteWrap);
    }

    teamItem.append(teamNameEl, petsRow);
    list.appendChild(teamItem);
  }

  container.append(header, list);
  return container;
}

/**
 * Open team selection modal → build team token → call onAttach.
 * NOTE: This function is not currently used - team selection is handled via onShowTeamSelection callback.
 */
async function openTeamImportModal(_onAttach: (token: GemToken) => void): Promise<void> {
  console.warn("[ChatImporter] openTeamImportModal is not implemented - use onShowTeamSelection instead");
}

/**
 * Close community hub → open a fake inventory modal with the consolidated
 * inventory → wait for item selection → build token → call onAttach →
 * close modal → reopen hub.
 */
async function openItemImportModal(onAttach: (token: GemToken) => void): Promise<void> {
  try {
    const consolidated = await buildConsolidatedInventory();

    // Close the community hub
    window.dispatchEvent(new CustomEvent(CH_EVENTS.CLOSE));

    // Small delay so the hub animation finishes before the modal opens
    await new Promise((r) => setTimeout(r, 250));

    // Open the fake inventory modal with our consolidated payload
    await fakeInventoryShow(consolidated, { open: true });

    // Wait for the user to select an item
    const selectedIndex = await waitForItemSelection();

    if (selectedIndex !== null && consolidated.items[selectedIndex]) {
      const selectedItem = consolidated.items[selectedIndex] as Record<string, unknown>;
      const token = buildItemToken(selectedItem);
      if (token) {
        onAttach(token);
      }
    }

  // Clear selection atoms
  try { await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null); } catch {}
  try { await Atoms.inventory.myValidatedSelectedItemIndex.set(null); } catch {}
  try { await Atoms.inventory.mySelectedItemName.set(null); } catch {}
  try { await Atoms.inventory.mySelectedItemId.set(null); } catch {}

    // Disable the fake so real inventory data is restored
    await fakeInventoryHide();

    // Reopen the community hub
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
  } catch (err) {
    console.error("[ChatImporter] Item import failed:", err);
    // Attempt to reopen hub even on error
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
  }
}

// ── Import button + menu ─────────────────────────────────────────────────────

export interface ImportButtonResult {
  element: HTMLElement;
  cleanup: () => void;
}

export interface ImportButtonOptions {
  onAttach: (token: GemToken) => void;
  onShowTeamSelection?: () => void;
}

/**
 * Create the "+" import button with its popup menu.
 * Calls `onAttach` with the GemToken to add as an attachment.
 * Calls `onShowTeamSelection` when user clicks on Team (if provided).
 */
export function createImportButton(options: ImportButtonOptions): ImportButtonResult {
  const { onAttach, onShowTeamSelection } = options;
  const wrap = document.createElement("div");
  style(wrap, {
    position: "relative",
    flexShrink: "0",
  });

  // "+" button
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "+";
  style(btn, {
    width: "34px",
    height: "34px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "#e7eef7",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    fontWeight: "400",
    opacity: "0.6",
    transition: "all 150ms ease",
    padding: "0",
    lineHeight: "1",
  });
  btn.onmouseenter = () => style(btn, { opacity: "1", background: "rgba(94,234,212,0.1)", borderColor: "rgba(94,234,212,0.25)" });
  btn.onmouseleave = () => {
    if (!btn.dataset.active) {
      style(btn, { opacity: "0.6", background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" });
    }
  };

  // Menu popup
  const menu = document.createElement("div");
  style(menu, {
    position: "absolute",
    left: "0",
    bottom: "42px",
    zIndex: "10",
    display: "none",
    minWidth: "200px",
    padding: "6px",
    borderRadius: "12px",
    background: "#0f141e",
    border: "1px solid rgba(94,234,212,0.2)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  });

  // Menu items
  const roomItem = createMenuItem(
    "Room",
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    "Share current room",
    () => {
      void getCurrentRoomId().then((roomId) => {
        if (!roomId) return;
        const raw = buildGemToken("room", roomId);
        onAttach({ type: "room", id: roomId, raw });
        closeMenu();
      });
    },
  );

  const teamImport = createMenuItem(
    "Team",
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.0803 15.7203C18.4903 12.1903 15.1003 9.32031 11.5203 9.32031C7.63028 9.32031 4.21028 12.4703 3.88028 16.3503C3.75028 17.8503 4.23028 19.2703 5.22028 20.3403C6.20028 21.4103 7.58028 22.0003 9.08028 22.0003H13.7603C15.4503 22.0003 16.9303 21.3403 17.9403 20.1503C18.9503 18.9603 19.3503 17.3803 19.0803 15.7203Z" fill="currentColor"/><path d="M10.2796 7.86C11.8978 7.86 13.2096 6.54819 13.2096 4.93C13.2096 3.31181 11.8978 2 10.2796 2C8.66141 2 7.34961 3.31181 7.34961 4.93C7.34961 6.54819 8.66141 7.86 10.2796 7.86Z" fill="currentColor"/><path d="M16.94 9.02844C18.2876 9.02844 19.38 7.93601 19.38 6.58844C19.38 5.24086 18.2876 4.14844 16.94 4.14844C15.5924 4.14844 14.5 5.24086 14.5 6.58844C14.5 7.93601 15.5924 9.02844 16.94 9.02844Z" fill="currentColor"/><path d="M20.5496 12.9313C21.6266 12.9313 22.4996 12.0582 22.4996 10.9812C22.4996 9.90429 21.6266 9.03125 20.5496 9.03125C19.4727 9.03125 18.5996 9.90429 18.5996 10.9812C18.5996 12.0582 19.4727 12.9313 20.5496 12.9313Z" fill="currentColor"/><path d="M3.94 10.9816C5.28757 10.9816 6.38 9.88914 6.38 8.54156C6.38 7.19399 5.28757 6.10156 3.94 6.10156C2.59243 6.10156 1.5 7.19399 1.5 8.54156C1.5 9.88914 2.59243 10.9816 3.94 10.9816Z" fill="currentColor"/></svg>`,
    "Share a pet team",
    () => {
      closeMenu();
      if (onShowTeamSelection) {
        onShowTeamSelection();
      }
    },
  );

  const itemImport = createMenuItem(
    "Item",
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    "Import from inventory",
    () => {
      closeMenu();
      void openItemImportModal(onAttach);
    },
  );

  menu.append(roomItem, teamImport, itemImport);

  // Open / close logic
  function closeMenu(): void {
    style(menu, { display: "none" });
    delete btn.dataset.active;
    style(btn, {
      opacity: "0.6",
      background: "rgba(255,255,255,0.04)",
      borderColor: "rgba(255,255,255,0.1)",
    });
    document.removeEventListener("click", onClickOutside);
  }

  function onClickOutside(e: MouseEvent): void {
    if (!wrap.contains(e.target as Node)) {
      closeMenu();
    }
  }

  btn.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    const isVisible = menu.style.display !== "none";
    if (isVisible) {
      closeMenu();
    } else {
      style(menu, { display: "block" });
      btn.dataset.active = "1";
      style(btn, {
        opacity: "1",
        background: "rgba(94,234,212,0.1)",
        borderColor: "rgba(94,234,212,0.25)",
      });
      setTimeout(() => document.addEventListener("click", onClickOutside), 0);
    }
  };

  wrap.append(btn, menu);

  return {
    element: wrap,
    cleanup: () => {
      document.removeEventListener("click", onClickOutside);
    },
  };
}

// ── Menu item helper ─────────────────────────────────────────────────────────

function createMenuItem(
  label: string,
  iconSvg: string,
  description: string,
  onClick: () => void,
): HTMLElement {
  const item = document.createElement("div");
  style(item, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 10px",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background 100ms ease",
  });
  item.onmouseenter = () => style(item, { background: "rgba(94,234,212,0.1)" });
  item.onmouseleave = () => style(item, { background: "transparent" });

  const iconEl = document.createElement("div");
  style(iconEl, {
    width: "28px",
    height: "28px",
    borderRadius: "8px",
    background: "rgba(94,234,212,0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    color: "#5eead4",
  });
  iconEl.innerHTML = iconSvg;

  const textWrap = document.createElement("div");
  style(textWrap, {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    minWidth: "0",
  });

  const nameEl = document.createElement("div");
  style(nameEl, {
    fontSize: "13px",
    fontWeight: "500",
    color: "#e7eef7",
  });
  nameEl.textContent = label;

  const descEl = document.createElement("div");
  style(descEl, {
    fontSize: "10px",
    color: "rgba(226,232,240,0.45)",
    whiteSpace: "nowrap",
  });
  descEl.textContent = description;

  textWrap.append(nameEl, descEl);
  item.append(iconEl, textWrap);
  item.onclick = onClick;

  return item;
}
