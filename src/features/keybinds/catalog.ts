// Every shortcut the mod offers, grouped into the sections the Keybinds menu
// shows. The Pets section also gets one action per team at runtime, through
// `setDynamicActions`, after the two listed here.

import type { Hotkey } from "../../lib/hotkey";

export type KeybindId =
  | "gui.toggle"
  | "gui.drag"
  | "shops.seeds"
  | "shops.eggs"
  | "shops.decors"
  | "shops.tools"
  | "sell.sell-all"
  | "sell.sell-all-pets"
  | "companion.chat"
  | "game.action"
  | "game.inventory"
  | "game.journal"
  | "game.pet-hutch"
  | "game.decor-shed"
  | "game.tool-shack"
  | "game.seed-silo"
  | "game.feeding-trough"
  | "game.weather-station"
  | "game.move-up"
  | "game.move-down"
  | "game.move-left"
  | "game.move-right"
  | `pets.team.${string}`
  | "pets.team.next"
  | "pets.team.prev";

interface KeybindHoldDetection {
  label: string;
  description?: string;
  defaultEnabled?: boolean;
}

/** One shortcut as the catalog declares it, before it is placed in a section. */
export interface KeybindActionConfig {
  id: KeybindId;
  label: string;
  /** Atlas frame key or image URL shown at the start of the row, e.g. `sprite/ui/SeedIcon`. */
  icon?: string;
  hint?: string;
  defaultHotkey: Hotkey | null;
  allowModifierOnly?: boolean;
  /** Lets a core Game binding be cleared. Every other section can always clear. */
  allowClear?: boolean;
  holdDetection?: KeybindHoldDetection;
}

export interface KeybindAction extends KeybindActionConfig {
  sectionId: string;
}

export interface KeybindSection {
  id: string;
  title: string;
  description: string;
  actions: KeybindAction[];
}

export interface KeybindSectionConfig {
  id: string;
  title: string;
  description: string;
  actions: KeybindActionConfig[];
}

export const PET_SECTION_ID = "pets";

export const SECTION_CONFIG: KeybindSectionConfig[] = [
  {
    id: "gui",
    title: "Mod menus",
    description: "Show, hide and move the mod's windows.",
    actions: [
      {
        id: "gui.toggle",
        label: "Show or hide menus",
        icon: "sprite/ui/CameraOff",
        hint: "Every Arie's Mod window and the launcher.",
        defaultHotkey: { alt: true, code: "KeyX" },
      },
      {
        id: "gui.drag",
        label: "Move windows",
        icon: "sprite/ui/Touchpad",
        hint: "Hold it, then drag a window anywhere.",
        defaultHotkey: { alt: true, code: "AltLeft" },
        allowModifierOnly: true,
      },
    ],
  },
  {
    id: "shops",
    title: "Shops",
    description: "Open a shop straight on its tab.",
    actions: [
      { id: "shops.seeds", label: "Seeds shop", icon: "sprite/ui/SeedIcon", defaultHotkey: { alt: true, code: "KeyS" } },
      { id: "shops.eggs", label: "Eggs shop", icon: "sprite/ui/EggIcon", defaultHotkey: { alt: true, code: "KeyE" } },
      { id: "shops.decors", label: "Decors shop", icon: "sprite/ui/DecorIcon", defaultHotkey: { alt: true, code: "KeyD" } },
      { id: "shops.tools", label: "Tools shop", icon: "sprite/ui/ToolIcon", defaultHotkey: { alt: true, code: "KeyT" } },
    ],
  },
  {
    id: "game",
    title: "Game",
    description: "Change the game's own keys.",
    actions: [
      {
        id: "game.action",
        label: "Action",
        icon: "sprite/ui/PickupPin",
        defaultHotkey: { code: "Space" },
        holdDetection: { label: "Rapid fire", defaultEnabled: false },
      },
      { id: "game.inventory", label: "Inventory", icon: "sprite/ui/InventoryBag", defaultHotkey: { code: "KeyE" } },
      { id: "game.pet-hutch", label: "Pet hutch", icon: "sprite/decor/PetHutch_1", defaultHotkey: null, allowClear: true },
      { id: "game.decor-shed", label: "Decor shed", icon: "sprite/decor/DecorShed", defaultHotkey: null, allowClear: true },
      { id: "game.tool-shack", label: "Tool shack", icon: "sprite/decor/ToolShack", defaultHotkey: null, allowClear: true },
      { id: "game.seed-silo", label: "Seed silo", icon: "sprite/decor/SeedSilo", defaultHotkey: null, allowClear: true },
      { id: "game.feeding-trough", label: "Feeding trough", icon: "sprite/decor/FeedingTrough", defaultHotkey: null, allowClear: true },
      { id: "game.weather-station", label: "Weather station", icon: "sprite/object/WeatherStation", defaultHotkey: null, allowClear: true },
      { id: "game.journal", label: "Journal", icon: "sprite/ui/JournalStamp", defaultHotkey: null, allowClear: true },
      { id: "game.move-up", label: "Move up", icon: "https://i.imgur.com/EkbKUgi.png", defaultHotkey: { code: "KeyW" } },
      { id: "game.move-down", label: "Move down", icon: "https://i.imgur.com/tdJ7IGP.png", defaultHotkey: { code: "KeyS" } },
      { id: "game.move-left", label: "Move left", icon: "https://i.imgur.com/86VbR70.png", defaultHotkey: { code: "KeyA" } },
      { id: "game.move-right", label: "Move right", icon: "https://i.imgur.com/Ljzz6td.png", defaultHotkey: { code: "KeyD" } },
    ],
  },
  {
    id: "sell",
    title: "Selling",
    description: "Sell everything in one key press.",
    actions: [
      {
        id: "sell.sell-all",
        label: "All crops",
        icon: "sprite/ui/IconSell",
        hint: "Sells every harvested crop.",
        defaultHotkey: null,
      },
      {
        id: "sell.sell-all-pets",
        label: "All pets",
        icon: "sprite/ui/IconShop",
        hint: "Sells every pet that is not a favorite.",
        defaultHotkey: null,
      },
    ],
  },
  {
    id: "companion",
    title: "Companion",
    description: "Reach your companion without the launcher.",
    actions: [
      {
        id: "companion.chat",
        label: "Open the chat",
        // No icon: the `ui` atlas has no chat pictogram, and a made-up key
        // would show an empty box.
        hint: "Opens the Companion window on its Chat tab.",
        defaultHotkey: { alt: true, code: "KeyC" },
      },
    ],
  },
  {
    id: PET_SECTION_ID,
    title: "Pet teams",
    description: "Switch teams with a single key.",
    actions: [
      { id: "pets.team.prev", label: "Previous team", defaultHotkey: null },
      { id: "pets.team.next", label: "Next team", defaultHotkey: null },
    ],
  },
];
