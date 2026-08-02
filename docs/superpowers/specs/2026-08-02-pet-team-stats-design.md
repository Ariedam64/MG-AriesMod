# Pet Team Stats — design

Date: 2026-08-02
Status: approved (design)

## Goal

The Team Builder ranks pets by max strength but never shows what that
strength is *worth*. A card says "Turtle 92/96" without telling you that the
Turtle's Plant Growth Boost II therefore procs at 24.8% instead of its 27%
base, or that the whole team clears 57.6% per roll.

This feature adds a computed stats layer to every suggested team: effective
proc chance, summed magnitudes, strength potential, weather exposure, and AFK
autonomy. The same component is reused in the Manager tab for the currently
equipped team.

## Non-goals

- **No log-based measurement.** No procs/hour, no coins/hour, no per-pet
  historical contribution. The activity-log history exists and could support
  it, but it is deliberately out of scope — everything here is derived from
  formulas and live state.
- **No procs/hour in any form.** The server tick interval for `continuous`
  abilities is not present in the client bundle, so a per-hour rate cannot be
  computed honestly. All proc figures are expressed **per roll**.
- **No team-composition suggestions.** Redundancy detection and marginal-swap
  advice ("replace X with Y → +8%") are not part of this.

## Game formulas (source of truth)

Decompiled from the runtime bundle (`docs/main-Brp3BbpW.js`, functions `xg`,
`Sg`, `tge`). Everything scales linearly on `strength / 100`:

```
ratio        = getPetStrength(pet) / 100
proc%        = min(100, baseProbability × ratio)
magnitude    = baseParameter × ratio
cooldown     = cooldownSeconds ÷ max(ratio, 0.01)
```

`getPetStrength` / `getPetMaxStrength` already exist in
`src/utils/petCalcul.ts` and are reused as-is.

The parameter keys that scale (from `tge`) are: `scaleIncreasePercentage`,
`cropSellPriceIncreasePercentage`, `mutationChanceIncreasePercentage`,
`hungerRestorePercentage`, `hungerRefundPercentage`,
`plantGrowthReductionMinutes`, `eggGrowthTimeReductionMinutes`,
`baseMaxCoinsFindable`, `bonusXp`, `maxStrengthIncreasePercentage`,
`plantAbilityChanceBoostPercentage`. `cooldownSeconds` is the one key that
divides rather than multiplies.

Abilities with no `baseProbability` (e.g. `ProduceMutationBoost`) are
always-on modifiers, not rolls — they contribute magnitude but no proc figure.

## Data gap: hunger depletion

Hunger depletion time exists nowhere in the client bundle nor in MGData. It is
sourced from the wiki and hardcoded. Two constraints shape how:

**1. The catalog proxy resolves per species, not per field.**
`makeCatalogProxy` in `src/data/index.ts` returns the *entire* dynamic entry
when MGData has the species. Adding `hungerDepletionMinutes` to the hardcoded
`petCatalog` would be silently shadowed in-game. It therefore ships as a
**separate static export**, alongside `rarity` / `harvestType`:

```js
// hardcoded-data.clean.js
// Source: wiki. Absent from the game bundle AND from MGData — this is the
// only place it exists. Keyed by catalog species key, not display name.
export const petHungerDepletionMinutes = { Turtle: 90, ... };
```

**2. Catalog keys are not wiki display names.**
The table must be keyed on `petSpecies`. Four entries differ:
`Caribou` → `WhiteCaribou`, `Snow Fox` → `SnowFox`, `Fire Horse` →
`FireHorse`, `Thunder Wolf` → `ThunderWolf`. Keying on display names would
drop 4 of 26 pets into fallback silently.

Coverage is 26/26 pets today. The fallback path is retained anyway: when the
game adds a 27th pet it will appear via MGData with no depletion time, and
must show the relative sustain score rather than a wrong duration.

Max hunger is read dynamically from `coinsToFullyReplenishHunger`; current
hunger from `InventoryPet.hunger`. Only the depletion time is hardcoded.

## Architecture

Pure logic in `src/services/`, DOM in `src/ui/`, per repo convention.

| File | Responsibility |
|---|---|
| `services/petAbilityStats.ts` (new) | Per pet+ability: effective proc %, scaled parameters, effective cooldown |
| `services/petTeamStats.ts` (new) | Team aggregation: combined proc, summed magnitudes, potential, headroom, weather, AFK |
| `ui/menus/petsTeamStats.ts` (new) | The strip + expandable panel, shared by both mount points |
| `ui/menus/petsTeamBuilder.ts` (edit) | Mounts the strip on each suggested-team card |
| `ui/menus/pets.ts` (edit) | Mounts the panel in the Manager tab for the equipped team |
| `data/hardcoded-data.clean.js` (edit) | Adds `petHungerDepletionMinutes` |
| `data/index.ts` (edit) | Re-exports it as a static-only export |

Each service stays well under the 500-line target. `petAbilityStats.ts` has no
dependency on team concepts; `petTeamStats.ts` consumes it and knows nothing
about the DOM.

## Computed model

### Per pet + ability

```ts
type AbilityStats = {
  abilityId: string;
  effectiveProbability: number | null;  // null when the ability has no baseProbability
  baseProbability: number | null;
  scaledParameters: Record<string, number>;
  effectiveCooldownSeconds: number | null;
  requiredWeather: string | null;
};
```

### Per team

- **Combined proc** — `1 − Π(1 − pᵢ)`, computed **per category**, not once per
  team. Merging a CoinFinder roll with a PlantGrowth roll into one number would
  be meaningless. A team covering two categories shows two figures.
- **Summed magnitudes** — per parameter key, `Σ value × ratioᵢ`, labelled
  "per full salvo" (i.e. the total if all contributing pets proc on the same
  roll). The label matters: it is not an expected value.
- **Strength potential** — `Σ current STR / Σ max STR`, as a percentage.
- **Headroom** — the gain from bringing every pet to max STR. Recomputed by
  re-running the whole aggregation at max strength rather than scaling the
  result, because the combined-proc product is non-linear in STR.
- **Weather exposure** — share of the team's summed magnitude coming from
  abilities that carry a `requiredWeather`, plus which weather(s).

### AFK autonomy

Baseline only, fully computed:

```
drainPerMinute(pet) = coinsToFullyReplenishHunger(species) / depletionMinutes(species)
timeToStarve(pet)   = pet.hunger / drainPerMinute(pet)
teamAutonomy        = min over the team's pets
```

Presented as "holds ~3h20 unattended, excluding restore procs". It is a floor,
not a prediction — restore abilities extend it by an amount that cannot be
computed without the tick interval, and the wording must not imply otherwise.

When any pet in the team has no depletion entry, the team falls back to the
relative sustain score, with no duration shown:

```
sustainScore = Σ (hungerRestorePercentage × ratio) + Σ (hungerRefundPercentage × ratio)
```

Displayed raw (a percentage-point total), not rescaled to 0–100 — there is no
principled maximum to divide by, and an invented one would read as a
meaningful ceiling. Two teams are compared by their raw totals.

## UI

### Team Builder card

One always-visible strip appended below the pet rows, above the Save button:

```
┌─ Plant Growth Boost II ───────┐
│ 🐢 Turtle    92/96  ▪▪        │
│ 🦋 Butterfly 96/96  ▪▪▪       │
│ 🦅 Ostrich   88/96  ▪         │
├───────────────────────────────┤
│ 57.6%/roll · 96% pot. · 3h20 ▾│
│ [💾 Save]                     │
└───────────────────────────────┘
```

Clicking `▾` expands an in-card panel: per-pet proc breakdown, combined proc
per category, summed magnitudes, potential with headroom delta, weather
exposure, AFK autonomy. Collapsed by default — the grid already holds many
cards and the strip is the scanning surface.

### Manager tab

The same panel, permanently expanded, for the currently equipped team. The
Manager already tracks `activeTeamId` and `activePetIdSet`, so the equipped
pets are known without new state.

## Performance

The Team Builder can emit dozens of cards (57 categories × up to 2 modes,
before merging). Per-card cost is a handful of multiplications over at most 3
pets × a few abilities, which is negligible. The catalog lookups
(`petAbilities`, `petCatalog`, `petHungerDepletionMinutes`) go through the
data proxy and are resolved once per repaint into a plain lookup rather than
per card.

No new subscriptions, intervals, or listeners: stats are computed during the
existing `repaint()` pass and the expand toggle is a local DOM handler
cleaned up with the card.

## Edge cases

- Pet missing from `petCatalog` → strength is already 0 via `getPetMaxStrength`;
  contributes nothing and is flagged rather than silently zeroed.
- Ability id absent from `petAbilities` → skipped, not crashed; the catalog is
  dynamic and may gain ids the mod has never seen.
- Ability with no `baseProbability` → contributes magnitude, shows "always on"
  instead of a proc figure.
- Team with an empty slot (Pet XP caps at 2) → aggregation runs over the real
  pets only; potential and autonomy are not diluted by the empty slot.
- `effectiveProbability` clamped at 100 exactly as the game does.
- Pet with 0 current hunger → autonomy 0, surfaced as "starving" rather than
  a misleading "0h00".

## Testing

Unit tests on the two services, no DOM required:

- Formula parity: a Turtle at STR 96 with Plant Growth Boost II (base 27)
  yields 25.92%, matching the bundle's `v * h` path.
- Combined proc: three identical 25.92% pets → 59.35%, not 77.76% (verifies the
  product form, not a sum).
- Headroom: a team at 88% potential recomputes rather than scales, so combined
  proc headroom differs from magnitude headroom.
- Depletion keying: `WhiteCaribou` resolves; `"Caribou"` does not — guards the
  display-name trap.
- Fallback: an unknown species yields a sustain score and no duration.
- Clamping: a high-probability ability at max STR caps at 100%.
