# Garden Paper: a new look for the mod's menus

Status: approved by the owner on 2026-10-09 (direction B of the mockups at
https://claude.ai/artifact/4dgABPntzegvVnfqfp79zP, dock on the left edge).

Amended the same day, after the owner saw the first build:

- the accent is sepia, not green: every "green" below (title band, primary
  buttons, open dock buttons, switches, focus rings, selection) reads as sepia,
  and the tokens are named `sepia*`;
- green stays only as a status colour (`ok`, `okInk`, `okSoft`): the connected
  dot, OK pills, active pet teams;
- gold and rainbow text on paper uses `goldInk` and `rainbowInk`;
- a fold button at the bottom of the dock shrinks it to the status dot, so
  players without an Insert key can put it away;
- a build behind the latest release badges the Settings dock button.
- after the first in-game test: the palette is one step darker (paper, sand,
  cards and sepia), and the dock can be dragged anywhere by the grip around its
  status dot, which is remembered.
- after the second test: the dock became a panel like the old HUD. A header
  holds the status dot, "Arie's Mod", the version pill (an amber "Update x"
  link when a newer release is out) and the fold button; below it the menus
  sit three to a row. Dragging the header moves the panel, which starts in the
  bottom right corner as before. The version pill replaces the Settings badge.
- Settings gained an Appearance tab: four themes (Sepia, Garden, Lavender,
  Night), an accent colour of the player's own, and a menu size from 80 to
  130 percent. Every theme is held to the same contrast pairs, and a custom
  accent is pushed darker or lighter until its shades stay readable. To make
  this possible `color.*` holds `var(--qmm-...)` references, so inline styles
  follow the theme too.

## Goal

Every menu and floating surface of the mod gets one light, warm look that sits
with Magic Garden's own art instead of a dark overlay on top of it. How the
menus work does not change: same windows, same tabs, same controls, same
settings.

## What players see

**Dock.** The current HUD launcher (a dark box listing the menus with emoji)
becomes a vertical column of icon buttons on the left edge of the screen,
vertically centred:

- one 48 px button per menu, in the current order (Pets, Locker, Alerts,
  Calculator, Room, Editor, Skins, Misc, Keybinds, Tools, Settings, Companion,
  Debug);
- a name tooltip on hover and an `aria-label` on each button;
- the open menus' buttons are green, the others cream;
- a red count badge on a button when its feature reports one (Alerts first);
- the existing hide-HUD hotkey hides the dock too;
- the connection status, today a pill in the launcher, becomes a small dot at
  the top of the dock (green connected, amber connecting, red lost), with its
  text in the tooltip; the version badge moves to the Settings window.
- When the window is shorter than the dock, the dock scrolls.

**Windows.** They still drag, stack, remember their position and can be open
several at once. New skin: a 56 px green title band with the white title and a
close button, a cream body, a 3 px beige border, a 24 px radius, and a solid
"raised" drop shadow (`0 8px 0 <shade>`) plus a soft one.

**Tabs** are pills: the active one dark brown on cream text, the others beige.

**Controls** follow the mockup:

- buttons are raised: an inset bottom shade, green for primary, beige for
  secondary, terracotta for danger;
- switches are 46×26 green pills with a white knob;
- sliders have a 10 px track and a white knob ringed in green;
- cards are white with a beige border, and the selected one has a green border;
- fields are white with a beige border and a green focus ring;
- segmented controls, vertical tabs, badges, meters and the hotkey button use
  the same palette.

**Other mod surfaces** take the same look:

- the floating shop bell and the instant-feed widget;
- the companion's question banner;
- the changelog notice, the auto-reconnect and room-privacy dialogs, and the
  kit's popup modal;
- the deleter picker, the sell-all-pets confirmation, and the garden editor's
  panels and toolbar;
- the controls the mod adds inside the game's own inventory modal (the sort
  bar and the value badges).

**Not changed:**

- the game's toasts (the game draws them);
- the badges and buttons the mod draws on the Pixi canvas (crop price badge,
  locker indicator, sell-all-pets action button, activity log filter bar);
- data colours: rarity, ability and mutation colours keep their exact values.

**Type:** Nunito (Google Fonts, weights 600/700/800/900), loaded once with
the stylesheet; the system UI font is the fallback.

**Icons:** inline stroke SVG icons owned by the mod (24 px grid, 2.2 px
stroke, `currentColor`), one per menu, replacing the emoji in the launcher.
Window titles lose their emoji too.

## Palette (theme tokens)

| Token | Value | Use |
|---|---|---|
| paper | #fbf4e4 | window body, dock, popups |
| paperDeep | #f6ecd5 | inset sections |
| sand | #efe3c6 | secondary buttons, inactive tabs, icon wells |
| sandEdge | #e3d3b0 | borders |
| sandShade | #c9b48a | raised shadow under paper surfaces |
| card | #ffffff | cards, fields |
| leaf | #57a05f | title bands, switches on, slider fill (large or non-text) |
| leafStrong | #40844c | primary buttons and any white text on green |
| leafShade | #2f6638 | inset shade of green buttons |
| leafSoft | #e7f2df | selected backgrounds |
| leafInk | #2f7a3d | green text on light |
| bark | #3b2f22 | main text, active tab |
| barkSoft | #6b5537 | secondary text, icons |
| barkDim | #76634a | captions (4.5:1 on paper, paperDeep and sand) |
| clay | #c24a2a | danger, alert badges |
| amber | #d18a1a | warnings |

The mockup used #8a7556, #57a05f under button text and #e0613f, which fall short; the values above are the darkened ones. Every text/background pair the kit uses must reach 4.5:1 (3:1 for text 18 px
and up or 14 px bold). A check enforces it; a value that fails is darkened
until it passes.

The token names in `src/ui/kit/theme.ts` keep their current meaning where one
exists (`accent`, `text`, `textDim`, `border`, `cardBg`, `danger`, ...), so the
features that already read `color.*` or `--qmm-*` switch to the new look
without edits. New tokens are added for what the dark theme did not need
(`raise` shadows, `paperDeep`, `leafInk`).

## How it is built

1. **`src/ui/kit/theme.ts`.** New token values. Gradients become flat colours.
   Two new shadow tokens: `raise` (`0 8px 0 sandShade`) and `raiseSmall`.
2. **`src/ui/kit/styles/`** (chrome, controls, containers). Rewritten for the
   new look, same class names, so callers do not change.
3. **`src/ui/kit/icons/menuIcons.ts`** (new). The SVG icons, keyed by menu id.
4. **`src/ui/kit/dock.ts`** (new). `createDock({ items, onSelect })`, with
   `setOpen(id, open)`, `setBadge(id, count)`, `setStatus(tone, text)` and a
   tooltip per item.
5. **`src/ui/hud.ts`, `hudStatus.ts`, `hudPlacement.ts`.** The launcher is
   replaced by the dock. Window placement and dragging do not change. The
   status pill becomes the dock's status dot, and the version badge moves to
   the Settings menu's Infos tab.
6. **Font.** One `<link>` to Google Fonts, added with the kit stylesheet,
   guarded so it is added once.
7. **Feature surfaces.** Every literal colour in DOM UI code outside data
   tables is replaced by a theme token. Data colours (`data/live/
   abilityColors.ts`, `rarityBadge.ts` values, `mutationTint.ts`,
   `pets/abilityChipColors.ts`) and Pixi-drawn colours stay.

## Checks

- **`check:contrast`.** Every text/background pair declared in a table next to
  the theme reaches its WCAG ratio.
- **`check:themecolors`.** No hex or `rgb()` literal in `src/` outside an
  allowlist of data files and Pixi drawing files, so a dark-theme leftover
  cannot sneak back.
- **`check:dock`.** In the fake DOM: one button per menu with its label,
  `setOpen` and `setBadge` reflect on the right button, and `onSelect` fires
  with the menu id.
- All existing suites and the typecheck pass.

## Preview

`scripts/kitPreview.mjs` builds a static `kit-preview.html` (not shipped)
that renders every kit component and the dock in the new theme, over the
garden backdrop, for a look in a browser before testing in game. It is
published as an artifact for the owner.

## Out of scope

- Moving to a single window with a sidebar (direction C).
- A dark/light switch: the dark theme is replaced, not kept.
- Restyling the game's own UI.
