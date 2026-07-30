# Pet Team Builder tab

## Context

The Pets menu (`src/ui/menus/pets.ts`) already has a tab system (`ui.addTab`) with Manager, Feeding, Hatch, and Logs tabs. The Manager tab already supports creating/renaming/reordering named `PetTeam`s (`slots: (string|null)[]`, max 3) and syncing them to the game's native pet-team system (`PetsService.createTeam`/`saveTeam`, `src/services/pets.ts`).

Two pieces of real, non-hardcoded infrastructure already exist and will be reused as-is:
- `getPetStrength(pet)` / `getPetMaxStrength(pet)` (`src/utils/petCalcul.ts`) — real STR formula derived from `petCatalog` (maxScale, hoursToMature) and the pet's own `xp`/`targetScale`. Matches the wiki's "strength determines proficiency in executing abilities."
- `PetsService.getInventoryPets()` — returns every owned pet (hutch + inventory + active) as `InventoryPet { id, petSpecies, xp, hunger, mutations, targetScale, abilities: string[] }`. Real owned pets can carry **multiple** abilities per pet (confirmed from live exported data), not just one.

Prior analysis (this conversation) established two hard constraints that shape the design:
1. **No pet in a reasonable roster reliably survives an unattended night on hunger pool alone** — there is no safe way to estimate a "time until starved" without a wiki-derived depletion-time table, which would violate rule #1 (no hardcoded game data, must come from `MGData`). So the AFK team composition doesn't try to estimate survival time at all — it structurally requires a **sustain pet** (an owned pet whose ability restores/reduces hunger drain, detected dynamically) instead.
2. **Ability `trigger` type gates AFK usefulness.** Abilities with `trigger: "hatchEgg" | "sellAllCrops" | "sellPet" | "harvest" | "playerActivated"` never fire without an explicit player action, so they contribute zero value while genuinely AFK, regardless of hunger. Only `trigger: "continuous"` or `"weather"` abilities are AFK-eligible. This is read live from `petAbilities[id].trigger` (already enriched in `src/data`), not hardcoded.

## Goal

A new "🧩 Team Builder" tab that scans the player's actual pet inventory and proposes ready-to-save teams of ≤3 pets, one per goal category, each in a Full-Active variant (session where you can feed/act) and — where possible — an AFK variant (continuous/weather abilities only, plus a mandatory sustain pet).

## Design

### 1. `src/services/petTeamBuilder.ts` (new, pure logic, no DOM)

**Category table** — the only hardcoded piece, and it hardcodes *groupings of already-real ability IDs*, not game values (same established pattern as `getAbilityChipColors` in `pets.ts`, which already does this kind of ID-based grouping). Each category is `{ id, label, abilityIds: string[] /* best tier first */, afkCapable: boolean }`:

| Category | Ability IDs (best → worst tier) |
|---|---|
| Crop Size | ProduceScaleBoostIII, ProduceScaleBoostII, SnowyCropSizeBoost, ProduceScaleBoost |
| Plant Growth Speed | PlantGrowthBoostIII, AmberPlantGrowthBoost, ThunderPlantGrowthBoost, DawnPlantGrowthBoost, SnowyPlantGrowthBoost, PlantGrowthBoostII, PlantGrowthBoost |
| Egg Growth Speed | EggGrowthBoostII (=tier III, 11min — game's own naming is misleading here, verified against `baseParameters.eggGrowthTimeReductionMinutes`), ThunderEggGrowthBoost, SnowyEggGrowthBoost, EggGrowthBoostII_NEW (=tier II, 9min), EggGrowthBoost |
| Mutation: Wet | RainDance |
| Mutation: Frozen | FrostGranter |
| Mutation: Chilled | SnowGranter |
| Mutation: Dawnlit | DawnlitGranter |
| Mutation: Ambershine | AmberlitGranter |
| Mutation: Gold | GoldGranter |
| Mutation: Rainbow | RainbowGranter |
| Mutation: Thunderstruck | ThunderstruckGranter |
| Coins | CoinFinderIII, DawnCoinFinder, ThunderCoinFinder, SnowyCoinFinder, CoinFinderII, CoinFinderI |
| Seeds | SeedFinderIV, SeedFinderIII, SeedFinderII, SeedFinderI |
| Pet XP | DawnXpBoost, ThunderXpBoost, PetXpBoostIII, SnowyPetXpBoost, PetXpBoostII, PetXpBoost |
| Hatch Prep *(Full-Active only)* | DoubleHatch, PetHatchSizeBoostIII/II/I, PetAgeBoostIII/II/I, PetMutationBoostIII/II/I |
| Sell Session *(Full-Active only)* | SellBoostIV/III/II/I, ProduceRefund, PetRefundII/I, DoubleHarvest |

**Sustain detection** (dynamic, not ID-listed): a pet is a sustain candidate if any of its abilities has `baseParameters.hungerRestorePercentage` or `baseParameters.hungerDepletionRateDecreasePercentage` defined in `petAbilities`. Ranked by: (has both a Restore-family *and* a Boost-family ability) desc, then `getPetStrength` desc.

**`buildSuggestedTeams(): SuggestedTeam[]`**, one entry per category with ≥1 owned candidate:
1. Collect owned pets whose `abilities` intersect the category's ID list; rank by (index in the category's tier-ordered list asc, `getPetStrength` desc).
2. **Full-Active**: top 3 candidates, no trigger filtering.
3. **AFK** (only for `afkCapable` categories): top 2 candidates restricted to abilities where `petAbilities[id].trigger` is `"continuous"` or `"weather"`, plus slot 3 = best sustain pet computed once globally (shared across all AFK teams — matches "pick the single best sustain pet you own"). If no sustain pet exists anywhere in the inventory, omit the AFK variant from every category and surface one global notice instead (see UI below).
4. A pet with abilities spanning multiple categories can appear in multiple different suggested teams — these are independent proposals, not an exclusive allocation across the whole roster.

`SuggestedTeam = { categoryId, categoryLabel, mode: "active" | "afk", petIds: string[] }`.

### 2. `src/ui/menus/petsTeamBuilder.ts` (new, UI only, mirrors `petsHatch.ts`)

`renderTeamBuilderTab(view, ui)`:
- Calls `PetsService.getInventoryPets()` + `buildSuggestedTeams()`, renders one `ui.card` per `SuggestedTeam`, grouped by category (Active/AFK side by side when both exist for that category).
- Card content: mini sprite icons for the 3 pets (`mkMiniIcon` is currently a private closure inside `renderManagerTab` in `pets.ts`, not exported — the new file gets its own trimmed local copy built on the exported `attachSpriteIcon`, consistent with each tab file owning its small rendering helpers rather than growing `pets.ts`'s shared surface), ability chips via the existing `getAbilityChipColors`, and a **"Sauvegarder comme team"** button.
- If no sustain pet exists anywhere: a single banner card at the top — "Aucun pet sustain (HungerRestore/HungerBoost) trouvé — les teams AFK ne sont pas fiables sans ça. Le plus facile à obtenir : Dragonfly (Uncommon, ~70% de chance de roll HungerRestore)." — and no AFK cards render at all that session.
- Save action: `PetsService.createTeam(autoName)` then `PetsService.saveTeam({ id, slots: petIds })`, where `autoName` is `"{categoryLabel} ({Active|AFK})"`. The team then behaves exactly like any Manager-tab team (hotkeys, native sync) — no new persistence mechanism.

### 3. Registration in `pets.ts`

Add `ui.addTab("teambuilder", "🧩 Team Builder", (view) => renderTeamBuilderTab(view, ui))` next to the existing tabs, and add `"teambuilder"` to `knownTabs`.

## Known risks

- The category table is a manual, hardcoded grouping of ability IDs. If the game adds a new ability ID/tier, it silently falls into no category until the table is updated — same maintenance burden `getAbilityChipColors` already has today, no new pattern introduced.
- Egg Growth Boost tiering (`EggGrowthBoostII` = highest tier despite the "II" name) is confusing and worth a code comment pointing at the real `eggGrowthTimeReductionMinutes` values, so a future edit doesn't "fix" the ordering back to alphabetical/numeral order by mistake.

## Testing

No automated test harness in this repo (confirmed absent — no `jest`/`vitest`, no `test` script). Verification is `npm run typecheck` + `npm run build`, plus manual verification in the running game: open Pets → Team Builder, confirm categories match owned pets, confirm Active/AFK split behaves correctly including the no-sustain-pet banner case, confirm "Sauvegarder comme team" produces a team visible and editable in the Manager tab with correct slots.
