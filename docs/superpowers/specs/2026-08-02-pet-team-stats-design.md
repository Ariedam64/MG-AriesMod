# Pet Team Stats — design

Date: 2026-08-02
Status: approved (design)

## Goal

The Team Builder ranks pets by max strength but never shows what that
strength is *worth*. A card says "Turtle 92/96" without telling you that the
Turtle's Plant Growth Boost II therefore procs at 24.8% instead of its 27%
base, or that the whole team clears 57.6% per minute.

This feature adds a computed stats layer to every suggested team: effective
proc chance, summed magnitudes, strength potential, weather exposure, and AFK
autonomy. The same component is reused in the Manager tab for the currently
equipped team.

## Non-goals

- **No log-based measurement.** No procs/hour, no coins/hour, no per-pet
  historical contribution. The activity-log history exists and could support
  it, but it is deliberately out of scope — everything here is derived from
  formulas and live state.
- **No measured rates.** Nothing is derived from observed history.

## Roll cadence (corrected 2026-08-02)

An earlier draft of this spec claimed the roll cadence was unknowable from
the client and that every figure had to be expressed "per roll". That was
wrong. The game's own item tooltip labels `continuous` abilities **"chance
per minute"** — visible in the bundle as the `trigger === "continuous"`
branch selecting message id `xVEzUu`. Continuous abilities roll **once per
minute**, so their effective probability is a per-minute chance and an
expected hourly count is simply `p × 60`.

This applies to `continuous` only. Every other trigger (`harvest`,
`sellAllCrops`, `sellPet`, `hatchEgg`, `playerActivated`) rolls once per
matching player action, at a frequency set by the player — those are labelled
per action, never per minute.
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

Coverage is 26/26 pets today, and the values match the community reference
calculator's `HUNGER_MINUTES` table exactly — an independent corroboration.
The fallback path is retained anyway: when the game adds a 27th pet it will
appear via MGData with no depletion time, and must report `unknown` rather
than a wrong duration.

Max hunger is read dynamically from `coinsToFullyReplenishHunger`. Live
hunger is not read at all — see the autonomy section. Only the depletion time
is hardcoded.

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

Computed as if every pet started **full**. Live hunger is deliberately not
read: this stat rates the team's composition so it stays comparable between
suggested teams, rather than reporting how recently each pet was fed.

An earlier version reported the raw depletion time and ignored both hunger
abilities. That understated a feeder team by more than an order of magnitude
— a Turtle trio with one Hunger Boost II + Hunger Restore II lasts ~30h, not
the 90 minutes it reported. The model below matches the community reference
calculator at <https://liam0306dis.github.io/hunger/> exactly on that case.

**Hunger Boost** cuts the drain rate and stacks across the team:

```
drainReduction% = Σ over pets, over boost abilities: refund × str/100
remainingDrain  = max(0, 1 - drainReduction% / 100)
drainPerMinute  = maxHunger / depletionMinutes × remainingDrain
```

The parameter is `hungerRefundPercentage` in the live bundle and
`hungerDepletionRateDecreasePercentage` in the hardcoded fallback — the same
value under two names, so both are recognised.

**Hunger Restore** refills a random active pet. Its chance is stated per
minute but checked every second, so it can fire more than once a minute:

```
perSecond      = 1 - (1 - chance×str/100 ÷ 100)^(1/60)
activations/min = perSecond × 60
hitsPerPet      = activations/min ÷ teamSize      // "a random active pet"
cap             = floor(targetMaxHunger × amount×str/100 ÷ 100)
averageRoll     = (cap + 1) / 2                   // uniform 1..cap
restorePerMinute = Σ hitsPerPet × averageRoll
```

Then per pet, `net = restorePerMinute - drainPerMinute`, and:

- every pet at `net ≥ 0`, or `remainingDrain == 0` → **sustained**, the team
  feeds itself and no duration is shown;
- otherwise → **runs out** in `min over pets of maxHunger / -net`.

Weather-gated hunger abilities (Snow Hunger Boost, Snowy Hunger Restore) are
**excluded**: they only work during that weather, which is never guaranteed.
The UI names the ones it left out so the figure is not misread.

Presented as "Lasts without feeding (from full): ~3h20" or "indefinitely".
Restore figures are expectations, so an unlucky streak does worse — the
tooltip says so.

When any pet in the team has no depletion entry or no max hunger, the whole
figure reports **unknown** rather than a partial answer: the pet that empties
first could easily be the one that cannot be measured.

## AFK team composition

The Team Builder's AFK variant originally filled `maxSlots - 1` goal slots and
reserved exactly one for a feeder. That fixed split is wrong whenever the goal
pets carry hunger abilities themselves: two Rainbow Turtles that each have
Hunger Restore and Hunger Boost sustain each other indefinitely, but the split
took only one of them and handed the last slot to a separate feeder, landing
on a finite ~2h31.

The AFK team is therefore chosen as a whole. Candidate compositions are drawn
from the top qualifying pets plus the top feeders, and ranked
lexicographically:

1. **self-sustaining** (`computeTeamAutonomy(...).status === "sustained"`) —
   a team that never needs feeding beats one that does, whatever the strength
   gap, because that is the entire point of an AFK team;
2. **feeding capability**, but only while the team still runs dry — dodging a
   granter (below) must never cost a real feeder; once sustained, extra hunger
   capability buys nothing and this tier goes silent;
3. **no Gold granter** (see below);
4. combined proc chance for the goal;
5. total max strength, minus the granter handicap below.

### Unwanted mutation granters

A pet carrying a mutation granter keeps rewriting the garden. Granters are
detected from the catalog (`grantedMutations` in `baseParameters`), so nothing
is hardcoded and a future granter is covered automatically. A granter the team
is actually built for is exempt — a Rainbow team wants its Rainbow pets.

This applies to **every pet in every team**, not only to feeders and not only
to AFK teams: an active Plant Growth team of Turtles rewrites the garden just
as happily if one of them carries Gold Granter. Concretely the rule lives in
three places — `rankCandidates` (active teams, AFK pools and padding),
`pickSustainPet` (the leftover-slot feeder) and `pickAfkTeam`'s team-level
score.

Ability tier still outranks it: dropping a whole tier to dodge a granter costs
more than the granter does. And a granter pet is still fielded when there is
no alternative — an empty slot is worse.

Only **Gold** and **Rainbow** are steered around:

- **Gold is avoided outright** whenever an equally capable granter-free pet
  exists. A golden crop can no longer turn Rainbow, so an unwanted Gold
  Granter actively destroys value rather than merely being noisy.
- **Rainbow costs a 10-strength handicap.** Expressed as a penalty rather
  than a veto, this reproduces the intended rule exactly: the Rainbow pet wins
  only when `strength - 10 > strength of the best clean pet`, i.e. when it is
  more than 10 stronger.

Every other granter (Wet, Chilled, Frozen, Dawnlit, Ambershine, Thunderstruck)
is **ignored**. An earlier version penalised all of them, which reshuffled
unrelated teams for no benefit: Ambershine Granter pets were pushed out of a
Dawn team by a much weaker pet, which stopped that team from merging with its
neighbour and split one card into two confusing ones.

Mutation *converters* (`MoonKisser`, `DawnKisser`) carry no `grantedMutations`
and are therefore not covered. They transform existing mutations rather than
granting new ones; revisit if that turns out to matter in practice.

Every composition must contain at least one pet that serves the goal and at
least one hunger source; otherwise "AFK" would be meaningless. Pool sizes are
capped (6 goal pets, 4 feeders) so the search stays trivial across all
categories — the pools are pre-ranked, so anything past the top few could
never win.

This is why `computeTeamAutonomy` is exported from `petTeamStats.ts`: the
builder needs the real hunger model to make this choice. The dependency runs
builder → stats only, so there is no cycle.

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
- Pet at 0 current hunger → no effect on the figure at all; autonomy assumes
  every pet starts full by design.

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
- Fallback: an unknown species reports `unknown`, never a partial duration.
- Hunger: Boost stacks team-wide and stretches the lifetime; Restore averages
  slightly more activations than its per-minute chance; weather-gated hunger
  abilities are excluded; a feeder team reproduces the reference calculator's
  1831 min on the reported case.
- Clamping: a high-probability ability at max STR caps at 100%.
