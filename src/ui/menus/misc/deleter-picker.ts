// src/ui/menus/misc/deleter-picker.ts
//
// One popup to pick what the seed/decor deleter should destroy.
//
// It replaces the old flow, which faked the game's own inventory panel and
// read the clicks back off a selection atom. That was long to drive, and went
// silently dead once the game renamed that atom. Here the list is the mod's
// own, built from the inventory *and* the matching storage, so what you see is
// everything the run can reach.
//
// The popup only returns a selection; withdrawing and deleting stay in the
// service.

import { attachSpriteIcon } from "../../spriteIconCache";
import {
  BORDER, CARD_BG, css, DANGER, TEAL, TEAL_BORDER, TEAL_DIM,
  TEXT, TEXT_DIM, button, textField,
} from "../panel-ui";
import { openModal } from "../companion/modal";
import type { DeleterEntry } from "../../../services/deleterSources";

/** Sprites carry the row: big enough to recognise a seed at a glance. */
const ROW_SPRITE_PX = 36;

const NF_US = new Intl.NumberFormat("en-US");
const formatNum = (n: number) => NF_US.format(Math.max(0, Math.floor(n || 0)));

export interface DeleterPickerOptions {
  /** HUD window the call comes from. Drives placement and z-index. */
  host: HTMLElement;
  title: string;
  /** Plural unit noun, e.g. "seeds". */
  unitNoun: string;
  /** Where the non-inventory half lives, e.g. "silo". */
  storageNoun: string;
  /** Sprite categories to search, e.g. `["seed"]`. The row id is the name. */
  spriteCategories: string[];
  /** Shown until the sprite resolves, or if it never does. */
  fallbackIcon: string;
  loadEntries: () => Promise<DeleterEntry[]>;
  /** Quantities already picked, by raw id, so reopening keeps the selection. */
  initial: ReadonlyMap<string, number>;
  onConfirm: (selection: Map<string, number>) => void;
  /** Always fires once the popup is gone, confirmed or not. */
  onClose?: () => void;
}

export function openDeleterPicker(options: DeleterPickerOptions): void {
  const modal = openModal({
    host: options.host,
    title: options.title,
    widthPx: 460,
    onClose: options.onClose,
  });

  /** Picked quantity per raw id. Absent or 0 means "not selected". */
  const picked = new Map<string, number>(options.initial);
  let entries: DeleterEntry[] = [];
  let filter = "";

  /* ----- Controls ----- */
  const controls = document.createElement("div");
  css(controls, { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginBottom: "10px" });

  const search = textField(`Search ${options.unitNoun}…`);
  css(search, { flex: "1 1 160px", minWidth: "120px" });
  search.addEventListener("input", () => {
    filter = search.value.trim().toLowerCase();
    renderRows();
  });

  const setAll = (fn: (entry: DeleterEntry) => number) => {
    for (const entry of visibleEntries()) {
      const qty = fn(entry);
      if (qty > 0) picked.set(entry.id, qty);
      else picked.delete(entry.id);
    }
    renderRows();
  };

  controls.append(
    search,
    button("All", "neutral", () => setAll((e) => e.total)),
    button("None", "neutral", () => setAll(() => 0)),
  );

  /* ----- List ----- */
  const list = document.createElement("div");
  css(list, { display: "flex", flexDirection: "column", gap: "4px" });

  modal.body.append(controls, list);

  /* ----- Footer ----- */
  const summary = document.createElement("div");
  css(summary, { flex: "1", minWidth: "0", fontSize: "12px", color: TEXT_DIM });

  const btnCancel = button("Cancel", "neutral", () => modal.close());
  const btnConfirm = button("Confirm selection", "accent", () => {
    const out = new Map<string, number>();
    for (const [id, qty] of picked) if (qty > 0) out.set(id, qty);
    // Commit before closing: `onClose` is what callers wait on, so the
    // selection has to be in place by the time it fires.
    options.onConfirm(out);
    modal.close();
  });

  css(modal.footer, { display: "flex", alignItems: "center", gap: "8px" });
  modal.footer.append(summary, btnCancel, btnConfirm);

  /* ----- Rendering ----- */
  /**
   * The real game sprite for a row, by raw id: `Aloe` in the `seed` sheet,
   * `WindSpinner` in `decor`. The emoji underneath shows while the atlas
   * resolves and stays put if that id has no sprite.
   */
  function buildIcon(id: string): HTMLElement {
    const box = document.createElement("span");
    css(box, {
      width: `${ROW_SPRITE_PX}px`, height: `${ROW_SPRITE_PX}px`, flex: "0 0 auto",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: "22px", lineHeight: "1",
    });
    box.textContent = options.fallbackIcon;
    attachSpriteIcon(box, options.spriteCategories, [id], ROW_SPRITE_PX, "deleter-picker");
    return box;
  }

  function visibleEntries(): DeleterEntry[] {
    if (!filter) return entries;
    return entries.filter(
      (entry) => entry.label.toLowerCase().includes(filter) || entry.id.toLowerCase().includes(filter),
    );
  }

  function updateSummary(): void {
    let groups = 0;
    let units = 0;
    let fromStorage = 0;
    for (const entry of entries) {
      const qty = picked.get(entry.id) ?? 0;
      if (qty <= 0) continue;
      groups += 1;
      units += qty;
      fromStorage += Math.max(0, qty - entry.invQty);
    }
    const storagePart = fromStorage > 0 ? ` · ${formatNum(fromStorage)} from the ${options.storageNoun}` : "";
    summary.textContent = groups === 0
      ? "Nothing selected."
      : `${groups} selected · ${formatNum(units)} ${options.unitNoun}${storagePart}`;
    btnConfirm.disabled = groups === 0;
    css(btnConfirm, { opacity: groups === 0 ? "0.45" : "1", cursor: groups === 0 ? "default" : "pointer" });
  }

  function buildRow(entry: DeleterEntry): HTMLElement {
    const qty = picked.get(entry.id) ?? 0;
    const selected = qty > 0;

    const row = document.createElement("div");
    css(row, {
      display: "flex", alignItems: "center", gap: "8px",
      padding: "6px 8px", borderRadius: "10px",
      border: `1px solid ${selected ? TEAL_BORDER : BORDER}`,
      background: selected ? TEAL_DIM : CARD_BG,
      cursor: "pointer",
    });

    // Clicking the row takes the whole stock, or drops it if already picked.
    row.addEventListener("click", () => {
      if ((picked.get(entry.id) ?? 0) > 0) picked.delete(entry.id);
      else picked.set(entry.id, entry.total);
      renderRows();
    });

    const label = document.createElement("div");
    css(label, { flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" });

    const name = document.createElement("div");
    css(name, { fontSize: "12.5px", color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
    name.textContent = entry.label;

    const detail = document.createElement("div");
    css(detail, { fontSize: "10.5px", color: TEXT_DIM });
    detail.textContent = entry.storeQty > 0
      ? `${formatNum(entry.total)} · ${formatNum(entry.invQty)} held, ${formatNum(entry.storeQty)} in ${options.storageNoun}`
      : `${formatNum(entry.total)} held`;

    label.append(name, detail);

    // Partial pick. Editing it must not toggle the row underneath.
    const amount = document.createElement("input");
    amount.type = "number";
    amount.min = "0";
    amount.max = String(entry.total);
    amount.step = "1";
    amount.value = String(qty);
    css(amount, {
      width: "66px", flex: "0 0 auto", padding: "4px 6px", borderRadius: "8px",
      border: `1px solid ${BORDER}`, background: "rgba(10,14,20,0.9)", color: TEXT,
      fontSize: "12px", textAlign: "right",
    });
    amount.addEventListener("click", (event) => event.stopPropagation());
    amount.addEventListener("change", (event) => {
      event.stopPropagation();
      const next = Math.max(0, Math.min(entry.total, Math.floor(Number(amount.value) || 0)));
      if (next > 0) picked.set(entry.id, next);
      else picked.delete(entry.id);
      renderRows();
    });

    row.append(buildIcon(entry.id), label, amount);
    return row;
  }

  function renderRows(): void {
    if (!modal.isOpen()) return;
    list.innerHTML = "";

    const rows = visibleEntries();
    if (rows.length === 0) {
      const empty = document.createElement("div");
      css(empty, { padding: "14px", textAlign: "center", fontSize: "12px", color: TEXT_DIM });
      empty.textContent = entries.length === 0
        ? `You have no ${options.unitNoun} to delete, in your inventory or your ${options.storageNoun}.`
        : "No match.";
      list.append(empty);
    } else {
      for (const entry of rows) list.append(buildRow(entry));
    }
    updateSummary();
  }

  /* ----- Load ----- */
  const loading = document.createElement("div");
  css(loading, { padding: "14px", textAlign: "center", fontSize: "12px", color: TEXT_DIM });
  loading.textContent = "Reading inventory…";
  list.append(loading);
  updateSummary();

  void options
    .loadEntries()
    .then((loaded) => {
      if (!modal.isOpen()) return;
      entries = loaded;
      // Drop stale picks and clamp the rest to what is actually there now.
      for (const [id, qty] of [...picked]) {
        const entry = entries.find((e) => e.id === id);
        if (!entry) picked.delete(id);
        else picked.set(id, Math.min(qty, entry.total));
      }
      renderRows();
    })
    .catch(() => {
      if (!modal.isOpen()) return;
      entries = [];
      renderRows();
      css(summary, { color: DANGER });
      summary.textContent = "Could not read the inventory.";
    });
}

/** Re-exported so callers styling their own trigger stay on the same accent. */
export const DELETER_PICKER_ACCENT = TEAL;
