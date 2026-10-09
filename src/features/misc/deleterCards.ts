// The seed and decor deleter cards of the Misc menu, wired to their picker.
//
// The deleters pick what to destroy through their own popup (`deleters/picker`),
// which lists the inventory and the matching storage.

import { DECOR_DELETE_DELAY_MS, SEED_DELETE_DELAY_MS, decorDeleter, seedDeleter } from "../deleters/deleters";
import { openDeleterPicker } from "../deleters/picker";
import type { DeleterController } from "../deleters/run";
import { createDeleterSection } from "../deleters/section";
import { getDecorEntries, getSeedEntries, type DeleterEntry } from "../deleters/sources";
import { isSectionCollapsed, setSectionCollapsed } from "./sectionCard";

type PickerSetup = {
  title: string;
  unitNoun: string;
  storageNoun: string;
  spriteCategories: string[];
  fallbackIcon: string;
  loadEntries: () => Promise<DeleterEntry[]>;
};

/**
 * Opens the picker and resolves once it is gone, confirmed or cancelled,
 * so the section refreshes its summary either way.
 */
function pickFor(host: HTMLElement, controller: DeleterController, opts: PickerSetup): Promise<void> {
  return new Promise<void>((resolve) => {
    let loaded: DeleterEntry[] = [];
    openDeleterPicker({
      ...opts,
      host,
      initial: new Map(controller.getSelection().map((entry) => [entry.id, entry.qty])),
      loadEntries: async () => {
        loaded = await opts.loadEntries();
        return loaded;
      },
      onConfirm: (picked) => {
        controller.setSelection(
          Array.from(picked, ([id, qty]) => {
            const entry = loaded.find((candidate) => candidate.id === id);
            return {
              id,
              qty,
              label: entry?.label ?? id,
              fromStorage: Math.max(0, qty - (entry?.invQty ?? 0)),
            };
          }),
        );
      },
      onClose: () => resolve(),
    });
  });
}

export function buildSeedDeleterSection(modalHost: () => HTMLElement): HTMLElement {
  return createDeleterSection({
    sprite: "sprite/ui/SeedIcon",
    title: "Seed deleter",
    description: "Delete seeds in bulk, from your inventory and Seed Silo.",
    spriteCategories: ["seed"],
    fallbackIcon: "🌱",
    groupNoun: { one: "species", many: "species" },
    unitNoun: { one: "seed", many: "seeds" },
    selectLabel: "Choose seeds",
    clearLabel: "Clear",
    storageLabel: "Seed Silo",
    estimateDelayMs: SEED_DELETE_DELAY_MS,
    runDelayMs: SEED_DELETE_DELAY_MS,
    collapsed: isSectionCollapsed("seedDeleter"),
    onToggleCollapsed: collapsed => setSectionCollapsed("seedDeleter", collapsed),
    controller: seedDeleter,
    openSelector: () => pickFor(modalHost(), seedDeleter, {
      title: "Select seeds",
      unitNoun: "seeds",
      storageNoun: "silo",
      spriteCategories: ["seed"],
      fallbackIcon: "🌱",
      loadEntries: getSeedEntries,
    }),
  });
}

export function buildDecorDeleterSection(modalHost: () => HTMLElement): HTMLElement {
  return createDeleterSection({
    sprite: "sprite/ui/DecorIcon",
    title: "Decor deleter",
    description: "Delete decor in bulk, from your inventory and Decor Shed.",
    spriteCategories: ["decor"],
    fallbackIcon: "🪴",
    groupNoun: { one: "kind", many: "kinds" },
    unitNoun: { one: "item", many: "items" },
    selectLabel: "Choose decor",
    clearLabel: "Clear",
    storageLabel: "Decor Shed",
    // Decor deletes cost roughly two round-trips each, so the estimate doubles
    // the delay the run is actually given.
    estimateDelayMs: DECOR_DELETE_DELAY_MS * 2,
    runDelayMs: DECOR_DELETE_DELAY_MS,
    collapsed: isSectionCollapsed("decorDeleter"),
    onToggleCollapsed: collapsed => setSectionCollapsed("decorDeleter", collapsed),
    controller: decorDeleter,
    openSelector: () => pickFor(modalHost(), decorDeleter, {
      title: "Select decor",
      unitNoun: "decor",
      storageNoun: "shed",
      spriteCategories: ["decor"],
      fallbackIcon: "🪴",
      loadEntries: getDecorEntries,
    }),
  });
}
