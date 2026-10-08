// The eggs the egg hatch locker lists: every egg of the catalog, then any
// other the egg shop offers.

import { eggCatalog } from "../../data";

export type EggOption = { id: string; name: string };

export function catalogEggs(): EggOption[] {
  return Object.entries(eggCatalog as Record<string, any>)
    .filter(([id]) => !!id)
    .map(([id, raw]) => ({ id, name: (typeof raw?.name === "string" && raw.name) || id }));
}

/** Every `eggId` (or `id`) found anywhere in the egg shop's state, named from it when it can. */
function shopEggs(shop: any): EggOption[] {
  const found = new Map<string, string>();
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const id = node.eggId ?? node.id ?? null;
    if (typeof id === "string" && id && !found.has(id)) {
      const name = (typeof node.name === "string" && node.name) || (typeof shop?.names?.[id] === "string" && shop.names[id]) || id;
      found.set(id, name);
    }
    for (const value of Object.values(node)) if (value && typeof value === "object") walk(value);
  };
  walk(shop);
  return Array.from(found, ([id, name]) => ({ id, name }));
}

/** The catalog's eggs, then the shop's eggs the catalog does not know. */
export function lockableEggs(shop: unknown): EggOption[] {
  const eggs = catalogEggs();
  const known = new Set(eggs.map((egg) => egg.id));
  for (const egg of shopEggs(shop)) {
    if (known.has(egg.id)) continue;
    known.add(egg.id);
    eggs.push(egg);
  }
  return eggs;
}
