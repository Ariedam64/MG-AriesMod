// src/ui/menus/companion/harvest-fields.ts
// Cartes de filtre de la popup de récolte, et le bandeau de résultat.
//
// Tout est replié au départ, et chaque carte porte son réglage en en-tête. On
// voit donc l'ensemble des critères d'un coup d'œil, et on n'ouvre que celui
// qu'on veut changer — au lieu d'avoir tous les contrôles déployés en même
// temps. Les résumés sont aussi la contrepartie des tuiles sans libellé : les
// sprites disent quoi choisir, l'en-tête dit ce qui est choisi, en toutes lettres.

import { BORDER, TEAL, TEXT, TEXT_DIM, WARN, css, sectionLabel } from "../panel-ui";
import { collapsibleCard } from "../panel-layout";
import { allTile, spriteTile, tileRow } from "./harvest-chips";
import type { HarvestFilters } from "../../../services/companion/chat/harvest";

export type FilterCard = {
  root: HTMLElement;
  body: HTMLElement;
  /** Résumé affiché à droite du titre. `active` = le réglage n'est plus par défaut. */
  setSummary(text: string, active: boolean): void;
};

/** Carte repliée, titre à gauche, état courant à droite. */
export function filterCard(icon: string, title: string): FilterCard {
  const summary = document.createElement("div");
  css(summary, {
    marginLeft: "auto",
    fontSize: "11px",
    color: TEXT_DIM,
    textAlign: "right",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "60%",
  });

  const header = document.createElement("div");
  css(header, { display: "flex", alignItems: "center", gap: "8px", width: "100%" });
  header.append(sectionLabel(icon ? `${icon} ${title}` : title), summary);

  const { root, body } = collapsibleCard({ header, collapsed: true, onToggle: () => {} });
  css(root, { padding: "9px 11px", gap: "9px", flex: "0 0 auto" });

  return {
    root,
    body,
    setSummary(text, active) {
      summary.textContent = text;
      css(summary, { color: active ? TEAL : TEXT_DIM });
    },
  };
}

/** Ligne de champ à l'intérieur d'une carte : un intitulé, un contrôle. */
export function fieldRow(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  css(row, { display: "flex", alignItems: "center", gap: "10px", justifyContent: "space-between" });

  const text = document.createElement("div");
  css(text, { fontSize: "11.5px", color: TEXT });
  text.textContent = label;

  row.append(text, control);
  return row;
}

/* ------------------------- Sélection par tuiles -------------------------- */

/** Bascule une valeur dans un filtre multiple ; vide ⇒ `null` ⇒ « tout ». */
export function toggleIn(current: string[] | null, value: string): string[] | null {
  const next = new Set(current ?? []);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next.size === 0 ? null : [...next];
}

export type SelectionRowOptions = {
  values: string[];
  counts: Map<string, number>;
  /** `null` = aucun filtre, donc l'entrée « tout » est active. */
  selected: string[] | null;
  iconFor(value: string): HTMLElement;
  onPick(value: string): void;
  onClear(): void;
  allLabel: string;
};

/** Grille de tuiles précédée de son entrée « tout ». */
export function selectionRow(options: SelectionRowOptions): HTMLElement {
  const row = tileRow();
  row.append(allTile(options.allLabel, options.selected === null, options.onClear));
  for (const value of options.values) {
    row.append(
      spriteTile({
        icon: options.iconFor(value),
        title: value,
        count: options.counts.get(value) ?? 0,
        selected: options.selected?.includes(value) ?? false,
        onClick: () => options.onPick(value),
      })
    );
  }
  return row;
}

/* ------------------------------- Résumés -------------------------------- */

/** « Carrot and Tomato », ou « 4 kinds » au-delà de trois. */
function nameList(values: string[], fallback: string): string {
  if (values.length === 0) return fallback;
  if (values.length > 3) return `${values.length} kinds`;
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

export function summarizeSpecies(filters: HarvestFilters): string {
  return nameList(filters.species ?? [], "All");
}

export function summarizeMutations(filters: HarvestFilters): string {
  if (filters.mutations.length === 0) return "Any";
  const list = nameList(filters.mutations, "Any");
  if (filters.mutationMode === "none") return `Without ${list}`;
  if (filters.mutationMode === "all") return `All of ${list}`;
  return list;
}

export function summarizeSize(filters: HarvestFilters): string {
  return filters.minSizePct > 50 ? `${filters.minSizePct}% and up` : "Any size";
}

/* -------------------------------- Aperçu -------------------------------- */

export type PreviewEntry = { icon: HTMLElement; label: string; count: number };

export type ResultStrip = {
  root: HTMLElement;
  /** `entries` porte une vignette par variante, déjà montée, avec son effectif. */
  update(total: number, entries: PreviewEntry[], hidden: number): void;
};

/**
 * Ce que le companion s'apprête à récolter, en vignettes.
 *
 * Une par apparence réellement présente, mutations comprises. C'est ce qui
 * remplace une liste ligne à ligne : on ne veut pas cent entrées, on veut
 * reconnaître ce qu'on va cueillir.
 */
export function resultStrip(): ResultStrip {
  const root = document.createElement("div");
  css(root, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "11px 12px",
    borderRadius: "12px",
    background: "rgba(94,234,212,0.07)",
    border: `1px solid ${BORDER}`,
    flex: "0 0 auto",
  });

  const count = document.createElement("div");
  css(count, { fontSize: "13px", fontWeight: "600", color: TEAL });

  const sprites = document.createElement("div");
  css(sprites, { display: "flex", alignItems: "flex-end", gap: "10px", flexWrap: "wrap" });

  root.append(count, sprites);

  return {
    root,
    update(total, entries, hidden) {
      count.textContent = total === 0 ? "Nothing to pick" : `${total} crop${total === 1 ? "" : "s"}`;
      sprites.innerHTML = "";
      sprites.style.display = entries.length === 0 ? "none" : "flex";

      for (const entry of entries) {
        const pair = document.createElement("div");
        pair.title = entry.label;
        css(pair, { display: "flex", alignItems: "center", gap: "3px" });
        const tally = document.createElement("span");
        css(tally, { fontSize: "11px", color: TEXT_DIM });
        tally.textContent = String(entry.count);
        pair.append(entry.icon, tally);
        sprites.append(pair);
      }

      if (hidden > 0) {
        const more = document.createElement("span");
        css(more, { fontSize: "11px", color: TEXT_DIM, alignSelf: "center" });
        more.textContent = `+${hidden} more`;
        sprites.append(more);
      }
    },
  };
}

/** Note explicative sous le bandeau : ce que le Locker met de côté. */
export function lockedNote(): { root: HTMLElement; update(lockedOut: number): void } {
  const root = document.createElement("div");
  css(root, { fontSize: "11px", lineHeight: "1.5", color: TEXT_DIM });

  return {
    root,
    update(lockedOut) {
      if (lockedOut === 0) {
        root.textContent = "Your Locker decides what I leave alone.";
        css(root, { color: TEXT_DIM });
        return;
      }
      root.textContent = `Leaving ${lockedOut} locked crop${lockedOut === 1 ? "" : "s"} alone.`;
      css(root, { color: WARN });
    },
  };
}
