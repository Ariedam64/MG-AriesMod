// src/data/dynamic/logic/sprites.ts

import type { DataBag } from "../types";
import { captureState } from "../state";
import { pageWindow } from "../../../utils/page-context";

/** Access the sprite service exposed on the page window */
function getSpriteService(): Record<string, Function> | null {
  const svc = (pageWindow as Record<string, unknown>).__MG_SPRITE_SERVICE__;
  if (svc && typeof svc === "object") return svc as Record<string, Function>;
  return null;
}

function spriteHas(category: string, id: string): boolean {
  const svc = getSpriteService();
  if (!svc || typeof svc.has !== "function") return false;
  try { return !!svc.has(category, id); } catch { return false; }
}

function spriteGetIdPath(category: string, id: string): string | null {
  const svc = getSpriteService();
  if (!svc || typeof svc.getIdPath !== "function") return null;
  try { return svc.getIdPath(category, id) as string | null; } catch { return null; }
}

function spriteListIds(prefix: string): string[] {
  const svc = getSpriteService();
  if (!svc || typeof svc.listIds !== "function") return [];
  try { return (svc.listIds(prefix) as string[]) || []; } catch { return []; }
}

function normalizeNameForSprite(input: string): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .trim();
}

function catCandidates(cat: string | null, extras: string[] = []): string[] {
  const list = new Set<string>();
  const add = (s: string | null | undefined) => {
    const v = String(s || "").trim();
    if (v) list.add(v);
  };

  add(cat);
  for (const e of extras) add(e);

  for (const c of Array.from(list.values())) {
    if (c.endsWith("s")) add(c.slice(0, -1));
    else add(`${c}s`);
    if (c.endsWith("es")) add(c.slice(0, -2));
  }

  return Array.from(list.values()).filter(Boolean);
}

function pickSpriteId(
  cat: string | null,
  idHint: string | null,
  nameHint: string | null,
  extraCats: string[] = [],
  idFallbacks: string[] = []
): string | null {
  if (!getSpriteService()) return null;

  const cats = catCandidates(cat, extraCats);
  if (!cats.length) return null;

  const idCandidates = [idHint, ...idFallbacks].filter((v) => typeof v === "string");

  const tryCandidate = (candidate: string | null): string | null => {
    const c = String(candidate || "").trim();
    if (!c) return null;
    for (const category of cats) {
      try {
        if (spriteHas(category, c)) return spriteGetIdPath(category, c);
      } catch { }
    }
    return null;
  };

  for (const cand of idCandidates) {
    const hit = tryCandidate(cand);
    if (hit) return hit;
  }

  const normName = normalizeNameForSprite(nameHint || "");
  const fromName = tryCandidate(normName || nameHint || "");
  if (fromName) return fromName;

  try {
    for (const category of cats) {
      const ids = spriteListIds(`sprite/${category}/`);
      const idLcList = idCandidates.map((x) => String(x || "").toLowerCase());
      const nameLc = String(nameHint || normName || "").toLowerCase();

      for (const k of ids) {
        const leaf = k.split("/").pop() || "";
        const leafLc = leaf.toLowerCase();
        if (idLcList.some((c) => c && c === leafLc)) return k;
        if (leafLc === nameLc) return k;
      }

      for (const k of ids) {
        const leaf = k.split("/").pop() || "";
        const leafLc = leaf.toLowerCase();
        if (idLcList.some((c) => c && (leafLc.includes(c) || c.includes(leafLc)))) return k;
        if (nameLc && (leafLc.includes(nameLc) || nameLc.includes(leafLc))) return k;
      }
    }
  } catch { }

  return null;
}

function applySpriteId(
  target: Record<string, unknown>,
  catHint: string | null,
  idHint: string | null,
  nameHint: string | null,
  extraCats: string[] = [],
  idFallbacks: string[] = []
): void {
  if (!target || typeof target !== "object") return;
  const tileRef = target.tileRef;
  if (!tileRef || typeof tileRef !== "object") return;

  const category = String((tileRef as Record<string, unknown>).spritesheet || catHint || "").trim();
  const spriteId = pickSpriteId(category, idHint, nameHint, extraCats, idFallbacks);
  if (spriteId) {
    try { target.spriteId = spriteId; } catch { }
  }

  const rv = target.rotationVariants;
  if (rv && typeof rv === "object") {
    for (const v of Object.values(rv as Record<string, unknown>)) {
      applySpriteId(v as Record<string, unknown>, category, idHint, nameHint);
    }
  }

  if (target.immatureTileRef) {
    const wrapper: Record<string, unknown> = { tileRef: target.immatureTileRef };
    applySpriteId(wrapper, category, idHint, nameHint);
    if (wrapper.spriteId) target.immatureSpriteId = wrapper.spriteId;
  }

  if (target.topmostLayerTileRef) {
    const wrapper: Record<string, unknown> = { tileRef: target.topmostLayerTileRef };
    applySpriteId(wrapper, category, idHint, nameHint);
    if (wrapper.spriteId) target.topmostLayerSpriteId = wrapper.spriteId;
  }

  if (target.activeState && typeof target.activeState === "object") {
    const activeState = target.activeState as Record<string, unknown>;
    applySpriteId(activeState, category, idHint, (activeState.name as string) || nameHint);
  }
}

function resolveSpriteIdByHints(
  category: string,
  hints: string[],
  nameHint?: string,
  extraCats: string[] = []
): string | null {
  if (!Array.isArray(hints) || hints.length === 0) return null;
  const primary = hints[0];
  const fallbacks = hints.slice(1);
  return pickSpriteId(category, primary, nameHint ?? null, extraCats, fallbacks);
}

function resolveAllSprites(bag: DataBag): void {
  for (const [id, entry] of Object.entries(bag.items || {})) {
    applySpriteId(entry as Record<string, unknown>, "items", id, (entry as Record<string, unknown>)?.name as string, ["item"]);
  }

  for (const [id, entry] of Object.entries(bag.decor || {})) {
    applySpriteId(entry as Record<string, unknown>, "decor", id, (entry as Record<string, unknown>)?.name as string);
  }

  for (const [id, entry] of Object.entries(bag.mutations || {})) {
    applySpriteId(entry as Record<string, unknown>, "mutations", id, (entry as Record<string, unknown>)?.name as string, ["mutation"]);

    const overlay = resolveSpriteIdByHints(
      "mutation-overlay",
      [`${id}TallPlant`, `${id}TallPlantIcon`, id],
      (entry as Record<string, unknown>)?.name as string,
      ["mutation-overlay"]
    );
    if (overlay) {
      try { (entry as Record<string, unknown>).overlaySpriteId = overlay; } catch { }
    }
  }

  for (const [id, entry] of Object.entries(bag.eggs || {})) {
    applySpriteId(entry as Record<string, unknown>, "pets", id, (entry as Record<string, unknown>)?.name as string, ["pet"]);
  }

  for (const [id, entry] of Object.entries(bag.pets || {})) {
    applySpriteId(entry as Record<string, unknown>, "pets", id, (entry as Record<string, unknown>)?.name as string, ["pet"]);
  }

  for (const [id, entry] of Object.entries(bag.plants || {})) {
    const plant = entry as Record<string, unknown>;
    const seed = plant.seed as Record<string, unknown> | undefined;
    const plantObj = plant.plant as Record<string, unknown> | undefined;
    const crop = plant.crop as Record<string, unknown> | undefined;

    if (seed) {
      const seedTileRef = seed.tileRef as Record<string, unknown> | undefined;
      applySpriteId(
        seed,
        (seedTileRef?.spritesheet as string) || "seeds",
        `${id}Seed`,
        (seed.name as string) || `${id} Seed`,
        ["seed", "plant", "plants"],
        [id]
      );
    }
    if (plantObj) {
      const plantTileRef = plantObj.tileRef as Record<string, unknown> | undefined;
      applySpriteId(
        plantObj,
        (plantTileRef?.spritesheet as string) || "plants",
        `${id}Plant`,
        (plantObj.name as string) || `${id} Plant`,
        ["plant", "plants", "tallplants"],
        [id]
      );
    }
    if (crop) {
      const cropTileRef = crop.tileRef as Record<string, unknown> | undefined;
      applySpriteId(
        crop,
        (cropTileRef?.spritesheet as string) || "plants",
        id,
        (crop.name as string) || id,
        ["plant", "plants"],
        [`${id}Crop`]
      );
    }
  }
}

export function resolveSprites(): void {
  try {
    resolveAllSprites(captureState.data);
  } catch (err) {
    try { console.warn("[MGData] sprite resolution failed", err); } catch { }
  }
}
