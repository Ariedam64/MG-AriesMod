// The menus the HUD registered, in dock order, and a signal each time one of
// their windows opens. The HUD reports here and features read, so no feature
// needs to know about the HUD: the bug report lists the menus as the parts of
// the mod a report can be about, and notes which ones the player opened.

import { Emitter, type Unsubscribe } from "../../lib/emitter";

export type MenuEntry = { id: string; title: string };

const menus: MenuEntry[] = [];
const opened = new Emitter<MenuEntry>();

export function noteMenuRegistered(id: string, title: string): void {
  if (!menus.some((menu) => menu.id === id)) menus.push({ id, title });
}

export function noteMenuOpened(id: string): void {
  const menu = menus.find((entry) => entry.id === id);
  if (menu) opened.emit({ ...menu });
}

export function registeredMenus(): MenuEntry[] {
  return menus.map((menu) => ({ ...menu }));
}

export function onMenuOpened(cb: (menu: MenuEntry) => void): Unsubscribe {
  return opened.on(cb);
}
