# Arie's Mod

A browser overlay for **Magic Garden / Magic Circle** that adds a bunch of quality-of-life tools on top of the official game: pet team switching, crop protection, shop and weather alerts, a garden editor, custom sprite skins, and more.

**Open or close the overlay:** `Alt + X` or `Insert` (`Option + X` on Mac)

> Grab the latest version from the [Releases page](https://github.com/Ariedam64/MG-AriesMod/releases).

---

## Where it works

| Platform | Supported |
|---|---|
| magicgarden.gg, magiccircle.gg, starweaver.org | Yes |
| Discord Activity (browser) | Yes |
| Discord Desktop / Mobile app | No |

---

## Installing it

### 1. Get a userscript manager

You need an extension that can run userscripts:

| Browser | Extension |
|---|---|
| Chrome, Edge, Opera GX | [Tampermonkey](https://www.tampermonkey.net/) |
| Firefox | [Violentmonkey](https://violentmonkey.github.io/) |

### 2. Turn on Developer mode (Tampermonkey only)

Chromium browsers block userscripts unless Developer mode is on for extensions.

- **Chrome:** open `chrome://extensions/` and switch on **Developer mode** (top right)
- **Edge:** open `edge://extensions` and switch on **Developer mode** (left panel)
- **Opera GX:** open `opera://extensions` and switch on **Developer mode** (top right)

Then open Tampermonkey's **Details** page from the extensions list and turn on **Allow user scripts**, if that option shows up. Restart your browser afterward.

Violentmonkey doesn't need any of this, it works out of the box.

### 3. Install the mod

Head to the [Releases page](https://github.com/Ariedam64/MG-AriesMod/releases), download the `.user.js` file from the latest release, and your userscript manager will offer to install it. Reload the game and the HUD will show up in the corner once you're connected.

After an update, a short release note pops up on your first load so you can see what changed.

---

## Feature map

Everything below lives in the overlay's menu, opened with `Alt + X` or `Insert`.

### 🐾 Pets

- **Manager**: build named teams of 3 pets, filter your inventory by ability or species while picking one, and snapshot your currently active pets into a team with one click. Drag teams to reorder them, assign a hotkey to each from Keybinds, and cycle through teams with Previous/Next. Teams stay in sync with the in-game ones by default, and a toggle lets you unsync them if you'd rather keep the two lists separate.
- **Team Builder**: scans the pets you actually own and proposes ready-made teams per goal (plant growth, egg hatching, a specific mutation, and so on), each with an Active and an AFK variant. Every suggestion shows its stats so you can compare, and saving one drops it straight into your Manager list.
- **Feeding**: decide which crops each pet species is allowed to eat, and toggle a small floating "Instant Feed" button you can drag anywhere on screen.
- **Hatch**: a running count of pets hatched per species, split by Normal, Gold, and Rainbow.
- **Logs**: a searchable history of your pets' ability activations, with filters and sorting.

### 🔒 Locker

- **General**: a global switch plus a shared set of filters: lock or allow harvest based on size range, required mutations (Gold, Rainbow), and weather mutations (match any, match all, or match specific recipes).
- **Overrides**: apply a different set of those same filters to individual crops, instead of the general rule.
- **Restrictions**: four independent safety nets:
  - A minimum friend-bonus threshold that blocks selling crops below it.
  - A toggle that stops placed decor from being picked back up.
  - Per-egg locks to stop specific eggs from being hatched by accident.
  - Rules for the game's "Sell all pets" action, protecting Gold or Rainbow pets, pets near max strength, or whole rarities.

Locked crops get a purple outline and a lock icon right in the garden, so you can spot them at a glance.

### 🔔 Alerts

- **Shops** and **Weather**: pick any item or weather event and get notified the moment it shows up, with a bell icon, a sound, and per-item rules (custom sound, volume, one-shot or loop, stop condition).
- **Pets**: a hunger warning once your active pets drop below a threshold you set.
- **Settings**: choose between the default bell icon or a movable floating widget, set default sounds per category, and import your own audio clips.

Clicking the bell opens a small panel listing every item you're tracking that's currently in stock, with Buy and Buy All buttons right there.

### 🤓 Calculator

Pick a crop, adjust its size, mutations, weather, and friend bonus, and see the exact coin value it would sell for, with a live preview of the sprite.

### 🏠 Room

A list of everyone currently in your room. Select a player to teleport to them or their garden, follow them around, peek at their inventory, journal, stats, or activity log, save their garden layout into your Editor, or check the estimated value of their inventory and garden.

### 📝 Editor

A sandbox mode that unlocks every plant and decor item for free placement, handy for planning a layout.

- Left click to place, right click to remove, drag to paint. Decor follows your mouse directly instead of snapping to a grid.
- Plants can be placed with the size, custom scale, and mutations of your choice, so a mock garden can look exactly like the real thing.
- Decor rotation is a slider with a live preview, and each piece only offers the angles it actually supports.
- Save your current garden, import one from a file, and manage a list of saved layouts you can reload or export at any time.

### 🎨 Skins

Replace any game sprite with your own image.

- Browse the sprite grid, filter by category or search by name, then pick an object and drop in a PNG.
- Works on plants (each growth stage has its own slot), decor, and items, mutated versions included.
- Every slot shows its ideal image size, match it for a pixel-perfect result.
- Skins are stored locally on your machine and reapplied automatically on every load. A master switch turns them all off, and Reset clears the lot.

Ground tiles are the one exception, they're baked into the map and can't be skinned.

### 🧩 Misc

- **Ghost mode**: walk through walls, with an adjustable movement delay.
- **Inventory guard**: keeps one inventory slot free so you never get stuck at capacity.
- **Auto-store**: automatically sends matching seeds and decor into the Seed Silo and Decor Shed, as soon as they land in your inventory.
- **Seed and decor deleters**: bulk delete a selection of seeds or decor with a progress bar and pause/stop controls.
- **Auto-reconnect** is in this menu too, but it's currently switched off at the request of the game's developers. It should come back once that's resolved.

### ⌨️ Keybinds

Rebind pretty much everything, grouped into sections you can collapse, with the game's own sprites next to each action:

- **GUI**: open the menu, drag the HUD.
- **Shops**: seeds, eggs, decor, tools.
- **Game**: the action button (with a rapid-fire hold), movement, and every panel, inventory, pet hutch, decor shed, seed silo, feeding trough, weather station, journal.
- **Sell**: all crops, all pets.
- **Pets**: previous and next team, plus one hotkey per saved team.

Clear or reset any binding individually.

### 🛠️ Tools

A curated list of community-made calculators, guides, apps, and other tools, with tags to filter by type, screenshots, and a preview before you click through.

### ⚙️ Settings

Export or import your whole configuration as a file, save and restore named backups, and check your mod version alongside the game's version and environment info.

---

## Also happening in the background

A few things run automatically without a dedicated menu:

- Crops in your inventory and garden show their estimated coin value.
- Your inventory gets a sort dropdown (name, rarity, value, size, mutations, strength) plus ascending/descending order.
- A "Sell all Pets" button appears next to the game's own sell prompt, respecting your Locker restrictions.
- The activity log keeps a much longer history than the game does, and gains a filter by action type.

---

## Looking for the social features?

Friends, DMs, groups, room browsing, and the leaderboard used to live inside this mod. They've since moved to their own companion userscript, **MG Community Hub**, so they can be installed and updated on their own. If you had them set up here before, your login and settings carry over automatically.

Get it from [github.com/Ariedam64/MG-CommunityHub](https://github.com/Ariedam64/MG-CommunityHub). You can run it alongside Arie's Mod without any conflicts. It's also where the room privacy toggle lives, if you'd rather your room stayed out of the public list.

---

## Good to know

- **Chrome and Edge** are the most tested browsers and the recommended choice.
- **Firefox** works fine, though a few things may look slightly different.
- **Discord Activity** loads everything, but joining a room from the Community Hub will redirect you to the website since Discord doesn't allow it directly.
- Sound alerts need at least one click or tap on the page first, that's a browser rule for audio, not a bug.

---

## Support

Bugs, suggestions, or just want to chat with other players? Join the [Discord server](https://discord.gg/qFpQ436HZc).

If you'd like to support the project, there's a Ko-fi link in the Settings menu. Never required, always appreciated.
