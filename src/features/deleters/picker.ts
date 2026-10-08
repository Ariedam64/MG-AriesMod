// One popup to pick what the seed or decor deleter should destroy.
//
// The list is the mod's own, built from the inventory and the matching
// storage, so what the player sees is everything the run can reach. The flow
// it replaced faked the game's inventory panel and read the clicks back off a
// selection atom, and went silently dead once the game renamed that atom.
//
// The popup only returns a selection; withdrawing and deleting stay in
// `run.ts`.

import { formatInteger } from "../../lib/format";
import { button, setButtonEnabled } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import { textInput } from "../../ui/kit/fields";
import { openModal } from "../../ui/kit/modal";
import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import type { DeleterEntry } from "./sources";
import { ensureDeleterStyles } from "./styles";

/** Sprites carry the row: big enough to recognise a seed at a glance. */
const ROW_SPRITE_PX = 36;

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
  ensureDeleterStyles();
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
  const search = textInput(`Search ${options.unitNoun}…`, "", { small: true });
  search.classList.add("qws-del-search");
  search.addEventListener("input", () => {
    filter = search.value.trim().toLowerCase();
    renderRows();
  });

  const setAll = (qtyFor: (entry: DeleterEntry) => number) => {
    for (const entry of visibleEntries()) {
      const qty = qtyFor(entry);
      if (qty > 0) picked.set(entry.id, qty);
      else picked.delete(entry.id);
    }
    renderRows();
  };

  const controls = h("div", "qws-del-controls");
  controls.append(
    search,
    button("All", { size: "sm", onClick: () => setAll((entry) => entry.total) }),
    button("None", { size: "sm", onClick: () => setAll(() => 0) }),
  );

  const list = h("div", "qws-del-list");
  modal.body.append(controls, list);

  /* ----- Footer ----- */
  const summary = h("div", "qws-del-summary");
  const btnCancel = button("Cancel", { size: "sm", onClick: () => modal.close() });
  const btnConfirm = button("Confirm selection", {
    variant: "primary",
    size: "sm",
    onClick: () => {
      const out = new Map<string, number>();
      for (const [id, qty] of picked) if (qty > 0) out.set(id, qty);
      // Commit before closing: `onClose` is what callers wait on, so the
      // selection has to be in place by the time it fires.
      options.onConfirm(out);
      modal.close();
    },
  });

  modal.footer.classList.add("qws-del-footer");
  modal.footer.append(summary, btnCancel, btnConfirm);

  /* ----- Rendering ----- */
  /**
   * The real game sprite for a row, by raw id: `Aloe` in the `seed` sheet,
   * `WindSpinner` in `decor`. The emoji underneath shows while the atlas
   * resolves and stays put if that id has no sprite.
   */
  function buildIcon(id: string): HTMLElement {
    const box = h("span", "qws-del-row__icon", options.fallbackIcon);
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
    const storagePart = fromStorage > 0 ? ` · ${formatInteger(fromStorage)} from the ${options.storageNoun}` : "";
    summary.textContent = groups === 0
      ? "Nothing selected."
      : `${groups} selected · ${formatInteger(units)} ${options.unitNoun}${storagePart}`;
    setButtonEnabled(btnConfirm, groups > 0);
  }

  function buildRow(entry: DeleterEntry): HTMLElement {
    const qty = picked.get(entry.id) ?? 0;

    const row = h("div", qty > 0 ? "qws-del-row is-selected" : "qws-del-row");
    // Clicking the row takes the whole stock, or drops it if already picked.
    row.addEventListener("click", () => {
      if ((picked.get(entry.id) ?? 0) > 0) picked.delete(entry.id);
      else picked.set(entry.id, entry.total);
      renderRows();
    });

    const text = h("div", "qws-del-row__text");
    text.append(
      h("div", "qws-del-row__name", entry.label),
      h(
        "div",
        "qws-del-row__detail",
        entry.storeQty > 0
          ? `${formatInteger(entry.total)} · ${formatInteger(entry.invQty)} held, ${formatInteger(entry.storeQty)} in ${options.storageNoun}`
          : `${formatInteger(entry.total)} held`,
      ),
    );

    // Partial pick. Editing it must not toggle the row underneath.
    const amount = h("input", "qmm-input qmm-input--sm qws-del-amount");
    amount.type = "number";
    amount.min = "0";
    amount.max = String(entry.total);
    amount.step = "1";
    amount.value = String(qty);
    amount.addEventListener("click", (event) => event.stopPropagation());
    amount.addEventListener("change", (event) => {
      event.stopPropagation();
      const next = Math.max(0, Math.min(entry.total, Math.floor(Number(amount.value) || 0)));
      if (next > 0) picked.set(entry.id, next);
      else picked.delete(entry.id);
      renderRows();
    });

    row.append(buildIcon(entry.id), text, amount);
    return row;
  }

  function renderRows(): void {
    if (!modal.isOpen()) return;
    list.replaceChildren();

    const rows = visibleEntries();
    if (rows.length === 0) {
      list.append(
        h(
          "div",
          "qws-del-note",
          entries.length === 0
            ? `You have no ${options.unitNoun} to delete, in your inventory or your ${options.storageNoun}.`
            : "No match.",
        ),
      );
    } else {
      for (const entry of rows) list.append(buildRow(entry));
    }
    updateSummary();
  }

  /* ----- Load ----- */
  list.append(h("div", "qws-del-note", "Reading inventory…"));
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
      summary.classList.add("is-error");
      summary.textContent = "Could not read the inventory.";
    });
}
